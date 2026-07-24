import { describe, expect, it } from 'vitest'
import { observeYunxiaoFixPhase, yunxiaoFixPhaseToastId } from './yunxiao-fix-phase-announcement'

describe('yunxiao fix phase observation', () => {
  it('reports no phase when the rows carry no evidence', () => {
    // Tabs rehydrating, a pruned retained snapshot, or a closed terminal empties
    // the list for a tick; announcing that flipped the fix to "running again".
    expect(observeYunxiaoFixPhase([])).toEqual({ phase: null, cleanCompletion: false })
  })

  it('carries the phase its rows show', () => {
    expect(observeYunxiaoFixPhase(['working'])).toEqual({
      phase: 'working',
      cleanCompletion: false
    })
    expect(observeYunxiaoFixPhase(['working', 'waiting'])).toEqual({
      phase: 'attention',
      cleanCompletion: false
    })
  })

  it('only calls a run clean when every agent ended done', () => {
    expect(observeYunxiaoFixPhase(['done', 'done'])).toEqual({
      phase: 'done',
      cleanCompletion: true
    })
    expect(observeYunxiaoFixPhase(['done', 'interrupted'])).toEqual({
      phase: 'done',
      cleanCompletion: false
    })
    expect(observeYunxiaoFixPhase(['idle'])).toEqual({ phase: 'done', cleanCompletion: false })
  })
})

describe('yunxiao fix phase toast id', () => {
  it('gives each workspace one lane so phases replace instead of stack', () => {
    expect(yunxiaoFixPhaseToastId('repo::/wt-a')).toBe('yunxiao-fix-phase:repo::/wt-a')
    expect(yunxiaoFixPhaseToastId('repo::/wt-a')).not.toBe(yunxiaoFixPhaseToastId('repo::/wt-b'))
  })
})
