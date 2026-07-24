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
  yunxiaoFixPhaseToastId,
  type YunxiaoFixPhaseObservation
} from '@/lib/yunxiao-fix-phase-announcement'
import {
  resolveWorktreeOperationRoute,
  settingsForWorktreeOperationRoute
} from '@/lib/worktree-operation-route'
import {
  YUNXIAO_FIX_MERGE_CHECK_INTERVAL_MS,
  resolveYunxiaoFixMergeBaseRef,
  resolveYunxiaoFixMergeState
} from '@/lib/yunxiao-fix-workspace-cleanup'
import { fetchRuntimeGit, getRuntimeGitBranchCompare } from '@/runtime/runtime-git-client'
import { useAppStore } from '@/store'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree-id'

/**
 * Retires a fix workspace once its branch has landed on the base it was cut
 * from — never merely because the agent stopped.
 *
 * A `/flow-bug` run stops at its confirmation gates, and a stopped agent reports
 * the same `done` a finished run does; removing on that signal deleted the
 * workspace out from under a fix that was waiting for the user to answer. The
 * branch being merged is the only evidence that the workspace has served its
 * purpose, so the watch outlives the agent and polls for it.
 */
function useMergedFixWorkspaceRetirement(args: {
  worktreeId: string
  serialNumber: string
  finished: boolean
}): void {
  const { worktreeId, serialNumber, finished } = args
  const removeWorktree = useAppStore((s) => s.removeWorktree)
  useEffect(() => {
    if (!finished) {
      return
    }
    let disposed = false
    let checking = false
    let timer: ReturnType<typeof setInterval> | null = null
    const stop = (): void => {
      disposed = true
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }
    const check = async (): Promise<void> => {
      // Retiring a workspace is never urgent, so a hidden window costs no fetch;
      // the visibility listener below catches up the moment the user is back.
      if (disposed || checking || document.hidden) {
        return
      }
      checking = true
      try {
        const state = useAppStore.getState()
        const worktree = state.allWorktrees().find((entry) => entry.id === worktreeId)
        const repo = state.repos?.find((entry) => entry.id === getRepoIdFromWorktreeId(worktreeId))
        if (!worktree || !repo) {
          return
        }
        const baseRef = resolveYunxiaoFixMergeBaseRef({
          worktreeBaseRef: worktree.baseRef,
          repoBaseRef: repo.worktreeBaseRef
        })
        if (!baseRef) {
          return
        }
        const route = resolveWorktreeOperationRoute(state, worktreeId)
        const gitContext = {
          settings: route
            ? settingsForWorktreeOperationRoute(state.settings, route)
            : state.settings,
          worktreeId,
          worktreePath: worktree.path,
          ...(repo.connectionId ? { connectionId: repo.connectionId } : {})
        }
        // The merge usually lands on the remote base (a merge request reviewed
        // outside Orca), which this clone only learns about by fetching.
        await fetchRuntimeGit(gitContext).catch(() => {})
        if (disposed) {
          return
        }
        const compare = await getRuntimeGitBranchCompare(gitContext, baseRef)
        if (disposed || resolveYunxiaoFixMergeState(compare.summary) !== 'merged') {
          return
        }
        // One attempt only: a removal that fails (dirty tree, locked worktree)
        // needs the user, and re-toasting the same failure every tick is noise.
        stop()
        const result = await removeWorktree(worktreeId)
        toast[result.ok ? 'success' : 'warning'](
          result.ok
            ? translate(
                'auto.components.TaskPage.yunxiao_toast_fix_merged_removed',
                '{{value0}} fix merged — workspace removed',
                { value0: serialNumber }
              )
            : translate(
                'auto.components.TaskPage.yunxiao_toast_fix_cleanup_failed',
                '{{value0}} fix workspace could not be removed: {{value1}}',
                { value0: serialNumber, value1: result.error }
              ),
          // The end of this workspace's story replaces its phase toast.
          { id: yunxiaoFixPhaseToastId(worktreeId) }
        )
      } catch (error) {
        // Why: a failed fetch/compare only means "not proven merged yet"; the
        // next tick retries rather than surfacing git noise per workspace.
        console.warn(`Failed to check merge state for fix workspace ${worktreeId}:`, error)
      } finally {
        checking = false
      }
    }
    const onVisible = (): void => {
      if (!document.hidden) {
        void check()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    timer = setInterval(() => void check(), YUNXIAO_FIX_MERGE_CHECK_INTERVAL_MS)
    void check()
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      stop()
    }
  }, [finished, removeWorktree, serialNumber, worktreeId])
}

function FixPhaseToastWatcher({
  worktreeId,
  serialNumber
}: {
  worktreeId: string
  serialNumber: string
}): null {
  const agentRows = useWorktreeAgentRows(worktreeId)
  const observed = observeYunxiaoFixPhase(agentRows.map(getAgentDotState))
  const [settled, setSettled] = useState<YunxiaoFixPhaseObservation>({
    phase: null,
    cleanCompletion: false
  })
  const observedPhase = observed.phase
  const observedCleanCompletion = observed.cleanCompletion
  useEffect(() => {
    if (
      observedPhase === null ||
      (observedPhase === settled.phase && observedCleanCompletion === settled.cleanCompletion)
    ) {
      return
    }
    // A reading that flips again inside the window cancels this commit, so only
    // a phase that actually holds is ever announced or acted on.
    const timer = setTimeout(
      () => setSettled({ phase: observedPhase, cleanCompletion: observedCleanCompletion }),
      YUNXIAO_FIX_PHASE_SETTLE_MS
    )
    return () => clearTimeout(timer)
  }, [observedPhase, observedCleanCompletion, settled])
  const phase = settled.phase
  const previousPhase = useRef<YunxiaoFixPhase | null>(null)
  useMergedFixWorkspaceRetirement({
    worktreeId,
    serialNumber,
    finished: settled.cleanCompletion
  })
  useEffect(() => {
    if (phase === null) {
      return
    }
    const previous = previousPhase.current
    previousPhase.current = phase
    // First observation is the baseline: announcing it would replay the current
    // state of every fix workspace on app launch instead of reporting a change.
    if (previous === null || previous === phase) {
      return
    }
    // One toast per workspace: a later phase replaces the message in place
    // rather than stacking another card under it.
    const options = { id: yunxiaoFixPhaseToastId(worktreeId) }
    if (phase === 'attention') {
      toast.warning(
        translate(
          'auto.components.TaskPage.yunxiao_toast_fix_attention',
          '{{value0}} fix needs your input',
          { value0: serialNumber }
        ),
        options
      )
    } else if (phase === 'done') {
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
  }, [phase, serialNumber, worktreeId])
  return null
}

/**
 * Bottom-right toasts for 云效 fix-workspace phase changes, plus the end-of-life
 * cleanup: a fix whose branch has been merged into its base loses its
 * workspace. Mounted once in App — the Tasks page rows show the same phases
 * inline, but the user has to be told about them from any page, not only while
 * that list is on screen.
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
