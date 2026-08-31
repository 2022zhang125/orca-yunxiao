import { describe, expect, it } from 'vitest'

import type { YunxiaoProject, YunxiaoWorkItem } from '../../../../../shared/yunxiao-types'
import {
  filterYunxiaoProjectWorkItems,
  getYunxiaoProjectKey,
  normalizeYunxiaoProjects
} from './yunxiao-project-work-items'

const projectA: YunxiaoProject = { id: 'project-a', name: 'Alpha', accountId: 'account-a' }
const projectB: YunxiaoProject = { id: 'project-b', name: 'Beta', accountId: 'account-a' }

function workItem(overrides: {
  id: string
  serialNumber: string
  title: string
  project?: YunxiaoProject
  assignee?: string
  accountId?: string
}): YunxiaoWorkItem {
  const project = overrides.project ?? projectA
  return {
    id: overrides.id,
    serialNumber: overrides.serialNumber,
    title: overrides.title,
    accountId: overrides.accountId ?? project.accountId,
    url: `https://devops.aliyun.com/${overrides.id}`,
    project,
    workItemType: { id: 'bug', name: 'Bug', category: 'Bug' },
    status: { id: 'todo', name: '待处理', stage: 'todo' },
    labels: [],
    assignee: overrides.assignee
      ? { userId: overrides.assignee, displayName: overrides.assignee }
      : undefined,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z'
  }
}

describe('yunxiao project tabs', () => {
  it('keeps projects with the same id in different accounts distinct', () => {
    const otherAccountProject = { ...projectA, accountId: 'account-b' }

    expect(getYunxiaoProjectKey(projectA)).not.toBe(getYunxiaoProjectKey(otherAccountProject))
    expect(normalizeYunxiaoProjects([otherAccountProject, projectA])).toHaveLength(2)
  })

  it('deduplicates and sorts project tabs by name', () => {
    expect(normalizeYunxiaoProjects([projectB, projectA, projectA])).toEqual([projectA, projectB])
  })
})

describe('yunxiao project work item filtering', () => {
  const items = [
    workItem({ id: 'mine', serialNumber: 'BUG-1024', title: 'Fix login timeout', assignee: 'me' }),
    workItem({ id: 'theirs', serialNumber: 'BUG-1025', title: 'Login copy', assignee: 'other' }),
    workItem({
      id: 'other-project',
      serialNumber: 'BUG-1024',
      title: 'Fix login timeout',
      project: projectB,
      assignee: 'me'
    })
  ]

  it('keeps only the selected project items assigned to the current user', () => {
    expect(filterYunxiaoProjectWorkItems(items, projectA, 'me', '')).toEqual([items[0]])
  })

  it('matches the title case-insensitively after trimming the query', () => {
    expect(filterYunxiaoProjectWorkItems(items, projectA, 'me', '  LOGIN TIME  ')).toEqual([
      items[0]
    ])
  })

  it('matches a Bug serial number', () => {
    expect(filterYunxiaoProjectWorkItems(items, projectA, 'me', '1024')).toEqual([items[0]])
  })
})
