import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ListChecks, Wrench, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { YunxiaoWorkItemRow } from '@/components/task-page-yunxiao-work-item-row'
import {
  getYunxiaoSelectionState,
  selectableYunxiaoWorkItems,
  toggleYunxiaoRowSelection
} from '@/components/task-page-yunxiao-batch-selection'
import {
  getYunxiaoPriorityRank,
  getYunxiaoStatusDotTone
} from '@/components/task-page-yunxiao-status-tone'
import type {
  YunxiaoWorkItemAttachmentResolver,
  YunxiaoWorkItemDetailLoader
} from '@/components/task-page-yunxiao-work-item-detail'
import type { YunxiaoStatusStage, YunxiaoWorkItem } from '../../../shared/yunxiao-types'

export type TaskPageYunxiaoWorkItemSection = {
  key: string
  label: string
  stage: YunxiaoStatusStage
  workItems: YunxiaoWorkItem[]
}

type TaskPageYunxiaoWorkItemListProps = {
  formatUpdatedAt: (updatedAt: string) => string
  workItems: YunxiaoWorkItem[]
  onFixWorkItem: (workItem: YunxiaoWorkItem) => void
  selectedWorkItem: YunxiaoWorkItem | null
  showOrganizationContext: boolean
  loadWorkItemDetail: YunxiaoWorkItemDetailLoader
  resolveAttachment: YunxiaoWorkItemAttachmentResolver
  /** Defect serial -> id of the workspace already fixing it. */
  fixWorktreeIdBySerial: ReadonlyMap<string, string>
  onBatchFixWorkItems: (workItems: YunxiaoWorkItem[]) => void
  onViewFixWorkspace: (worktreeId: string) => void
  statusDirection?: 'asc' | 'desc'
}

/** Stable across accounts, so the same id in two organizations stays distinct. */
export function yunxiaoWorkItemRowKey(workItem: YunxiaoWorkItem): string {
  return `${workItem.accountId ?? 'account'}:${workItem.id}`
}

/**
 * The order a defect actually travels, which is what a reader scans the list
 * for. The workflow stage cannot express it: 已修复, 暂不修复 and 已关闭 all sit
 * in a "finished" stage, and 待确认 sits in an unstarted one despite belonging
 * after 处理中. Aliases cover the 云效 defaults and the English names an org may
 * have switched to.
 */
const STATUS_SEQUENCE: string[][] = [
  ['待处理', '重新打开', '再次打开', 'pending processing', 'reopened', 'reopen'],
  ['处理中', 'in progress', 'processing'],
  ['待人工确认', '待确认', 'pending confirmation', 'new'],
  ['已修复', 'fixed'],
  ['暂不修复', '未修复', '不修复', "won't fix", 'wont fix', 'deferred fix'],
  ['已关闭', 'closed']
]

function statusSequenceRank(label: string): number {
  const normalized = label.trim().toLowerCase()
  const index = STATUS_SEQUENCE.findIndex((names) => names.includes(normalized))
  // A status outside the sequence sorts behind all of them, by stage.
  return index === -1 ? STATUS_SEQUENCE.length : index
}

// Why: 云效 has no board-column API for an arbitrary cross-project list, so a
// status the sequence above does not name falls back to its workflow stage.
const STAGE_RANK: Record<YunxiaoStatusStage, number> = {
  todo: 0,
  'in-progress': 1,
  done: 2,
  unknown: 3
}

export function groupYunxiaoWorkItemsByStatus(
  workItems: readonly YunxiaoWorkItem[],
  statusDirection: 'asc' | 'desc' = 'asc'
): TaskPageYunxiaoWorkItemSection[] {
  const sections = new Map<string, TaskPageYunxiaoWorkItemSection>()
  for (const workItem of workItems) {
    const key = `status:${workItem.status.name}`
    const section = sections.get(key)
    if (section) {
      section.workItems.push(workItem)
    } else {
      sections.set(key, {
        key,
        label: workItem.status.name,
        stage: workItem.status.stage,
        workItems: [workItem]
      })
    }
  }

  // Within a status the only ordering that helps triage is urgency; the sort is
  // stable, so items of equal priority keep the relevance order they arrived in.
  for (const section of sections.values()) {
    section.workItems.sort(
      (a, b) => getYunxiaoPriorityRank(a.priority) - getYunxiaoPriorityRank(b.priority)
    )
  }

  const sorted = [...sections.values()].sort((a, b) => {
    const sequenceDiff = statusSequenceRank(a.label) - statusSequenceRank(b.label)
    if (sequenceDiff !== 0) {
      return sequenceDiff
    }
    const stageDiff = STAGE_RANK[a.stage] - STAGE_RANK[b.stage]
    return stageDiff === 0 ? a.label.localeCompare(b.label) : stageDiff
  })
  return statusDirection === 'desc' ? sorted.toReversed() : sorted
}

function isSelectedWorkItem(
  workItem: YunxiaoWorkItem,
  selectedWorkItem: YunxiaoWorkItem | null
): boolean {
  return selectedWorkItem !== null && workItem.id === selectedWorkItem.id
}

// Spreads `props` so CollapsibleTrigger's asChild wiring reaches the button.
function YunxiaoStatusGroupHeader({
  open,
  section,
  className,
  ...props
}: React.ComponentProps<typeof Button> & {
  open: boolean
  section: TaskPageYunxiaoWorkItemSection
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      {...props}
      className={cn(
        'h-9 flex-1 justify-start rounded-none px-2 text-left font-normal transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
        className
      )}
    >
      {open ? (
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
      )}
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          getYunxiaoStatusDotTone({
            name: section.label,
            stage: section.stage
          })
        )}
        aria-hidden
      />
      <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
        {section.label}
      </span>
      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {section.workItems.length}
      </span>
    </Button>
  )
}

export function TaskPageYunxiaoWorkItemList({
  formatUpdatedAt,
  workItems,
  onFixWorkItem,
  selectedWorkItem,
  showOrganizationContext,
  loadWorkItemDetail,
  resolveAttachment,
  fixWorktreeIdBySerial,
  onBatchFixWorkItems,
  onViewFixWorkspace,
  statusDirection = 'asc'
}: TaskPageYunxiaoWorkItemListProps): React.JSX.Element {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  // Rows expand independently so two defects can be compared side by side.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set())
  const [checkedRows, setCheckedRows] = useState<Set<string>>(() => new Set())
  const sections = useMemo(
    () => groupYunxiaoWorkItemsByStatus(workItems, statusDirection),
    [statusDirection, workItems]
  )

  const allSelectable = useMemo(
    () => selectableYunxiaoWorkItems(workItems, fixWorktreeIdBySerial),
    [fixWorktreeIdBySerial, workItems]
  )

  // Why selectable, not just "still listed": the count must equal the ticks the
  // user can actually see. A defect that stopped being fixable since it was
  // ticked (someone closed it, a poll refreshed its status) renders no checkbox,
  // so counting it would strand the batch bar with nothing to untick.
  const checkedWorkItems = useMemo(
    () => allSelectable.filter((workItem) => checkedRows.has(yunxiaoWorkItemRowKey(workItem))),
    [allSelectable, checkedRows]
  )

  // Why prune rather than only derive: a key left behind by a no-longer-fixable
  // defect would silently re-arm if that defect reopened later.
  useEffect(() => {
    const selectableKeys = new Set(allSelectable.map(yunxiaoWorkItemRowKey))
    setCheckedRows((current) => {
      const next = new Set([...current].filter((key) => selectableKeys.has(key)))
      return next.size === current.size ? current : next
    })
  }, [allSelectable])

  const toggleCheckedRow = useCallback((workItem: YunxiaoWorkItem) => {
    const key = yunxiaoWorkItemRowKey(workItem)
    setCheckedRows((current) => {
      const next = new Set(current)
      if (!next.delete(key)) {
        next.add(key)
      }
      return next
    })
  }, [])

  const isRowChecked = useCallback(
    (workItem: YunxiaoWorkItem) => checkedRows.has(yunxiaoWorkItemRowKey(workItem)),
    [checkedRows]
  )
  const sectionSelectionOf = useCallback(
    (section: TaskPageYunxiaoWorkItemSection) => {
      const selectable = selectableYunxiaoWorkItems(section.workItems, fixWorktreeIdBySerial)
      const state = getYunxiaoSelectionState(selectable, isRowChecked)
      return {
        selectable,
        checkedState: state === 'all' ? true : state === 'some' ? 'indeterminate' : false
      } as const
    },
    [fixWorktreeIdBySerial, isRowChecked]
  )
  const toggleSectionSelection = useCallback(
    (section: TaskPageYunxiaoWorkItemSection) => {
      const selectable = selectableYunxiaoWorkItems(section.workItems, fixWorktreeIdBySerial)
      setCheckedRows((current) =>
        toggleYunxiaoRowSelection(current, selectable, yunxiaoWorkItemRowKey)
      )
    },
    [fixWorktreeIdBySerial]
  )
  const selectEveryRow = useCallback(() => {
    setCheckedRows(new Set(allSelectable.map(yunxiaoWorkItemRowKey)))
  }, [allSelectable])
  const batchBarVisible = checkedWorkItems.length > 0

  const submitBatchFix = useCallback(() => {
    if (checkedWorkItems.length > 0) {
      onBatchFixWorkItems(checkedWorkItems)
      setCheckedRows(new Set())
    }
  }, [checkedWorkItems, onBatchFixWorkItems])

  const toggleExpandedRow = useCallback((workItem: YunxiaoWorkItem) => {
    const key = yunxiaoWorkItemRowKey(workItem)
    setExpandedRows((current) => {
      const next = new Set(current)
      if (!next.delete(key)) {
        next.add(key)
      }
      return next
    })
  }, [])

  return (
    <div className="divide-y divide-border/50">
      {batchBarVisible ? (
        // Sticky above the group headers so the submit stays reachable however
        // deep the tick that armed it happened. Fixed height: the group headers
        // stack below it by that exact offset, so a taller bar would hide them.
        <div className="sticky top-0 z-20 flex h-9 items-center gap-2 border-b border-border bg-background px-3">
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {translate('auto.components.TaskPage.yunxiao_batch_selected', '{{value0}} selected', {
              value0: checkedWorkItems.length
            })}
          </span>
          <Button size="xs" onClick={submitBatchFix} className="gap-1.5">
            <Wrench className="size-3" />
            {translate('auto.components.TaskPage.yunxiao_batch_fix_button', 'Fix selected')}
          </Button>
          {/* Widens a started selection to the whole list; the per-status boxes
              are how a selection starts, so this only shows once one exists. */}
          {checkedWorkItems.length < allSelectable.length ? (
            <Button size="xs" variant="ghost" onClick={selectEveryRow} className="gap-1">
              <ListChecks className="size-3" />
              {translate('auto.components.TaskPage.yunxiao_batch_select_all', 'Select all')}
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setCheckedRows(new Set())}
            className="gap-1"
          >
            <X className="size-3" />
            {translate('auto.components.TaskPage.yunxiao_batch_clear', 'Clear')}
          </Button>
        </div>
      ) : null}
      {sections.map((section) => {
        const open = !collapsedGroups.has(section.key)
        return (
          <Collapsible
            key={section.key}
            open={open}
            onOpenChange={(nextOpen) => {
              setCollapsedGroups((current) => {
                const next = new Set(current)
                if (nextOpen) {
                  next.delete(section.key)
                } else {
                  next.add(section.key)
                }
                return next
              })
            }}
          >
            {/* Sticky so the status a long group belongs to stays readable while
                scrolling; that needs an opaque surface, hence bg-secondary. The
                select-all box is a sibling of the trigger, never inside it — a
                checkbox nested in a button is invalid and unreachable. */}
            <div
              className={cn(
                'sticky z-10 flex h-9 items-center gap-1.5 bg-secondary pl-3',
                // Stacks under the batch bar instead of vanishing behind it.
                batchBarVisible ? 'top-9' : 'top-0',
                open && 'border-b border-border/50'
              )}
            >
              {/* The slot is held even with nothing selectable, so group labels
                  stay on one vertical line down the list. */}
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {sectionSelectionOf(section).selectable.length > 0 ? (
                  <Checkbox
                    checked={sectionSelectionOf(section).checkedState}
                    onCheckedChange={() => toggleSectionSelection(section)}
                    aria-label={translate(
                      'auto.components.TaskPage.yunxiao_batch_select_group_aria',
                      'Select every fixable defect in {{value0}}',
                      { value0: section.label }
                    )}
                    className="size-3.5"
                  />
                ) : null}
              </span>
              <CollapsibleTrigger asChild>
                <YunxiaoStatusGroupHeader open={open} section={section} />
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="collapsible-height-content divide-y divide-border/50">
              {section.workItems.map((workItem) => (
                <YunxiaoWorkItemRow
                  key={yunxiaoWorkItemRowKey(workItem)}
                  formatUpdatedAt={formatUpdatedAt}
                  workItem={workItem}
                  onFixWorkItem={onFixWorkItem}
                  selected={isSelectedWorkItem(workItem, selectedWorkItem)}
                  showOrganizationContext={showOrganizationContext}
                  expanded={expandedRows.has(yunxiaoWorkItemRowKey(workItem))}
                  onToggleExpanded={toggleExpandedRow}
                  loadDetail={loadWorkItemDetail}
                  resolveAttachment={resolveAttachment}
                  checked={checkedRows.has(yunxiaoWorkItemRowKey(workItem))}
                  onToggleChecked={toggleCheckedRow}
                  fixWorktreeId={fixWorktreeIdBySerial.get(workItem.serialNumber) ?? null}
                  onViewFixWorkspace={onViewFixWorkspace}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}
