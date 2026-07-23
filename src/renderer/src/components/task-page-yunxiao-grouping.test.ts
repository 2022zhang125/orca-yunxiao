import { describe, expect, it } from 'vitest'
import { groupYunxiaoWorkItemsByStatus } from './task-page-yunxiao-work-item-list'
import {
  canFixYunxiaoWorkItem,
  getYunxiaoPriorityChipTone,
  getYunxiaoPriorityRank,
  getYunxiaoStatusAccent,
  getYunxiaoStatusDotTone,
  getYunxiaoStatusTone
} from './task-page-yunxiao-status-tone'
import type { YunxiaoStatusStage, YunxiaoWorkItem } from '../../../shared/types'

function workItem(id: string, statusName: string, stage: YunxiaoStatusStage): YunxiaoWorkItem {
  return {
    id,
    serialNumber: id,
    title: `Item ${id}`,
    url: `https://devops.aliyun.com/projex/project/space/task/${id}`,
    project: { id: 'space', name: 'Space' },
    workItemType: { id: 'Req', name: 'Requirement', category: 'Req' },
    status: { id: statusName, name: statusName, stage },
    labels: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('yunxiao work item grouping', () => {
  it('orders sections along the defect workflow, not the workflow stage', () => {
    // Shuffled on purpose: 已修复/暂不修复/已关闭 share a stage, and 待确认 sits
    // in an unstarted one, so stage ordering alone cannot produce this.
    const sections = groupYunxiaoWorkItemsByStatus([
      workItem('a', '已关闭', 'done'),
      workItem('b', '已修复', 'done'),
      workItem('c', '待确认', 'todo'),
      workItem('d', '暂不修复', 'done'),
      workItem('e', '处理中', 'in-progress'),
      workItem('f', '待处理', 'todo')
    ])

    expect(sections.map((section) => section.label)).toEqual([
      '待处理',
      '处理中',
      '待确认',
      '已修复',
      '暂不修复',
      '已关闭'
    ])
  })

  it('files 重新打开 alongside 待处理 at the head of the queue', () => {
    const sections = groupYunxiaoWorkItemsByStatus([
      workItem('a', '已关闭', 'done'),
      workItem('b', '重新打开', 'todo'),
      workItem('c', '处理中', 'in-progress')
    ])
    expect(sections.map((section) => section.label)).toEqual(['重新打开', '处理中', '已关闭'])
  })

  it('accepts 待人工确认 as the same step as 待确认', () => {
    const sections = groupYunxiaoWorkItemsByStatus([
      workItem('a', '已修复', 'done'),
      workItem('b', '待人工确认', 'todo')
    ])
    expect(sections.map((section) => section.label)).toEqual(['待人工确认', '已修复'])
  })

  it('sorts a status outside the sequence behind it, by stage', () => {
    const sections = groupYunxiaoWorkItemsByStatus([
      workItem('a', '已关闭', 'done'),
      workItem('b', 'Custom Review', 'in-progress'),
      workItem('c', '处理中', 'in-progress')
    ])
    expect(sections.map((section) => section.label)).toEqual(['处理中', '已关闭', 'Custom Review'])
  })

  it('groups items of the same status together', () => {
    const sections = groupYunxiaoWorkItemsByStatus([
      workItem('b', '待处理', 'todo'),
      workItem('c', '处理中', 'in-progress'),
      workItem('d', '待处理', 'todo')
    ])
    expect(sections[0].workItems.map((item) => item.id)).toEqual(['b', 'd'])
  })

  it('reverses section order for a descending status sort', () => {
    const sections = groupYunxiaoWorkItemsByStatus(
      [workItem('a', '已关闭', 'done'), workItem('b', '待处理', 'todo')],
      'desc'
    )
    expect(sections.map((section) => section.label)).toEqual(['已关闭', '待处理'])
  })

  it('gives done and in-progress distinct tones from untriaged statuses', () => {
    const done = getYunxiaoStatusTone({ name: '已完成', stage: 'done' })
    const inProgress = getYunxiaoStatusTone({ name: '处理中', stage: 'in-progress' })
    const unknown = getYunxiaoStatusTone({ name: 'Custom', stage: 'unknown' })
    expect(new Set([done, inProgress, unknown]).size).toBe(3)
    expect(getYunxiaoStatusTone({ name: 'Custom', stage: 'todo' })).toBe(unknown)
  })

  it('mirrors the tone split in the group header dot', () => {
    const dots = (['done', 'in-progress', 'todo'] as const).map((stage) =>
      getYunxiaoStatusDotTone({ name: 'Custom', stage })
    )
    expect(new Set(dots).size).toBe(3)
    expect(getYunxiaoStatusDotTone({ name: 'Custom', stage: 'unknown' })).toBe(
      getYunxiaoStatusDotTone({ name: 'Custom', stage: 'todo' })
    )
  })
})

describe('yunxiao defect status warnings', () => {
  it('flags reopened as a warning and unfixed as a danger regardless of stage', () => {
    expect(getYunxiaoStatusAccent({ name: '重新打开', stage: 'todo' })).toBe('reopened')
    expect(getYunxiaoStatusAccent({ name: 'Reopened', stage: 'in-progress' })).toBe('reopened')
    expect(getYunxiaoStatusAccent({ name: '暂不修复', stage: 'done' })).toBe('unfixed')
    expect(getYunxiaoStatusAccent({ name: "Won't Fix", stage: 'done' })).toBe('unfixed')
  })

  it('paints reopened amber and unfixed red in both the chip and the dot', () => {
    const reopened = { name: '重新打开', stage: 'todo' } as const
    const unfixed = { name: '暂不修复', stage: 'done' } as const

    expect(getYunxiaoStatusTone(reopened)).toContain('text-status-warning')
    expect(getYunxiaoStatusDotTone(reopened)).toBe('bg-status-warning')
    expect(getYunxiaoStatusTone(unfixed)).toContain('text-status-danger')
    expect(getYunxiaoStatusDotTone(unfixed)).toBe('bg-status-danger')
  })

  it('leaves an ordinary finished status on the success tone', () => {
    expect(getYunxiaoStatusAccent({ name: '已修复', stage: 'done' })).toBe('done')
    expect(getYunxiaoStatusTone({ name: '已修复', stage: 'done' })).toContain('text-status-success')
  })
})

describe('one-click fix availability', () => {
  function defect(statusName: string, stage: YunxiaoStatusStage): YunxiaoWorkItem {
    const item = workItem('DEMO-1', statusName, stage)
    return { ...item, workItemType: { id: 'Bug', name: '缺陷', category: 'Bug' } }
  }

  it('offers the fix on unfixed, reopened, in-progress, and pending-confirmation defects', () => {
    expect(canFixYunxiaoWorkItem(defect('暂不修复', 'done'))).toBe(true)
    expect(canFixYunxiaoWorkItem(defect('未修复', 'todo'))).toBe(true)
    expect(canFixYunxiaoWorkItem(defect('重新打开', 'todo'))).toBe(true)
    expect(canFixYunxiaoWorkItem(defect('处理中', 'in-progress'))).toBe(true)
    expect(canFixYunxiaoWorkItem(defect('待确认', 'todo'))).toBe(true)

    expect(canFixYunxiaoWorkItem(defect('已修复', 'done'))).toBe(false)
    expect(canFixYunxiaoWorkItem(defect('待处理', 'todo'))).toBe(false)
  })

  it('never offers the fix on a requirement or task', () => {
    expect(canFixYunxiaoWorkItem(workItem('DEMO-2', '重新打开', 'todo'))).toBe(false)
    const task = workItem('DEMO-3', '暂不修复', 'done')
    expect(
      canFixYunxiaoWorkItem({
        ...task,
        workItemType: { id: 'Task', name: '任务', category: 'Task' }
      })
    ).toBe(false)
  })
})

describe('yunxiao priority chip tone', () => {
  it('maps 低 to primary, 中 to warning and 高 to danger', () => {
    expect(getYunxiaoPriorityChipTone('低')).toContain('text-primary')
    expect(getYunxiaoPriorityChipTone('中')).toContain('text-status-warning')
    expect(getYunxiaoPriorityChipTone('高')).toContain('text-status-danger')
  })

  it('reads the 云效 default scale onto the same three tints', () => {
    expect(getYunxiaoPriorityChipTone('较低')).toBe(getYunxiaoPriorityChipTone('低'))
    expect(getYunxiaoPriorityChipTone('普通')).toBe(getYunxiaoPriorityChipTone('中'))
    expect(getYunxiaoPriorityChipTone('较高')).toBe(getYunxiaoPriorityChipTone('高'))
  })

  it('escalates 紧急 past 高 with a solid fill rather than a fourth hue', () => {
    const urgent = getYunxiaoPriorityChipTone('紧急')
    expect(urgent).toContain('bg-status-danger')
    expect(urgent).not.toContain('bg-status-danger-background')
    expect(urgent).not.toBe(getYunxiaoPriorityChipTone('高'))
    expect(getYunxiaoPriorityChipTone('Urgent')).toBe(urgent)
  })

  it('gives all four levels a background and keeps them distinct', () => {
    const levels = ['紧急', '高', '中', '低'].map(getYunxiaoPriorityChipTone)
    expect(levels.every((tone) => tone.includes('bg-'))).toBe(true)
    expect(new Set(levels).size).toBe(4)
  })

  it('leaves a renamed value uncoloured instead of calling it low', () => {
    const unknown = getYunxiaoPriorityChipTone('Blocker-ish')
    expect(unknown).toBe(getYunxiaoPriorityChipTone(undefined))
    expect(unknown).toContain('text-muted-foreground')
    expect(unknown).not.toBe(getYunxiaoPriorityChipTone('低'))
  })
})

describe('priority ordering inside a status group', () => {
  function prioritised(id: string, priority: string | undefined): YunxiaoWorkItem {
    return { ...workItem(id, '处理中', 'in-progress'), priority }
  }

  it('sorts the most urgent work to the top of each group', () => {
    const [section] = groupYunxiaoWorkItemsByStatus([
      prioritised('low', '低'),
      prioritised('urgent', '紧急'),
      prioritised('medium', '中'),
      prioritised('high', '高')
    ])
    expect(section.workItems.map((item) => item.id)).toEqual(['urgent', 'high', 'medium', 'low'])
  })

  it('sinks an unrecognised or missing priority below every known one', () => {
    const [section] = groupYunxiaoWorkItemsByStatus([
      prioritised('renamed', 'Blocker-ish'),
      prioritised('none', undefined),
      prioritised('low', '低')
    ])
    expect(section.workItems.map((item) => item.id)).toEqual(['low', 'renamed', 'none'])
  })

  it('keeps equal priorities in the relevance order they arrived in', () => {
    const [section] = groupYunxiaoWorkItemsByStatus([
      prioritised('first', '中'),
      prioritised('second', '中')
    ])
    expect(section.workItems.map((item) => item.id)).toEqual(['first', 'second'])
  })

  it('reads the org-renamed scale as well as the 云效 defaults', () => {
    expect(getYunxiaoPriorityRank('高')).toBeLessThan(getYunxiaoPriorityRank('中'))
    expect(getYunxiaoPriorityRank('较高')).toBeLessThan(getYunxiaoPriorityRank('普通'))
    expect(getYunxiaoPriorityRank('紧急')).toBeLessThan(getYunxiaoPriorityRank('高'))
  })
})
