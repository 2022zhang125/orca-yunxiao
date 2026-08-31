import type { AppState } from '../types'
import type {
  YunxiaoAccountSelection,
  YunxiaoConnectionStatus,
  YunxiaoViewer
} from '../../../../shared/yunxiao-types'
import {
  yunxiaoConnect,
  yunxiaoDisconnect,
  yunxiaoSelectAccount,
  yunxiaoStatus,
  yunxiaoTestConnection
} from '@/runtime/runtime-yunxiao-client'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import {
  beginYunxiaoMutation,
  beginYunxiaoStatusRead,
  currentYunxiaoMutationGeneration,
  getSelectedAccountId,
  isCurrentYunxiaoMutation,
  isCurrentYunxiaoRuntimeContext,
  isCurrentYunxiaoStatusRead
} from './yunxiao-read-scope'

type ConnectResult = { ok: true; viewer: YunxiaoViewer } | { ok: false; error: string }

type StoreApi = {
  set: (partial: Partial<AppState>) => void
  get: () => AppState
  clearInflight: () => void
}

const DISCONNECTED: YunxiaoConnectionStatus = { connected: false, viewer: null }

function statusChanged(prev: YunxiaoConnectionStatus, next: YunxiaoConnectionStatus): boolean {
  return (
    prev.connected !== next.connected ||
    prev.credentialError !== next.credentialError ||
    prev.viewer?.userId !== next.viewer?.userId ||
    getSelectedAccountId(prev) !== getSelectedAccountId(next) ||
    (prev.accounts?.length ?? 0) !== (next.accounts?.length ?? 0)
  )
}

export function createYunxiaoConnectionActions({ set, get, clearInflight }: StoreApi): {
  checkYunxiaoConnection: () => Promise<void>
  connectYunxiao: (args: {
    organizationId: string
    accessToken: string
    endpoint?: string
  }) => Promise<ConnectResult>
  testYunxiaoConnection: (accountId?: string | null) => Promise<ConnectResult>
  selectYunxiaoAccount: (accountId: YunxiaoAccountSelection) => Promise<void>
  disconnectYunxiao: (accountId?: string | null) => Promise<void>
} {
  const settleStatus = (status: YunxiaoConnectionStatus, contextKey: string): void => {
    if (statusChanged(get().yunxiaoStatus, status)) {
      set({
        yunxiaoStatus: status,
        yunxiaoStatusChecked: true,
        yunxiaoStatusContextKey: contextKey
      })
    } else if (!get().yunxiaoStatusChecked || get().yunxiaoStatusContextKey !== contextKey) {
      set({ yunxiaoStatusChecked: true, yunxiaoStatusContextKey: contextKey })
    }
  }

  return {
    checkYunxiaoConnection: async () => {
      const contextKey = getProviderRuntimeContextKey(get().settings)
      const statusRead = beginYunxiaoStatusRead()
      const mutation = currentYunxiaoMutationGeneration()
      if (get().yunxiaoStatusContextKey !== contextKey) {
        set({ yunxiaoStatusChecked: false })
      }
      const stale = (): boolean =>
        !isCurrentYunxiaoMutation(mutation) ||
        !isCurrentYunxiaoStatusRead(statusRead) ||
        !isCurrentYunxiaoRuntimeContext(contextKey, get().settings)
      try {
        const status = await yunxiaoStatus(get().settings)
        if (!stale()) {
          settleStatus(status, contextKey)
        }
      } catch {
        if (!stale()) {
          settleStatus(
            get().yunxiaoStatus.connected ? DISCONNECTED : get().yunxiaoStatus,
            contextKey
          )
        }
      }
    },

    connectYunxiao: async (args) => {
      const generation = beginYunxiaoMutation()
      const contextKey = getProviderRuntimeContextKey(get().settings)
      try {
        const result = await yunxiaoConnect(get().settings, args)
        if (!result.ok) {
          return result
        }
        if (
          !isCurrentYunxiaoMutation(generation) ||
          !isCurrentYunxiaoRuntimeContext(contextKey, get().settings)
        ) {
          return { ok: false as const, error: '云效 connection was superseded by a newer request.' }
        }
        set({
          yunxiaoStatus: { connected: true, viewer: result.viewer },
          yunxiaoStatusChecked: true,
          yunxiaoStatusContextKey: contextKey
        })
        void get().checkYunxiaoConnection()
        return result
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Connection failed'
        }
      }
    },

    testYunxiaoConnection: async (accountId) => {
      const generation = beginYunxiaoMutation()
      const contextKey = getProviderRuntimeContextKey(get().settings)
      try {
        const result = await yunxiaoTestConnection(get().settings, accountId)
        if (
          !isCurrentYunxiaoMutation(generation) ||
          !isCurrentYunxiaoRuntimeContext(contextKey, get().settings)
        ) {
          return result
        }
        const status = await yunxiaoStatus(get().settings)
        if (
          isCurrentYunxiaoMutation(generation) &&
          isCurrentYunxiaoRuntimeContext(contextKey, get().settings)
        ) {
          set({
            yunxiaoStatus: status,
            yunxiaoStatusChecked: true,
            yunxiaoStatusContextKey: contextKey
          })
        }
        return result
      } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : 'Test failed' }
      }
    },

    selectYunxiaoAccount: async (accountId) => {
      const generation = beginYunxiaoMutation()
      const contextKey = getProviderRuntimeContextKey(get().settings)
      const status = await yunxiaoSelectAccount(get().settings, accountId)
      if (
        !isCurrentYunxiaoMutation(generation) ||
        !isCurrentYunxiaoRuntimeContext(contextKey, get().settings)
      ) {
        return
      }
      clearInflight()
      set({
        yunxiaoStatus: status,
        yunxiaoWorkItemCache: {},
        yunxiaoSearchCache: {},
        yunxiaoStatusChecked: true,
        yunxiaoStatusContextKey: contextKey
      })
    },

    disconnectYunxiao: async (accountId) => {
      const generation = beginYunxiaoMutation()
      const contextKey = getProviderRuntimeContextKey(get().settings)
      const stale = (): boolean =>
        !isCurrentYunxiaoMutation(generation) ||
        !isCurrentYunxiaoRuntimeContext(contextKey, get().settings)
      await yunxiaoDisconnect(get().settings, accountId)
      if (stale()) {
        return
      }
      clearInflight()
      const status = await yunxiaoStatus(get().settings)
      if (stale()) {
        return
      }
      set({
        yunxiaoStatus: status.connected ? status : DISCONNECTED,
        yunxiaoWorkItemCache: {},
        yunxiaoSearchCache: {},
        yunxiaoStatusChecked: true,
        yunxiaoStatusContextKey: contextKey
      })
    }
  }
}
