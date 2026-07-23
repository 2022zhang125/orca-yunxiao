import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  announceYunxiaoWorkItemListChanges,
  resetYunxiaoWorkItemChangeTracking
} from './yunxiao-work-item-change-toasts'
import type { YunxiaoWorkItem } from '../../../shared/types'

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), warning: vi.fn(), success: vi.fn() }
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, options?: Record<string, unknown>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (match, name: string) => String(options?.[name] ?? match))
}))

import { toast } from 'sonner'

const toastInfo = vi.mocked(toast.info)

function workItem(
  serial: string,
  overrides: { statusName?: string; updatedAt?: string; title?: string } = {}
): YunxiaoWorkItem {
  return {
    id: serial,
    serialNumber: serial,
    title: overrides.title ?? `Item ${serial}`,
    url: `https://devops.aliyun.com/projex/project/space/task/${serial}`,
    project: { id: 'space', name: 'Space' },
    workItemType: { id: 'Bug', name: '缺陷', category: 'Bug' },
    status: {
      id: overrides.statusName ?? '待处理',
      name: overrides.statusName ?? '待处理',
      stage: 'todo'
    },
    labels: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z'
  }
}

describe('announceYunxiaoWorkItemListChanges', () => {
  beforeEach(() => {
    resetYunxiaoWorkItemChangeTracking()
    vi.clearAllMocks()
  })

  it('stays silent on the first read of a list', () => {
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1'), workItem('BUG-2')])
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('announces an item that appeared since the previous read', () => {
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1')])
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1'), workItem('BUG-2')])
    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastInfo).toHaveBeenCalledWith('New 缺陷: BUG-2', { description: 'Item BUG-2' })
  })

  it('carries a View action that jumps to the list', () => {
    const onView = vi.fn()
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1')], { onView })
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1'), workItem('BUG-2')], {
      onView
    })

    expect(toastInfo).toHaveBeenCalledWith('New 缺陷: BUG-2', {
      description: 'Item BUG-2',
      action: { label: 'View', onClick: onView }
    })
  })

  it('carries the same View action on the collapsed bulk toast', () => {
    const onView = vi.fn()
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1')], { onView })
    announceYunxiaoWorkItemListChanges(
      'assigned',
      ['BUG-1', 'BUG-2', 'BUG-3', 'BUG-4', 'BUG-5'].map((serial) => workItem(serial)),
      { onView }
    )

    expect(toastInfo).toHaveBeenCalledWith('4 云效 work items changed', {
      action: { label: 'View', onClick: onView }
    })
  })

  it('omits the action when no jump was wired', () => {
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1')])
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1'), workItem('BUG-2')])

    expect(toastInfo.mock.calls[0][1]).not.toHaveProperty('action')
  })

  it('announces a status change on a known item', () => {
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1')])
    announceYunxiaoWorkItemListChanges('assigned', [
      workItem('BUG-1', { statusName: '处理中', updatedAt: '2026-01-02T00:00:00.000Z' })
    ])
    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastInfo).toHaveBeenCalledWith('BUG-1 updated (处理中)', { description: 'Item BUG-1' })
  })

  it('stays silent when nothing changed', () => {
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1')])
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1')])
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('announces the same change once even when it arrives through two list presets', () => {
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1')])
    announceYunxiaoWorkItemListChanges('created', [workItem('BUG-1')])
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1'), workItem('BUG-2')])
    announceYunxiaoWorkItemListChanges('created', [workItem('BUG-1'), workItem('BUG-2')])
    expect(toastInfo).toHaveBeenCalledTimes(1)
  })

  it('collapses a large batch of changes into one summary toast', () => {
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1')])
    announceYunxiaoWorkItemListChanges('assigned', [
      workItem('BUG-1'),
      workItem('BUG-2'),
      workItem('BUG-3'),
      workItem('BUG-4'),
      workItem('BUG-5')
    ])
    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastInfo.mock.calls[0][0]).toBe('4 云效 work items changed')
  })

  it('starts from a clean baseline after a reset', () => {
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1')])
    resetYunxiaoWorkItemChangeTracking()
    announceYunxiaoWorkItemListChanges('assigned', [workItem('BUG-1'), workItem('BUG-2')])
    expect(toastInfo).not.toHaveBeenCalled()
  })
})
