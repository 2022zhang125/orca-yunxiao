import { canFixYunxiaoWorkItem } from '@/components/task-page-yunxiao-status-tone'
import type { YunxiaoWorkItem } from '../../../shared/yunxiao-types'

/**
 * Which rows a batch fix may actually arm. Mirrors the row's own checkbox gate:
 * a defect that is already outstanding, and not already owned by a fix
 * workspace — starting a second fix for one workspace is the thing to prevent.
 */
export function selectableYunxiaoWorkItems(
  workItems: readonly YunxiaoWorkItem[],
  fixWorktreeIdBySerial: ReadonlyMap<string, string>
): YunxiaoWorkItem[] {
  return workItems.filter(
    (workItem) =>
      canFixYunxiaoWorkItem(workItem) && !fixWorktreeIdBySerial.has(workItem.serialNumber)
  )
}

export type YunxiaoSelectionState = 'none' | 'some' | 'all'

export function getYunxiaoSelectionState(
  selectable: readonly YunxiaoWorkItem[],
  isChecked: (workItem: YunxiaoWorkItem) => boolean
): YunxiaoSelectionState {
  if (selectable.length === 0) {
    return 'none'
  }
  const checkedCount = selectable.filter(isChecked).length
  if (checkedCount === 0) {
    return 'none'
  }
  return checkedCount === selectable.length ? 'all' : 'some'
}

/**
 * Select-all is a toggle against the group it covers: a fully-checked group
 * clears, anything less fills. Rows outside `selectable` keep their state, so a
 * status group's toggle can never disturb another group's ticks.
 */
export function toggleYunxiaoRowSelection(
  checkedRows: ReadonlySet<string>,
  selectable: readonly YunxiaoWorkItem[],
  rowKey: (workItem: YunxiaoWorkItem) => string
): Set<string> {
  const next = new Set(checkedRows)
  const keys = selectable.map(rowKey)
  if (keys.length > 0 && keys.every((key) => next.has(key))) {
    for (const key of keys) {
      next.delete(key)
    }
    return next
  }
  for (const key of keys) {
    next.add(key)
  }
  return next
}
