import React, { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'

import { useWorktreeAgentRows } from '@/components/sidebar/useWorktreeAgentRows'
import { getAgentDotState } from '@/components/sidebar/worktree-card-agent-summary'
import {
  indexFixWorktreesByWorkItem,
  summarizeFixPhase,
  type YunxiaoFixPhase
} from '@/components/task-page-yunxiao-fix-progress'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

function FixPhaseToastWatcher({
  worktreeId,
  serialNumber
}: {
  worktreeId: string
  serialNumber: string
}): null {
  const agentRows = useWorktreeAgentRows(worktreeId)
  const removeWorktree = useAppStore((s) => s.removeWorktree)
  const states = agentRows.map(getAgentDotState)
  const phase: YunxiaoFixPhase = summarizeFixPhase(states)
  // 'done' also covers failed/interrupted runs; only a run where every agent
  // actually finished is safe to clean up without the user looking first.
  const cleanCompletion = phase === 'done' && states.every((state) => state === 'done')
  const previousPhase = useRef<YunxiaoFixPhase | null>(null)
  useEffect(() => {
    const previous = previousPhase.current
    previousPhase.current = phase
    // First observation is the baseline: announcing it would replay the current
    // state of every fix workspace on app launch instead of reporting a change.
    if (previous === null || previous === phase) {
      return
    }
    if (phase === 'attention') {
      toast.warning(
        translate(
          'auto.components.TaskPage.yunxiao_toast_fix_attention',
          '{{value0}} fix needs your input',
          { value0: serialNumber }
        )
      )
    } else if (phase === 'done') {
      if (cleanCompletion) {
        // The fix ran to completion, so the workspace has served its purpose:
        // remove it (unforced — a dirty tree fails and stays reviewable).
        void removeWorktree(worktreeId)
          .then((result) => {
            if (result.ok) {
              toast.success(
                translate(
                  'auto.components.TaskPage.yunxiao_toast_fix_done_removed',
                  '{{value0}} fix finished — workspace removed',
                  { value0: serialNumber }
                )
              )
            } else {
              toast.warning(
                translate(
                  'auto.components.TaskPage.yunxiao_toast_fix_cleanup_failed',
                  '{{value0}} fix workspace could not be removed: {{value1}}',
                  { value0: serialNumber, value1: result.error }
                )
              )
            }
          })
          .catch((error: unknown) => {
            toast.warning(
              translate(
                'auto.components.TaskPage.yunxiao_toast_fix_cleanup_failed',
                '{{value0}} fix workspace could not be removed: {{value1}}',
                { value0: serialNumber, value1: String(error) }
              )
            )
          })
      } else {
        toast.success(
          translate(
            'auto.components.TaskPage.yunxiao_toast_fix_done',
            '{{value0}} fix finished — review the workspace',
            { value0: serialNumber }
          )
        )
      }
    } else {
      toast.info(
        translate(
          'auto.components.TaskPage.yunxiao_toast_fix_working',
          '{{value0}} fix is running again',
          { value0: serialNumber }
        )
      )
    }
  }, [phase, cleanCompletion, removeWorktree, serialNumber, worktreeId])
  return null
}

/**
 * Bottom-right toasts for 云效 fix-workspace phase changes, plus the end-of-life
 * cleanup: a cleanly finished fix removes its workspace. Mounted once in App —
 * the Tasks page rows show the same phases inline, but the user has to be told
 * about them from any page, not only while that list is on screen.
 */
export function YunxiaoFixPhaseToasts(): React.JSX.Element {
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const fixWorktrees = useMemo(
    () => [...indexFixWorktreesByWorkItem(Object.values(worktreesByRepo).flat()).entries()],
    [worktreesByRepo]
  )
  return (
    <>
      {fixWorktrees.map(([serialNumber, worktree]) => (
        <FixPhaseToastWatcher
          key={worktree.id}
          worktreeId={worktree.id}
          serialNumber={serialNumber}
        />
      ))}
    </>
  )
}
