import { net, session } from 'electron'
import { ensureElectronProxyFromEnvironment } from '../network/proxy-settings'
import { withSpan } from '../observability/tracer'
import type { YunxiaoAccount } from '../../shared/types'

const YUNXIAO_API_USER_AGENT = 'Orca'

const MAX_CONCURRENT = 4
let running = 0
const queue: (() => void)[] = []

export function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running += 1
    return Promise.resolve()
  }
  return new Promise((resolve) =>
    queue.push(() => {
      running += 1
      resolve()
    })
  )
}

export function release(): void {
  running -= 1
  const next = queue.shift()
  if (next) {
    next()
  }
}

export type YunxiaoClientForAccount = {
  account: YunxiaoAccount
  accessToken: string
}

export class YunxiaoApiError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.status = status
  }
}

function describeErrorCause(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('cause' in error)) {
    return undefined
  }
  const cause = (error as { cause?: unknown }).cause
  if (cause instanceof Error) {
    return `${cause.name}: ${cause.message}`
  }
  return cause === undefined ? undefined : String(cause)
}

async function yunxiaoFetch(url: string, init: RequestInit): Promise<Response> {
  return withSpan(
    'yunxiao.request',
    async (span) => {
      span.setAttribute('yunxiao.endpoint', new URL(url).origin)
      await ensureElectronProxyFromEnvironment({
        proxySession: session.defaultSession,
        probeUrl: url
      }).catch((error) => {
        span.addEvent('yunxiao.proxySetupFailed', {
          errorName: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error)
        })
      })
      try {
        // Why: Electron's network stack follows Chromium proxy/session state,
        // avoiding undici's stale keep-alive sockets after VPN path changes.
        return await net.fetch(url, init)
      } catch (error) {
        span.setAttribute(
          'yunxiao.transportErrorName',
          error instanceof Error ? error.name : typeof error
        )
        span.setAttribute(
          'yunxiao.transportErrorMessage',
          error instanceof Error ? error.message : String(error)
        )
        const cause = describeErrorCause(error)
        if (cause) {
          span.setAttribute('yunxiao.transportErrorCause', cause)
        }
        throw error
      }
    },
    { kind: 'client' }
  )
}

async function readYunxiaoError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      errorMessage?: string
      errorMsg?: string
      message?: string
      errorCode?: string
    }
    const messages = [data.errorMessage, data.errorMsg, data.message].filter(
      (value): value is string => typeof value === 'string' && value.length > 0
    )
    if (messages.length > 0) {
      return data.errorCode ? `${messages[0]} (${data.errorCode})` : messages[0]
    }
  } catch {
    // Fall through to status text.
  }
  return response.statusText || `云效 request failed (${response.status})`
}

export async function requestWithToken<T>(
  endpoint: string,
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  headers.set('Content-Type', 'application/json')
  headers.set('User-Agent', YUNXIAO_API_USER_AGENT)
  headers.set('x-yunxiao-token', accessToken)
  const response = await yunxiaoFetch(`${endpoint}${path}`, { ...init, headers })
  if (!response.ok) {
    throw new YunxiaoApiError(await readYunxiaoError(response), response.status)
  }
  if (response.status === 204) {
    return null as T
  }
  return (await response.json()) as T
}

export async function yunxiaoRequest<T>(
  client: YunxiaoClientForAccount,
  path: string,
  init?: RequestInit
): Promise<T> {
  return requestWithToken<T>(client.account.endpoint, client.accessToken, path, init)
}

export function isAuthError(error: unknown): boolean {
  // Why: 云效 returns 403 for organization/permission gaps even when the token
  // itself is valid, so only 401 means the saved credential is bad.
  return error instanceof YunxiaoApiError && error.status === 401
}
