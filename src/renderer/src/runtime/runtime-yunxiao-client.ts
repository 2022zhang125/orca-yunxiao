import type { GlobalSettings } from '../../../shared/global-settings-types'
import type {
  YunxiaoAccountSelection,
  YunxiaoComment,
  YunxiaoConnectionStatus,
  YunxiaoCreateWorkItemArgs,
  YunxiaoCreateWorkItemResult,
  YunxiaoMutationResult,
  YunxiaoProject,
  YunxiaoViewer,
  YunxiaoWorkItem,
  YunxiaoWorkItemCategory,
  YunxiaoWorkItemFile,
  YunxiaoWorkItemFilter,
  YunxiaoWorkItemType,
  YunxiaoWorkItemUpdate
} from '../../../shared/yunxiao-types'
import { callRuntimeRpc, getActiveRuntimeTarget } from './runtime-rpc-client'
import {
  getTaskSourceRuntimeSettings,
  type TaskSourceContext
} from '../../../shared/task-source-context'
import { isRuntimeProviderSearchQueryWithinLimit } from './runtime-provider-search-bounds'

export type RuntimeYunxiaoSettings =
  | Pick<GlobalSettings, 'activeRuntimeEnvironmentId'>
  | TaskSourceContext
  | null
  | undefined

export type YunxiaoConnectResult =
  | { ok: true; viewer: YunxiaoViewer }
  | { ok: false; error: string }
export type YunxiaoCommentResult = { ok: true; id: string } | { ok: false; error: string }

function isTaskSourceRuntimeSettings(
  settings: RuntimeYunxiaoSettings
): settings is TaskSourceContext {
  return settings !== null && settings !== undefined && 'kind' in settings
}

function getYunxiaoRuntimeTarget(
  settings: RuntimeYunxiaoSettings
): ReturnType<typeof getActiveRuntimeTarget> {
  return getActiveRuntimeTarget(
    isTaskSourceRuntimeSettings(settings) ? getTaskSourceRuntimeSettings(settings) : settings
  )
}

export async function yunxiaoStatus(
  settings: RuntimeYunxiaoSettings
): Promise<YunxiaoConnectionStatus> {
  const target = getYunxiaoRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<YunxiaoConnectionStatus>(target, 'yunxiao.status', undefined, {
        timeoutMs: 15_000
      })
    : window.api.yunxiao.status()
}

export async function yunxiaoConnect(
  settings: RuntimeYunxiaoSettings,
  args: { organizationId: string; accessToken: string; endpoint?: string }
): Promise<YunxiaoConnectResult> {
  const target = getYunxiaoRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<YunxiaoConnectResult>(target, 'yunxiao.connect', args, { timeoutMs: 30_000 })
    : window.api.yunxiao.connect(args)
}

export async function yunxiaoDisconnect(
  settings: RuntimeYunxiaoSettings,
  accountId?: string | null
): Promise<void> {
  const target = getYunxiaoRuntimeTarget(settings)
  if (target.kind === 'environment') {
    await callRuntimeRpc<{ ok: true }>(
      target,
      'yunxiao.disconnect',
      accountId ? { accountId } : undefined,
      { timeoutMs: 15_000 }
    )
    return
  }
  await window.api.yunxiao.disconnect(accountId ? { accountId } : undefined)
}

export async function yunxiaoSelectAccount(
  settings: RuntimeYunxiaoSettings,
  accountId: YunxiaoAccountSelection
): Promise<YunxiaoConnectionStatus> {
  const target = getYunxiaoRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<YunxiaoConnectionStatus>(
        target,
        'yunxiao.selectAccount',
        { accountId },
        { timeoutMs: 15_000 }
      )
    : window.api.yunxiao.selectAccount({ accountId })
}

export async function yunxiaoTestConnection(
  settings: RuntimeYunxiaoSettings,
  accountId?: string | null
): Promise<YunxiaoConnectResult> {
  const target = getYunxiaoRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<YunxiaoConnectResult>(
        target,
        'yunxiao.testConnection',
        accountId ? { accountId } : undefined,
        { timeoutMs: 30_000 }
      )
    : window.api.yunxiao.testConnection(accountId ? { accountId } : undefined)
}

export async function yunxiaoSearchWorkItems(
  settings: RuntimeYunxiaoSettings,
  query: string,
  limit?: number,
  accountId?: YunxiaoAccountSelection | null
): Promise<YunxiaoWorkItem[]> {
  if (!isRuntimeProviderSearchQueryWithinLimit(query)) {
    return []
  }
  const target = getYunxiaoRuntimeTarget(settings)
  const args = { query, limit, accountId: accountId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<YunxiaoWorkItem[]>(target, 'yunxiao.searchWorkItems', args, {
        timeoutMs: 30_000
      })
    : window.api.yunxiao.searchWorkItems(args)
}

export async function yunxiaoListWorkItems(
  settings: RuntimeYunxiaoSettings,
  filter?: YunxiaoWorkItemFilter,
  limit?: number,
  accountId?: YunxiaoAccountSelection | null,
  projectId?: string
): Promise<YunxiaoWorkItem[]> {
  const target = getYunxiaoRuntimeTarget(settings)
  const args = { filter, limit, accountId: accountId ?? undefined, projectId }
  return target.kind === 'environment'
    ? callRuntimeRpc<YunxiaoWorkItem[]>(target, 'yunxiao.listWorkItems', args, {
        timeoutMs: 30_000
      })
    : window.api.yunxiao.listWorkItems(args)
}

export async function yunxiaoGetWorkItem(
  settings: RuntimeYunxiaoSettings,
  workItemId: string,
  accountId?: string | null
): Promise<YunxiaoWorkItem | null> {
  const target = getYunxiaoRuntimeTarget(settings)
  const args = { workItemId, accountId: accountId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<YunxiaoWorkItem | null>(target, 'yunxiao.getWorkItem', args, {
        timeoutMs: 30_000
      })
    : window.api.yunxiao.getWorkItem(args)
}

export async function yunxiaoGetWorkItemFile(
  settings: RuntimeYunxiaoSettings,
  workItemId: string,
  fileId: string,
  accountId?: string | null
): Promise<YunxiaoWorkItemFile | null> {
  const target = getYunxiaoRuntimeTarget(settings)
  const args = { workItemId, fileId, accountId: accountId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<YunxiaoWorkItemFile | null>(target, 'yunxiao.getWorkItemFile', args, {
        timeoutMs: 30_000
      })
    : window.api.yunxiao.getWorkItemFile(args)
}

export async function yunxiaoCreateWorkItem(
  settings: RuntimeYunxiaoSettings,
  args: YunxiaoCreateWorkItemArgs
): Promise<YunxiaoCreateWorkItemResult> {
  const target = getYunxiaoRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<YunxiaoCreateWorkItemResult>(target, 'yunxiao.createWorkItem', args, {
        timeoutMs: 30_000
      })
    : window.api.yunxiao.createWorkItem(args)
}

export async function yunxiaoUpdateWorkItem(
  settings: RuntimeYunxiaoSettings,
  workItemId: string,
  updates: YunxiaoWorkItemUpdate,
  accountId?: string | null
): Promise<YunxiaoMutationResult> {
  const target = getYunxiaoRuntimeTarget(settings)
  const args = { workItemId, updates, accountId: accountId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<YunxiaoMutationResult>(target, 'yunxiao.updateWorkItem', args, {
        timeoutMs: 30_000
      })
    : window.api.yunxiao.updateWorkItem(args)
}

export async function yunxiaoAddWorkItemComment(
  settings: RuntimeYunxiaoSettings,
  workItemId: string,
  body: string,
  accountId?: string | null
): Promise<YunxiaoCommentResult> {
  const target = getYunxiaoRuntimeTarget(settings)
  const args = { workItemId, body, accountId: accountId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<YunxiaoCommentResult>(target, 'yunxiao.addWorkItemComment', args, {
        timeoutMs: 30_000
      })
    : window.api.yunxiao.addWorkItemComment(args)
}

export async function yunxiaoWorkItemComments(
  settings: RuntimeYunxiaoSettings,
  workItemId: string,
  accountId?: string | null
): Promise<YunxiaoComment[]> {
  const target = getYunxiaoRuntimeTarget(settings)
  const args = { workItemId, accountId: accountId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<YunxiaoComment[]>(target, 'yunxiao.workItemComments', args, {
        timeoutMs: 30_000
      })
    : window.api.yunxiao.workItemComments(args)
}

export async function yunxiaoListProjects(
  settings: RuntimeYunxiaoSettings,
  accountId?: YunxiaoAccountSelection | null
): Promise<YunxiaoProject[]> {
  const target = getYunxiaoRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<YunxiaoProject[]>(
        target,
        'yunxiao.listProjects',
        accountId ? { accountId } : undefined,
        { timeoutMs: 30_000 }
      )
    : window.api.yunxiao.listProjects(accountId ? { accountId } : undefined)
}

export async function yunxiaoListWorkItemTypes(
  settings: RuntimeYunxiaoSettings,
  spaceId: string,
  category?: YunxiaoWorkItemCategory,
  accountId?: string | null
): Promise<YunxiaoWorkItemType[]> {
  const target = getYunxiaoRuntimeTarget(settings)
  const args = { spaceId, category, accountId: accountId ?? undefined }
  return target.kind === 'environment'
    ? callRuntimeRpc<YunxiaoWorkItemType[]>(target, 'yunxiao.listWorkItemTypes', args, {
        timeoutMs: 30_000
      })
    : window.api.yunxiao.listWorkItemTypes(args)
}
