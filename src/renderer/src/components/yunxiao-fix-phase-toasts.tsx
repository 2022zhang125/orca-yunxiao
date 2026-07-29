import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useWorktreeAgentRows } from '@/components/sidebar/useWorktreeAgentRows'
import { getAgentDotState } from '@/components/sidebar/worktree-card-agent-summary'
import {
  indexFixWorktreesByWorkItem,
  type YunxiaoFixPhase
} from '@/components/task-page-yunxiao-fix-progress'
import { translate } from '@/i18n/i18n'
import {
  YUNXIAO_FIX_PHASE_SETTLE_MS,
  observeYunxiaoFixPhase,
  yunxiaoFixPhaseToastId
} from '@/lib/yunxiao-fix-phase-announcement'
import { useAppStore } from '@/store'

function FixPhaseToastWatcher({
  worktreeId,
  serialNumber
}: {
  worktreeId: string
  serialNumber: string
}): null {
  const agentRows = useWorktreeAgentRows(worktreeId)
  // The phase is all we announce: the workspace is never removed automatically —
  // even a finished fix is left for the user to review and delete by hand.
  const observedPhase = observeYunxiaoFixPhase(agentRows.map(getAgentDotState)).phase
  const [settledPhase, setSettledPhase] = useState<YunxiaoFixPhase | null>(null)
  useEffect(() => {
    if (observedPhase === null || observedPhase === settledPhase) {
      return
    }
    // A reading that flips again inside the window cancels this commit, so only
    // a phase that actually holds is ever announced.
    const timer = setTimeout(() => setSettledPhase(observedPhase), YUNXIAO_FIX_PHASE_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [observedPhase, settledPhase])
  const previousPhase = useRef<YunxiaoFixPhase | null>(null)
  useEffect(() => {
    if (settledPhase === null) {
      return
    }
    const previous = previousPhase.current
    previousPhase.current = settledPhase
    // First observation is the baseline: announcing it would replay the current
    // state of every fix workspace on app launch instead of reporting a change.
    if (previous === null || previous === settledPhase) {
      return
    }
    // One toast per workspace: a later phase replaces the message in place
    // rather than stacking another card under it.
    const options = { id: yunxiaoFixPhaseToastId(worktreeId) }
    if (settledPhase === 'attention') {
      toast.warning(
        translate(
          'auto.components.TaskPage.yunxiao_toast_fix_attention',
          '{{value0}} fix needs your input',
          { value0: serialNumber }
        ),
        options
      )
    } else if (settledPhase === 'done') {
      toast.success(
        translate(
          'auto.components.TaskPage.yunxiao_toast_fix_done',
          '{{value0}} fix finished — review and merge the workspace',
          { value0: serialNumber }
        ),
        options
      )
    } else {
      toast.info(
        translate(
          'auto.components.TaskPage.yunxiao_toast_fix_working',
          '{{value0}} fix is running again',
          { value0: serialNumber }
        ),
        options
      )
    }
  }, [settledPhase, serialNumber, worktreeId])
  return null
}

/**
 * Bottom-right toasts for 云效 fix-workspace phase changes. Mounted once in App —
 * the Tasks page rows show the same phases inline, but the user has to be told
 * about them from any page, not only while that list is on screen.
 *
 * A finished fix is never removed automatically; it is left for the user to
 * review and delete by hand.
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
