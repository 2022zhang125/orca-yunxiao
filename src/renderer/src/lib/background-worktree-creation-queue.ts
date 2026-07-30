import { useAppStore } from '@/store'
import {
  getInitialWorktreeCreationPhase,
  type WorktreeCreationRequest
} from '@/lib/pending-worktree-creation'

// Why: a batch launch (the 云效 task list ticks N defects, each getting its own
// fix workspace) used to call the create path once per item in one synchronous
// loop. Every create is a base-ref fetch, a full `git worktree add` checkout, a
// trust write and an agent PTY spawn, so N at once pegs the CPU of whichever
// host owns the worktrees and starves the renderer that has to paint their
// progress. Background creates run through this FIFO instead, a couple at a time.

export type QueuedWorktreeCreation = {
  /** True once the user dismissed the pending entry — skip the work entirely. */
  isAbandoned: () => boolean
  /** Called only when the create actually has to wait for a slot. */
  onQueued: () => void
  /** Called as the slot opens, immediately before `run`. */
  onStart: () => void
  run: () => Promise<void>
}

// Why fixed rather than derived from navigator.hardwareConcurrency: the host
// executing the checkout can be an SSH target or a runtime VM, so the renderer's
// core count says nothing about it. Five is the batch-fix working set — enough
// fix agents spin up together to be useful, while a 20-defect batch still
// arrives in waves instead of one stampede.
export const BACKGROUND_WORKTREE_CREATION_CONCURRENCY = 5

const waiting: QueuedWorktreeCreation[] = []
let active = 0

function pump(): void {
  while (active < BACKGROUND_WORKTREE_CREATION_CONCURRENCY && waiting.length > 0) {
    const next = waiting.shift()
    if (!next) {
      return
    }
    if (next.isAbandoned()) {
      continue
    }
    active += 1
    next.onStart()
    void next
      .run()
      .catch(() => {
        // The create path reports its own failures on the pending entry; a
        // rejection here must still free the slot rather than wedge the queue.
      })
      .finally(() => {
        active -= 1
        pump()
      })
  }
}

export function enqueueBackgroundWorktreeCreation(creation: QueuedWorktreeCreation): void {
  waiting.push(creation)
  pump()
  // Why after pump: an open slot starts the create synchronously, so only a
  // creation still sitting in the queue should announce that it is waiting.
  if (waiting.includes(creation)) {
    creation.onQueued()
  }
}

export function resetBackgroundWorktreeCreationQueueForTests(): void {
  waiting.length = 0
  active = 0
}

/**
 * Queues a create and keeps its pending entry honest about what is happening:
 * `queued` while it waits for a slot, its real starting phase once work begins.
 * The entry is already staged by the caller, so the row appears immediately and
 * only its label waits.
 */
export function queueBackgroundWorktreeCreation(
  creationId: string,
  request: Pick<WorktreeCreationRequest, 'ephemeralVmRecipe' | 'ephemeralVmRuntimeId'>,
  run: () => Promise<void>
): void {
  enqueueBackgroundWorktreeCreation({
    // A dismissed create must not consume a slot, let alone run on disk.
    isAbandoned: () => useAppStore.getState().pendingWorktreeCreations[creationId] === undefined,
    onQueued: () => {
      useAppStore.getState().updatePendingWorktreeCreation(creationId, { phase: 'queued' })
    },
    onStart: () => {
      // Why re-stamp startedAt: the panel's elapsed time should measure the
      // create, not how long the batch ahead of it took.
      useAppStore.getState().updatePendingWorktreeCreation(creationId, {
        phase: getInitialWorktreeCreationPhase(request),
        startedAt: Date.now()
      })
    },
    run
  })
}
