import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'
import type { YunxiaoWorkItem } from '../../../shared/types'

/**
 * Bottom-right toasts for remote 云效 changes: when a fresh list read lands,
 * items that appeared or changed since the previous read of the same list are
 * announced, so edits made by teammates surface without watching the Tasks page.
 */

type WorkItemFingerprint = { statusName: string; updatedAt: string }

const snapshotsByListKey = new Map<string, Map<string, WorkItemFingerprint>>()
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
}

/**
 * Jumps to the 云效 list. Refreshing is part of the jump, not a follow-up: the
 * toast is announcing something the list's own cached read predates, so landing
 * on a stale list is the one outcome the notification must not produce.
 */
export type YunxiaoWorkItemChangeToastOptions = { onView?: () => void }

function fingerprint(workItem: YunxiaoWorkItem): WorkItemFingerprint {
  return { statusName: workItem.status.name, updatedAt: workItem.updatedAt }
}

/** Diff a fresh list against the previous snapshot of the same list read. */
export function diffYunxiaoWorkItemSnapshot(
  previous: ReadonlyMap<string, WorkItemFingerprint> | undefined,
  workItems: readonly YunxiaoWorkItem[]
): YunxiaoWorkItemListChanges {
  // No baseline yet (first read after launch/reconnect): nothing has "changed".
  if (!previous) {
    return { added: [], updated: [] }
  }
  const added: YunxiaoWorkItem[] = []
  const updated: YunxiaoWorkItem[] = []
  for (const workItem of workItems) {
    const before = previous.get(workItem.serialNumber)
    if (!before) {
      added.push(workItem)
    } else if (
      before.statusName !== workItem.status.name ||
      before.updatedAt !== workItem.updatedAt
    ) {
      updated.push(workItem)
    }
  }
  return { added, updated }
}

function announceKey(kind: 'added' | 'updated', workItem: YunxiaoWorkItem): string {
  const account = workItem.accountId ?? ''
  return kind === 'added'
    ? `added::${account}::${workItem.serialNumber}`
    : `updated::${account}::${workItem.serialNumber}::${workItem.updatedAt}::${workItem.status.name}`
}

export function announceYunxiaoWorkItemListChanges(
  listKey: string,
  workItems: readonly YunxiaoWorkItem[],
  options: YunxiaoWorkItemChangeToastOptions = {}
): void {
  const previous = snapshotsByListKey.get(listKey)
  snapshotsByListKey.set(
    listKey,
    new Map(workItems.map((workItem) => [workItem.serialNumber, fingerprint(workItem)]))
  )
  const { added, updated } = diffYunxiaoWorkItemSnapshot(previous, workItems)
  const now = Date.now()
  for (const [key, at] of announcedAt) {
    if (now - at > ANNOUNCE_DEDUPE_TTL_MS) {
      announcedAt.delete(key)
    }
  }
  const announcements: { kind: 'added' | 'updated'; workItem: YunxiaoWorkItem }[] = []
  for (const kind of ['added', 'updated'] as const) {
    for (const workItem of kind === 'added' ? added : updated) {
      const key = announceKey(kind, workItem)
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
    toast.info(
      translate(
        'auto.components.TaskPage.yunxiao_toast_bulk_changes',
        '{{value0}} 云效 work items changed',
        { value0: announcements.length }
      ),
      viewAction
    )
    return
  }
  for (const { kind, workItem } of announcements) {
    toast.info(
      kind === 'added'
        ? translate(
            'auto.components.TaskPage.yunxiao_toast_new_item',
            'New {{value0}}: {{value1}}',
            {
              value0: workItem.workItemType.name,
              value1: workItem.serialNumber
            }
          )
        : translate(
            'auto.components.TaskPage.yunxiao_toast_item_updated',
            '{{value0}} updated ({{value1}})',
            { value0: workItem.serialNumber, value1: workItem.status.name }
          ),
      { description: workItem.title, ...viewAction }
    )
  }
}

/** Drop baselines so a reconnect or account switch starts clean instead of diffing across identities. */
export function resetYunxiaoWorkItemChangeTracking(): void {
  snapshotsByListKey.clear()
  announcedAt.clear()
}
