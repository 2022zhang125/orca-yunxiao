import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingWorktreeCreation } from '@/lib/pending-worktree-creation'

const store = {
  pendingWorktreeCreations: {} as Record<string, Partial<PendingWorktreeCreation>>,
  updatePendingWorktreeCreation: vi.fn(
    (creationId: string, patch: Partial<PendingWorktreeCreation>) => {
      const entry = store.pendingWorktreeCreations[creationId]
      if (entry) {
        store.pendingWorktreeCreations[creationId] = { ...entry, ...patch }
      }
    }
  )
}

vi.mock('@/store', () => ({
  useAppStore: { getState: () => store }
}))

import {
  BACKGROUND_WORKTREE_CREATION_CONCURRENCY,
  enqueueBackgroundWorktreeCreation,
  queueBackgroundWorktreeCreation,
  resetBackgroundWorktreeCreationQueueForTests
} from './background-worktree-creation-queue'

type Deferred = { promise: Promise<void>; resolve: () => void }

function deferred(): Deferred {
  let resolve = (): void => {}
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function enqueue(options?: {
  isAbandoned?: () => boolean
  onQueued?: () => void
  onStart?: () => void
}): { started: () => boolean; finish: () => void } {
  const gate = deferred()
  let started = false
  enqueueBackgroundWorktreeCreation({
    isAbandoned: options?.isAbandoned ?? ((): boolean => false),
    onQueued: options?.onQueued ?? ((): void => {}),
    onStart: options?.onStart ?? ((): void => {}),
    run: () => {
      started = true
      return gate.promise
    }
  })
  return { started: () => started, finish: gate.resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  store.pendingWorktreeCreations = {}
})

afterEach(() => {
  resetBackgroundWorktreeCreationQueueForTests()
})

describe('enqueueBackgroundWorktreeCreation', () => {
  it('runs a lone create immediately without announcing a wait', () => {
    const onQueued = vi.fn()
    const onStart = vi.fn()
    const first = enqueue({ onQueued, onStart })

    expect(first.started()).toBe(true)
    expect(onQueued).not.toHaveBeenCalled()
    expect(onStart).toHaveBeenCalled()
  })

  it('caps concurrent creates and holds the rest queued', () => {
    const onQueued = vi.fn()
    const running = Array.from({ length: BACKGROUND_WORKTREE_CREATION_CONCURRENCY }, () =>
      enqueue()
    )
    const overflow = enqueue({ onQueued })

    expect(running.every((entry) => entry.started())).toBe(true)
    expect(overflow.started()).toBe(false)
    expect(onQueued).toHaveBeenCalledTimes(1)
  })

  it('starts a queued create when a slot frees up', async () => {
    const running = Array.from({ length: BACKGROUND_WORKTREE_CREATION_CONCURRENCY }, () =>
      enqueue()
    )
    const overflow = enqueue()
    expect(overflow.started()).toBe(false)

    running[0].finish()
    await vi.waitFor(() => expect(overflow.started()).toBe(true))
  })

  it('frees the slot when a create rejects', async () => {
    const failures: Promise<void>[] = []
    for (let index = 0; index < BACKGROUND_WORKTREE_CREATION_CONCURRENCY; index += 1) {
      const rejection = Promise.reject(new Error('create failed'))
      failures.push(rejection.catch(() => undefined))
      enqueueBackgroundWorktreeCreation({
        isAbandoned: () => false,
        onQueued: () => {},
        onStart: () => {},
        run: () => rejection
      })
    }
    const overflow = enqueue()
    expect(overflow.started()).toBe(false)

    await Promise.all(failures)
    await vi.waitFor(() => expect(overflow.started()).toBe(true))
  })

  it('skips a create the user dismissed while it waited', async () => {
    const running = Array.from({ length: BACKGROUND_WORKTREE_CREATION_CONCURRENCY }, () =>
      enqueue()
    )
    let abandoned = false
    const dismissed = enqueue({ isAbandoned: () => abandoned })
    const next = enqueue()

    abandoned = true
    running[0].finish()

    await vi.waitFor(() => expect(next.started()).toBe(true))
    expect(dismissed.started()).toBe(false)
  })
})

describe('queueBackgroundWorktreeCreation', () => {
  function stage(creationId: string): { started: () => boolean; finish: () => void } {
    store.pendingWorktreeCreations[creationId] = { creationId, phase: 'fetching' }
    const gate = deferred()
    let started = false
    queueBackgroundWorktreeCreation(creationId, {}, () => {
      started = true
      return gate.promise
    })
    return { started: () => started, finish: gate.resolve }
  }

  it('leaves a create that starts immediately on its real phase', () => {
    stage('create-a')

    expect(store.pendingWorktreeCreations['create-a']?.phase).toBe('fetching')
  })

  it('marks a waiting create queued, then flips it to its starting phase', async () => {
    const running = Array.from({ length: BACKGROUND_WORKTREE_CREATION_CONCURRENCY }, (_, index) =>
      stage(`busy-${index}`)
    )
    stage('overflow')
    expect(store.pendingWorktreeCreations['overflow']?.phase).toBe('queued')

    running[0].finish()
    await vi.waitFor(() =>
      expect(store.pendingWorktreeCreations['overflow']?.phase).toBe('fetching')
    )
  })

  it('provisions a VM recipe first once its slot opens', async () => {
    const running = Array.from({ length: BACKGROUND_WORKTREE_CREATION_CONCURRENCY }, (_, index) =>
      stage(`busy-${index}`)
    )
    store.pendingWorktreeCreations['vm'] = { creationId: 'vm', phase: 'fetching' }
    queueBackgroundWorktreeCreation(
      'vm',
      { ephemeralVmRecipe: { sourceRepoId: 'r', recipeId: 'x', projectId: 'p' } },
      () => Promise.resolve()
    )
    expect(store.pendingWorktreeCreations['vm']?.phase).toBe('queued')

    running[0].finish()
    await vi.waitFor(() =>
      expect(store.pendingWorktreeCreations['vm']?.phase).toBe('provisioning-vm')
    )
  })

  it('never runs a create whose pending entry was dismissed while queued', async () => {
    const running = Array.from({ length: BACKGROUND_WORKTREE_CREATION_CONCURRENCY }, (_, index) =>
      stage(`busy-${index}`)
    )
    const dismissed = stage('gone')
    delete store.pendingWorktreeCreations['gone']

    running[0].finish()
    await vi.waitFor(() => expect(store.pendingWorktreeCreations['busy-0']).toBeDefined())
    expect(dismissed.started()).toBe(false)
  })
})
