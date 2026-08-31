import {
  summarizeFixPhase,
  type YunxiaoFixPhase
} from '../components/task-page-yunxiao-fix-progress'
import type { AgentDotState } from '@/components/AgentStateDot'

/**
 * How long a phase has to hold before it is announced.
 *
 * The phase is a projection of agent rows that legitimately churn — hook pings,
 * stale decay, title-derived rows, tabs rehydrating — so a single real event
 * passes through several intermediate readings. Announcing each one stacked
 * three toasts on what the user experienced as one change.
 */
export const YUNXIAO_FIX_PHASE_SETTLE_MS = 4_000

export type YunxiaoFixPhaseObservation = {
  /** `null` when the rows carry no evidence, so the last phase stands. */
  phase: YunxiaoFixPhase | null
}

/** One workspace owns one phase toast; a newer phase replaces it, not stacks. */
export function yunxiaoFixPhaseToastId(worktreeId: string): string {
  return `yunxiao-fix-phase:${worktreeId}`
}

/**
 * Reads agent rows as a phase observation.
 *
 * An empty row list is absence of evidence rather than a phase: tabs hydrate
 * late, retained `done` snapshots get pruned, and closing a terminal empties the
 * list for a tick. The Tasks row reads that as "just launched" (nothing else can
 * be shown in a cell), but announcing it would toast a fix "running again" that
 * never restarted — so here it holds whatever was last seen instead.
 */
export function observeYunxiaoFixPhase(
  states: readonly AgentDotState[]
): YunxiaoFixPhaseObservation {
  if (states.length === 0) {
    return { phase: null }
  }
  return { phase: summarizeFixPhase(states) }
}
