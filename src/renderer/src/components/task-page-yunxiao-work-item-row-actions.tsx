import React from 'react'
import { ChevronDown, ExternalLink, Wrench } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DetailIcon } from '@/components/icons/DetailIcon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { canFixYunxiaoWorkItem } from '@/components/task-page-yunxiao-status-tone'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { YunxiaoWorkItem } from '../../../shared/types'

export function YunxiaoWorkItemRowActions({
  workItem,
  onFixWorkItem,
  detailId,
  expanded,
  onToggleExpanded,
  fixWorktreeId,
  onViewFixWorkspace
}: {
  workItem: YunxiaoWorkItem
  onFixWorkItem: (workItem: YunxiaoWorkItem) => void
  detailId: string
  expanded: boolean
  onToggleExpanded: (workItem: YunxiaoWorkItem) => void
  fixWorktreeId: string | null
  onViewFixWorkspace: (worktreeId: string) => void
}): React.JSX.Element {
  const fixLabel = translate('auto.components.TaskPage.yunxiao_fix_tooltip', 'One-click fix')
  const viewLabel = translate('auto.components.TaskPage.yunxiao_view_fix_tooltip', 'View fix')
  const detailLabel = expanded
    ? translate('auto.components.TaskPage.yunxiao_detail_collapse', 'Hide details')
    : translate('auto.components.TaskPage.yunxiao_detail_expand', 'Show details')
  return (
    <div className="flex shrink-0 items-center justify-end gap-1">
      {/* One slot, two meanings: before a fix exists it starts one; afterwards
          it goes to it. Both stay visible — they are the row's primary action. */}
      {fixWorktreeId ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(event) => {
                event.stopPropagation()
                onViewFixWorkspace(fixWorktreeId)
              }}
              aria-label={`${viewLabel} — ${workItem.serialNumber}`}
              // Same slot as the fix button, so it keeps the same success fill.
              className="bg-status-success text-background hover:bg-status-success hover:text-background hover:brightness-110"
            >
              <DetailIcon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {viewLabel}
          </TooltipContent>
        </Tooltip>
      ) : canFixYunxiaoWorkItem(workItem) ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(event) => {
                event.stopPropagation()
                onFixWorkItem(workItem)
              }}
              aria-label={`${fixLabel} — ${workItem.serialNumber}`}
              // The one affirmative action in the row, so it carries the success
              // fill rather than the ghost treatment its neighbour keeps.
              className="bg-status-success text-background hover:bg-status-success hover:text-background hover:brightness-110"
            >
              <Wrench className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {fixLabel}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="md:opacity-0 md:transition-opacity md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100"
            onClick={(event) => {
              event.stopPropagation()
              window.api.shell.openUrl(workItem.url)
            }}
            aria-label={translate(
              'auto.components.TaskPage.yunxiao_open_aria',
              'Open {{value0}} in 云效',
              { value0: workItem.serialNumber }
            )}
          >
            <ExternalLink className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {translate('auto.components.TaskPage.yunxiao_open_tooltip', 'Open in 云效')}
        </TooltipContent>
      </Tooltip>
      {/* Always visible, unlike its hover-revealed neighbour: reading the body
          in place is the point, so the affordance cannot be hidden. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-expanded={expanded}
            aria-controls={detailId}
            onClick={(event) => {
              event.stopPropagation()
              onToggleExpanded(workItem)
            }}
            aria-label={`${detailLabel} — ${workItem.serialNumber}`}
          >
            <ChevronDown
              className={cn(
                'size-3.5 transition-transform motion-reduce:transition-none',
                expanded && 'rotate-180'
              )}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {detailLabel}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
