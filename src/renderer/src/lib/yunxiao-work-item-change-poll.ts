import type { YunxiaoWorkItem, YunxiaoWorkItemFilter } from '../../../shared/types'

/**
 * 云效 exposes no push channel a desktop client can subscribe to — its webhooks
 * need a reachable callback URL — so noticing a teammate's change means polling
 * for it. One minute matches the list cache's TTL: the freshest a read can be
 * before the cache would just answer with its own previous snapshot.
 */
export const YUNXIAO_CHANGE_POLL_INTERVAL_MS = 60_000

/** The lists that carry work related to me: mine to fix, and mine to follow. */
export const YUNXIAO_WATCHED_FILTERS: readonly YunxiaoWorkItemFilter[] = ['assigned', 'created']

export const YUNXIAO_CHANGE_POLL_LIMIT = 50

/**
 * One tick of the change watch: drop the cached lists, then re-read them so the
 * store's list-read path can diff the result and announce what moved.
 */
export function createYunxiaoChangePoll(deps: {
  invalidate: () => void
  read: (filter: YunxiaoWorkItemFilter, limit: number) => Promise<YunxiaoWorkItem[]>
  filters?: readonly YunxiaoWorkItemFilter[]
  limit?: number
}): () => Promise<void> {
  const filters = deps.filters ?? YUNXIAO_WATCHED_FILTERS
  const limit = deps.limit ?? YUNXIAO_CHANGE_POLL_LIMIT
  let inFlight: Promise<void> | null = null

  return () => {
    // Why: a read slower than the interval must not stack. Two reads of one list
    // can resolve out of order, and the later-resolving older snapshot would move
    // the change baseline backwards — losing the next tick's announcement.
    if (inFlight) {
      return inFlight
    }
    deps.invalidate()
    const run = Promise.all(
      // A failed read is not evidence of change; the next tick retries.
      filters.map((filter) => deps.read(filter, limit).catch(() => []))
    ).then(() => undefined)
    inFlight = run
    void run.finally(() => {
      if (inFlight === run) {
        inFlight = null
      }
    })
    return run
  }
}
