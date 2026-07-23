// 云效 (Alibaba Cloud DevOps) exposes one OpenAPI endpoint per region and scopes
// every project-management call to an organization id, so a connection is an
// (endpoint, organization, personal access token) triple rather than a site URL.

export type YunxiaoOrganization = {
  id: string
  name: string
}

export type YunxiaoAccount = {
  id: string
  endpoint: string
  organizationId: string
  organizationName: string
  userId: string
  displayName: string
  email?: string | null
}

export type YunxiaoViewer = {
  userId: string
  displayName: string
  email: string | null
  organizationId?: string
  organizationName?: string
}

export type YunxiaoAccountSelection = string | 'all'

export type YunxiaoConnectionStatus = {
  connected: boolean
  viewer: YunxiaoViewer | null
  accounts?: YunxiaoAccount[]
  activeAccountId?: string | null
  selectedAccountId?: YunxiaoAccountSelection | null
  // Set when a stored token file exists but could not be decrypted, so the UI
  // can explain reads failing while the connection still looks saved.
  credentialError?: string
}

export type YunxiaoProject = {
  id: string
  name: string
  accountId?: string
  organizationId?: string
  organizationName?: string
}

/** 云效 groups work items into categories; each category has org-defined types. */
export type YunxiaoWorkItemCategory = 'Req' | 'Task' | 'Bug'

export type YunxiaoWorkItemType = {
  id: string
  name: string
  category: YunxiaoWorkItemCategory
}

export type YunxiaoUser = {
  userId: string
  displayName: string
  email?: string | null
  avatarUrl?: string
}

export type YunxiaoStatus = {
  id: string
  name: string
  /** Workflow stage the status belongs to; drives done/in-progress tone. */
  stage: YunxiaoStatusStage
}

export type YunxiaoStatusStage = 'todo' | 'in-progress' | 'done' | 'unknown'

/** 云效 assigns each label a hex color; `color` is absent when it fails validation. */
export type YunxiaoLabel = {
  name: string
  color?: string
}

export type YunxiaoWorkItem = {
  id: string
  /** Human-facing identifier shown in the 云效 UI (falls back to the raw id). */
  serialNumber: string
  accountId?: string
  organizationId?: string
  organizationName?: string
  title: string
  description?: string
  url: string
  project: YunxiaoProject
  workItemType: YunxiaoWorkItemType
  status: YunxiaoStatus
  labels: YunxiaoLabel[]
  assignee?: YunxiaoUser
  creator?: YunxiaoUser
  priority?: string
  sprintName?: string
  updatedAt: string
  createdAt: string
}

/**
 * A file embedded in a work item description or attached to it. `url` is a
 * pre-signed OSS link that needs no credentials but expires within minutes, so
 * resolve it when the viewer opens rather than caching it with the work item.
 */
export type YunxiaoWorkItemFile = {
  id: string
  name: string
  url: string
  /** Lowercase extension without the dot, e.g. `png`. Absent when unknown. */
  suffix?: string
  sizeBytes?: number
}

export type YunxiaoComment = {
  id: string
  body: string
  createdAt: string
  updatedAt?: string
  user?: YunxiaoUser
}

export type YunxiaoWorkItemUpdate = {
  title?: string
  statusId?: string
  assigneeUserId?: string | null
  priority?: string | null
  labels?: string[]
}

export type YunxiaoWorkItemFilter = 'assigned' | 'created' | 'all' | 'done'

export type YunxiaoConnectArgs = {
  organizationId: string
  accessToken: string
  /** Defaults to the public OpenAPI host when omitted. */
  endpoint?: string
}

export type YunxiaoCreateWorkItemArgs = {
  accountId?: string
  spaceId: string
  workItemTypeId: string
  title: string
  description?: string
  assigneeUserId?: string
}

export type YunxiaoCreateWorkItemResult =
  | { ok: true; id: string; serialNumber: string; url: string }
  | { ok: false; error: string }

export type YunxiaoMutationResult = { ok: true } | { ok: false; error: string }

export const YUNXIAO_DEFAULT_ENDPOINT = 'https://openapi-rdc.aliyuncs.com'

export const YUNXIAO_WEB_BASE_URL = 'https://devops.aliyun.com'
