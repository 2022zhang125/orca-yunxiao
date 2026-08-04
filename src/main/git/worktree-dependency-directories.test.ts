import { mkdtempSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { checkIgnoredPathsMock } = vi.hoisted(() => ({
  checkIgnoredPathsMock: vi.fn<(repoPath: string, paths: string[]) => Promise<string[]>>()
}))

vi.mock('./check-ignored-paths', () => ({
  checkIgnoredPaths: checkIgnoredPathsMock
}))

import { resolveWorktreeDependencyDirectories } from './worktree-dependency-directories'

describe('resolveWorktreeDependencyDirectories', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'worktree-deps-'))
    checkIgnoredPathsMock.mockReset()
    // Default: git reports every candidate as ignored.
    checkIgnoredPathsMock.mockImplementation(async (_repoPath, paths) => paths)
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('finds dependency directories at the repo root', async () => {
    await fs.mkdir(path.join(dir, 'node_modules'))

    expect(await resolveWorktreeDependencyDirectories(dir)).toEqual(['node_modules'])
  })

  it('finds dependency directories one level down so monorepo sub-projects are covered', async () => {
    await fs.mkdir(path.join(dir, 'node_modules'))
    await fs.mkdir(path.join(dir, 'mobile', 'node_modules'), { recursive: true })

    expect(await resolveWorktreeDependencyDirectories(dir)).toEqual([
      'mobile/node_modules',
      'node_modules'
    ])
  })

  it('does not descend past one level', async () => {
    await fs.mkdir(path.join(dir, 'packages', 'app', 'node_modules'), { recursive: true })

    expect(await resolveWorktreeDependencyDirectories(dir)).toEqual([])
  })

  it('excludes directories git does not ignore, so a tracked path is never linked', async () => {
    await fs.mkdir(path.join(dir, 'node_modules'))
    await fs.mkdir(path.join(dir, 'vendor'))
    checkIgnoredPathsMock.mockResolvedValue(['node_modules'])

    expect(await resolveWorktreeDependencyDirectories(dir)).toEqual(['node_modules'])
  })

  it('never shares build outputs', async () => {
    await fs.mkdir(path.join(dir, 'dist'))
    await fs.mkdir(path.join(dir, 'out'))

    expect(await resolveWorktreeDependencyDirectories(dir)).toEqual([])
  })

  it('ignores an entry that is already a symlink rather than re-sharing it', async () => {
    const real = path.join(dir, 'real-modules')
    await fs.mkdir(real)
    try {
      await fs.symlink(real, path.join(dir, 'node_modules'), 'junction')
    } catch {
      // Windows without Developer Mode can refuse both link types; the assertion
      // below is only meaningful when the link was actually created.
      return
    }

    expect(await resolveWorktreeDependencyDirectories(dir)).toEqual([])
  })

  it('resolves to no directories when the ignore check fails, so setup still runs', async () => {
    await fs.mkdir(path.join(dir, 'node_modules'))
    checkIgnoredPathsMock.mockRejectedValue(new Error('git unavailable'))

    expect(await resolveWorktreeDependencyDirectories(dir)).toEqual([])
  })

  it('resolves to no directories for a repo path that does not exist', async () => {
    expect(await resolveWorktreeDependencyDirectories(path.join(dir, 'missing'))).toEqual([])
  })
})
