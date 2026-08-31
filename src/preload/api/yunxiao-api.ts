import type {
  YunxiaoAccountSelection,
  YunxiaoComment,
  YunxiaoConnectArgs,
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
} from '../../shared/yunxiao-types'

export type YunxiaoApi = {
  connect: (
    args: YunxiaoConnectArgs
  ) => Promise<{ ok: true; viewer: YunxiaoViewer } | { ok: false; error: string }>
  disconnect: (args?: { accountId?: string }) => Promise<void>
  selectAccount: (args: { accountId: YunxiaoAccountSelection }) => Promise<YunxiaoConnectionStatus>
  status: () => Promise<YunxiaoConnectionStatus>
  testConnection: (args?: {
    accountId?: string
  }) => Promise<{ ok: true; viewer: YunxiaoViewer } | { ok: false; error: string }>
  searchWorkItems: (args: {
    query: string
    limit?: number
    accountId?: YunxiaoAccountSelection
  }) => Promise<YunxiaoWorkItem[]>
  listWorkItems: (args?: {
    filter?: YunxiaoWorkItemFilter
    limit?: number
    accountId?: YunxiaoAccountSelection
    projectId?: string
  }) => Promise<YunxiaoWorkItem[]>
  getWorkItem: (args: { workItemId: string; accountId?: string }) => Promise<YunxiaoWorkItem | null>
  getWorkItemFile: (args: {
    workItemId: string
    fileId: string
    accountId?: string
  }) => Promise<YunxiaoWorkItemFile | null>
  createWorkItem: (args: YunxiaoCreateWorkItemArgs) => Promise<YunxiaoCreateWorkItemResult>
  updateWorkItem: (args: {
    workItemId: string
    updates: YunxiaoWorkItemUpdate
    accountId?: string
  }) => Promise<YunxiaoMutationResult>
  addWorkItemComment: (args: {
    workItemId: string
    body: string
    accountId?: string
  }) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
  workItemComments: (args: { workItemId: string; accountId?: string }) => Promise<YunxiaoComment[]>
  listProjects: (args?: { accountId?: YunxiaoAccountSelection }) => Promise<YunxiaoProject[]>
  listWorkItemTypes: (args: {
    spaceId: string
    category?: YunxiaoWorkItemCategory
    accountId?: string
  }) => Promise<YunxiaoWorkItemType[]>
}
