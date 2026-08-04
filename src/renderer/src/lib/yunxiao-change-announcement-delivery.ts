import { toast } from 'sonner'

import { isWindowVisible } from './window-visibility-interval'
import type { YunxiaoWorkItemChangeNotification } from '../../../shared/types'

/**
 * Where a 云效 change announcement goes. A toast only exists on screen, so a
 * hidden window would drop the announcement it just polled for — the native
 * notification is what makes background watching worth doing at all.
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
  if (isWindowVisible()) {
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
