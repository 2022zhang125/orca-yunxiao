import type { GitBranchCompareSummary } from '../../../shared/types'

/** How long a finished fix waits between merge checks before its workspace is
 *  retired. The merge is a human step (review gate → merge request), so this is
 *  a slow watch, not a progress poll. */
export const YUNXIAO_FIX_MERGE_CHECK_INTERVAL_MS = 3 * 60 * 1000

/** Whether the fix branch's commits already live on the base it was cut from. */
export type YunxiaoFixMergeState = 'merged' | 'unmerged' | 'unknown'

/** The merge target is the branch the workspace was cut from; a workspace with
 *  no recorded base has nothing to prove a merge against. */
export function resolveYunxiaoFixMergeBaseRef(input: {
  worktreeBaseRef?: string | null
  repoBaseRef?: string | null
}): string | null {
  return input.worktreeBaseRef?.trim() || input.repoBaseRef?.trim() || null
}

/**
 * Reads a branch-compare summary as the merge verdict that gates workspace
 * removal.
 *
 * An unresolvable base, a missing merge base, or a failed read prove nothing —
 * and deleting a fix workspace on a guess is exactly what this gate exists to
 * prevent, so anything short of a clean "no commits, no changes ahead of base"
 * keeps the workspace.
 */
export function resolveYunxiaoFixMergeState(
  summary: GitBranchCompareSummary | null | undefined
): YunxiaoFixMergeState {
  if (summary?.status !== 'ready' || summary.commitsAhead === undefined) {
    return 'unknown'
  }
  return summary.commitsAhead === 0 && summary.changedFiles === 0 ? 'merged' : 'unmerged'
}
