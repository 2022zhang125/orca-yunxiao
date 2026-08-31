import { ipcMain } from 'electron'
import { connect, disconnect, getStatus, selectAccount, testConnection } from '../yunxiao/client'
import { _resetPreflightCache } from './preflight'
import {
  getWorkItem,
  getWorkItemFile,
  getWorkItemComments,
  listWorkItems,
  searchWorkItems
} from '../yunxiao/work-items'
import { addWorkItemComment, createWorkItem, updateWorkItem } from '../yunxiao/work-item-mutations'
import { listProjects, listWorkItemTypes } from '../yunxiao/projects'
import type {
  YunxiaoAccountSelection,
  YunxiaoConnectArgs,
  YunxiaoCreateWorkItemArgs,
  YunxiaoWorkItemCategory,
  YunxiaoWorkItemFilter,
  YunxiaoWorkItemUpdate
} from '../../shared/yunxiao-types'

const VALID_FILTERS = new Set<YunxiaoWorkItemFilter>(['assigned', 'created', 'all', 'done'])
const VALID_CATEGORIES = new Set<YunxiaoWorkItemCategory>(['Req', 'Task', 'Bug'])

function normalizeAccountId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeAccountSelection(value: unknown): YunxiaoAccountSelection | undefined {
  return normalizeAccountId(value) as YunxiaoAccountSelection | undefined
}

function clampLimit(value: unknown, fallback = 30): number {
  const limit = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(Math.max(1, limit), 100)
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined
  }
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined
}

function normalizeWorkItemUpdate(value: unknown): YunxiaoWorkItemUpdate | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const input = value as YunxiaoWorkItemUpdate
  if (input.title !== undefined && typeof input.title !== 'string') {
    return null
  }
  if (input.statusId !== undefined && typeof input.statusId !== 'string') {
    return null
  }
  if (
    input.assigneeUserId !== undefined &&
    input.assigneeUserId !== null &&
    typeof input.assigneeUserId !== 'string'
  ) {
    return null
  }
  if (
    input.priority !== undefined &&
    input.priority !== null &&
    typeof input.priority !== 'string'
  ) {
    return null
  }
  if (input.labels !== undefined && normalizeStringArray(input.labels) === undefined) {
    return null
  }
  return input
}

export function registerYunxiaoHandlers(): void {
  ipcMain.handle('yunxiao:connect', async (_event, args: YunxiaoConnectArgs) => {
    if (typeof args?.organizationId !== 'string' || typeof args?.accessToken !== 'string') {
      return { ok: false, error: 'Organization ID and personal access token are required.' }
    }
    const result = await connect({
      organizationId: args.organizationId,
      accessToken: args.accessToken,
      endpoint: typeof args.endpoint === 'string' ? args.endpoint : undefined
    })
    if (result.ok) {
      _resetPreflightCache()
    }
    return result
  })

  ipcMain.handle('yunxiao:disconnect', async (_event, args?: { accountId?: string }) => {
    disconnect(normalizeAccountId(args?.accountId))
    _resetPreflightCache()
  })

  ipcMain.handle(
    'yunxiao:selectAccount',
    async (_event, args: { accountId: YunxiaoAccountSelection }) => {
      const accountId = normalizeAccountSelection(args?.accountId)
      if (!accountId) {
        return getStatus()
      }
      return selectAccount(accountId)
    }
  )

  ipcMain.handle('yunxiao:status', async () => {
    return getStatus()
  })

  ipcMain.handle('yunxiao:testConnection', async (_event, args?: { accountId?: string }) => {
    return testConnection(normalizeAccountId(args?.accountId))
  })

  ipcMain.handle(
    'yunxiao:searchWorkItems',
    async (
      _event,
      args: { query: string; limit?: number; accountId?: YunxiaoAccountSelection }
    ) => {
      if (typeof args?.query !== 'string') {
        return []
      }
      return searchWorkItems(
        args.query,
        clampLimit(args.limit),
        normalizeAccountSelection(args.accountId)
      )
    }
  )

  ipcMain.handle(
    'yunxiao:listWorkItems',
    async (
      _event,
      args?: {
        filter?: YunxiaoWorkItemFilter
        limit?: number
        accountId?: YunxiaoAccountSelection
        projectId?: string
      }
    ) => {
      const filter = VALID_FILTERS.has(args?.filter as YunxiaoWorkItemFilter)
        ? (args!.filter as YunxiaoWorkItemFilter)
        : undefined
      return listWorkItems(
        filter,
        clampLimit(args?.limit),
        normalizeAccountSelection(args?.accountId),
        normalizeAccountId(args?.projectId)
      )
    }
  )

  ipcMain.handle(
    'yunxiao:getWorkItem',
    async (_event, args: { workItemId: string; accountId?: string }) => {
      if (typeof args?.workItemId !== 'string' || !args.workItemId.trim()) {
        return null
      }
      return getWorkItem(args.workItemId.trim(), normalizeAccountId(args.accountId))
    }
  )

  ipcMain.handle(
    'yunxiao:getWorkItemFile',
    async (_event, args: { workItemId: string; fileId: string; accountId?: string }) => {
      if (typeof args?.workItemId !== 'string' || !args.workItemId.trim()) {
        return null
      }
      if (typeof args?.fileId !== 'string' || !args.fileId.trim()) {
        return null
      }
      return getWorkItemFile(
        args.workItemId.trim(),
        args.fileId.trim(),
        normalizeAccountId(args.accountId)
      )
    }
  )

  ipcMain.handle('yunxiao:createWorkItem', async (_event, args: YunxiaoCreateWorkItemArgs) => {
    if (typeof args?.spaceId !== 'string' || !args.spaceId.trim()) {
      return { ok: false, error: 'Project is required.' }
    }
    if (typeof args?.workItemTypeId !== 'string' || !args.workItemTypeId.trim()) {
      return { ok: false, error: 'Work item type is required.' }
    }
    if (typeof args?.title !== 'string' || !args.title.trim()) {
      return { ok: false, error: 'Title is required.' }
    }
    return createWorkItem({
      accountId: normalizeAccountId(args.accountId),
      spaceId: args.spaceId.trim(),
      workItemTypeId: args.workItemTypeId.trim(),
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      assigneeUserId: normalizeAccountId(args.assigneeUserId)
    })
  })

  ipcMain.handle(
    'yunxiao:updateWorkItem',
    async (
      _event,
      args: { workItemId: string; updates: YunxiaoWorkItemUpdate; accountId?: string }
    ) => {
      if (typeof args?.workItemId !== 'string' || !args.workItemId.trim()) {
        return { ok: false, error: 'Work item ID is required.' }
      }
      const updates = normalizeWorkItemUpdate(args.updates)
      if (!updates) {
        return { ok: false, error: 'Updates object is required.' }
      }
      return updateWorkItem(args.workItemId.trim(), updates, normalizeAccountId(args.accountId))
    }
  )

  ipcMain.handle(
    'yunxiao:addWorkItemComment',
    async (_event, args: { workItemId: string; body: string; accountId?: string }) => {
      if (typeof args?.workItemId !== 'string' || !args.workItemId.trim()) {
        return { ok: false, error: 'Work item ID is required.' }
      }
      if (typeof args?.body !== 'string' || !args.body.trim()) {
        return { ok: false, error: 'Comment body is required.' }
      }
      return addWorkItemComment(
        args.workItemId.trim(),
        args.body.trim(),
        normalizeAccountId(args.accountId)
      )
    }
  )

  ipcMain.handle(
    'yunxiao:workItemComments',
    async (_event, args: { workItemId: string; accountId?: string }) => {
      if (typeof args?.workItemId !== 'string' || !args.workItemId.trim()) {
        return []
      }
      return getWorkItemComments(args.workItemId.trim(), normalizeAccountId(args.accountId))
    }
  )

  ipcMain.handle(
    'yunxiao:listProjects',
    async (_event, args?: { accountId?: YunxiaoAccountSelection }) => {
      return listProjects(normalizeAccountSelection(args?.accountId))
    }
  )

  ipcMain.handle(
    'yunxiao:listWorkItemTypes',
    async (
      _event,
      args: { spaceId: string; category?: YunxiaoWorkItemCategory; accountId?: string }
    ) => {
      if (typeof args?.spaceId !== 'string' || !args.spaceId.trim()) {
        return []
      }
      const category = VALID_CATEGORIES.has(args.category as YunxiaoWorkItemCategory)
        ? (args.category as YunxiaoWorkItemCategory)
        : undefined
      return listWorkItemTypes(args.spaceId.trim(), category, normalizeAccountId(args.accountId))
    }
  )
}
