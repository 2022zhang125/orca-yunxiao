import type {
  YunxiaoCreateWorkItemArgs,
  YunxiaoCreateWorkItemResult,
  YunxiaoMutationResult,
  YunxiaoWorkItemUpdate
} from '../../shared/yunxiao-types'
import { acquire, getClients, release, yunxiaoRequest } from './client'
import { workItemsPath } from './work-items'
import { asRecord, buildWorkItemUrl, firstString } from './work-item-normalizers'

const NOT_CONNECTED = 'Not connected to 云效.'

export async function addWorkItemComment(
  workItemId: string,
  body: string,
  accountId?: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const client = getClients(accountId)[0]
  if (!client) {
    return { ok: false, error: NOT_CONNECTED }
  }
  await acquire()
  try {
    const payload = await yunxiaoRequest<unknown>(
      client,
      workItemsPath(client, `/${encodeURIComponent(workItemId)}/comments`),
      { method: 'POST', body: JSON.stringify({ content: body, formatType: 'MARKDOWN' }) }
    )
    const record = asRecord(payload)
    const result = asRecord(record?.result) ?? record
    return { ok: true, id: (result ? firstString(result, ['id', 'identifier']) : undefined) ?? '' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Comment failed.' }
  } finally {
    release()
  }
}

function toUpdateFields(updates: YunxiaoWorkItemUpdate): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (updates.title !== undefined) {
    fields.subject = updates.title
  }
  if (updates.statusId !== undefined) {
    fields.status = updates.statusId
  }
  if (updates.assigneeUserId !== undefined && updates.assigneeUserId !== null) {
    fields.assignedTo = updates.assigneeUserId
  }
  if (updates.priority !== undefined && updates.priority !== null) {
    fields.priority = updates.priority
  }
  if (updates.labels !== undefined) {
    fields.labels = updates.labels
  }
  return fields
}

export async function updateWorkItem(
  workItemId: string,
  updates: YunxiaoWorkItemUpdate,
  accountId?: string
): Promise<YunxiaoMutationResult> {
  const client = getClients(accountId)[0]
  if (!client) {
    return { ok: false, error: NOT_CONNECTED }
  }
  const fields = toUpdateFields(updates)
  if (Object.keys(fields).length === 0) {
    return { ok: false, error: 'No supported fields to update.' }
  }

  await acquire()
  try {
    await yunxiaoRequest<unknown>(
      client,
      workItemsPath(client, `/${encodeURIComponent(workItemId)}`),
      { method: 'PUT', body: JSON.stringify(fields) }
    )
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Update failed.' }
  } finally {
    release()
  }
}

export async function createWorkItem(
  args: YunxiaoCreateWorkItemArgs
): Promise<YunxiaoCreateWorkItemResult> {
  const client = getClients(args.accountId)[0]
  if (!client) {
    return { ok: false, error: NOT_CONNECTED }
  }
  await acquire()
  try {
    const payload = await yunxiaoRequest<unknown>(client, workItemsPath(client), {
      method: 'POST',
      body: JSON.stringify({
        spaceId: args.spaceId,
        workitemTypeId: args.workItemTypeId,
        subject: args.title,
        ...(args.description ? { description: args.description, formatType: 'MARKDOWN' } : {}),
        ...(args.assigneeUserId ? { assignedTo: args.assigneeUserId } : {})
      })
    })
    const record = asRecord(payload)
    const result = asRecord(record?.result) ?? record
    const id = result ? firstString(result, ['id', 'identifier', 'workitemIdentifier']) : undefined
    if (!id) {
      return { ok: false, error: 'Created the work item but 云效 returned no identifier.' }
    }
    return {
      ok: true,
      id,
      serialNumber: (result ? firstString(result, ['serialNumber']) : undefined) ?? id,
      url: buildWorkItemUrl(client.account.organizationId, args.spaceId, id)
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Create failed.' }
  } finally {
    release()
  }
}
