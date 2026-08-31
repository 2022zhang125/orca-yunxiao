import { useId, useLayoutEffect, useState } from 'react'
import { LoaderCircle, Lock } from 'lucide-react'
import { useAppStore } from '@/store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { hasRemoteProviderRuntime } from '@/lib/provider-runtime-context'
import { YUNXIAO_DEFAULT_ENDPOINT } from '../../../shared/yunxiao-types'
import { translate } from '@/i18n/i18n'

type YunxiaoConnectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected?: () => void
  overlayClassName?: string
  contentClassName?: string
}

type ConnectState = 'idle' | 'connecting' | 'error'

// Why: 云效 scopes every project-management call to an organization, so the
// connect flow collects the organization id alongside the personal access
// token instead of a site URL like the Jira dialog.
export function YunxiaoConnectDialog({
  open,
  onOpenChange,
  onConnected,
  overlayClassName,
  contentClassName
}: YunxiaoConnectDialogProps): React.JSX.Element {
  const connectYunxiao = useAppStore((s) => s.connectYunxiao)
  const settings = useAppStore((s) => s.settings)
  const mountedRef = useMountedRef()
  const organizationId = useId()
  const tokenId = useId()
  const endpointId = useId()
  const errorId = useId()

  const [organization, setOrganization] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [connectState, setConnectState] = useState<ConnectState>('idle')
  const [connectError, setConnectError] = useState<string | null>(null)

  // Start every open with a clean slate so a previously-typed secret or old
  // error can't linger across reopens. Runs before paint so a stale credential
  // never renders for a frame.
  useLayoutEffect(() => {
    if (!open) {
      return
    }
    setOrganization('')
    setAccessToken('')
    setEndpoint('')
    setConnectState('idle')
    setConnectError(null)
  }, [open])

  const canSubmit =
    Boolean(organization.trim()) && Boolean(accessToken.trim()) && connectState !== 'connecting'
  const credentialStorageCopy = hasRemoteProviderRuntime(settings)
    ? translate(
        'auto.components.yunxiao.connect.dialog.storage_remote',
        'Your token is sent to the selected remote runtime and stored there with runtime-supported encryption.'
      )
    : translate(
        'auto.components.yunxiao.connect.dialog.storage_local',
        'Your token is stored locally and encrypted when local runtime storage supports it.'
      )

  const clearErrorOnEdit = (): void => {
    if (connectState === 'error') {
      setConnectState('idle')
      setConnectError(null)
    }
  }

  const handleOpenChange = (nextOpen: boolean): void => {
    if (connectState !== 'connecting') {
      onOpenChange(nextOpen)
    }
  }

  const handleConnect = async (): Promise<void> => {
    const trimmedOrganization = organization.trim()
    const trimmedToken = accessToken.trim()
    if (!trimmedOrganization || !trimmedToken || connectState === 'connecting') {
      return
    }
    setConnectState('connecting')
    setConnectError(null)
    try {
      const result = await connectYunxiao({
        organizationId: trimmedOrganization,
        accessToken: trimmedToken,
        endpoint: endpoint.trim() || undefined
      })
      if (!mountedRef.current) {
        return
      }
      if (result.ok) {
        setOrganization('')
        setAccessToken('')
        setEndpoint('')
        setConnectState('idle')
        onOpenChange(false)
        onConnected?.()
        return
      }
      setConnectState('error')
      setConnectError(result.error)
    } catch (error) {
      if (mountedRef.current) {
        setConnectState('error')
        setConnectError(error instanceof Error ? error.message : 'Connection failed')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName={overlayClassName}
        className={cn('sm:max-w-md', contentClassName)}
      >
        <DialogHeader className="gap-3">
          <DialogTitle className="leading-tight">
            {translate('auto.components.yunxiao.connect.dialog.title', 'Connect 云效 organization')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.yunxiao.connect.dialog.description',
              'Use your 云效 organization ID and a personal access token to browse work items.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void handleConnect()
          }}
        >
          <div className="flex flex-col gap-3">
            <div className="space-y-2">
              <Label htmlFor={organizationId} className="text-xs">
                {translate(
                  'auto.components.yunxiao.connect.dialog.organization_label',
                  'Organization ID'
                )}
              </Label>
              <Input
                id={organizationId}
                autoFocus
                placeholder="5f7f2b1c9a8e4d2b6c3a1f0e"
                value={organization}
                onChange={(event) => {
                  setOrganization(event.target.value)
                  clearErrorOnEdit()
                }}
                disabled={connectState === 'connecting'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={tokenId} className="text-xs">
                {translate(
                  'auto.components.yunxiao.connect.dialog.token_label',
                  'Personal access token'
                )}
              </Label>
              <Input
                id={tokenId}
                type="password"
                placeholder={translate(
                  'auto.components.yunxiao.connect.dialog.token_placeholder',
                  '云效 personal access token'
                )}
                value={accessToken}
                onChange={(event) => {
                  setAccessToken(event.target.value)
                  clearErrorOnEdit()
                }}
                disabled={connectState === 'connecting'}
                aria-invalid={connectState === 'error'}
                aria-describedby={connectState === 'error' ? errorId : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={endpointId} className="text-xs">
                {translate(
                  'auto.components.yunxiao.connect.dialog.endpoint_label',
                  'OpenAPI endpoint (optional)'
                )}
              </Label>
              <Input
                id={endpointId}
                placeholder={YUNXIAO_DEFAULT_ENDPOINT}
                value={endpoint}
                onChange={(event) => {
                  setEndpoint(event.target.value)
                  clearErrorOnEdit()
                }}
                disabled={connectState === 'connecting'}
              />
            </div>
            {connectState === 'error' && connectError ? (
              <p id={errorId} className="text-xs text-destructive">
                {connectError}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.yunxiao.connect.dialog.token_hint',
                'Create a token under 个人设置 › 个人访问令牌 in 云效, and copy the organization ID from 组织管理 › 基本信息.'
              )}
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
              <Lock className="size-3 shrink-0" />
              {credentialStorageCopy}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={connectState === 'connecting'}
            >
              {translate('auto.components.yunxiao.connect.dialog.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {connectState === 'connecting' ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  {translate('auto.components.yunxiao.connect.dialog.verifying', 'Verifying…')}
                </>
              ) : (
                translate('auto.components.yunxiao.connect.dialog.connect', 'Connect')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
