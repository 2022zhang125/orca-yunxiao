import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  CredentialDecryptionError,
  credentialFileHasContent,
  readStoredCredentialToken,
  writeEncryptedCredential
} from '../integration-credential-file'
import {
  YUNXIAO_DEFAULT_ENDPOINT,
  type YunxiaoAccount,
  type YunxiaoAccountSelection
} from '../../shared/yunxiao-types'

export type YunxiaoAccountFile = {
  version: 1
  activeAccountId: string | null
  selectedAccountId: YunxiaoAccountSelection | null
  accounts: YunxiaoAccount[]
}

let cachedAccountFile: YunxiaoAccountFile | null = null
let accountFileLoaded = false
const cachedTokens = new Map<string, string>()
// Why: decrypt failures are recorded per account so getStatus can explain
// failing reads without re-touching the keychain on every status poll.
const credentialErrors = new Map<string, string>()

function getOrcaDir(): string {
  return join(homedir(), '.orca')
}

function getAccountFilePath(): string {
  return join(getOrcaDir(), 'yunxiao-accounts.json')
}

function getTokenDir(): string {
  return join(getOrcaDir(), 'yunxiao-tokens')
}

function getTokenPath(accountId: string): string {
  return join(getTokenDir(), `${Buffer.from(accountId).toString('base64url')}.enc`)
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function emptyAccountFile(): YunxiaoAccountFile {
  return { version: 1, activeAccountId: null, selectedAccountId: null, accounts: [] }
}

export function hasStoredToken(accountId: string): boolean {
  return cachedTokens.has(accountId) || credentialFileHasContent(getTokenPath(accountId))
}

export function getCredentialError(accountId: string): string | undefined {
  return credentialErrors.get(accountId)
}

function normalizeAccount(input: unknown): YunxiaoAccount | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const record = input as Record<string, unknown>
  if (
    typeof record.id !== 'string' ||
    typeof record.organizationId !== 'string' ||
    typeof record.userId !== 'string'
  ) {
    return null
  }
  return {
    id: record.id,
    endpoint: typeof record.endpoint === 'string' ? record.endpoint : YUNXIAO_DEFAULT_ENDPOINT,
    organizationId: record.organizationId,
    organizationName:
      typeof record.organizationName === 'string' ? record.organizationName : record.organizationId,
    userId: record.userId,
    displayName: typeof record.displayName === 'string' ? record.displayName : record.userId,
    email: typeof record.email === 'string' ? record.email : null
  }
}

function readAccountFileFromDisk(): YunxiaoAccountFile {
  const path = getAccountFilePath()
  if (!existsSync(path)) {
    return emptyAccountFile()
  }
  try {
    const parsed = JSON.parse(
      readFileSync(path, { encoding: 'utf-8' })
    ) as Partial<YunxiaoAccountFile>
    const accounts = Array.isArray(parsed.accounts)
      ? parsed.accounts
          .map((account) => normalizeAccount(account))
          .filter((account): account is YunxiaoAccount => account !== null)
          .filter((account) => hasStoredToken(account.id))
      : []
    return {
      version: 1,
      ...resolveSelection(accounts, parsed.activeAccountId, parsed.selectedAccountId),
      accounts
    }
  } catch {
    return emptyAccountFile()
  }
}

function resolveSelection(
  accounts: readonly YunxiaoAccount[],
  activeCandidate: unknown,
  selectedCandidate: unknown
): { activeAccountId: string | null; selectedAccountId: YunxiaoAccountSelection | null } {
  const activeAccountId =
    typeof activeCandidate === 'string' && accounts.some((entry) => entry.id === activeCandidate)
      ? activeCandidate
      : (accounts[0]?.id ?? null)
  const selectedAccountId =
    selectedCandidate === 'all' ||
    (typeof selectedCandidate === 'string' &&
      accounts.some((entry) => entry.id === selectedCandidate))
      ? (selectedCandidate as YunxiaoAccountSelection)
      : activeAccountId
  return { activeAccountId, selectedAccountId }
}

export function getAccountFile(): YunxiaoAccountFile {
  if (!accountFileLoaded || !cachedAccountFile) {
    cachedAccountFile = readAccountFileFromDisk()
    accountFileLoaded = true
  }
  return cachedAccountFile
}

export function writeAccountFile(file: YunxiaoAccountFile): void {
  ensureDir(getOrcaDir())
  const accounts = file.accounts.filter((account) => hasStoredToken(account.id))
  cachedAccountFile = {
    version: 1,
    ...resolveSelection(accounts, file.activeAccountId, file.selectedAccountId),
    accounts
  }
  accountFileLoaded = true
  writeFileSync(getAccountFilePath(), JSON.stringify(cachedAccountFile, null, 2), {
    encoding: 'utf-8',
    mode: 0o600
  })
}

export function readToken(accountId: string): string | null {
  const cached = cachedTokens.get(accountId)
  if (cached !== undefined) {
    return cached
  }
  const path = getTokenPath(accountId)
  if (!existsSync(path)) {
    return null
  }
  try {
    const raw = readFileSync(path)
    const token = readStoredCredentialToken('Yunxiao', raw)
    if (token) {
      cachedTokens.set(accountId, token)
    }
    credentialErrors.delete(accountId)
    return token
  } catch (error) {
    if (error instanceof CredentialDecryptionError) {
      credentialErrors.set(accountId, error.message)
      throw error
    }
    return null
  }
}

export function saveToken(accountId: string, accessToken: string): void {
  ensureDir(getOrcaDir())
  ensureDir(getTokenDir())
  writeEncryptedCredential('Yunxiao', getTokenPath(accountId), accessToken)
  cachedTokens.set(accountId, accessToken)
  credentialErrors.delete(accountId)
}

export function deleteToken(accountId: string): void {
  cachedTokens.delete(accountId)
  credentialErrors.delete(accountId)
  try {
    unlinkSync(getTokenPath(accountId))
  } catch {
    // Token may not exist — safe to ignore.
  }
}

export function normalizeYunxiaoEndpoint(endpoint: string | null | undefined): string {
  const trimmed = endpoint?.trim()
  if (!trimmed) {
    return YUNXIAO_DEFAULT_ENDPOINT
  }
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withProtocol)
  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

export function getAccountId(endpoint: string, organizationId: string, userId: string): string {
  return createHash('sha256')
    .update(`${endpoint}\n${organizationId}\n${userId}`)
    .digest('base64url')
    .slice(0, 24)
}
