import {
  isYunxiaoPendingConfirmStatus,
  isYunxiaoReopenedStatus,
  isYunxiaoUnfixedStatus
} from '../../../shared/yunxiao-defect-status'
import type { YunxiaoStatusStage, YunxiaoWorkItem } from '../../../shared/types'

export type YunxiaoStatusRef = { name: string; stage: YunxiaoStatusStage }

export type YunxiaoStatusAccent = 'unfixed' | 'reopened' | 'done' | 'active' | 'neutral'

// 云效 ships these defect statuses by name, so match the name before the stage;
// both sit in the same workflow stage as ordinary open work otherwise.
export function getYunxiaoStatusAccent(status: YunxiaoStatusRef): YunxiaoStatusAccent {
  if (isYunxiaoUnfixedStatus(status.name)) {
    return 'unfixed'
  }
  if (isYunxiaoReopenedStatus(status.name)) {
    return 'reopened'
  }
  if (status.stage === 'done') {
    return 'done'
  }
  return status.stage === 'in-progress' ? 'active' : 'neutral'
}

export function getYunxiaoStatusTone(status: YunxiaoStatusRef): string {
  switch (getYunxiaoStatusAccent(status)) {
    case 'unfixed':
      return 'border-status-danger-border bg-status-danger-background text-status-danger'
    case 'reopened':
      return 'border-status-warning-border bg-status-warning-background text-status-warning'
    case 'done':
      return 'border-status-success-border bg-status-success-background text-status-success'
    // Why: the palette stays monochrome outside the flagged states, so an active
    // status earns emphasis through weight rather than yet another hue.
    case 'active':
      return 'border-border bg-secondary text-foreground'
    case 'neutral':
      return 'border-border/50 bg-muted/40 text-muted-foreground'
  }
}

export function getYunxiaoStatusDotTone(status: YunxiaoStatusRef): string {
  switch (getYunxiaoStatusAccent(status)) {
    case 'unfixed':
      return 'bg-status-danger'
    case 'reopened':
      return 'bg-status-warning'
    case 'done':
      return 'bg-status-success'
    case 'active':
      return 'bg-foreground/60'
    case 'neutral':
      return 'bg-muted-foreground/40'
  }
}

/**
 * One-click fix only makes sense for a defect that is actually outstanding —
 * an unfixed, reopened, in-progress, or pending-confirmation 缺陷. Everything
 * else keeps a read-only row.
 */
export function canFixYunxiaoWorkItem(workItem: YunxiaoWorkItem): boolean {
  if (workItem.workItemType.category !== 'Bug') {
    return false
  }
  const accent = getYunxiaoStatusAccent(workItem.status)
  return (
    accent === 'unfixed' ||
    accent === 'reopened' ||
    accent === 'active' ||
    isYunxiaoPendingConfirmStatus(workItem.status.name)
  )
}

export type YunxiaoPriorityLevel = 'urgent' | 'high' | 'medium' | 'low' | 'unknown'

// 云效 ships 紧急/较高/普通/较低 by default, but an org can rename the field's
// values — this one uses 高/中/低 — so every spelling we have seen maps here.
const PRIORITY_LEVELS: { level: YunxiaoPriorityLevel; names: string[] }[] = [
  { level: 'urgent', names: ['紧急', '最高', 'urgent', 'highest', 'critical', 'p0'] },
  { level: 'high', names: ['高', '较高', 'high', 'p1'] },
  { level: 'medium', names: ['中', '普通', '中等', '一般', 'medium', 'normal', 'p2'] },
  { level: 'low', names: ['低', '较低', '最低', 'low', 'lowest', 'p3'] }
]

export function getYunxiaoPriorityLevel(priority: string | undefined): YunxiaoPriorityLevel {
  const normalized = priority?.trim().toLowerCase()
  if (!normalized) {
    return 'unknown'
  }
  return PRIORITY_LEVELS.find((entry) => entry.names.includes(normalized))?.level ?? 'unknown'
}

const PRIORITY_RANK: Record<YunxiaoPriorityLevel, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  // A renamed value sorts after everything known rather than jumping the queue.
  unknown: 4
}

/** Ascending, so a plain sort puts the most urgent work first. */
export function getYunxiaoPriorityRank(priority: string | undefined): number {
  return PRIORITY_RANK[getYunxiaoPriorityLevel(priority)]
}

/**
 * Border/background/text triple for the priority chip, matching the shape the
 * status chip uses so the two read as one vocabulary.
 *
 * Every level is tinted: 低 primary, 中 warning, 高 danger. 紧急 sits above 高,
 * so it takes the solid danger fill rather than a fourth hue Orca does not have.
 * The 10%/25% mix on primary mirrors how the status tokens are built, so the
 * chips stay the same weight as each other.
 */
export function getYunxiaoPriorityChipTone(priority: string | undefined): string {
  switch (getYunxiaoPriorityLevel(priority)) {
    case 'urgent':
      return 'border-status-danger bg-status-danger text-background'
    case 'high':
      return 'border-status-danger-border bg-status-danger-background text-status-danger'
    case 'medium':
      return 'border-status-warning-border bg-status-warning-background text-status-warning'
    case 'low':
      return 'border-primary/25 bg-primary/10 text-primary'
    // Not a level, so it stays uncoloured — an unreadable value is not "low".
    case 'unknown':
      return 'border-border/50 bg-muted/40 text-muted-foreground'
  }
}
