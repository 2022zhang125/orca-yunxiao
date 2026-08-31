import { Loader2, RefreshCw, Search, X } from 'lucide-react'

import { YunxiaoIcon } from '@/components/icons/YunxiaoIcon'
import { TaskPageYunxiaoWorkItemList } from '@/components/task-page-yunxiao-work-item-list'
import { getYunxiaoPresets } from '@/components/task-page-localized-options'
import { formatRelativeTime } from '@/components/task-page/relative-time'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { YunxiaoConnectDialog } from '@/components/yunxiao-connect-dialog'
import { translate } from '@/i18n/i18n'
import { shouldSuppressEnterSubmit } from '@/lib/new-workspace-enter-guard'
import { cn } from '@/lib/utils'
import { useTaskPageYunxiao } from './use-task-page-yunxiao'

function YunxiaoFilters({ model }: { model: ReturnType<typeof useTaskPageYunxiao> }) {
  const presets = getYunxiaoPresets()
  return (
    <div className="mt-3 rounded-md rounded-b-none border border-border/50 bg-muted/50 px-3 pt-2 pb-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const active = !model.searchInput && model.activePreset === preset.id
            return (
              <Button
                key={preset.id}
                type="button"
                size="xs"
                variant={active ? 'secondary' : 'ghost'}
                onClick={() => {
                  model.setSearchInput('')
                  model.setAppliedSearch('')
                  model.setActivePreset(preset.id)
                  model.refresh()
                }}
              >
                {preset.label}
              </Button>
            )
          })}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={model.refresh}
              disabled={model.loading}
              aria-label={translate(
                'auto.components.TaskPage.yunxiao_refresh',
                'Refresh 云效 work items'
              )}
            >
              {model.loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {translate('auto.components.TaskPage.yunxiao_refresh', 'Refresh 云效 work items')}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={model.searchInput}
          onChange={(event) => model.setSearchInput(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key !== 'Enter' ||
              shouldSuppressEnterSubmit(
                { isComposing: event.nativeEvent.isComposing, shiftKey: event.shiftKey },
                false
              )
            ) {
              return
            }
            event.preventDefault()
            const query = model.searchInput.trim()
            model.setSearchInput(query)
            model.setAppliedSearch(query)
            model.refresh()
          }}
          placeholder={translate(
            'auto.components.TaskPage.yunxiao_search_placeholder',
            'Search 云效 work items by title'
          )}
          className="h-8 pr-8 pl-8 text-xs"
        />
        {model.searchInput ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={translate('auto.components.TaskPage.b797bdd7c3', 'Clear search')}
            onClick={() => {
              model.setSearchInput('')
              model.setAppliedSearch('')
              model.refresh()
            }}
            className="absolute top-1/2 right-1 -translate-y-1/2"
          >
            <X />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function YunxiaoList({ model }: { model: ReturnType<typeof useTaskPageYunxiao> }) {
  const hasError = Boolean(model.status.credentialError || model.error)
  return (
    <div className="flex min-h-0 max-h-full flex-col overflow-hidden rounded-md rounded-t-none border border-t-0 border-border/50 bg-background shadow-sm">
      <div className="relative flex h-10 flex-none items-center justify-between gap-3 border-b border-border/50 bg-muted/35 px-3">
        <div className="min-w-0 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          {translate('auto.components.TaskPage.yunxiao_list_heading', '云效 work items')}
        </div>
        <div className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {model.workItems.length} {translate('auto.components.TaskPage.b7bae28b6a', 'shown')}
        </div>
        {model.loadingVisible ? (
          <div
            className="list-refresh-indicator pointer-events-none absolute inset-x-0 bottom-0 h-px"
            aria-hidden
          />
        ) : null}
      </div>
      <div
        className={cn(
          'scrollbar-sleek min-h-0 flex-1 overflow-y-auto transition-opacity duration-150',
          model.loadingVisible && model.workItems.length > 0 && 'pointer-events-none opacity-45'
        )}
        style={{ scrollbarGutter: 'stable' }}
        aria-busy={model.loading || undefined}
      >
        {model.status.credentialError ? (
          <div className="border-b border-border px-4 py-4 text-sm text-destructive">
            {model.status.credentialError}
          </div>
        ) : model.error ? (
          <div className="border-b border-border px-4 py-4 text-sm text-destructive">
            {model.error}
          </div>
        ) : null}
        {model.loadingVisible && model.workItems.length === 0 ? (
          <div className="divide-y divide-border/50">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="px-3 py-3">
                <div className="h-4 w-4/5 animate-pulse rounded bg-muted/70" />
                <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-muted/60" />
              </div>
            ))}
          </div>
        ) : null}
        {!model.loading && model.workItems.length === 0 && !hasError ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              {translate(
                'auto.components.TaskPage.yunxiao_empty_title',
                'No 云效 work items found'
              )}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {model.searchInput
                ? translate(
                    'auto.components.TaskPage.yunxiao_empty_search',
                    'Try a different title search.'
                  )
                : translate(
                    'auto.components.TaskPage.94d900518d',
                    'No issues match the selected preset.'
                  )}
            </p>
          </div>
        ) : null}
        <TaskPageYunxiaoWorkItemList
          formatUpdatedAt={formatRelativeTime}
          workItems={model.workItems}
          onFixWorkItem={model.fixWorkItem}
          selectedWorkItem={null}
          showOrganizationContext={model.selectedAccountId === 'all'}
          loadWorkItemDetail={model.loadWorkItemDetail}
          resolveAttachment={model.resolveAttachment}
          fixWorktreeIdBySerial={model.fixWorktreeIdBySerial}
          onBatchFixWorkItems={model.batchFixWorkItems}
          onViewFixWorkspace={model.viewFixWorkspace}
        />
      </div>
    </div>
  )
}

export function YunxiaoTaskSurface({ onHide }: { onHide: () => void }): React.JSX.Element {
  const model = useTaskPageYunxiao()
  return (
    <>
      {!model.statusReady ? (
        <div className="mt-3 flex items-center justify-center py-14">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : !model.connected ? (
        <div className="mt-3 flex flex-col items-center justify-center rounded-md border border-border/50 bg-muted/50 px-6 py-14 text-center shadow-sm">
          <YunxiaoIcon className="mb-4 size-8 text-muted-foreground/60" />
          <p className="text-base font-medium text-foreground">
            {translate(
              'auto.components.TaskPage.yunxiao_connect_title',
              'Connect your 云效 organization'
            )}
          </p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {translate(
              'auto.components.TaskPage.yunxiao_connect_body',
              'Browse and start work from 云效 work items directly from here.'
            )}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => model.setConnectOpen(true)}>
              {translate('auto.components.TaskPage.yunxiao_connect_cta', 'Connect 云效')}
            </Button>
            <Button variant="outline" onClick={onHide}>
              {translate('auto.components.TaskPage.yunxiao_hide_cta', 'Hide 云效')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <YunxiaoFilters model={model} />
          <YunxiaoList model={model} />
        </>
      )}
      <YunxiaoConnectDialog
        open={model.connectOpen}
        onOpenChange={model.setConnectOpen}
        onConnected={model.refresh}
      />
    </>
  )
}
