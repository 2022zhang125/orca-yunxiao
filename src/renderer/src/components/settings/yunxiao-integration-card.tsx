import { useState } from 'react'
import { AlertCircle, CheckCircle2, LoaderCircle, Unlink } from 'lucide-react'
import { YunxiaoConnectDialog } from '@/components/yunxiao-connect-dialog'
import { YunxiaoIcon } from '@/components/icons/YunxiaoIcon'
import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import {
  getProviderRuntimeContextKey,
  hasRemoteProviderRuntime
} from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'
import { getProviderAccountScope } from './provider-account-scope'
import { ProviderHostScopeControl } from './ProviderHostScopeControl'
import { translate } from '@/i18n/i18n'

type VerificationResult = { state: 'ok' | 'error'; error?: string }

export function YunxiaoIntegrationCard(): React.JSX.Element {
  const yunxiaoStatus = useAppStore((s) => s.yunxiaoStatus)
  const yunxiaoStatusChecked = useAppStore((s) => s.yunxiaoStatusChecked)
  const yunxiaoStatusContextKey = useAppStore((s) => s.yunxiaoStatusContextKey)
  const checkYunxiaoConnection = useAppStore((s) => s.checkYunxiaoConnection)
  const disconnectYunxiao = useAppStore((s) => s.disconnectYunxiao)
  const testYunxiaoConnection = useAppStore((s) => s.testYunxiaoConnection)
  const settings = useAppStore((s) => s.settings)
  const mountedRef = useMountedRef()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null)
  const [testResultByAccount, setTestResultByAccount] = useState<
    Record<string, VerificationResult>
  >({})

  const contextMatches = yunxiaoStatusContextKey === getProviderRuntimeContextKey(settings)
  const checking = !contextMatches || !yunxiaoStatusChecked
  const connected = contextMatches && yunxiaoStatus.connected
  const accounts = yunxiaoStatus.accounts ?? []
  const accountCount = accounts.length || (connected ? 1 : 0)
  const accountScope = getProviderAccountScope(settings)
  const credentialCopy = hasRemoteProviderRuntime(settings)
    ? translate(
        'auto.components.settings.yunxiao.integration.card.credentials_remote',
        'Connect a 云效 organization with a personal access token. Credentials are sent to the selected remote runtime and stored there with runtime-supported encryption.'
      )
    : translate(
        'auto.components.settings.yunxiao.integration.card.credentials_local',
        'Connect a 云效 organization with a personal access token. Credentials are stored locally and encrypted when local runtime storage supports it.'
      )
  const subordinateRowClass = useIntegrationSubordinateRowClass('flex items-center gap-3')
  const accountScopeRowClass = useIntegrationSubordinateRowClass('text-xs')

  const handleDisconnect = async (accountId?: string): Promise<void> => {
    await disconnectYunxiao(accountId)
    if (mountedRef.current) {
      setTestResultByAccount({})
    }
  }

  const handleTest = async (accountId: string): Promise<void> => {
    setTestingAccountId(accountId)
    setTestResultByAccount((prev) => {
      const next = { ...prev }
      delete next[accountId]
      return next
    })
    const result = await testYunxiaoConnection(accountId)
    if (!mountedRef.current) {
      return
    }
    setTestResultByAccount((prev) => ({
      ...prev,
      [accountId]: result.ok ? { state: 'ok' } : { state: 'error', error: result.error }
    }))
    setTestingAccountId(null)
  }

  return (
    <IntegrationCardShell
      icon={<YunxiaoIcon className="size-5" />}
      name="云效"
      description={
        connected
          ? translate(
              'auto.components.settings.yunxiao.integration.card.connected_count',
              '{{value0}} organization{{value1}} connected',
              { value0: accountCount, value1: accountCount === 1 ? '' : 's' }
            )
          : checking
            ? translate(
                'auto.components.settings.yunxiao.integration.card.checking',
                'Checking 云效 access before showing setup actions.'
              )
            : translate(
                'auto.components.settings.yunxiao.integration.card.idle',
                'Browse, create, and start work from 云效 work items.'
              )
      }
      checking={checking}
      statusTone={connected ? 'connected' : 'attention'}
      statusLabel={connected ? 'Connected' : 'Not connected'}
      actions={
        !checking ? (
          <Button
            variant={connected ? 'outline' : 'default'}
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            {connected
              ? translate(
                  'auto.components.settings.yunxiao.integration.card.add_org',
                  'Add 云效 organization'
                )
              : translate(
                  'auto.components.settings.yunxiao.integration.card.connect',
                  'Connect 云效'
                )}
          </Button>
        ) : null
      }
    >
      <IntegrationCardDetails>
        <ProviderHostScopeControl
          labelPrefix={translate(
            'auto.components.settings.task.tracker.integration.cards.account_scope_prefix',
            'Account scope'
          )}
          scope={accountScope}
          className={accountScopeRowClass}
        />
        {connected && accounts.length > 0 ? (
          <div className="space-y-2">
            {accounts.map((account) => {
              const testResult = testResultByAccount[account.id]
              const testing = testingAccountId === account.id
              return (
                <div key={account.id} className={subordinateRowClass}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {account.organizationName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {account.displayName}
                      {account.email ? ` · ${account.email}` : ''}
                    </p>
                  </div>
                  {testResult?.state === 'ok' ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-status-success">
                      <CheckCircle2 className="size-3.5" />
                      {translate(
                        'auto.components.settings.task.tracker.integration.cards.a2c0015fb8',
                        'Verified'
                      )}
                    </span>
                  ) : null}
                  {testResult?.state === 'error' ? (
                    <span className="flex min-w-0 max-w-[220px] shrink items-center gap-1 truncate text-xs text-destructive">
                      <AlertCircle className="size-3.5 shrink-0" />
                      <span className="truncate">{testResult.error}</span>
                    </span>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleTest(account.id)}
                    disabled={testing}
                  >
                    {testing ? (
                      <>
                        <LoaderCircle className="size-3.5 mr-1.5 animate-spin" />
                        {translate(
                          'auto.components.settings.task.tracker.integration.cards.3e7c10d286',
                          'Testing...'
                        )}
                      </>
                    ) : (
                      translate(
                        'auto.components.settings.task.tracker.integration.cards.c24e56c532',
                        'Test'
                      )
                    )}
                  </Button>
                  <button
                    onClick={() => void handleDisconnect(account.id)}
                    aria-label={translate(
                      'auto.components.settings.task.tracker.integration.cards.dd3529015d',
                      'Disconnect {{value0}}',
                      { value0: account.organizationName }
                    )}
                    className="rounded-md p-1 text-muted-foreground/50 transition-colors hover:text-destructive"
                  >
                    <Unlink className="size-3.5" />
                  </button>
                </div>
              )
            })}
            <p className="text-[11px] text-muted-foreground/70">
              {translate(
                'auto.components.settings.yunxiao.integration.card.token_scope_note',
                'Each connected 云效 organization has one token stored by the active runtime.'
              )}
            </p>
          </div>
        ) : connected ? (
          <>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.yunxiao.integration.card.stale_hint',
                '云效 is connected for this runtime. Re-check if the connected organization list looks stale.'
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => void checkYunxiaoConnection()}>
                {translate(
                  'auto.components.settings.task.tracker.integration.cards.c90f2ef419',
                  'Re-check'
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void handleDisconnect()}>
                {translate(
                  'auto.components.settings.task.tracker.integration.cards.disconnect_all',
                  'Disconnect'
                )}
              </Button>
            </div>
          </>
        ) : !checking ? (
          <>
            <p className="text-xs text-muted-foreground">{credentialCopy}</p>
            <Button variant="ghost" size="sm" onClick={() => void checkYunxiaoConnection()}>
              {translate(
                'auto.components.settings.task.tracker.integration.cards.c90f2ef419',
                'Re-check'
              )}
            </Button>
          </>
        ) : null}
      </IntegrationCardDetails>

      <YunxiaoConnectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConnected={() => setTestResultByAccount({})}
        overlayClassName="z-[110]"
        contentClassName="z-[120]"
      />
    </IntegrationCardShell>
  )
}
