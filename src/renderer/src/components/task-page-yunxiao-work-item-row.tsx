import React from 'react'
import { Bug, CircleCheck, Lightbulb, ListTodo, Milestone } from 'lucide-react'

import { AgentWorkingSpinner } from '@/components/AgentWorkingSpinner'
import { useWorktreeAgentRows } from '@/components/sidebar/useWorktreeAgentRows'
import { getAgentDotState } from '@/components/sidebar/worktree-card-agent-summary'
import {
  summarizeFixPhase,
  type YunxiaoFixPhase
} from '@/components/task-page-yunxiao-fix-progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  TaskPageYunxiaoWorkItemDetail,
  type YunxiaoWorkItemAttachmentResolver,
  type YunxiaoWorkItemDetailLoader
} from '@/components/task-page-yunxiao-work-item-detail'
import { YunxiaoWorkItemRowActions } from '@/components/task-page-yunxiao-work-item-row-actions'
import {
  canFixYunxiaoWorkItem,
  getYunxiaoPriorityChipTone,
  getYunxiaoStatusTone
} from '@/components/task-page-yunxiao-status-tone'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type {
  YunxiaoLabel,
  YunxiaoWorkItem,
  YunxiaoWorkItemCategory
} from '../../../shared/yunxiao-types'

const WORK_ITEM_TYPE_ICON: Record<YunxiaoWorkItemCategory, typeof Bug> = {
  Req: Lightbulb,
  Task: ListTodo,
  Bug
}

/**
 * Tints border and background from the 云效 label hue but keeps neutral text —
 * an arbitrary remote color as text would fail contrast in one of the themes.
 */
function YunxiaoLabelChip({ label }: { label: YunxiaoLabel }): React.JSX.Element {
  return (
    <span
      className={cn(
        'max-w-[140px] truncate rounded-full border px-1.5 py-0.5 text-[10px]',
        label.color ? 'text-foreground/75' : 'border-border/50 bg-muted/35 text-muted-foreground'
      )}
      style={
        label.color
          ? {
              borderColor: `color-mix(in srgb, ${label.color} 45%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${label.color} 14%, transparent)`
            }
          : undefined
      }
    >
      {label.name}
    </span>
  )
}

/**
 * The row's scan anchor (需求 / 任务 / 缺陷). Deliberately inert — opening 云效
 * lives on the trailing external-link action alone, so nothing in the identity
 * cluster can navigate by accident.
 */
function WorkItemTypeIcon({
  workItem,
  className
}: {
  workItem: YunxiaoWorkItem
  className?: string
}): React.JSX.Element {
  const Icon = WORK_ITEM_TYPE_ICON[workItem.workItemType.category] ?? ListTodo
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex shrink-0 items-center p-0.5">
          <Icon
            className={cn(
              'size-3.5',
              workItem.workItemType.category === 'Bug'
                ? 'text-destructive/80'
                : 'text-muted-foreground/70',
              className
            )}
            aria-hidden
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {workItem.workItemType.name}
      </TooltipContent>
    </Tooltip>
  )
}

export function YunxiaoWorkItemRow({
  formatUpdatedAt,
  workItem,
  onFixWorkItem,
  selected,
  showOrganizationContext,
  expanded,
  onToggleExpanded,
  loadDetail,
  resolveAttachment,
  checked,
  onToggleChecked,
  fixWorktreeId,
  onViewFixWorkspace
}: {
  formatUpdatedAt: (updatedAt: string) => string
  workItem: YunxiaoWorkItem
  onFixWorkItem: (workItem: YunxiaoWorkItem) => void
  selected: boolean
  showOrganizationContext: boolean
  expanded: boolean
  onToggleExpanded: (workItem: YunxiaoWorkItem) => void
  loadDetail: YunxiaoWorkItemDetailLoader
  resolveAttachment: YunxiaoWorkItemAttachmentResolver
  checked: boolean
  onToggleChecked: (workItem: YunxiaoWorkItem) => void
  fixWorktreeId: string | null
  onViewFixWorkspace: (worktreeId: string) => void
}): React.JSX.Element {
  const fixing = fixWorktreeId !== null
  // Subscribed only while a fix workspace exists; inert rows pay nothing.
  const fixAgentRows = useWorktreeAgentRows(fixWorktreeId ?? '', fixing)
  const fixPhase: YunxiaoFixPhase | null = fixing
    ? summarizeFixPhase(fixAgentRows.map(getAgentDotState))
    : null
  const selectable = !fixing && canFixYunxiaoWorkItem(workItem)
  const detailId = `yunxiao-detail-${workItem.accountId ?? 'account'}-${workItem.id}`
  const labels = workItem.labels.slice(0, 3)
  const contextLabel =
    showOrganizationContext && workItem.organizationName
      ? `${workItem.organizationName} / ${workItem.project.name}`
      : workItem.project.name
  // No chip at all when 云效 has no priority on the item: a pill reading
  // "No priority" is louder than the absence it reports.
  const priorityChip = workItem.priority ? (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        getYunxiaoPriorityChipTone(workItem.priority)
      )}
    >
      <span className="truncate">{workItem.priority}</span>
    </span>
  ) : null
  const assigneeLabel =
    workItem.assignee?.displayName ?? translate('auto.components.TaskPage.42a9160321', 'Unassigned')

  return (
    // group/row sits on the wrapper so the trailing actions stay revealed while
    // the pointer is inside an expanded row's detail panel.
    <div className="group/row">
      {/* Why: the row toggles the detail panel but never navigates — opening
          云效 lives on the trailing external-link action, which stops
          propagation. The chevron carries the keyboard affordance; this handler
          is the pointer shortcut for it. */}
      <div
        aria-current={selected ? 'true' : undefined}
        data-current={selected ? 'true' : undefined}
        onClick={() => {
          // Releasing a drag-select inside the row is not a click on it.
          if (window.getSelection()?.toString()) {
            return
          }
          onToggleExpanded(workItem)
        }}
        className={cn(
          'relative grid min-h-12 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left transition hover:bg-accent md:grid-cols-[90px_minmax(0,1fr)_128px_92px_80px_64px] lg:grid-cols-[96px_minmax(0,1.25fr)_132px_120px_136px_96px_64px] xl:grid-cols-[104px_minmax(0,1.45fr)_144px_132px_160px_128px_72px]',
          // A persistent selection must outrank a transient hover, so the current
          // row keeps a rail that hover alone never draws.
          selected &&
            'bg-accent before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-foreground/70',
          // A fix owns the row: a real surface plus a rail, one look per phase.
          // Working stays monochrome; the attention wash loops as the reminder;
          // done holds the success tint until the user acts on it.
          fixPhase && 'before:absolute before:inset-y-0 before:left-0 before:w-[2px]',
          fixPhase === 'working' && 'bg-secondary before:bg-foreground/40',
          fixPhase === 'attention' && 'yunxiao-fix-attention before:bg-status-warning',
          fixPhase === 'done' && 'bg-status-success-background before:bg-status-success'
        )}
      >
        {/* The row's identity, so it stays put at every width rather than moving
            into the title line on narrow screens. Excluded from the expand
            trigger: it is dense with its own targets (checkbox, open-in-云效),
            and a miss around them must not toggle the panel. `self-stretch`
            makes the shield cover the whole grid cell — the fixed column is
            wider and taller than its content, and the gap around the icons has
            to swallow clicks too, not just the glyphs themselves. */}
        <div
          className="flex min-w-0 cursor-default items-center gap-1.5 self-stretch"
          onClick={(event) => event.stopPropagation()}
        >
          {selectable ? (
            <Checkbox
              checked={checked}
              // The row click toggles expansion, so the checkbox must trap its own.
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={() => onToggleChecked(workItem)}
              aria-label={translate(
                'auto.components.TaskPage.yunxiao_select_aria',
                'Select {{value0}} for batch fix',
                { value0: workItem.serialNumber }
              )}
              className="size-3.5 shrink-0"
            />
          ) : null}
          <WorkItemTypeIcon workItem={workItem} />
          <span className="block truncate font-mono text-[12px] tabular-nums text-muted-foreground">
            {workItem.serialNumber}
          </span>
          {fixPhase === 'working' ? <AgentWorkingSpinner className="size-3 shrink-0" /> : null}
          {fixPhase === 'attention' ? (
            <span className="size-2 shrink-0 rounded-full bg-status-warning" aria-hidden />
          ) : null}
          {fixPhase === 'done' ? (
            <CircleCheck className="size-3.5 shrink-0 text-status-success" aria-hidden />
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {/* Labels lead the title so they read as a continuation of the
                identifier beside them; the title truncates before they do. */}
            {labels.length > 0 ? (
              <span className="flex shrink-0 items-center gap-1.5">
                {labels.map((label) => (
                  <YunxiaoLabelChip key={label.name} label={label} />
                ))}
                {workItem.labels.length > labels.length ? (
                  <span className="text-[10px] text-muted-foreground">
                    +{workItem.labels.length - labels.length}
                  </span>
                ) : null}
              </span>
            ) : null}
            <h3 className="min-w-0 truncate text-[13px] font-medium text-foreground">
              {workItem.title}
            </h3>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 md:!hidden">
            <span
              className={cn(
                'inline-flex min-w-0 items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium',
                getYunxiaoStatusTone(workItem.status)
              )}
            >
              <span className="truncate">{workItem.status.name}</span>
            </span>
            {priorityChip ? <span className="shrink-0">{priorityChip}</span> : null}
            <span className="min-w-0 truncate text-[11px] text-muted-foreground">
              {assigneeLabel}
            </span>
          </div>
          <div
            className={cn(
              'mt-1 flex min-w-0 items-center gap-1.5 max-lg:!hidden',
              // Context is the only thing left here at xl, where it is hidden —
              // without this the row would keep the empty line's leading.
              !workItem.sprintName && 'xl:!hidden'
            )}
          >
            <span className="max-w-[160px] truncate text-[10px] text-muted-foreground xl:!hidden">
              {contextLabel}
            </span>
            {workItem.sprintName ? (
              // Sprint is metadata, not a tag: icon + text keeps it distinct from
              // the pill-shaped labels that now lead the title.
              <span className="flex min-w-0 shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                <Milestone className="size-3 shrink-0" aria-hidden />
                <span className="sr-only">
                  {translate('auto.components.TaskPage.yunxiao_sprint_label', 'Sprint')}:{' '}
                </span>
                <span className="max-w-[120px] truncate">{workItem.sprintName}</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 max-md:!hidden">
          <span
            className={cn(
              'inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
              getYunxiaoStatusTone(workItem.status)
            )}
          >
            <span className="truncate">{workItem.status.name}</span>
          </span>
        </div>

        <div className="flex min-w-0 max-md:!hidden">{priorityChip}</div>

        <div className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground max-lg:!hidden">
          {workItem.assignee?.avatarUrl ? (
            <img
              src={workItem.assignee.avatarUrl}
              alt={workItem.assignee.displayName}
              className="size-5 shrink-0 rounded-full"
            />
          ) : (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/40 text-[10px]">
              {workItem.assignee?.displayName?.slice(0, 1) ?? '-'}
            </span>
          )}
          <span className="truncate">{assigneeLabel}</span>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="block min-w-0 truncate text-[12px] tabular-nums text-muted-foreground max-md:!hidden">
              {formatUpdatedAt(workItem.updatedAt)}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {new Date(workItem.updatedAt).toLocaleString()}
          </TooltipContent>
        </Tooltip>

        <YunxiaoWorkItemRowActions
          workItem={workItem}
          onFixWorkItem={onFixWorkItem}
          detailId={detailId}
          expanded={expanded}
          onToggleExpanded={onToggleExpanded}
          fixWorktreeId={fixWorktreeId}
          onViewFixWorkspace={onViewFixWorkspace}
        />
      </div>

      {/* Height-animated so the rows below slide rather than jump, which is what
          keeps the reader's place when a row opens mid-list. Radix keeps the
          panel mounted through the closing animation, then unmounts it — the
          detail only fetches while it is actually open. */}
      <Collapsible open={expanded} onOpenChange={() => onToggleExpanded(workItem)}>
        <CollapsibleContent id={detailId} className="collapsible-height-content">
          <TaskPageYunxiaoWorkItemDetail
            workItem={workItem}
            loadDetail={loadDetail}
            resolveAttachment={resolveAttachment}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
