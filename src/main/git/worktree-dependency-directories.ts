import { readdir, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { checkIgnoredPaths } from './check-ignored-paths'
import type { GitRuntimeOptions } from './git-runtime-options'

// Why: a batch of one-click fix worktrees each ran the repo's setup script, so N
// throwaway workspaces meant N `pnpm install` processes. Sharing the primary
// checkout's already-installed dependency directories removes the reinstall
// entirely; detection is automatic so no per-repo `orca.yaml` entry is needed.

/** Package-manager dependency roots only — never build outputs (`dist`, `out`).
 *  A fix worktree builds its own branch, so sharing outputs would let one branch
 *  read another's artifacts. */
const DEPENDENCY_DIRECTORY_NAMES = ['node_modules', '.venv', 'venv', 'vendor'] as const

// Why: enumerating the repo root is cheap, but descending into these is not, and
// none of them ever holds a sibling project's dependency root.
const UNSEARCHABLE_SUBDIRECTORY_NAMES = new Set<string>([
  '.git',
  ...DEPENDENCY_DIRECTORY_NAMES,
  'dist',
  'dist-electron',
  'out',
  'build',
  'release',
  'target',
  'coverage',
  '.next',
  '.cache'
])

/** Bounds the scan on a repo whose root has an unusual number of entries. */
const MAX_SEARCHED_SUBDIRECTORIES = 64

async function isRealDirectory(absolutePath: string): Promise<boolean> {
  try {
    // Why `lstat`: an entry that is already a symlink is either a previous
    // share or the user's own link — following it could point back out of the
    // repo, so it is never re-shared.
    return (await lstat(absolutePath)).isDirectory()
  } catch {
    return false
  }
}

/** Repo-relative dependency directories to look for: each candidate name at the
 *  repo root, plus the same names one level down so monorepo sub-projects
 *  (`mobile/node_modules`) are covered without a deep walk. */
async function listCandidateDependencyDirectories(repoPath: string): Promise<string[]> {
  const candidates: string[] = [...DEPENDENCY_DIRECTORY_NAMES]
  let entries: string[]
  try {
    entries = (await readdir(repoPath, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !UNSEARCHABLE_SUBDIRECTORY_NAMES.has(entry.name))
      .map((entry) => entry.name)
      .sort()
      .slice(0, MAX_SEARCHED_SUBDIRECTORIES)
  } catch {
    return candidates
  }
  for (const entry of entries) {
    for (const name of DEPENDENCY_DIRECTORY_NAMES) {
      // Why POSIX separator: these become `git check-ignore` operands and
      // `orca.yaml`-style shared paths, both of which are `/`-relative.
      candidates.push(`${entry}/${name}`)
    }
  }
  return candidates
}

/**
 * Dependency directories in `repoPath` that a new worktree can symlink instead
 * of installing for itself.
 *
 * Only directories that exist as real directories **and** are gitignored are
 * returned — the ignore check is the safety rail: a tracked directory is already
 * materialized by the checkout, and linking an unignored path would surface the
 * link as a spurious worktree diff.
 *
 * Never throws; any failure resolves to `[]` so worktree creation degrades to
 * running setup rather than failing.
 */
export async function resolveWorktreeDependencyDirectories(
  repoPath: string,
  options: GitRuntimeOptions = {}
): Promise<string[]> {
  try {
    const candidates = await listCandidateDependencyDirectories(repoPath)
    const existing: string[] = []
    for (const relativePath of candidates) {
      if (await isRealDirectory(join(repoPath, relativePath))) {
        existing.push(relativePath)
      }
    }
    if (existing.length === 0) {
      return []
    }
    const ignored = new Set(await checkIgnoredPaths(repoPath, existing, options))
    return existing.filter((relativePath) => ignored.has(relativePath)).sort()
  } catch (error) {
    console.warn('[worktree-dependency-directories] Detection failed:', error)
    return []
  }
}
