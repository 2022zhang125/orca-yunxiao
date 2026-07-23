import type { AppState } from '../types'
import type { YunxiaoAccountSelection, YunxiaoConnectionStatus } from '../../../../shared/types'
import type { CacheEntry } from './github'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import {
  getTaskSourceCacheScope,
  getTaskSourceRuntimeSettings,
  type TaskSourceContext
} from '../../../../shared/task-source-context'

const CACHE_TTL = 60_000
const MAX_CACHE_ENTRIES = 500

export type YunxiaoReadOptions = { sourceContext?: TaskSourceContext | null }

export type InflightYunxiaoReadRequest<T> = {
  promise: Promise<T>
  contextKey: string
  mutationGeneration: number
}

export type YunxiaoReadScope = {
  settings: AppState['settings'] | TaskSourceContext | null
  contextKey: string
  cachePrefix: string | null
  explicitSource: boolean
}

export function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() - entry.fetchedAt < CACHE_TTL
}

export function evictStaleEntries<T>(
  cache: Record<string, CacheEntry<T>>,
  maxEntries = MAX_CACHE_ENTRIES
): Record<string, CacheEntry<T>> {
  const keys = Object.keys(cache)
  if (keys.length <= maxEntries) {
    return cache
  }
  const sorted = keys.sort((a, b) => (cache[a]?.fetchedAt ?? 0) - (cache[b]?.fetchedAt ?? 0))
  const pruned: Record<string, CacheEntry<T>> = {}
  for (const key of sorted.slice(sorted.length - maxEntries)) {
    pruned[key] = cache[key]
  }
  return pruned
}

export function looksLikeYunxiaoAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  // Why: 云效 403 commonly means organization/permission gaps while the saved
  // token is still valid; do not flip Settings back to disconnected.
  return /authenticat|unauthorized|401/i.test(message)
}

export function getSelectedAccountId(
  status: YunxiaoConnectionStatus
): YunxiaoAccountSelection | null {
  return status.selectedAccountId ?? status.activeAccountId ?? null
}

export function shouldRefreshStatusAfterRead(
  accountId: YunxiaoAccountSelection | null | undefined,
  status: YunxiaoConnectionStatus
): boolean {
  // Why: 'all' reads can hide per-account decrypt failures, and a visible
  // credential error may have been cleared by a successful credential read.
  return accountId === 'all' || status.credentialError !== undefined
}

let mutationGeneration = 0
let statusReadGeneration = 0

export function beginYunxiaoMutation(): number {
  mutationGeneration += 1
  return mutationGeneration
}

export function currentYunxiaoMutationGeneration(): number {
  return mutationGeneration
}

export function isCurrentYunxiaoMutation(generation: number): boolean {
  return generation === mutationGeneration
}

export function beginYunxiaoStatusRead(): number {
  statusReadGeneration += 1
  return statusReadGeneration
}

export function isCurrentYunxiaoStatusRead(generation: number): boolean {
  return generation === statusReadGeneration
}

export function isCurrentYunxiaoRuntimeContext(
  contextKey: string,
  settings: AppState['settings']
): boolean {
  return getProviderRuntimeContextKey(settings) === contextKey
}

export function canWriteYunxiaoReadResult(
  contextKey: string,
  requestMutationGeneration: number,
  settings: AppState['settings'],
  explicitSource = false
): boolean {
  return (
    requestMutationGeneration === mutationGeneration &&
    (explicitSource || isCurrentYunxiaoRuntimeContext(contextKey, settings))
  )
}

export function getYunxiaoReadScope(
  settings: AppState['settings'],
  sourceContext?: TaskSourceContext | null
): YunxiaoReadScope {
  if (!sourceContext) {
    return {
      settings,
      contextKey: getProviderRuntimeContextKey(settings),
      cachePrefix: null,
      explicitSource: false
    }
  }
  const runtimeSettings = getTaskSourceRuntimeSettings(sourceContext)
  return {
    settings: sourceContext,
    contextKey: `${getProviderRuntimeContextKey(runtimeSettings)}::${getTaskSourceCacheScope(sourceContext)}`,
    cachePrefix: getTaskSourceCacheScope(sourceContext),
    explicitSource: true
  }
}

export function scopedYunxiaoCacheKey(scope: YunxiaoReadScope, key: string): string {
  return scope.cachePrefix ? `${scope.cachePrefix}::${key}` : key
}
