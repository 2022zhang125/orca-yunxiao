import { useEffect } from 'react'

import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { installBackgroundPollInterval } from '@/lib/background-poll-interval'
import {
  createYunxiaoChangePoll,
  YUNXIAO_CHANGE_POLL_INTERVAL_MS
} from '@/lib/yunxiao-work-item-change-poll'
import { useAppStore } from '@/store'

/**
 * Keeps the 云效 change announcements arriving without anyone opening Tasks:
 * re-reads the related-to-me lists on an interval so the store's list-read path
 * can announce what a teammate added or changed.
 *
 * Runs while the window is hidden too. Being away from Orca is when a teammate's
 * change is most worth hearing about, and delivery switches to a native
 * notification whenever Orca isn't the window in front, so neither a hidden nor
 * a backgrounded window is a reason to stop reading.
 */
export function YunxiaoWorkItemChangePoller(): null {
  const runtimeContextKey = useAppStore((s) => getProviderRuntimeContextKey(s.settings))
  const yunxiaoConnected = useAppStore((s) => s.yunxiaoStatus.connected)
  const yunxiaoStatusChecked = useAppStore((s) => s.yunxiaoStatusChecked)
  const yunxiaoStatusContextKey = useAppStore((s) => s.yunxiaoStatusContextKey)
  const checkYunxiaoConnection = useAppStore((s) => s.checkYunxiaoConnection)
  const listYunxiaoWorkItems = useAppStore((s) => s.listYunxiaoWorkItems)
  const invalidateYunxiaoWorkItemLists = useAppStore((s) => s.invalidateYunxiaoWorkItemLists)

  const statusCurrent = yunxiaoStatusContextKey === runtimeContextKey

  // Why: Tasks was the only surface that ever probed the connection, so a session
  // that never opened it read as disconnected and watched nothing — exactly the
  // case where a background notification is the whole point.
  useEffect(() => {
    if (!statusCurrent || !yunxiaoStatusChecked) {
      void checkYunxiaoConnection()
    }
  }, [checkYunxiaoConnection, statusCurrent, yunxiaoStatusChecked])

  const watching = statusCurrent && yunxiaoConnected
  useEffect(() => {
    if (!watching) {
      return
    }
    const poll = createYunxiaoChangePoll({
      invalidate: () => invalidateYunxiaoWorkItemLists(),
      read: (filter, limit) => listYunxiaoWorkItems(filter, limit)
    })
    return installBackgroundPollInterval({
      run: () => void poll(),
      intervalMs: YUNXIAO_CHANGE_POLL_INTERVAL_MS
    })
  }, [invalidateYunxiaoWorkItemLists, listYunxiaoWorkItems, watching])

  return null
}
