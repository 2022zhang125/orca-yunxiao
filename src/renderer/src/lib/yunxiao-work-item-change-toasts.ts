import { translate } from '@/i18n/i18n'
import {
  deliverYunxiaoChangeAnnouncements,
  type YunxiaoChangeAnnouncement
} from './yunxiao-change-announcement-delivery'
import type { YunxiaoWorkItem } from '../../../shared/types'

/**
 * Announcements for remote 云效 changes: when a fresh list read lands, items
 * that appeared, changed, or left the list since the previous read of the same
 * list are announced, so edits made by teammates surface without watching the
 * Tasks page. Delivery picks the surface — toast on screen, native notification
 * when the window is hidden.
 */

// Snapshots keep the whole item, not only the compared fields: an item that left
// the list still has to name itself in the toast the fresh read cannot describe.
const snapshotsByListKey = new Map<string, Map<string, YunxiaoWorkItem>>()
// The same change can arrive through several list presets (assigned/created/…);
// remember what was already announced so it toasts once, not once per preset.
const announcedAt = new Map<string, number>()

const ANNOUNCE_DEDUPE_TTL_MS = 10 * 60 * 1000
// A handful of changes read fine as individual toasts; past that they collapse
// into one summary so a busy sprint doesn't stack a wall of notifications.
const MAX_INDIVIDUAL_TOASTS = 3

export type YunxiaoWorkItemListChanges = {
  added: YunxiaoWorkItem[]
  updated: YunxiaoWorkItem[]
  /** Previous-read copies of the items the fresh read no longer lists. */
  removed: YunxiaoWorkItem[]
  /** Serial numbers among `updated` whose owner moved. */
  reassigned: string[]
}

export type YunxiaoWorkItemChangeToastOptions = {
  /**
   * Jumps to the 云效 list. Refreshing is part of the jump, not a follow-up: the
   * toast is announcing something the list's own cached read predates, so
   * landing on a stale list is the one outcome the notification must not
   * produce.
   */
  onView?: () => void
  /**
   * Announce the items that left the list. Only the assigned list loses one to a
   * reassignment; elsewhere a disappearance means deleted or ranked out, which
   * is not the user's news.
   */
  announceRemoved?: boolean
  /**
   * The read's limit. A list sitting at its limit may have dropped an item to
   * the slice rather than to a real change, so removals stay silent there.
   */
  listLimit?: number
}

type AnnouncementKind = 'added' | 'updated' | 'removed'

function assigneeUserId(workItem: YunxiaoWorkItem): string | null {
  return workItem.assignee?.userId ?? null
}

function hasChanged(before: YunxiaoWorkItem, after: YunxiaoWorkItem): boolean {
  return (
    before.status.name !== after.status.name ||
    before.updatedAt !== after.updatedAt ||
    // Why: 云效 does not reliably bump gmtModified on a reassignment, so the
    // owner is compared directly instead of inferred from updatedAt.
    assigneeUserId(before) !== assigneeUserId(after)
  )
}

/** Diff a fresh list against the previous snapshot of the same list read. */
export function diffYunxiaoWorkItemSnapshot(
  previous: ReadonlyMap<string, YunxiaoWorkItem> | undefined,
  workItems: readonly YunxiaoWorkItem[]
): YunxiaoWorkItemListChanges {
  // No baseline yet (first read after launch/reconnect): nothing has "changed".
  if (!previous) {
    return { added: [], updated: [], removed: [], reassigned: [] }
  }
  const added: YunxiaoWorkItem[] = []
  const updated: YunxiaoWorkItem[] = []
  const reassigned: string[] = []
  const present = new Set<string>()
  for (const workItem of workItems) {
    present.add(workItem.serialNumber)
    const before = previous.get(workItem.serialNumber)
    if (!before) {
      added.push(workItem)
    } else if (hasChanged(before, workItem)) {
      updated.push(workItem)
      if (assigneeUserId(before) !== assigneeUserId(workItem)) {
        reassigned.push(workItem.serialNumber)
      }
    }
  }
  const removed: YunxiaoWorkItem[] = []
  for (const [serialNumber, before] of previous) {
    if (!present.has(serialNumber)) {
      removed.push(before)
    }
  }
  return { added, updated, removed, reassigned }
}

function announceKey(
  kind: AnnouncementKind,
  workItem: YunxiaoWorkItem,
  reassigned: ReadonlySet<string>
): string {
  const account = workItem.accountId ?? ''
  // One reassignment reaches both watched lists — as a departure from Assigned
  // and as an owner change in Created. Share a dedupe lane so it toasts once.
  if (kind === 'removed' || (kind === 'updated' && reassigned.has(workItem.serialNumber))) {
    return `reassigned::${account}::${workItem.serialNumber}`
  }
  if (kind === 'updated') {
    return `updated::${account}::${workItem.serialNumber}::${workItem.updatedAt}::${workItem.status.name}::${assigneeUserId(workItem) ?? ''}`
  }
  return `${kind}::${account}::${workItem.serialNumber}`
}

function toastMessage(kind: AnnouncementKind, workItem: YunxiaoWorkItem): string {
  if (kind === 'added') {
    return translate(
      'auto.components.TaskPage.yunxiao_toast_new_item',
      'New {{value0}}: {{value1}}',
      {
        value0: workItem.workItemType.name,
        value1: workItem.serialNumber
      }
    )
  }
  if (kind === 'removed') {
    return translate(
      'auto.components.TaskPage.yunxiao_toast_item_unassigned',
      '{{value0}} is no longer assigned to you',
      { value0: workItem.serialNumber }
    )
  }
  return translate(
    'auto.components.TaskPage.yunxiao_toast_item_updated',
    '{{value0}} updated ({{value1}})',
    {
      value0: workItem.serialNumber,
      value1: workItem.status.name
    }
  )
}

export function announceYunxiaoWorkItemListChanges(
  listKey: string,
  workItems: readonly YunxiaoWorkItem[],
  options: YunxiaoWorkItemChangeToastOptions = {}
): void {
  const previous = snapshotsByListKey.get(listKey)
  snapshotsByListKey.set(
    listKey,
    new Map(workItems.map((workItem) => [workItem.serialNumber, workItem]))
  )
  const { added, updated, removed, reassigned } = diffYunxiaoWorkItemSnapshot(previous, workItems)
  const reassignedSerials = new Set(reassigned)
  const truncated = options.listLimit !== undefined && workItems.length >= options.listLimit
  const departed = options.announceRemoved && !truncated ? removed : []
  const now = Date.now()
  for (const [key, at] of announcedAt) {
    if (now - at > ANNOUNCE_DEDUPE_TTL_MS) {
      announcedAt.delete(key)
    }
  }
  const announcements: { kind: AnnouncementKind; workItem: YunxiaoWorkItem }[] = []
  for (const [kind, changed] of [
    ['added', added],
    ['updated', updated],
    ['removed', departed]
  ] as const) {
    for (const workItem of changed) {
      const key = announceKey(kind, workItem, reassignedSerials)
      if (announcedAt.has(key)) {
        continue
      }
      announcedAt.set(key, now)
      announcements.push({ kind, workItem })
    }
  }
  if (announcements.length === 0) {
    return
  }
  const viewAction = options.onView
    ? {
        action: {
          label: translate('auto.components.TaskPage.9c57663908', 'View'),
          onClick: options.onView
        }
      }
    : {}
  if (announcements.length > MAX_INDIVIDUAL_TOASTS) {
    deliverYunxiaoChangeAnnouncements([
      {
        message: translate(
          'auto.components.TaskPage.yunxiao_toast_bulk_changes',
          '{{value0}} 云效 work items changed',
          { value0: announcements.length }
        ),
        notification: { kind: 'bulk', count: announcements.length },
        ...viewAction
      }
    ])
    return
  }
  deliverYunxiaoChangeAnnouncements(
    announcements.map(({ kind, workItem }): YunxiaoChangeAnnouncement => {
      const isDeparture = kind === 'removed'
      return {
        message: toastMessage(kind, workItem),
        description: workItem.title,
        notification: {
          kind,
          serialNumber: workItem.serialNumber,
          ...(kind === 'added' ? { workItemTypeName: workItem.workItemType.name } : {}),
          ...(isDeparture ? {} : { statusName: workItem.status.name })
        },
        ...viewAction
      }
    })
  )
}

/** Drop baselines so a reconnect or account switch starts clean instead of diffing across identities. */
export function resetYunxiaoWorkItemChangeTracking(): void {
  snapshotsByListKey.clear()
  announcedAt.clear()
}
