import type {
  YunxiaoAccountSelection,
  YunxiaoComment,
  YunxiaoWorkItem,
  YunxiaoWorkItemCategory,
  YunxiaoWorkItemFile,
  YunxiaoWorkItemFilter
} from '../../shared/types'
import { isYunxiaoOutstandingStatus } from '../../shared/yunxiao-defect-status'
import { acquire, getClients, release, yunxiaoRequest } from './client'
import type { YunxiaoClientForAccount } from './request'
import { fetchProjects } from './projects'
import {
  asRecord,
  firstString,
  normalizeUser,
  normalizeWorkItem,
  toArray,
  toIsoDate
} from './work-item-normalizers'

// Why: workitems:search is scoped to one project, so a cross-project list fans
// out. Bound the fan-out to keep a large organization from issuing 100+ calls.
const MAX_PROJECTS_PER_LIST = 10

const ALL_CATEGORIES: YunxiaoWorkItemCategory[] = ['Req', 'Task', 'Bug']

/** The API ceiling for workitems:search. */
const SEARCH_PAGE_SIZE = 200

// Why: workitems:search filters on numeric stage ids, not symbolic names;
// sending 'END' matches nothing and silently empties the Done preset.
// 3 = fixed/end, 4 = closed — both are finished work for the Done tab.
const END_STATUS_STAGE_IDS = '3,4'

export function workItemsPath(client: YunxiaoClientForAccount, suffix = ''): string {
  return `/oapi/v1/projex/organizations/${encodeURIComponent(client.account.organizationId)}/workitems${suffix}`
}

type WorkItemSearchBody = {
  category: string
  spaceId: string
  spaceType: 'Project'
  page: number
  perPage: number
  orderBy: string
  sort: 'desc' | 'asc'
  assignedTo?: string
  creator?: string
  statusStage?: string
  subject?: string
}

export function buildSearchBody(args: {
  spaceId: string
  filter: YunxiaoWorkItemFilter
  limit: number
  subject?: string
}): WorkItemSearchBody {
  const body: WorkItemSearchBody = {
    category: ALL_CATEGORIES.join(','),
    spaceId: args.spaceId,
    spaceType: 'Project',
    page: 1,
    // Why not `limit`: the caller ranks the pooled result and keeps the best
    // `limit`, so fetching only `limit` per project makes that ranking a no-op —
    // whatever the API happened to put on page 1 wins. Ask for the API maximum
    // (one request either way) so the ranking sees the whole assignment.
    perPage: SEARCH_PAGE_SIZE,
    // 云效 accepts gmtCreate/subject/status/priority/assignedTo here and ignores
    // anything else, so gmtModified silently fell back to the default ordering.
    orderBy: 'gmtCreate',
    sort: 'desc'
  }
  if (args.subject) {
    body.subject = args.subject
  }
  switch (args.filter) {
    case 'assigned':
      body.assignedTo = 'self'
      break
    case 'created':
      body.creator = 'self'
      break
    case 'done':
      body.statusStage = END_STATUS_STAGE_IDS
      break
    case 'all':
      break
  }
  return body
}

async function searchWorkItemsInProject(
  client: YunxiaoClientForAccount,
  args: { spaceId: string; filter: YunxiaoWorkItemFilter; limit: number; subject?: string }
): Promise<YunxiaoWorkItem[]> {
  const payload = await yunxiaoRequest<unknown>(client, workItemsPath(client, ':search'), {
    method: 'POST',
    body: JSON.stringify(buildSearchBody(args))
  })
  return toArray(payload).flatMap((entry) => {
    const workItem = normalizeWorkItem(client, entry, args.spaceId)
    return workItem ? [workItem] : []
  })
}

function byUpdatedAtDesc(a: YunxiaoWorkItem, b: YunxiaoWorkItem): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
}

async function collectWorkItems(
  selection: YunxiaoAccountSelection | undefined,
  limit: number,
  read: (client: YunxiaoClientForAccount, spaceId: string) => Promise<YunxiaoWorkItem[]>,
  compare: (a: YunxiaoWorkItem, b: YunxiaoWorkItem) => number = byUpdatedAtDesc
): Promise<YunxiaoWorkItem[]> {
  const collected: YunxiaoWorkItem[] = []
  for (const client of getClients(selection)) {
    await acquire()
    try {
      const projects = await fetchProjects(client, MAX_PROJECTS_PER_LIST)
      const results = await Promise.all(
        projects
          .slice(0, MAX_PROJECTS_PER_LIST)
          .map((project) => read(client, project.id).catch(() => []))
      )
      collected.push(...results.flat())
    } finally {
      release()
    }
  }
  return collected.sort(compare).slice(0, limit)
}

// Why: 云效 silently ignores search-body fields it does not recognise, so a
// preset that only filtered server-side could return the same rows as every
// other preset. Re-apply the preset on the normalized result to guarantee it.
export function matchesWorkItemFilter(
  workItem: YunxiaoWorkItem,
  filter: YunxiaoWorkItemFilter,
  viewerUserId: string
): boolean {
  switch (filter) {
    case 'assigned':
      return workItem.assignee?.userId === viewerUserId
    case 'created':
      return workItem.creator?.userId === viewerUserId
    case 'done':
      return workItem.status.stage === 'done'
    case 'all':
      // Finished work is not open, and in-progress work is already surfaced by
      // the Assigned preset, so All Open is what nobody has picked up yet.
      return workItem.status.stage !== 'done' && workItem.status.stage !== 'in-progress'
  }
}

/**
 * Ranks my unresolved defects first so they survive the cross-project `limit`
 * slice instead of being crowded out by unrelated recently-touched items.
 */
export function workItemRelevanceRank(workItem: YunxiaoWorkItem, viewerIds: Set<string>): number {
  const mine = workItem.assignee?.userId !== undefined && viewerIds.has(workItem.assignee.userId)
  // 暂不修复 and 重新打开 sit in a finished stage but are still someone's problem;
  // ranking them as done buried them under every recently closed defect.
  const open = workItem.status.stage !== 'done' || isYunxiaoOutstandingStatus(workItem.status.name)
  const bug = workItem.workItemType.category === 'Bug'
  if (bug && open) {
    return mine ? 0 : 2
  }
  if (bug) {
    return mine ? 3 : 5
  }
  return mine && open ? 1 : 4
}

export async function listWorkItems(
  filter: YunxiaoWorkItemFilter = 'assigned',
  limit = 30,
  accountId?: YunxiaoAccountSelection
): Promise<YunxiaoWorkItem[]> {
  // Filled during the reads; the comparator only runs once they have all settled.
  const viewerIds = new Set<string>()
  return collectWorkItems(
    accountId,
    limit,
    async (client, spaceId) => {
      viewerIds.add(client.account.userId)
      const workItems = await searchWorkItemsInProject(client, { spaceId, filter, limit })
      return workItems.filter((workItem) =>
        matchesWorkItemFilter(workItem, filter, client.account.userId)
      )
    },
    (a, b) => {
      const rank = workItemRelevanceRank(a, viewerIds) - workItemRelevanceRank(b, viewerIds)
      return rank === 0 ? byUpdatedAtDesc(a, b) : rank
    }
  )
}

export async function searchWorkItems(
  query: string,
  limit = 30,
  accountId?: YunxiaoAccountSelection
): Promise<YunxiaoWorkItem[]> {
  const subject = query.trim()
  if (!subject) {
    return []
  }
  return collectWorkItems(accountId, limit, (client, spaceId) =>
    searchWorkItemsInProject(client, { spaceId, filter: 'all', limit, subject })
  )
}

export async function getWorkItem(
  workItemId: string,
  accountId?: string
): Promise<YunxiaoWorkItem | null> {
  for (const client of getClients(accountId)) {
    await acquire()
    try {
      const payload = await yunxiaoRequest<unknown>(
        client,
        workItemsPath(client, `/${encodeURIComponent(workItemId)}`)
      )
      const record = asRecord(payload)
      const workItem = normalizeWorkItem(client, record?.result ?? payload)
      if (workItem) {
        return workItem
      }
    } catch {
      // Try the next account — the item may belong to another organization.
    } finally {
      release()
    }
  }
  return null
}

/**
 * Resolves an embedded image or attachment to a downloadable link. 云效 renders
 * descriptions with `devops.aliyun.com/…?fileIdentifier=<id>` URLs, which are
 * session-guarded and unusable from Orca; this endpoint trades that id for a
 * pre-signed OSS URL that needs no credentials. The signature expires within
 * minutes, so callers resolve on demand instead of caching the result.
 */
export async function getWorkItemFile(
  workItemId: string,
  fileId: string,
  accountId?: string
): Promise<YunxiaoWorkItemFile | null> {
  for (const client of getClients(accountId)) {
    await acquire()
    try {
      const payload = await yunxiaoRequest<unknown>(
        client,
        workItemsPath(
          client,
          `/${encodeURIComponent(workItemId)}/files/${encodeURIComponent(fileId)}`
        )
      )
      const record = asRecord(asRecord(payload)?.result ?? payload)
      const url = record ? firstString(record, ['url', 'downloadUrl']) : undefined
      if (!record || !url) {
        continue
      }
      const size = record.size
      return {
        id: firstString(record, ['id', 'identifier']) ?? fileId,
        name: firstString(record, ['name', 'fileName']) ?? fileId,
        url,
        suffix: firstString(record, ['suffix', 'extension'])?.toLowerCase(),
        sizeBytes: typeof size === 'number' && Number.isFinite(size) ? size : undefined
      }
    } catch {
      // Try the next account — the work item may belong to another organization.
    } finally {
      release()
    }
  }
  return null
}

export async function getWorkItemComments(
  workItemId: string,
  accountId?: string
): Promise<YunxiaoComment[]> {
  const client = getClients(accountId)[0]
  if (!client) {
    return []
  }
  await acquire()
  try {
    const payload = await yunxiaoRequest<unknown>(
      client,
      workItemsPath(client, `/${encodeURIComponent(workItemId)}/comments`)
    )
    return toArray(payload).flatMap((entry) => {
      const record = asRecord(entry)
      const id = record ? firstString(record, ['id', 'identifier']) : undefined
      if (!record || !id) {
        return []
      }
      return [
        {
          id,
          body: firstString(record, ['content', 'body', 'text']) ?? '',
          createdAt: toIsoDate(record.gmtCreate ?? record.createdAt),
          updatedAt: record.gmtModified ? toIsoDate(record.gmtModified) : undefined,
          user: normalizeUser(record.user ?? record.creator ?? record.createUser)
        }
      ]
    })
  } finally {
    release()
  }
}
