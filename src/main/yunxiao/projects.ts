import type {
  YunxiaoAccountSelection,
  YunxiaoProject,
  YunxiaoWorkItemCategory,
  YunxiaoWorkItemType
} from '../../shared/types'
import { acquire, getClients, release, yunxiaoRequest } from './client'
import type { YunxiaoClientForAccount } from './request'
import {
  asRecord,
  firstString,
  normalizeCategory,
  normalizeProject,
  toArray
} from './work-item-normalizers'

function organizationPath(client: YunxiaoClientForAccount, suffix: string): string {
  return `/oapi/v1/projex/organizations/${encodeURIComponent(client.account.organizationId)}${suffix}`
}

export async function fetchProjects(
  client: YunxiaoClientForAccount,
  limit: number
): Promise<YunxiaoProject[]> {
  const payload = await yunxiaoRequest<unknown>(
    client,
    organizationPath(client, '/projects:search'),
    {
      method: 'POST',
      body: JSON.stringify({ page: 1, perPage: Math.min(Math.max(limit, 1), 200) })
    }
  )
  return toArray(payload).flatMap((entry) => {
    const record = asRecord(entry)
    const id = record ? firstString(record, ['id', 'identifier']) : undefined
    return record && id ? [normalizeProject(client, record, id)] : []
  })
}

export async function listProjects(accountId?: YunxiaoAccountSelection): Promise<YunxiaoProject[]> {
  const projects: YunxiaoProject[] = []
  for (const client of getClients(accountId)) {
    await acquire()
    try {
      projects.push(...(await fetchProjects(client, 200)))
    } catch {
      // Skip organizations the token cannot list projects for.
    } finally {
      release()
    }
  }
  return projects
}

export async function listWorkItemTypes(
  spaceId: string,
  category: YunxiaoWorkItemCategory = 'Req',
  accountId?: string
): Promise<YunxiaoWorkItemType[]> {
  const client = getClients(accountId)[0]
  if (!client) {
    return []
  }
  await acquire()
  try {
    const payload = await yunxiaoRequest<unknown>(
      client,
      organizationPath(
        client,
        `/workitemTypes?spaceIdentifier=${encodeURIComponent(spaceId)}&category=${encodeURIComponent(category)}`
      )
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
          name: firstString(record, ['name']) ?? id,
          category: normalizeCategory(firstString(record, ['categoryIdentifier', 'category']))
        }
      ]
    })
  } catch {
    return []
  } finally {
    release()
  }
}
