import { describe, expect, it } from 'vitest'
import { indexFixWorktreesByWorkItem, summarizeFixPhase } from './task-page-yunxiao-fix-progress'
import type { Worktree } from '../../../shared/worktree/types'

function worktree(overrides: Partial<Worktree> & { id: string }): Worktree {
  return {
    repoId: 'repo',
    path: `/tmp/${overrides.id}`,
    branch: 'main',
    displayName: overrides.id,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  } as Worktree
}

describe('yunxiao fix workspace lookup', () => {
  it('indexes a workspace by the defect serial its create stamped', () => {
    const index = indexFixWorktreesByWorkItem([
      worktree({ id: 'wt-1', linkedYunxiaoWorkItem: 'RTOH-76' }),
      worktree({ id: 'wt-2' })
    ])
    expect(index.get('RTOH-76')?.id).toBe('wt-1')
    expect(index.size).toBe(1)
  })

  it('keeps the most recently active workspace when a defect was fixed twice', () => {
    const index = indexFixWorktreesByWorkItem([
      worktree({ id: 'old', linkedYunxiaoWorkItem: 'RTOH-76', lastActivityAt: 10 }),
      worktree({ id: 'new', linkedYunxiaoWorkItem: 'RTOH-76', lastActivityAt: 20 })
    ])
    expect(index.get('RTOH-76')?.id).toBe('new')
  })

  it('ignores archived workspaces so the fix can be offered again', () => {
    const index = indexFixWorktreesByWorkItem([
      worktree({ id: 'wt-1', linkedYunxiaoWorkItem: 'RTOH-76', isArchived: true })
    ])
    expect(index.has('RTOH-76')).toBe(false)
  })
})

describe('yunxiao fix phase', () => {
  it('reports work while any agent is still running', () => {
    expect(summarizeFixPhase(['working'])).toBe('working')
    expect(summarizeFixPhase(['working', 'idle'])).toBe('working')
  })

  it('lets a blocked agent outrank a busy one, so a stalled fix is not hidden', () => {
    expect(summarizeFixPhase(['working', 'waiting'])).toBe('attention')
    expect(summarizeFixPhase(['working', 'blocked'])).toBe('attention')
    expect(summarizeFixPhase(['permission'])).toBe('attention')
  })

  it('treats a workspace whose sessions all ended as finished', () => {
    expect(summarizeFixPhase(['done'])).toBe('done')
    expect(summarizeFixPhase(['idle', 'interrupted'])).toBe('done')
  })

  it('reads an empty workspace as still launching, not as finished', () => {
    // A finished session leaves a retained 'done' row; only a fix whose agent
    // has not started reporting yet is truly empty.
    expect(summarizeFixPhase([])).toBe('working')
  })
})
