import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'

import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import {
  hasStructuredDefectReport,
  parseYunxiaoDefectReport,
  splitReproductionSteps,
  type YunxiaoDefectAttachment,
  type YunxiaoDefectFieldId,
  type YunxiaoDefectReport
} from '@/components/task-page-yunxiao-defect-report'
import {
  TaskPageYunxiaoAttachmentViewer,
  type YunxiaoAttachmentResolver
} from '@/components/task-page-yunxiao-attachment-viewer'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { YunxiaoWorkItem, YunxiaoWorkItemFile } from '../../../shared/types'

/** Binds an attachment to the work item it belongs to, which the API needs. */
export type YunxiaoWorkItemAttachmentResolver = (
  workItem: YunxiaoWorkItem,
  attachment: YunxiaoDefectAttachment
) => Promise<YunxiaoWorkItemFile | null>

/**
 * Resolves the full work item behind a list row. The list payload
 * (workitems:search) omits the description, so expanding a row has to read the
 * single-item endpoint before there is anything to show.
 */
export type YunxiaoWorkItemDetailLoader = (
  workItem: YunxiaoWorkItem
) => Promise<YunxiaoWorkItem | null>

type DetailState =
  | { kind: 'loading' }
  | { kind: 'ready'; description: string }
  | { kind: 'empty' }
  | { kind: 'error' }

function initialDetailState(workItem: YunxiaoWorkItem): DetailState {
  const description = workItem.description?.trim()
  return description ? { kind: 'ready', description } : { kind: 'loading' }
}

/**
 * Labels read as form slots rather than prose, so they borrow the row's
 * monospace treatment — the same signal the serial number already carries.
 *
 * Two treatments, because two jobs: a section label heads a block and gets the
 * uppercase spine, while an inline label sits beside its value and stays in
 * lower case so it does not compete with the value it introduces.
 */
function SectionLabel({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'font-mono text-[11px] uppercase tracking-wide text-muted-foreground',
        className
      )}
    >
      {children}
    </span>
  )
}

// Undimmed on purpose: `muted-foreground` is already the low-contrast step
// (#737373 light), and thinning it further drops 11px text under 3:1 there.
function InlineField({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-[11px] text-foreground">{value}</span>
    </span>
  )
}

function IdentityStrip({ workItem }: { workItem: YunxiaoWorkItem }): React.JSX.Element {
  const entries = [
    [
      translate('auto.components.TaskPage.yunxiao_detail_project', 'Project'),
      workItem.project.name
    ],
    [
      translate('auto.components.TaskPage.yunxiao_detail_reporter', 'Reporter'),
      workItem.creator?.displayName ?? translate('auto.components.TaskPage.5ebff3a0aa', 'None')
    ],
    [
      translate('auto.components.TaskPage.yunxiao_detail_created', 'Created'),
      new Date(workItem.createdAt).toLocaleString()
    ]
  ]
  if (workItem.sprintName) {
    entries.push([
      translate('auto.components.TaskPage.yunxiao_sprint_label', 'Sprint'),
      workItem.sprintName
    ])
  }
  return (
    // A caption for the record, so it sits above the hairline and stays quiet.
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border pb-2.5">
      {entries.map(([label, value]) => (
        <InlineField key={label} label={label} value={value} />
      ))}
    </div>
  )
}

/**
 * The defect's central claim. Expected and actual are the one pair whose
 * disagreement *is* the bug, so they sit opposed and read first. They share one
 * surface — the pair is a single thought — and differ only in the rail and
 * label hue, which is the whole of the color budget in this panel.
 *
 * `muted` rather than a translucent wash: it is a real surface in both themes
 * (#f5f5f5 / #262626), so the block reads as filled either way. An alpha over
 * `background` would lift it in light and sink it in dark.
 */
function ClaimPair({ report }: { report: YunxiaoDefectReport }): React.JSX.Element | null {
  const { expected, actual } = report.fields
  if (!expected && !actual) {
    return null
  }
  const sides = [
    {
      value: expected,
      label: translate('auto.components.TaskPage.yunxiao_detail_expected', 'Expected'),
      rail: 'border-status-success-border',
      tone: 'text-status-success'
    },
    {
      value: actual,
      label: translate('auto.components.TaskPage.yunxiao_detail_actual', 'Actual'),
      rail: 'border-status-danger-border',
      tone: 'text-status-danger'
    }
  ].filter((side) => side.value)

  return (
    <div className={cn('grid gap-2', sides.length > 1 && 'sm:grid-cols-2')}>
      {sides.map((side) => (
        <div key={side.label} className={cn('border-l-2 bg-muted py-1.5 pr-2 pl-2.5', side.rail)}>
          <SectionLabel className={side.tone}>{side.label}</SectionLabel>
          <p className="mt-0.5 whitespace-pre-line text-[12px] leading-relaxed text-foreground">
            {side.value}
          </p>
        </div>
      ))}
    </div>
  )
}

/**
 * Reproduction steps are the one genuinely ordered field in the template, so
 * they are the one place a number earns its keep. A lone step stays prose — a
 * "1." with nothing after it claims a sequence that isn't there.
 */
function ReproductionSteps({ steps }: { steps: string }): React.JSX.Element {
  const label = translate('auto.components.TaskPage.yunxiao_detail_steps', 'Steps to reproduce')
  const parts = splitReproductionSteps(steps)
  if (parts.length < 2) {
    return <ProseBlock label={label} body={steps} />
  }
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <ol className="mt-1 flex flex-col gap-1">
        {parts.map((step, index) => (
          <li key={step} className="flex min-w-0 items-baseline gap-2">
            <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <span className="min-w-0 text-[12px] leading-relaxed text-foreground">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const SCALAR_FIELD_IDS: YunxiaoDefectFieldId[] = ['environment', 'account', 'scope', 'api']

// Static keys rather than a template literal, so the localization catalog check
// can still resolve every string this file references.
function getScalarFieldLabels(): { id: YunxiaoDefectFieldId; label: string }[] {
  return [
    {
      id: 'environment',
      label: translate('auto.components.TaskPage.yunxiao_detail_environment', 'Environment')
    },
    {
      id: 'account',
      label: translate('auto.components.TaskPage.yunxiao_detail_account', 'Account')
    },
    { id: 'scope', label: translate('auto.components.TaskPage.yunxiao_detail_scope', 'Impact') },
    { id: 'api', label: translate('auto.components.TaskPage.yunxiao_detail_api', 'Endpoint') }
  ]
}

/** Short single-value fields; a grid keeps them scannable instead of a wall. */
function ScalarFields({ report }: { report: YunxiaoDefectReport }): React.JSX.Element | null {
  const present = getScalarFieldLabels().filter((field) => report.fields[field.id])
  if (present.length === 0) {
    return null
  }
  return (
    <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
      {present.map((field) => (
        <InlineField key={field.id} label={field.label} value={report.fields[field.id]!} />
      ))}
    </div>
  )
}

function ProseBlock({ label, body }: { label: string; body: string }): React.JSX.Element {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <p className="mt-0.5 whitespace-pre-line text-[12px] leading-relaxed text-foreground">
        {body}
      </p>
    </div>
  )
}

/**
 * 云效's own image URLs are guarded by a web session Orca does not have, so an
 * inline <img> is always a broken tile. These open the viewer, which resolves a
 * usable link first.
 */
function Attachments({
  report,
  onOpenAttachment
}: {
  report: YunxiaoDefectReport
  onOpenAttachment: (attachment: YunxiaoDefectAttachment) => void
}): React.JSX.Element | null {
  if (report.images.length === 0) {
    return null
  }
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {report.images.map((image) => (
        <button
          key={image.src}
          type="button"
          onClick={() => onOpenAttachment(image)}
          className="flex min-w-0 items-center gap-1.5 rounded-sm text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ImageIcon className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{image.name}</span>
        </button>
      ))}
    </div>
  )
}

function StructuredReport({
  report,
  onOpenAttachment
}: {
  report: YunxiaoDefectReport
  onOpenAttachment: (attachment: YunxiaoDefectAttachment) => void
}): React.JSX.Element {
  const steps = report.fields.steps
  const hasContext = SCALAR_FIELD_IDS.some((id) => report.fields[id]) || report.images.length > 0
  return (
    // The claim gets more air beneath it than the blocks below share between
    // them, so the hierarchy is legible before any of the text is read.
    <div className="flex flex-col gap-4">
      <ClaimPair report={report} />
      {steps ? <ReproductionSteps steps={steps} /> : null}
      {report.prose.length > 0 ? (
        <p className="whitespace-pre-line text-[12px] leading-relaxed text-foreground">
          {report.prose.join('\n')}
        </p>
      ) : null}
      {hasContext ? (
        <div className="flex flex-col gap-2 border-t border-border pt-2.5">
          <ScalarFields report={report} />
          <Attachments report={report} onOpenAttachment={onOpenAttachment} />
        </div>
      ) : null}
    </div>
  )
}

function DetailBody({
  state,
  onOpenAttachment
}: {
  state: DetailState
  onOpenAttachment: (attachment: YunxiaoDefectAttachment) => void
}): React.JSX.Element {
  const report = useMemo(
    () => (state.kind === 'ready' ? parseYunxiaoDefectReport(state.description) : null),
    [state]
  )
  switch (state.kind) {
    case 'loading':
      return (
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
          {translate('auto.components.TaskPage.yunxiao_detail_loading', 'Loading details…')}
        </div>
      )
    case 'error':
      return (
        <p className="text-[12px] text-status-danger">
          {translate(
            'auto.components.TaskPage.yunxiao_detail_failed',
            'Could not load this item. Open it in 云效 to see the full content.'
          )}
        </p>
      )
    case 'empty':
      return (
        <p className="text-[12px] text-muted-foreground">
          {translate('auto.components.TaskPage.yunxiao_detail_empty', 'No description.')}
        </p>
      )
    case 'ready':
      // A description that does not follow the defect template keeps its own
      // shape rather than being forced into slots it never filled.
      return report && hasStructuredDefectReport(report) ? (
        <StructuredReport report={report} onOpenAttachment={onOpenAttachment} />
      ) : (
        <CommentMarkdown
          content={state.description}
          variant="document"
          // Cap the height so one verbose defect cannot push the rest of the
          // list off screen.
          className="scrollbar-sleek max-h-64 min-w-0 max-w-full overflow-y-auto break-words text-[12px] leading-relaxed [&_a]:break-all [&_pre]:max-w-full"
        />
      )
  }
}

/**
 * Inline body of an expanded row: the fields the row has no space for, then the
 * defect report itself. Renders in place so triaging a defect costs one click
 * instead of a round trip through the 云效 web app.
 */
export function TaskPageYunxiaoWorkItemDetail({
  workItem,
  loadDetail,
  resolveAttachment,
  className
}: {
  workItem: YunxiaoWorkItem
  loadDetail: YunxiaoWorkItemDetailLoader
  resolveAttachment: YunxiaoWorkItemAttachmentResolver
  className?: string
}): React.JSX.Element {
  const [state, setState] = useState<DetailState>(() => initialDetailState(workItem))
  const [viewing, setViewing] = useState<YunxiaoDefectAttachment | null>(null)
  const resolveForThisItem = useCallback<YunxiaoAttachmentResolver>(
    (attachment) => resolveAttachment(workItem, attachment),
    [resolveAttachment, workItem]
  )

  useEffect(() => {
    const seeded = initialDetailState(workItem)
    setState(seeded)
    if (seeded.kind !== 'loading') {
      return
    }
    let active = true
    void loadDetail(workItem)
      .then((detail) => {
        if (!active) {
          return
        }
        const description = detail?.description?.trim()
        setState(description ? { kind: 'ready', description } : { kind: 'empty' })
      })
      .catch(() => {
        if (active) {
          setState({ kind: 'error' })
        }
      })
    return () => {
      active = false
    }
  }, [loadDetail, workItem])

  return (
    // No surface of its own: the claim block is the one filled thing in here,
    // and a second wash behind it would leave nothing for it to sit on. The
    // rule plus the indent are enough to tie the panel to the row above.
    <div className={cn('flex flex-col gap-3 border-t border-border py-3 pr-3 pl-4', className)}>
      <IdentityStrip workItem={workItem} />
      <DetailBody state={state} onOpenAttachment={setViewing} />
      <TaskPageYunxiaoAttachmentViewer
        attachment={viewing}
        resolve={resolveForThisItem}
        onClose={() => setViewing(null)}
      />
    </div>
  )
}
