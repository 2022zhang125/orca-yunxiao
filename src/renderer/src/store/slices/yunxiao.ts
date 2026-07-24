import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type {
  YunxiaoAccountSelection,
  YunxiaoConnectionStatus,
  YunxiaoViewer,
  YunxiaoWorkItem,
  YunxiaoWorkItemFilter
} from '../../../../shared/types'
import type { CacheEntry } from './github'
import {
  yunxiaoGetWorkItem,
  yunxiaoListWorkItems,
  yunxiaoSearchWorkItems
} from '@/runtime/runtime-yunxiao-client'
import { getTaskSourceCacheScope } from '../../../../shared/task-source-context'
import { resetYunxiaoWorkItemChangeTracking } from '@/lib/yunxiao-work-item-change-toasts'
import { createYunxiaoConnectionActions } from './yunxiao-connection-actions'
import {
  clearYunxiaoListInflight,
  dropYunxiaoListInflight,
  readYunxiaoWorkItemList
} from './yunxiao-work-item-list-read'
import {
  canWriteYunxiaoReadResult,
  currentYunxiaoMutationGeneration,
  evictStaleEntries,
  getYunxiaoReadScope,
  isFresh,
  looksLikeYunxiaoAuthError,
  scopedYunxiaoCacheKey,
  shouldRefreshStatusAfterRead,
  type InflightYunxiaoReadRequest,
  type YunxiaoReadOptions
} from './yunxiao-read-scope'

const inflightWorkItemRequests = new Map<
  string,
  InflightYunxiaoReadRequest<YunxiaoWorkItem | null>
>()

function clearYunxiaoInflight(): void {
  inflightWorkItemRequests.clear()
  clearYunxiaoListInflight()
  resetYunxiaoWorkItemChangeTracking()
}

/** Without an explicit 云效 source context the caller means every scope. */
function cacheKeyScopeMatcher(options: YunxiaoReadOptions | undefined): (key: string) => boolean {
  const sourceScope =
    options?.sourceContext?.provider === 'yunxiao'
      ? getTaskSourceCacheScope(options.sourceContext)
      : null
  return (key) => sourceScope === null || key.startsWith(`${sourceScope}::`)
}

function reusableInflight<T>(
  map: Map<string, InflightYunxiaoReadRequest<T>>,
  cacheKey: string,
  contextKey: string
): Promise<T> | null {
  const inflight = map.get(cacheKey)
  return inflight &&
    inflight.contextKey === contextKey &&
    inflight.mutationGeneration === currentYunxiaoMutationGeneration()
    ? inflight.promise
    : null
}

export type YunxiaoSlice = {
  yunxiaoStatus: YunxiaoConnectionStatus
  yunxiaoStatusChecked: boolean
  yunxiaoStatusContextKey: string | null
  yunxiaoWorkItemCache: Record<string, CacheEntry<YunxiaoWorkItem>>
  yunxiaoSearchCache: Record<string, CacheEntry<YunxiaoWorkItem[]>>
  yunxiaoListRefreshNonce: number

  checkYunxiaoConnection: () => Promise<void>
  connectYunxiao: (args: {
    organizationId: string
    accessToken: string
    endpoint?: string
  }) => Promise<{ ok: true; viewer: YunxiaoViewer } | { ok: false; error: string }>
  testYunxiaoConnection: (
    accountId?: string | null
  ) => Promise<{ ok: true; viewer: YunxiaoViewer } | { ok: false; error: string }>
  selectYunxiaoAccount: (accountId: YunxiaoAccountSelection) => Promise<void>
  disconnectYunxiao: (accountId?: string | null) => Promise<void>
  fetchYunxiaoWorkItem: (
    workItemId: string,
    accountId?: string | null,
    options?: YunxiaoReadOptions
  ) => Promise<YunxiaoWorkItem | null>
  searchYunxiaoWorkItems: (
    query: string,
    limit?: number,
    options?: YunxiaoReadOptions
  ) => Promise<YunxiaoWorkItem[]>
  listYunxiaoWorkItems: (
    filter?: YunxiaoWorkItemFilter,
    limit?: number,
    options?: YunxiaoReadOptions
  ) => Promise<YunxiaoWorkItem[]>
  invalidateYunxiaoWorkItemLists: (options?: YunxiaoReadOptions) => void
  requestYunxiaoListRefresh: () => void
  patchYunxiaoWorkItem: (
    workItemId: string,
    patch: Partial<YunxiaoWorkItem>,
    options?: YunxiaoReadOptions
  ) => void
}

export const createYunxiaoSlice: StateCreator<AppState, [], [], YunxiaoSlice> = (set, get) => ({
  yunxiaoStatus: { connected: false, viewer: null },
  yunxiaoStatusChecked: false,
  yunxiaoStatusContextKey: null,
  yunxiaoWorkItemCache: {},
  yunxiaoSearchCache: {},
  yunxiaoListRefreshNonce: 0,

  ...createYunxiaoConnectionActions({ set, get, clearInflight: clearYunxiaoInflight }),

  fetchYunxiaoWorkItem: async (workItemId, accountId, options) => {
    const scope = getYunxiaoReadScope(get().settings, options?.sourceContext)
    const { contextKey } = scope
    const cacheKey = scopedYunxiaoCacheKey(scope, `${accountId ?? 'selected'}::${workItemId}`)
    const cached = get().yunxiaoWorkItemCache[cacheKey]
    if (isFresh(cached)) {
      return cached.data
    }
    const reusable = reusableInflight(inflightWorkItemRequests, cacheKey, contextKey)
    if (reusable) {
      return reusable
    }
    let entry: InflightYunxiaoReadRequest<YunxiaoWorkItem | null>
    const requestGeneration = currentYunxiaoMutationGeneration()
    const canWrite = (): boolean =>
      canWriteYunxiaoReadResult(contextKey, requestGeneration, get().settings, scope.explicitSource)
    const promise = yunxiaoGetWorkItem(scope.settings, workItemId, accountId)
      .then((workItem) => {
        if (inflightWorkItemRequests.get(cacheKey) === entry && canWrite()) {
          set((s) => ({
            yunxiaoWorkItemCache: evictStaleEntries({
              ...s.yunxiaoWorkItemCache,
              [cacheKey]: { data: workItem, fetchedAt: Date.now() }
            })
          }))
        }
        return workItem
      })
      .catch((error) => {
        console.warn('[yunxiao] fetchYunxiaoWorkItem failed:', error)
        if (canWrite() && looksLikeYunxiaoAuthError(error)) {
          set({ yunxiaoStatus: { connected: false, viewer: null } })
        }
        return null
      })
      .finally(() => {
        if (inflightWorkItemRequests.get(cacheKey) === entry) {
          inflightWorkItemRequests.delete(cacheKey)
        }
        if (shouldRefreshStatusAfterRead(accountId, get().yunxiaoStatus) && canWrite()) {
          void get().checkYunxiaoConnection()
        }
      })
    entry = { promise, contextKey, mutationGeneration: requestGeneration }
    inflightWorkItemRequests.set(cacheKey, entry)
    return promise
  },

  searchYunxiaoWorkItems: async (query, limit = 30, options) =>
    readYunxiaoWorkItemList({
      set,
      get,
      options,
      cacheSuffix: `search::${query}::${limit}`,
      operation: 'searchYunxiaoWorkItems',
      run: (scope, accountId) => yunxiaoSearchWorkItems(scope.settings, query, limit, accountId)
    }),

  listYunxiaoWorkItems: async (filter = 'assigned', limit = 30, options) =>
    readYunxiaoWorkItemList({
      set,
      get,
      options,
      cacheSuffix: `list::${filter}::${limit}`,
      operation: 'listYunxiaoWorkItems',
      announce: { filter, limit },
      run: (scope, accountId) => yunxiaoListWorkItems(scope.settings, filter, limit, accountId)
    }),

  // Why: list reads are cached for a minute, so an explicit Refresh has to drop
  // the cached entries first or the effect just re-reads what it already had.
  invalidateYunxiaoWorkItemLists: (options) => {
    const inScope = cacheKeyScopeMatcher(options)
    dropYunxiaoListInflight(inScope)
    set((s) => {
      const next: Record<string, CacheEntry<YunxiaoWorkItem[]>> = {}
      for (const [key, entry] of Object.entries(s.yunxiaoSearchCache)) {
        if (!inScope(key)) {
          next[key] = entry
        }
      }
      return { yunxiaoSearchCache: next }
    })
  },

  // Why: the Tasks list owns its own fetch effect, so an outside caller — a
  // change toast the user just clicked — can only force a re-read by dropping
  // the cache and bumping a signal that effect depends on.
  requestYunxiaoListRefresh: () => {
    get().invalidateYunxiaoWorkItemLists()
    set((s) => ({ yunxiaoListRefreshNonce: s.yunxiaoListRefreshNonce + 1 }))
  },

  patchYunxiaoWorkItem: (workItemId, patch, options) => {
    const canPatchCacheKey = cacheKeyScopeMatcher(options)
    set((s) => {
      let changed = false
      const nextWorkItemCache = { ...s.yunxiaoWorkItemCache }
      for (const [key, entry] of Object.entries(nextWorkItemCache)) {
        if (!canPatchCacheKey(key) || entry?.data?.id !== workItemId) {
          continue
        }
        nextWorkItemCache[key] = { ...entry, data: { ...entry.data, ...patch }, fetchedAt: 0 }
        changed = true
      }
      const nextSearchCache = { ...s.yunxiaoSearchCache }
      for (const key of Object.keys(nextSearchCache)) {
        const entry = nextSearchCache[key]
        if (!canPatchCacheKey(key) || !entry?.data) {
          continue
        }
        const index = entry.data.findIndex((workItem) => workItem.id === workItemId)
        if (index === -1) {
          continue
        }
        const updatedItems = [...entry.data]
        updatedItems[index] = { ...updatedItems[index], ...patch }
        nextSearchCache[key] = { ...entry, data: updatedItems }
        changed = true
      }
      return changed
        ? { yunxiaoWorkItemCache: nextWorkItemCache, yunxiaoSearchCache: nextSearchCache }
        : {}
    })
  }
})
