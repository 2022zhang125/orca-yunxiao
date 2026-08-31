import { useCallback, useEffect, useMemo, useState } from 'react'

import { TASK_SEARCH_DEBOUNCE_MS } from '@/components/task-page/task-page-list-limits'
import { translate } from '@/i18n/i18n'
import { yunxiaoListProjects, yunxiaoListWorkItems } from '@/runtime/runtime-yunxiao-client'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type {
  YunxiaoAccountSelection,
  YunxiaoConnectionStatus,
  YunxiaoProject,
  YunxiaoWorkItem
} from '../../../../../shared/yunxiao-types'
import {
  filterYunxiaoProjectWorkItems,
  getYunxiaoProjectKey,
  getYunxiaoProjectViewerUserId,
  normalizeYunxiaoProjects
} from './yunxiao-project-work-items'

const YUNXIAO_ITEM_LIMIT = 100

type UseYunxiaoProjectWorkItemsArgs = {
  connected: boolean
  status: YunxiaoConnectionStatus
  selectedAccountId: YunxiaoAccountSelection | null
  sourceContext: TaskSourceContext | null
  listRefreshNonce: number
}

export function useYunxiaoProjectWorkItems({
  connected,
  status,
  selectedAccountId,
  sourceContext,
  listRefreshNonce
}: UseYunxiaoProjectWorkItemsArgs) {
  const [projects, setProjects] = useState<YunxiaoProject[]>([])
  const [activeProjectKey, setActiveProjectKey] = useState<string | null>(null)
  const [projectWorkItems, setProjectWorkItems] = useState<YunxiaoWorkItem[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [workItemsLoading, setWorkItemsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [workItemsError, setWorkItemsError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    const timeout = window.setTimeout(() => setAppliedSearch(searchInput), TASK_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    if (!connected) {
      setProjects([])
      setActiveProjectKey(null)
      return
    }
    let cancelled = false
    setProjectsLoading(true)
    setProjectsError(null)
    void yunxiaoListProjects(sourceContext, selectedAccountId)
      .then((result) => {
        if (cancelled) {
          return
        }
        const nextProjects = normalizeYunxiaoProjects(result)
        setProjects(nextProjects)
        setActiveProjectKey((current) =>
          current && nextProjects.some((project) => getYunxiaoProjectKey(project) === current)
            ? current
            : nextProjects[0]
              ? getYunxiaoProjectKey(nextProjects[0])
              : null
        )
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setProjects([])
          setActiveProjectKey(null)
          setProjectsError(toLoadError(reason, 'Failed to load 云效 projects.'))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProjectsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [connected, listRefreshNonce, refreshNonce, selectedAccountId, sourceContext])

  const activeProject = useMemo(
    () => projects.find((project) => getYunxiaoProjectKey(project) === activeProjectKey) ?? null,
    [activeProjectKey, projects]
  )

  useEffect(() => {
    if (!connected || !activeProject) {
      setProjectWorkItems([])
      setWorkItemsLoading(false)
      return
    }
    let cancelled = false
    setProjectWorkItems([])
    setWorkItemsLoading(true)
    setWorkItemsError(null)
    void yunxiaoListWorkItems(
      sourceContext,
      'assigned',
      YUNXIAO_ITEM_LIMIT,
      activeProject.accountId ?? selectedAccountId,
      activeProject.id
    )
      .then((items) => {
        if (!cancelled) {
          setProjectWorkItems(items)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setProjectWorkItems([])
          setWorkItemsError(toLoadError(reason, 'Failed to load 云效 work items.'))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setWorkItemsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeProject, connected, listRefreshNonce, refreshNonce, selectedAccountId, sourceContext])

  const viewerUserId = activeProject ? getYunxiaoProjectViewerUserId(status, activeProject) : null
  const workItems = useMemo(
    () =>
      activeProject
        ? filterYunxiaoProjectWorkItems(
            projectWorkItems,
            activeProject,
            viewerUserId,
            appliedSearch
          )
        : [],
    [activeProject, appliedSearch, projectWorkItems, viewerUserId]
  )

  const refresh = useCallback(() => setRefreshNonce((value) => value + 1), [])

  return {
    projects,
    activeProject,
    activeProjectKey,
    setActiveProjectKey,
    workItems,
    loading: projectsLoading || workItemsLoading,
    error: projectsError ?? workItemsError,
    searchInput,
    setSearchInput,
    refresh
  }
}

function toLoadError(reason: unknown, fallback: string): string {
  return reason instanceof Error
    ? reason.message
    : translate('auto.components.TaskPage.yunxiao_load_failed', fallback)
}
