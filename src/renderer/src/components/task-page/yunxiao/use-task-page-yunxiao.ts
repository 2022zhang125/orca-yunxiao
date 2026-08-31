import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { indexFixWorktreesByWorkItem } from '@/components/task-page-yunxiao-fix-progress'
import type { YunxiaoDefectAttachment } from '@/components/task-page-yunxiao-defect-report'
import { TASK_SEARCH_DEBOUNCE_MS } from '@/components/task-page/task-page-list-limits'
import { getTaskPageRepoSourceContext } from '@/components/task-page/source/repo-source-context'
import { useDeferredLoadingIndicator } from '@/hooks/use-deferred-loading-indicator'
import { translate } from '@/i18n/i18n'
import type { LinkedWorkItemSummary } from '@/lib/new-workspace'
import { getLinkedWorkItemSuggestedName, getLinkedWorkItemWorkspaceName } from '@/lib/new-workspace'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { runBackgroundWorktreeCreation } from '@/lib/worktree-creation-flow'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import {
  buildYunxiaoFixWorkspaceRequest,
  YUNXIAO_FIX_AGENT
} from '@/lib/yunxiao-fix-workspace-request'
import { yunxiaoGetWorkItemFile } from '@/runtime/runtime-yunxiao-client'
import { useAppStore } from '@/store'
import { getSettingsFocusedExecutionHostId } from '../../../../../shared/execution-host'
import { isGitRepoKind } from '../../../../../shared/repo-kind'
import {
  getTaskSourceRuntimeSettings,
  normalizeTaskSourceContext
} from '../../../../../shared/task-source-context'
import type { YunxiaoWorkItem, YunxiaoWorkItemFile } from '../../../../../shared/yunxiao-types'
import type { YunxiaoPresetId } from '@/components/task-page-localized-options'

const YUNXIAO_ITEM_LIMIT = 50

function getYunxiaoWorkItemWorkspaceSeed(workItem: YunxiaoWorkItem): string {
  const linkedWorkItem: LinkedWorkItemSummary = {
    type: 'issue',
    provider: 'yunxiao',
    number: 0,
    title: `${workItem.serialNumber} ${workItem.title}`,
    url: workItem.url,
    yunxiaoIdentifier: workItem.serialNumber
  }
  return (
    getLinkedWorkItemWorkspaceName(linkedWorkItem)?.seedName ??
    getLinkedWorkItemSuggestedName(linkedWorkItem)
  )
}

function selectFixRepo() {
  const store = useAppStore.getState()
  const activeRepo = store.activeRepoId
    ? (store.repos.find((repo) => repo.id === store.activeRepoId) ?? null)
    : null
  if (activeRepo && isGitRepoKind(activeRepo)) {
    return activeRepo
  }
  const gitRepos = store.repos.filter((repo) => isGitRepoKind(repo))
  return gitRepos.length === 1 ? gitRepos[0] : null
}

export function useTaskPageYunxiao() {
  const settings = useAppStore((state) => state.settings)
  const repos = useAppStore((state) => state.repos)
  const openModal = useAppStore((state) => state.openModal)
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const yunxiaoStatus = useAppStore((state) => state.yunxiaoStatus)
  const yunxiaoStatusChecked = useAppStore((state) => state.yunxiaoStatusChecked)
  const yunxiaoStatusContextKey = useAppStore((state) => state.yunxiaoStatusContextKey)
  const checkYunxiaoConnection = useAppStore((state) => state.checkYunxiaoConnection)
  const searchYunxiaoWorkItems = useAppStore((state) => state.searchYunxiaoWorkItems)
  const listYunxiaoWorkItems = useAppStore((state) => state.listYunxiaoWorkItems)
  const fetchYunxiaoWorkItem = useAppStore((state) => state.fetchYunxiaoWorkItem)
  const invalidateYunxiaoWorkItemLists = useAppStore(
    (state) => state.invalidateYunxiaoWorkItemLists
  )
  const listRefreshNonce = useAppStore((state) => state.yunxiaoListRefreshNonce)
  const [workItems, setWorkItems] = useState<YunxiaoWorkItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [activePreset, setActivePreset] = useState<YunxiaoPresetId>('assigned')
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [connectOpen, setConnectOpen] = useState(false)
  const loadingVisible = useDeferredLoadingIndicator(loading)

  const providerRuntimeContextKey = getProviderRuntimeContextKey(settings)
  const statusCurrent = yunxiaoStatusContextKey === providerRuntimeContextKey
  const statusReady = statusCurrent && yunxiaoStatusChecked
  const connected = statusCurrent && yunxiaoStatus.connected
  const selectedAccountId = yunxiaoStatus.selectedAccountId ?? yunxiaoStatus.activeAccountId ?? null

  const sourceContext = useMemo(() => {
    const firstRepoContext = repos
      .filter((repo) => isGitRepoKind(repo))
      .map((repo) => getTaskPageRepoSourceContext(repo, 'github'))
      .find((context) => context !== null)
    return normalizeTaskSourceContext({
      provider: 'yunxiao',
      projectId: firstRepoContext?.projectId ?? 'account-backed-task-source',
      hostId: getSettingsFocusedExecutionHostId(settings),
      providerIdentity: {
        provider: 'yunxiao',
        accountId: selectedAccountId === 'all' ? null : selectedAccountId,
        organizationId: yunxiaoStatus.viewer?.organizationId ?? null,
        organizationName: yunxiaoStatus.viewer?.organizationName ?? null
      },
      accountLabel: yunxiaoStatus.viewer?.organizationName ?? null
    })
  }, [repos, selectedAccountId, settings, yunxiaoStatus.viewer])

  const fixWorktreeIdBySerial = useMemo(() => {
    const result = new Map<string, string>()
    for (const [serial, worktree] of indexFixWorktreesByWorkItem(
      Object.values(worktreesByRepo).flat()
    )) {
      result.set(serial, worktree.id)
    }
    return result
  }, [worktreesByRepo])

  useEffect(() => {
    if (!statusReady) {
      void checkYunxiaoConnection()
    }
  }, [checkYunxiaoConnection, statusReady])

  useEffect(() => {
    const timeout = window.setTimeout(() => setAppliedSearch(searchInput), TASK_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    if (!connected) {
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const query = appliedSearch.trim()
    const options = { sourceContext }
    const request = query
      ? searchYunxiaoWorkItems(query, YUNXIAO_ITEM_LIMIT, options)
      : listYunxiaoWorkItems(activePreset, YUNXIAO_ITEM_LIMIT, options)
    void request
      .then((items) => {
        if (!cancelled) {
          setWorkItems(items)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setWorkItems([])
          setError(
            reason instanceof Error
              ? reason.message
              : translate(
                  'auto.components.TaskPage.yunxiao_load_failed',
                  'Failed to load 云效 work items.'
                )
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    activePreset,
    appliedSearch,
    connected,
    listYunxiaoWorkItems,
    listRefreshNonce,
    refreshNonce,
    searchYunxiaoWorkItems,
    sourceContext
  ])

  const openComposer = useCallback(
    (workItem: YunxiaoWorkItem): void => {
      const linkedWorkItem: LinkedWorkItemSummary = {
        type: 'issue',
        provider: 'yunxiao',
        number: 0,
        title: `${workItem.serialNumber} ${workItem.title}`,
        url: workItem.url,
        yunxiaoIdentifier: workItem.serialNumber
      }
      openModal('new-workspace-composer', {
        linkedWorkItem,
        taskSourceContext: sourceContext,
        prefilledName: getYunxiaoWorkItemWorkspaceSeed(workItem),
        telemetrySource: 'sidebar'
      })
    },
    [openModal, sourceContext]
  )

  const ensureFixAgent = useCallback((): boolean => {
    const detectedAgentIds = useAppStore.getState().detectedAgentIds
    if (!detectedAgentIds || detectedAgentIds.includes(YUNXIAO_FIX_AGENT)) {
      return true
    }
    toast.error(
      translate(
        'auto.components.TaskPage.yunxiao_fix_agent_missing',
        'Claude is not available on this host, so the fix cannot start automatically.'
      )
    )
    return false
  }, [])

  const fixWorkItem = useCallback(
    (workItem: YunxiaoWorkItem): void => {
      const store = useAppStore.getState()
      store.recordFeatureInteraction('yunxiao-tasks')
      const repo = selectFixRepo()
      if (!repo) {
        openComposer(workItem)
        return
      }
      if (ensureFixAgent()) {
        runBackgroundWorktreeCreation(
          buildYunxiaoFixWorkspaceRequest({
            workItem,
            repo,
            store,
            taskSourceContext: sourceContext
          })
        )
      }
    },
    [ensureFixAgent, openComposer, sourceContext]
  )

  const batchFixWorkItems = useCallback(
    (items: YunxiaoWorkItem[]): void => {
      const store = useAppStore.getState()
      store.recordFeatureInteraction('yunxiao-tasks')
      const repo = selectFixRepo()
      if (!repo) {
        toast.error(
          translate(
            'auto.components.TaskPage.yunxiao_batch_fix_no_repo',
            'Select an active repo first so the fixes know where to run.'
          )
        )
        return
      }
      if (!ensureFixAgent()) {
        return
      }
      for (const workItem of items) {
        runBackgroundWorktreeCreation(
          buildYunxiaoFixWorkspaceRequest({
            workItem,
            repo,
            store,
            taskSourceContext: sourceContext
          })
        )
      }
    },
    [ensureFixAgent, sourceContext]
  )

  const loadWorkItemDetail = useCallback(
    (workItem: YunxiaoWorkItem) =>
      fetchYunxiaoWorkItem(workItem.id, workItem.accountId ?? null, { sourceContext }),
    [fetchYunxiaoWorkItem, sourceContext]
  )
  const resolveAttachment = useCallback(
    (
      workItem: YunxiaoWorkItem,
      attachment: YunxiaoDefectAttachment
    ): Promise<YunxiaoWorkItemFile | null> => {
      if (!attachment.fileId) {
        return Promise.resolve({ id: attachment.src, name: attachment.name, url: attachment.src })
      }
      return yunxiaoGetWorkItemFile(
        getTaskSourceRuntimeSettings(sourceContext),
        workItem.id,
        attachment.fileId,
        workItem.accountId ?? null
      )
    },
    [sourceContext]
  )

  const refresh = useCallback(() => {
    invalidateYunxiaoWorkItemLists({ sourceContext })
    setRefreshNonce((value) => value + 1)
  }, [invalidateYunxiaoWorkItemLists, sourceContext])

  return {
    statusReady,
    connected,
    status: yunxiaoStatus,
    selectedAccountId,
    workItems,
    loading,
    loadingVisible,
    error,
    searchInput,
    setSearchInput,
    appliedSearch,
    setAppliedSearch,
    activePreset,
    setActivePreset,
    refresh,
    connectOpen,
    setConnectOpen,
    fixWorktreeIdBySerial,
    fixWorkItem,
    batchFixWorkItems,
    loadWorkItemDetail,
    resolveAttachment,
    viewFixWorkspace: activateAndRevealWorktree
  }
}
