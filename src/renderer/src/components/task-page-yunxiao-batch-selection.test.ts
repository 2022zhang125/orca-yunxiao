import { describe, expect, it } from 'vitest'

import {
  getYunxiaoSelectionState,
  selectableYunxiaoWorkItems,
  toggleYunxiaoRowSelection
} from './task-page-yunxiao-batch-selection'
import type { YunxiaoStatusStage, YunxiaoWorkItem } from '../../../shared/types'

// 处理中 is the least ambiguous fixable status: outstanding by stage alone,
// without relying on a name-matched special case.
function defect(
  serial: string,
  statusName = '处理中',
  stage: YunxiaoStatusStage = 'in-progress'
): YunxiaoWorkItem {
  return {
    id: serial,
    serialNumber: serial,
    title: `Defect ${serial}`,
    url: `https://devops.aliyun.com/projex/project/space/task/${serial}`,
    project: { id: 'space', name: 'Space' },
    workItemType: { id: 'Bug', name: '缺陷', category: 'Bug' },
    status: { id: statusName, name: statusName, stage },
    labels: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

const rowKey = (workItem: YunxiaoWorkItem): string => workItem.serialNumber
const noFixes = new Map<string, string>()

describe('selectableYunxiaoWorkItems', () => {
  it('keeps only outstanding defects', () => {
    const items = [
      defect('BUG-1'),
      defect('BUG-2', '已修复', 'done'),
      defect('BUG-3', '待确认', 'todo'),
      defect('BUG-4', '已关闭', 'done')
    ]

    expect(selectableYunxiaoWorkItems(items, noFixes).map(rowKey)).toEqual(['BUG-1', 'BUG-3'])
  })

  it('drops a defect whose fix workspace already exists', () => {
    const items = [defect('BUG-1'), defect('BUG-2')]
    const fixing = new Map([['BUG-2', 'worktree-1']])

    expect(selectableYunxiaoWorkItems(items, fixing).map(rowKey)).toEqual(['BUG-1'])
  })

  it('never offers a requirement or task', () => {
    const task: YunxiaoWorkItem = {
      ...defect('DEMO-1'),
      workItemType: { id: 'Task', name: '任务', category: 'Task' }
    }

    expect(selectableYunxiaoWorkItems([task], noFixes)).toEqual([])
  })
})

// Why: the batch bar counts what this returns, and every row it counts must be
// a row showing a tick the user can clear. Counting a defect that stopped being
// fixable stranded the bar on screen with nothing to untick.
describe('batch bar count', () => {
  const countChecked = (
    workItems: readonly YunxiaoWorkItem[],
    fixWorktreeIdBySerial: ReadonlyMap<string, string>,
    checkedRows: ReadonlySet<string>
  ): number =>
    selectableYunxiaoWorkItems(workItems, fixWorktreeIdBySerial).filter((workItem) =>
      checkedRows.has(rowKey(workItem))
    ).length

  it('drops a tick whose defect was closed since it was made', () => {
    const checked = new Set(['BUG-1', 'BUG-2'])

    expect(countChecked([defect('BUG-1'), defect('BUG-2')], noFixes, checked)).toBe(2)
    expect(
      countChecked([defect('BUG-1'), defect('BUG-2', '已关闭', 'done')], noFixes, checked)
    ).toBe(1)
  })

  it('reaches zero once every ticked defect stopped being fixable', () => {
    expect(countChecked([defect('BUG-1', '已修复', 'done')], noFixes, new Set(['BUG-1']))).toBe(0)
  })

  it('drops a tick whose defect gained a fix workspace', () => {
    expect(
      countChecked([defect('BUG-1')], new Map([['BUG-1', 'worktree-1']]), new Set(['BUG-1']))
    ).toBe(0)
  })
})

describe('getYunxiaoSelectionState', () => {
  const items = [defect('BUG-1'), defect('BUG-2')]

  it('reads none, some, and all apart', () => {
    expect(getYunxiaoSelectionState(items, () => false)).toBe('none')
    expect(getYunxiaoSelectionState(items, (item) => item.serialNumber === 'BUG-1')).toBe('some')
    expect(getYunxiaoSelectionState(items, () => true)).toBe('all')
  })

  it('reports an empty group as none rather than all', () => {
    expect(getYunxiaoSelectionState([], () => true)).toBe('none')
  })
})

describe('toggleYunxiaoRowSelection', () => {
  it('fills a partially selected group', () => {
    const next = toggleYunxiaoRowSelection(
      new Set(['BUG-1']),
      [defect('BUG-1'), defect('BUG-2')],
      rowKey
    )

    expect([...next].sort()).toEqual(['BUG-1', 'BUG-2'])
  })

  it('clears a fully selected group', () => {
    const next = toggleYunxiaoRowSelection(
      new Set(['BUG-1', 'BUG-2']),
      [defect('BUG-1'), defect('BUG-2')],
      rowKey
    )

    expect([...next]).toEqual([])
  })

  it('leaves rows outside the group untouched', () => {
    const next = toggleYunxiaoRowSelection(
      new Set(['OTHER-9', 'BUG-1', 'BUG-2']),
      [defect('BUG-1'), defect('BUG-2')],
      rowKey
    )

    expect([...next]).toEqual(['OTHER-9'])
  })

  it('does not clear the selection when the group has nothing selectable', () => {
    const next = toggleYunxiaoRowSelection(new Set(['BUG-1']), [], rowKey)

    expect([...next]).toEqual(['BUG-1'])
  })
})
