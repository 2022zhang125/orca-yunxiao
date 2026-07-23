import type { AppState } from '../types'
import type { YunxiaoAccountSelection, YunxiaoWorkItem } from '../../../../shared/types'
import { isIntegrationCredentialDecryptionError } from '../../../../shared/integration-credential-errors'
import { announceYunxiaoWorkItemListChanges } from '@/lib/yunxiao-work-item-change-toasts'
import {
  canWriteYunxiaoReadResult,
  currentYunxiaoMutationGeneration,
  evictStaleEntries,
  getSelectedAccountId,
  getYunxiaoReadScope,
  isFresh,
  looksLikeYunxiaoAuthError,
  scopedYunxiaoCacheKey,
  type InflightYunxiaoReadRequest,
  type YunxiaoReadOptions
} from './yunxiao-read-scope'

/**
 * The scoped list read behind both the preset lists and search: one cache entry
 * and one in-flight request per (runtime scope, account, query), so concurrent
 * callers share a read and a superseded one can never write its result.
 */

const inflightListRequests = new Map<string, InflightYunxiaoReadRequest<YunxiaoWorkItem[]>>()

export function clearYunxiaoListInflight(): void {
  inflightListRequests.clear()
}

export function dropYunxiaoListInflight(inScope: (cacheKey: string) => boolean): void {
  for (const key of inflightListRequests.keys()) {
    if (inScope(key)) {
      inflightListRequests.delete(key)
    }
  }
}

// Credential/auth failures are surfaced through connection state, so they keep
// the empty-list contract. Other failures (forbidden, network, 5xx) reject so
// the Tasks panel can show a real error instead of a misleading "No items".
function handleYunxiaoListError(error: unknown, operation: string): YunxiaoWorkItem[] {
  console.warn(`[yunxiao] ${operation} failed:`, error)
  if (isIntegrationCredentialDecryptionError(error) || looksLikeYunxiaoAuthError(error)) {
    return []
  }
  throw error
}

export type YunxiaoListReadArgs = {
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
  get: () => AppState
  options: YunxiaoReadOptions | undefined
  cacheSuffix: string
  operation: string
  run: (
    scope: ReturnType<typeof getYunxiaoReadScope>,
    accountId: YunxiaoAccountSelection | null
  ) => Promise<YunxiaoWorkItem[]>
}

export function readYunxiaoWorkItemList(args: YunxiaoListReadArgs): Promise<YunxiaoWorkItem[]> {
  const { set, get, options, cacheSuffix, operation, run } = args
  const scope = getYunxiaoReadScope(get().settings, options?.sourceContext)
  const { contextKey } = scope
  const accountId = getSelectedAccountId(get().yunxiaoStatus)
  const cacheKey = scopedYunxiaoCacheKey(scope, `${accountId ?? 'default'}::${cacheSuffix}`)
  const cached = get().yunxiaoSearchCache[cacheKey]
  if (isFresh(cached)) {
    return Promise.resolve(cached.data ?? [])
  }
  const inflight = inflightListRequests.get(cacheKey)
  if (
    inflight &&
    inflight.contextKey === contextKey &&
    inflight.mutationGeneration === currentYunxiaoMutationGeneration()
  ) {
    return inflight.promise
  }
  let entry: InflightYunxiaoReadRequest<YunxiaoWorkItem[]>
  const requestGeneration = currentYunxiaoMutationGeneration()
  const promise = run(scope, accountId)
    .then((workItems) => {
      if (
        inflightListRequests.get(cacheKey) === entry &&
        canWriteYunxiaoReadResult(
          contextKey,
          requestGeneration,
          get().settings,
          scope.explicitSource
        )
      ) {
        set((s) => ({
          yunxiaoSearchCache: evictStaleEntries({
            ...s.yunxiaoSearchCache,
            [cacheKey]: { data: workItems, fetchedAt: Date.now() }
          })
        }))
        // Preset lists only: search results churn with the query, so an item
        // "appearing" there is a match, not a teammate's change worth a toast.
        if (cacheSuffix.startsWith('list::')) {
          announceYunxiaoWorkItemListChanges(cacheKey, workItems, {
            // The jump stays inside Orca — raise this window, navigate, and
            // re-read. Refresh is part of it: the toast reports a change the
            // list's cached read predates, so it must not land on stale rows.
            onView: () => {
              window.api?.ui?.revealWindow?.()
              get().openTaskPage({ taskSource: 'yunxiao' })
              get().requestYunxiaoListRefresh()
            }
          })
        }
      }
      return workItems
    })
    .catch((error) => handleYunxiaoListError(error, operation))
    .finally(() => {
      if (inflightListRequests.get(cacheKey) === entry) {
        inflightListRequests.delete(cacheKey)
      }
    })
  entry = { promise, contextKey, mutationGeneration: requestGeneration }
  inflightListRequests.set(cacheKey, entry)
  return promise
}
