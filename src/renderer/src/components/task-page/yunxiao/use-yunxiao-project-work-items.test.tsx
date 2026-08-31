// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TASK_SEARCH_DEBOUNCE_MS } from '@/components/task-page/task-page-list-limits'
import { yunxiaoListProjects, yunxiaoListWorkItems } from '@/runtime/runtime-yunxiao-client'
import type { YunxiaoProject, YunxiaoWorkItem } from '../../../../../shared/yunxiao-types'
import { useYunxiaoProjectWorkItems } from './use-yunxiao-project-work-items'

vi.mock('@/runtime/runtime-yunxiao-client', () => ({
  yunxiaoListProjects: vi.fn(),
  yunxiaoListWorkItems: vi.fn()
}))

const alpha: YunxiaoProject = { id: 'alpha', name: 'Alpha', accountId: 'account-a' }
const beta: YunxiaoProject = { id: 'beta', name: 'Beta', accountId: 'account-a' }

function workItem(id: string, serialNumber: string, title: string): YunxiaoWorkItem {
  return {
    id,
    serialNumber,
    title,
    accountId: 'account-a',
    url: `https://devops.aliyun.com/${id}`,
    project: alpha,
    workItemType: { id: 'bug', name: 'Bug', category: 'Bug' },
    status: { id: 'todo', name: '待处理', stage: 'todo' },
    labels: [],
    assignee: { userId: 'me', displayName: 'Me' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z'
  }
}

beforeEach(() => {
  vi.mocked(yunxiaoListProjects).mockResolvedValue([beta, alpha])
  vi.mocked(yunxiaoListWorkItems).mockResolvedValue([
    workItem('one', 'BUG-1024', 'Fix login timeout'),
    workItem('two', 'BUG-2048', 'Repair settings panel')
  ])
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useYunxiaoProjectWorkItems', () => {
  it('loads all projects and requests assigned work from the active project only', async () => {
    const { result } = renderHook(() =>
      useYunxiaoProjectWorkItems({
        connected: true,
        status: {
          connected: true,
          viewer: { userId: 'me', displayName: 'Me', email: null },
          accounts: [
            {
              id: 'account-a',
              endpoint: 'https://openapi-rdc.aliyuncs.com',
              organizationId: 'org-a',
              organizationName: 'Org A',
              userId: 'me',
              displayName: 'Me'
            }
          ]
        },
        selectedAccountId: 'all',
        sourceContext: null,
        listRefreshNonce: 0
      })
    )

    await waitFor(() => expect(result.current.workItems).toHaveLength(2))

    expect(result.current.projects).toEqual([alpha, beta])
    expect(result.current.activeProject).toEqual(alpha)
    expect(yunxiaoListWorkItems).toHaveBeenCalledWith(null, 'assigned', 100, 'account-a', 'alpha')
  })

  it('debounces onChange search and matches a Bug number', async () => {
    const { result } = renderHook(() =>
      useYunxiaoProjectWorkItems({
        connected: true,
        status: {
          connected: true,
          viewer: { userId: 'me', displayName: 'Me', email: null }
        },
        selectedAccountId: 'account-a',
        sourceContext: null,
        listRefreshNonce: 0
      })
    )

    await waitFor(() => expect(result.current.workItems).toHaveLength(2))
    vi.useFakeTimers()

    act(() => result.current.setSearchInput('2048'))
    act(() => vi.advanceTimersByTime(TASK_SEARCH_DEBOUNCE_MS - 1))
    expect(result.current.workItems).toHaveLength(2)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current.workItems.map((item) => item.serialNumber)).toEqual(['BUG-2048'])
  })
})
