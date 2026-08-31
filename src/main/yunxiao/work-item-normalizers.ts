import {
  YUNXIAO_WEB_BASE_URL,
  type YunxiaoLabel,
  type YunxiaoProject,
  type YunxiaoStatus,
  type YunxiaoStatusStage,
  type YunxiaoUser,
  type YunxiaoWorkItem,
  type YunxiaoWorkItemCategory
} from '../../shared/yunxiao-types'
import type { YunxiaoClientForAccount } from './request'
import { unwrapWorkItemDescription } from './work-item-description'

export type RawRecord = Record<string, unknown>

export function asRecord(value: unknown): RawRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawRecord) : null
}

// Why: 云效 spells the same concept differently across endpoints (id vs
// identifier, subject vs title), so every read tries a candidate list.
export function firstString(record: RawRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
  }
  return undefined
}

/** 云效 wraps collections in `result` on some endpoints and not others. */
export function toArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }
  const record = asRecord(payload)
  if (!record) {
    return []
  }
  for (const key of ['result', 'workitems', 'data', 'items', 'list']) {
    const value = record[key]
    if (Array.isArray(value)) {
      return value
    }
  }
  return []
}

export function toIsoDate(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString()
  }
  return new Date(0).toISOString()
}

export function normalizeUser(value: unknown): YunxiaoUser | undefined {
  const record = asRecord(value)
  if (!record) {
    return typeof value === 'string' && value.trim()
      ? { userId: value, displayName: value }
      : undefined
  }
  const userId = firstString(record, ['id', 'userId', 'identifier'])
  if (!userId) {
    return undefined
  }
  return {
    userId,
    displayName: firstString(record, ['name', 'nickName', 'displayName']) ?? userId,
    email: firstString(record, ['email']) ?? null,
    avatarUrl: firstString(record, ['avatar', 'avatarUrl'])
  }
}

function normalizeStatusStage(value: string | undefined): YunxiaoStatusStage {
  switch (value?.toUpperCase()) {
    // Why: workitems:search returns the stage as a numeric `statusStageId`
    // (1 = not started, 2 = in progress, 3 = fixed/end, 4 = closed).
    case '1':
      return 'todo'
    case '2':
      return 'in-progress'
    case '3':
    case '4':
      return 'done'
    case 'END':
    case 'COMPLETED':
    case 'CLOSED':
    case 'DONE':
      return 'done'
    case 'PROCESSING':
    case 'IN_PROGRESS':
    case 'PROGRESS':
      return 'in-progress'
    case 'START':
    case 'TODO':
    case 'UNCONFIRMED':
      return 'todo'
    default:
      return 'unknown'
  }
}

function normalizeStatus(record: RawRecord): YunxiaoStatus {
  const statusRecord = asRecord(record.status)
  const name =
    (statusRecord ? firstString(statusRecord, ['name', 'displayName']) : undefined) ??
    (typeof record.status === 'string' ? record.status : undefined) ??
    firstString(record, ['statusName']) ??
    'Unknown'
  const id =
    (statusRecord ? firstString(statusRecord, ['id', 'identifier']) : undefined) ??
    firstString(record, ['statusIdentifier', 'statusId']) ??
    name
  const stage =
    (statusRecord
      ? firstString(statusRecord, ['stageIdentifier', 'stage', 'stageId'])
      : undefined) ??
    firstString(record, [
      'statusStageIdentifier',
      'statusStage',
      'stageIdentifier',
      'statusStageId'
    ])
  return { id, name, stage: normalizeStatusStage(stage) }
}

/**
 * 云效 does not return priority (or severity) as a column — workitems:search
 * files them under `customFieldValues`, keyed by `fieldId`. Reading the missing
 * top-level key left every row labelled "No priority".
 */
export function readCustomFieldValue(record: RawRecord, fieldId: string): string | undefined {
  const fields = record.customFieldValues
  if (!Array.isArray(fields)) {
    return undefined
  }
  for (const entry of fields) {
    const field = asRecord(entry)
    if (!field || firstString(field, ['fieldId', 'fieldIdentifier']) !== fieldId) {
      continue
    }
    const values = Array.isArray(field.values) ? field.values : []
    for (const value of values) {
      const valueRecord = asRecord(value)
      const display = valueRecord
        ? firstString(valueRecord, ['displayValue', 'value', 'name'])
        : undefined
      if (display) {
        return display
      }
    }
  }
  return undefined
}

export function normalizeCategory(value: string | undefined): YunxiaoWorkItemCategory {
  switch (value) {
    case 'Bug':
      return 'Bug'
    case 'Task':
      return 'Task'
    default:
      return 'Req'
  }
}

// Label colors are remote data interpolated into CSS, so only accept literal hex.
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

function normalizeLabelColor(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && HEX_COLOR.test(trimmed) ? trimmed : undefined
}

function normalizeLabels(record: RawRecord): YunxiaoLabel[] {
  for (const key of ['labels', 'tags']) {
    const value = record[key]
    if (!Array.isArray(value)) {
      continue
    }
    return value.flatMap((entry) => {
      if (typeof entry === 'string') {
        return [{ name: entry }]
      }
      const labelRecord = asRecord(entry)
      const name = labelRecord ? firstString(labelRecord, ['name', 'label']) : undefined
      if (!name) {
        return []
      }
      const color = normalizeLabelColor(firstString(labelRecord!, ['color', 'colour']))
      return [color ? { name, color } : { name }]
    })
  }
  return []
}

export function buildWorkItemUrl(
  organizationId: string,
  spaceId: string,
  workItemId: string
): string {
  return `${YUNXIAO_WEB_BASE_URL}/projex/project/${encodeURIComponent(spaceId)}/task/${encodeURIComponent(workItemId)}?orgId=${encodeURIComponent(organizationId)}`
}

export function normalizeProject(
  client: YunxiaoClientForAccount,
  record: RawRecord | null,
  fallbackId: string
): YunxiaoProject {
  const id = record ? (firstString(record, ['id', 'identifier']) ?? fallbackId) : fallbackId
  return {
    id,
    name: record ? (firstString(record, ['name']) ?? id) : id,
    accountId: client.account.id,
    organizationId: client.account.organizationId,
    organizationName: client.account.organizationName
  }
}

export function normalizeWorkItem(
  client: YunxiaoClientForAccount,
  raw: unknown,
  fallbackSpaceId?: string
): YunxiaoWorkItem | null {
  const record = asRecord(raw)
  if (!record) {
    return null
  }
  const id = firstString(record, ['id', 'identifier', 'workitemIdentifier'])
  if (!id) {
    return null
  }
  const spaceRecord = asRecord(record.space) ?? asRecord(record.project)
  const spaceId =
    firstString(record, ['spaceIdentifier', 'spaceId', 'projectIdentifier']) ??
    (spaceRecord ? firstString(spaceRecord, ['id', 'identifier']) : undefined) ??
    fallbackSpaceId ??
    ''
  const typeRecord = asRecord(record.workitemType) ?? asRecord(record.workitemTypeVO)
  const category = normalizeCategory(
    // Why: workitems:search spells it `categoryId`; other endpoints use
    // `categoryIdentifier`. Missing a spelling silently demotes Bugs to Req.
    firstString(record, ['categoryIdentifier', 'category', 'categoryId']) ??
      (typeRecord
        ? firstString(typeRecord, ['categoryIdentifier', 'category', 'categoryId'])
        : undefined)
  )
  const sprintRecord = asRecord(record.sprint)

  return {
    id,
    serialNumber: firstString(record, ['serialNumber', 'code']) ?? id,
    accountId: client.account.id,
    organizationId: client.account.organizationId,
    organizationName: client.account.organizationName,
    title: firstString(record, ['subject', 'title', 'name']) ?? id,
    description: unwrapWorkItemDescription(firstString(record, ['description', 'descriptionText'])),
    url: buildWorkItemUrl(client.account.organizationId, spaceId, id),
    project: normalizeProject(client, spaceRecord, spaceId),
    workItemType: {
      id:
        (typeRecord ? firstString(typeRecord, ['id', 'identifier']) : undefined) ??
        firstString(record, ['workitemTypeIdentifier', 'workitemTypeId']) ??
        category,
      name:
        (typeRecord ? firstString(typeRecord, ['name']) : undefined) ??
        firstString(record, ['workitemTypeName']) ??
        category,
      category
    },
    status: normalizeStatus(record),
    labels: normalizeLabels(record),
    assignee: normalizeUser(record.assignedTo ?? record.assignedToUser ?? record.assignee),
    creator: normalizeUser(record.creator ?? record.createUser),
    priority:
      // Other endpoints nest it as an object; search omits it entirely and only
      // the custom field carries it.
      firstString(asRecord(record.priority) ?? {}, ['displayValue', 'name', 'value']) ??
      firstString(record, ['priority', 'priorityName']) ??
      readCustomFieldValue(record, 'priority'),
    sprintName: sprintRecord
      ? firstString(sprintRecord, ['name'])
      : firstString(record, ['sprintName']),
    createdAt: toIsoDate(record.gmtCreate ?? record.createdAt),
    updatedAt: toIsoDate(record.gmtModified ?? record.updatedAt ?? record.gmtCreate)
  }
}
