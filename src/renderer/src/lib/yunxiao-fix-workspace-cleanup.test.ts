import { describe, expect, it } from 'vitest'
import {
  resolveYunxiaoFixMergeBaseRef,
  resolveYunxiaoFixMergeState
} from './yunxiao-fix-workspace-cleanup'
import type { GitBranchCompareSummary } from '../../../shared/types'

function summary(overrides: Partial<GitBranchCompareSummary> = {}): GitBranchCompareSummary {
  return {
    baseRef: 'origin/main',
    baseOid: 'base',
    compareRef: 'HEAD',
    headOid: 'head',
    mergeBase: 'base',
    changedFiles: 0,
    commitsAhead: 0,
    status: 'ready',
    ...overrides
  }
}

describe('yunxiao fix merge base ref', () => {
  it('prefers the base the workspace was created from', () => {
    expect(
      resolveYunxiaoFixMergeBaseRef({ worktreeBaseRef: 'origin/dev', repoBaseRef: 'origin/main' })
    ).toBe('origin/dev')
  })

  it('falls back to the repo base, then to nothing to compare against', () => {
    expect(
      resolveYunxiaoFixMergeBaseRef({ worktreeBaseRef: '  ', repoBaseRef: 'origin/main' })
    ).toBe('origin/main')
    expect(resolveYunxiaoFixMergeBaseRef({ worktreeBaseRef: null, repoBaseRef: null })).toBeNull()
  })
})

describe('yunxiao fix merge state', () => {
  it('reads a branch with nothing ahead of its base as merged', () => {
    expect(resolveYunxiaoFixMergeState(summary())).toBe('merged')
  })

  it('keeps a branch that still carries its own commits', () => {
    expect(resolveYunxiaoFixMergeState(summary({ commitsAhead: 2, changedFiles: 3 }))).toBe(
      'unmerged'
    )
    // A rebased-onto-base branch reports no commits ahead but still owns changes.
    expect(resolveYunxiaoFixMergeState(summary({ commitsAhead: 0, changedFiles: 1 }))).toBe(
      'unmerged'
    )
  })

  it('refuses to call an unverifiable compare merged', () => {
    expect(resolveYunxiaoFixMergeState(summary({ status: 'error' }))).toBe('unknown')
    expect(resolveYunxiaoFixMergeState(summary({ status: 'invalid-base' }))).toBe('unknown')
    expect(resolveYunxiaoFixMergeState(summary({ status: 'no-merge-base' }))).toBe('unknown')
    expect(resolveYunxiaoFixMergeState(summary({ commitsAhead: undefined }))).toBe('unknown')
    expect(resolveYunxiaoFixMergeState(null)).toBe('unknown')
  })
})
