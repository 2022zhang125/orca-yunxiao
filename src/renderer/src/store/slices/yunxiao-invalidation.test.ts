import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import type { YunxiaoWorkItem } from '../../../../shared/yunxiao-types'
import { createYunxiaoSlice } from './yunxiao'

const yunxiaoListWorkItems = vi.fn()

vi.mock('@/runtime/runtime-yunxiao-client', () => ({
  yunxiaoConnect: vi.fn(),
  yunxiaoDisconnect: vi.fn(),
  yunxiaoGetWorkItem: vi.fn(),
  yunxiaoListWorkItems: (...args: unknown[]) => yunxiaoListWorkItems(...args),
  yunxiaoSearchWorkItems: vi.fn(),
  yunxiaoSelectAccount: vi.fn(),
  yunxiaoStatus: vi.fn(),
  yunxiaoTestConnection: vi.fn()
}))

function createTestStore() {
  return create<AppState>()(
    (...a) =>
      ({
        settings: null,
        ...createYunxiaoSlice(...a)
      }) as AppState
  )
}

function workItem(id: string): YunxiaoWorkItem {
  return {
    id,
    serialNumber: id,
    title: id,
    url: `https://devops.aliyun.com/${id}`,
    project: { id: 'space-1', name: 'Space' },
    workItemType: { id: 'Req', name: '需求', category: 'Req' },
    status: { id: '100005', name: '待处理', stage: 'todo' },
    labels: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('yunxiao work item list invalidation', () => {
  beforeEach(() => {
    yunxiaoListWorkItems.mockReset()
    yunxiaoListWorkItems.mockResolvedValue([workItem('DEMO-1')])
  })

  it('serves a repeat read from cache until the lists are invalidated', async () => {
    const store = createTestStore()

    await store.getState().listYunxiaoWorkItems('assigned', 50)
    await store.getState().listYunxiaoWorkItems('assigned', 50)
    expect(yunxiaoListWorkItems).toHaveBeenCalledTimes(1)

    store.getState().invalidateYunxiaoWorkItemLists()
    await store.getState().listYunxiaoWorkItems('assigned', 50)
    expect(yunxiaoListWorkItems).toHaveBeenCalledTimes(2)
  })

  it('keeps each preset on its own cache entry', async () => {
    const store = createTestStore()

    await store.getState().listYunxiaoWorkItems('assigned', 50)
    await store.getState().listYunxiaoWorkItems('done', 50)

    expect(yunxiaoListWorkItems).toHaveBeenCalledTimes(2)
    expect(yunxiaoListWorkItems.mock.calls.map((call) => call[1])).toEqual(['assigned', 'done'])
  })
})
