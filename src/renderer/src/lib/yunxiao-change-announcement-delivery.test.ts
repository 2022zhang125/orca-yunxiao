import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deliverYunxiaoChangeAnnouncements } from './yunxiao-change-announcement-delivery'
import type { YunxiaoChangeAnnouncement } from './yunxiao-change-announcement-delivery'

vi.mock('sonner', () => ({
  toast: { info: vi.fn() }
}))

import { toast } from 'sonner'

const toastInfo = vi.mocked(toast.info)

function announcement(overrides: Partial<YunxiaoChangeAnnouncement> = {}) {
  return {
    message: 'New 缺陷: DEMO-8',
    description: 'Login fails on Windows',
    notification: {
      kind: 'added' as const,
      serialNumber: 'DEMO-8',
      workItemTypeName: '缺陷'
    },
    ...overrides
  }
}

function stubVisibility(state: DocumentVisibilityState, focused = true): void {
  vi.stubGlobal('document', {
    visibilityState: state,
    hasFocus: () => focused,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })
}

function stubNotificationApi(): ReturnType<typeof vi.fn> {
  const dispatch = vi.fn().mockResolvedValue({ delivered: true })
  vi.stubGlobal('window', { api: { notifications: { dispatch } } })
  return dispatch
}

describe('deliverYunxiaoChangeAnnouncements', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    toastInfo.mockClear()
  })

  it('toasts every announcement while the user is looking at Orca', () => {
    stubVisibility('visible')
    const dispatch = stubNotificationApi()

    deliverYunxiaoChangeAnnouncements([
      announcement(),
      announcement({ message: 'DEMO-9 updated (修复中)' })
    ])

    expect(toastInfo).toHaveBeenCalledTimes(2)
    expect(dispatch).not.toHaveBeenCalled()
  })

  // Why this case at all: Electron reports a window sitting behind the user's
  // editor as visible, and that is the case the whole watch exists for.
  it('sends a native notification while Orca is on screen but not in front', () => {
    stubVisibility('visible', false)
    const dispatch = stubNotificationApi()

    deliverYunxiaoChangeAnnouncements([announcement()])

    expect(toastInfo).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('sends a native notification instead of a toast nobody can see when hidden', () => {
    stubVisibility('hidden')
    const dispatch = stubNotificationApi()

    deliverYunxiaoChangeAnnouncements([announcement()])

    expect(toastInfo).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({
      source: 'yunxiao-work-item-change',
      yunxiaoChange: {
        kind: 'added',
        serialNumber: 'DEMO-8',
        workItemTypeName: '缺陷',
        itemTitle: 'Login fails on Windows'
      }
    })
  })

  it('collapses a hidden batch into one notification so the cooldown cannot drop the rest', () => {
    stubVisibility('hidden')
    const dispatch = stubNotificationApi()

    deliverYunxiaoChangeAnnouncements([
      announcement(),
      announcement({ message: 'DEMO-9 updated (修复中)' }),
      announcement({ message: 'DEMO-10 updated (已解决)' })
    ])

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      source: 'yunxiao-work-item-change',
      yunxiaoChange: { kind: 'bulk', count: 3 }
    })
  })

  it('delivers nothing for an empty batch', () => {
    stubVisibility('hidden')
    const dispatch = stubNotificationApi()

    deliverYunxiaoChangeAnnouncements([])

    expect(dispatch).not.toHaveBeenCalled()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('does not let a rejected dispatch escape into the poll', async () => {
    stubVisibility('hidden')
    const dispatch = vi.fn().mockRejectedValue(new Error('notifications unavailable'))
    vi.stubGlobal('window', { api: { notifications: { dispatch } } })

    expect(() => deliverYunxiaoChangeAnnouncements([announcement()])).not.toThrow()
    await Promise.resolve()
  })
})
