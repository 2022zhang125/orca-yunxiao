import type { AgentDotState } from '@/components/AgentStateDot'
import type { Worktree, YunxiaoWorkItem } from '../../../shared/types'

/**
 * What the row shows once a fix workspace exists for the defect.
 *
 * `attention` collapses every state where Claude has stopped and is waiting on
 * the user — a prompt, a permission, an interrupt — because the row's job is to
 * say "this one needs you", not to reproduce the agent panel's vocabulary.
 */
export type YunxiaoFixPhase = 'working' | 'attention' | 'done'

export type YunxiaoFixProgress = {
  worktreeId: string
  phase: YunxiaoFixPhase
}

/** Fix workspaces are keyed by the defect's serial, which the create stamps. */
export function indexFixWorktreesByWorkItem(worktrees: readonly Worktree[]): Map<string, Worktree> {
  const byWorkItem = new Map<string, Worktree>()
  for (const worktree of worktrees) {
    const serial = worktree.linkedYunxiaoWorkItem?.trim()
    // Archived workspaces are finished business; a new fix should be offerable.
    if (!serial || worktree.isArchived) {
      continue
    }
    const existing = byWorkItem.get(serial)
    if (!existing || worktree.lastActivityAt > existing.lastActivityAt) {
      byWorkItem.set(serial, worktree)
    }
  }
  return byWorkItem
}

export function findFixWorktree(
  workItem: YunxiaoWorkItem,
  byWorkItem: ReadonlyMap<string, Worktree>
): Worktree | null {
  return byWorkItem.get(workItem.serialNumber) ?? null
}

/**
 * Collapses the agent states in a workspace to the one the row should report.
 *
 * Attention outranks work: with several panes running, one of them blocking on
 * a question is the thing the user has to act on, and burying it under "still
 * working" is how a fix silently stalls. `done` only wins when nothing is live.
 */
export function summarizeFixPhase(states: readonly AgentDotState[]): YunxiaoFixPhase {
  if (
    states.some((state) => state === 'waiting' || state === 'blocked' || state === 'permission')
  ) {
    return 'attention'
  }
  // No rows at all means the workspace was just created and Claude has not
  // started reporting — a finished session leaves a retained 'done' row behind,
  // so genuine completion never presents as empty. Without this the row would
  // flash success the moment the batch launches.
  if (states.length === 0 || states.some((state) => state === 'working')) {
    return 'working'
  }
  // 'interrupted' and 'failed' are terminal too — the workspace stopped, and the
  // row's job is to send the user in to look, not to diagnose from out here.
  return 'done'
}
