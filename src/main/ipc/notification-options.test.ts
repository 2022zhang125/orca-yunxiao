import { describe, expect, it, vi } from 'vitest'

vi.mock('../i18n/main-i18n', () => ({
  translateMain: (_key: string, fallback: string, options?: Record<string, unknown>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (match, name: string) => String(options?.[name] ?? match))
}))

import { buildNotificationOptions } from './notification-options'

describe('buildNotificationOptions for a 云效 change', () => {
  it('names a new work item by type and serial, with its title as the body', () => {
    expect(
      buildNotificationOptions({
        source: 'yunxiao-work-item-change',
        yunxiaoChange: {
          kind: 'added',
          serialNumber: 'DEMO-8',
          workItemTypeName: '缺陷',
          itemTitle: 'Login fails on Windows'
        }
      })
    ).toEqual({ title: 'New 缺陷: DEMO-8', body: 'Login fails on Windows' })
  })

  it('reports the new status for an update', () => {
    expect(
      buildNotificationOptions({
        source: 'yunxiao-work-item-change',
        yunxiaoChange: {
          kind: 'updated',
          serialNumber: 'DEMO-8',
          statusName: '修复中',
          itemTitle: 'Login fails on Windows'
        }
      })
    ).toEqual({ title: 'DEMO-8 updated (修复中)', body: 'Login fails on Windows' })
  })

  it('reads a departure as a reassignment rather than a deletion', () => {
    expect(
      buildNotificationOptions({
        source: 'yunxiao-work-item-change',
        yunxiaoChange: { kind: 'removed', serialNumber: 'DEMO-8', itemTitle: 'Login fails' }
      }).title
    ).toBe('DEMO-8 is no longer assigned to you')
  })

  it('summarizes a batch by count', () => {
    expect(
      buildNotificationOptions({
        source: 'yunxiao-work-item-change',
        yunxiaoChange: { kind: 'bulk', count: 5 }
      })
    ).toEqual({ title: '5 云效 work items changed', body: '' })
  })

  it('still produces copy when the change payload is missing', () => {
    expect(buildNotificationOptions({ source: 'yunxiao-work-item-change' }).title).toBe(
      '0 云效 work items changed'
    )
  })
})
