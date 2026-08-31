import { CredentialDecryptionError } from '../integration-credential-file'
import {
  deleteToken,
  getAccountFile,
  getAccountId,
  getCredentialError,
  hasStoredToken,
  normalizeYunxiaoEndpoint,
  readToken,
  saveToken,
  writeAccountFile
} from './account-store'
import { acquire, release, requestWithToken, yunxiaoRequest } from './request'
import type { YunxiaoClientForAccount } from './request'
import type {
  YunxiaoAccount,
  YunxiaoAccountSelection,
  YunxiaoConnectArgs,
  YunxiaoConnectionStatus,
  YunxiaoOrganization,
  YunxiaoViewer
} from '../../shared/yunxiao-types'

export { acquire, release, yunxiaoRequest, isAuthError, YunxiaoApiError } from './request'
export type { YunxiaoClientForAccount } from './request'
export { normalizeYunxiaoEndpoint } from './account-store'

function accountToViewer(account: YunxiaoAccount | null): YunxiaoViewer | null {
  if (!account) {
    return null
  }
  return {
    userId: account.userId,
    displayName: account.displayName,
    email: account.email ?? null,
    organizationId: account.organizationId,
    organizationName: account.organizationName
  }
}

type YunxiaoCurrentUser = {
  id?: string
  userId?: string
  name?: string
  nickName?: string
  email?: string
}

function toViewer(
  data: unknown,
  organizationId: string,
  organizationName: string
): YunxiaoViewer | null {
  const record = (data ?? {}) as YunxiaoCurrentUser & { user?: YunxiaoCurrentUser }
  const user = record.user ?? record
  const userId = user.id ?? user.userId
  if (!userId) {
    return null
  }
  return {
    userId,
    displayName: user.name ?? user.nickName ?? userId,
    email: user.email ?? null,
    organizationId,
    organizationName
  }
}

function normalizeOrganizations(data: unknown): YunxiaoOrganization[] {
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { result?: unknown })?.result)
      ? ((data as { result: unknown[] }).result as unknown[])
      : []
  return list.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }
    const record = entry as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : String(record.id ?? '')
    if (!id) {
      return []
    }
    return [{ id, name: typeof record.name === 'string' ? record.name : id }]
  })
}

/** Lists the organizations the token can reach, so Connect can label the account. */
export async function listOrganizations(
  endpoint: string,
  accessToken: string
): Promise<YunxiaoOrganization[]> {
  return normalizeOrganizations(
    await requestWithToken<unknown>(endpoint, accessToken, '/oapi/v1/platform/organizations')
  )
}

export function getClients(selection?: YunxiaoAccountSelection | null): YunxiaoClientForAccount[] {
  const file = getAccountFile()
  const selected = selection ?? file.selectedAccountId ?? file.activeAccountId
  const isAllSelection = selected === 'all'
  const accounts = isAllSelection
    ? file.accounts
    : file.accounts.filter((account) => account.id === (selected ?? file.activeAccountId))

  return accounts.flatMap((account) => {
    let token: string | null
    try {
      token = readToken(account.id)
    } catch (error) {
      // Why: under an 'all' selection one un-decryptable account must not
      // collapse reads for the healthy ones. readToken already recorded the
      // per-account credentialError for getStatus to surface.
      if (isAllSelection && error instanceof CredentialDecryptionError) {
        return []
      }
      throw error
    }
    return token ? [{ account, accessToken: token }] : []
  })
}

export function getStatus(): YunxiaoConnectionStatus {
  const file = getAccountFile()
  const accounts = file.accounts.filter((account) => hasStoredToken(account.id))
  const activeAccount =
    accounts.find((account) => account.id === file.activeAccountId) ?? accounts[0] ?? null
  const credentialError = accounts
    .map((account) => getCredentialError(account.id))
    .find((message) => message !== undefined)
  return {
    connected: accounts.length > 0,
    viewer: accountToViewer(activeAccount),
    accounts,
    activeAccountId: activeAccount?.id ?? null,
    selectedAccountId: file.selectedAccountId ?? activeAccount?.id ?? null,
    ...(credentialError ? { credentialError } : {})
  }
}

export async function connect(
  args: YunxiaoConnectArgs
): Promise<{ ok: true; viewer: YunxiaoViewer } | { ok: false; error: string }> {
  let endpoint: string
  try {
    endpoint = normalizeYunxiaoEndpoint(args.endpoint)
  } catch {
    return { ok: false, error: 'Enter a valid 云效 OpenAPI endpoint.' }
  }

  const organizationId = args.organizationId.trim()
  const accessToken = args.accessToken.trim()
  if (!organizationId) {
    return { ok: false, error: 'Organization ID is required.' }
  }
  if (!accessToken) {
    return { ok: false, error: 'Personal access token is required.' }
  }

  await acquire()
  try {
    const organizations = await listOrganizations(endpoint, accessToken).catch(() => [])
    const organizationName =
      organizations.find((organization) => organization.id === organizationId)?.name ??
      organizationId
    const viewer = toViewer(
      await requestWithToken<unknown>(endpoint, accessToken, '/oapi/v1/platform/user'),
      organizationId,
      organizationName
    )
    if (!viewer) {
      return { ok: false, error: 'Could not read the 云效 user for this token.' }
    }
    const id = getAccountId(endpoint, organizationId, viewer.userId)
    saveToken(id, accessToken)
    const file = getAccountFile()
    writeAccountFile({
      version: 1,
      activeAccountId: id,
      selectedAccountId: id,
      accounts: [
        {
          id,
          endpoint,
          organizationId,
          organizationName,
          userId: viewer.userId,
          displayName: viewer.displayName,
          email: viewer.email
        },
        ...file.accounts.filter((entry) => entry.id !== id)
      ]
    })
    return { ok: true, viewer }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Connection failed.' }
  } finally {
    release()
  }
}

export function disconnect(accountId?: string): void {
  const file = getAccountFile()
  const ids = accountId ? [accountId] : file.accounts.map((account) => account.id)
  for (const id of ids) {
    deleteToken(id)
  }
  writeAccountFile({
    version: 1,
    activeAccountId: file.activeAccountId,
    selectedAccountId: file.selectedAccountId,
    accounts: file.accounts.filter((account) => !ids.includes(account.id))
  })
}

export function selectAccount(accountId: YunxiaoAccountSelection): YunxiaoConnectionStatus {
  const file = getAccountFile()
  if (accountId !== 'all' && !file.accounts.some((account) => account.id === accountId)) {
    return getStatus()
  }
  writeAccountFile({
    ...file,
    activeAccountId: accountId === 'all' ? file.activeAccountId : accountId,
    selectedAccountId: accountId
  })
  return getStatus()
}

export async function testConnection(
  accountId?: string
): Promise<{ ok: true; viewer: YunxiaoViewer } | { ok: false; error: string }> {
  let client: YunxiaoClientForAccount | undefined
  try {
    client = getClients(accountId)[0]
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Connection failed.' }
  }
  if (!client) {
    return { ok: false, error: 'Not connected to 云效.' }
  }
  await acquire()
  try {
    const viewer = toViewer(
      await yunxiaoRequest<unknown>(client, '/oapi/v1/platform/user'),
      client.account.organizationId,
      client.account.organizationName
    )
    return viewer
      ? { ok: true, viewer }
      : { ok: false, error: 'Could not read the 云效 user for this token.' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Connection failed.' }
  } finally {
    release()
  }
}

export function clearToken(accountId: string): void {
  deleteToken(accountId)
  const file = getAccountFile()
  writeAccountFile({
    ...file,
    accounts: file.accounts.filter((account) => account.id !== accountId)
  })
}
