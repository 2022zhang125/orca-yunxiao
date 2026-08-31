import { toast } from 'sonner'

import { isWindowInForeground } from './window-foreground'
import type { YunxiaoWorkItemChangeNotification } from '../../../shared/notification-settings-types'

/**
 * Where a 云效 change announcement goes. A toast is only seen by someone looking
 * at Orca, so anything else — minimized, or just sitting behind the editor the
 * user is coding in — takes the native notification. That backgrounded case is
 * the whole point of watching, and it is not a hidden window: Electron reports
 * an unfocused window as visible, so routing on visibility toasted into a window
 * the user could not see until they switched to it.
 */

export type YunxiaoChangeAnnouncement = {
  message: string
  /** Toast subtitle; the native notification's body. */
  description?: string
  /** Structured form of `message` so main can render it in the user's language. */
  notification: YunxiaoWorkItemChangeNotification
  /** Jump-to-list affordance. Toast-only — a native notification click routes
   *  through main's own handler. */
  action?: { label: string; onClick: () => void }
}

/** One batch, one native notification. Main dedupes desktop notifications on a
 *  short cooldown keyed by workspace, and a 云效 change has no workspace — so a
 *  per-item dispatch would deliver the first and silently drop the rest. */
function toBatchNotification(
  announcements: readonly YunxiaoChangeAnnouncement[]
): { change: YunxiaoWorkItemChangeNotification; body?: string } | null {
  const [first] = announcements
  if (!first) {
    return null
  }
  if (announcements.length === 1) {
    return {
      change: first.notification,
      ...(first.description ? { body: first.description } : {})
    }
  }
  return { change: { kind: 'bulk', count: announcements.length } }
}

export function deliverYunxiaoChangeAnnouncements(
  announcements: readonly YunxiaoChangeAnnouncement[]
): void {
  if (isWindowInForeground()) {
    for (const announcement of announcements) {
      toast.info(announcement.message, {
        ...(announcement.description ? { description: announcement.description } : {}),
        ...(announcement.action ? { action: announcement.action } : {})
      })
    }
    return
  }
  const batch = toBatchNotification(announcements)
  if (!batch) {
    return
  }
  void window.api.notifications
    .dispatch({
      source: 'yunxiao-work-item-change',
      yunxiaoChange: {
        ...batch.change,
        ...(batch.body ? { itemTitle: batch.body } : {})
      }
    })
    .catch(() => {
      // Best-effort: a refused or unsupported notification must not break the poll.
    })
}
