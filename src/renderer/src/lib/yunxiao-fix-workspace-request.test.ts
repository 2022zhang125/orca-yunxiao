import { describe, expect, it } from 'vitest'
import {
  buildYunxiaoFixPrompt,
  buildYunxiaoFixWorkspaceName,
  withClaudeSkipPermissions
} from './yunxiao-fix-workspace-request'
import type { YunxiaoWorkItem } from '../../../shared/yunxiao-types'

function workItem(serialNumber: string): YunxiaoWorkItem {
  return {
    id: 'wi-1',
    serialNumber,
    title: 'Login fails on Windows',
    url: 'https://devops.aliyun.com/wi-1',
    project: { id: 'space-1', name: 'Space' },
    workItemType: { id: 'Bug', name: '缺陷', category: 'Bug' },
    status: { id: '30', name: '重新打开', stage: 'todo' },
    labels: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('yunxiao one-click fix request', () => {
  it('drives the repo bug workflow off the serial number', () => {
    expect(buildYunxiaoFixPrompt(workItem('DEMO-8'))).toBe('/flow-bug #DEMO-8')
  })

  it('derives a git-safe workspace name from any serial format', () => {
    expect(buildYunxiaoFixWorkspaceName(workItem('DEMO-8'))).toBe('fix-demo-8')
    expect(buildYunxiaoFixWorkspaceName(workItem('缺陷 #12'))).toBe('fix-12')
    expect(buildYunxiaoFixWorkspaceName(workItem('__'))).toBe('fix-yunxiao-bug')
  })
})

describe('claude unattended permissions for fixes', () => {
  it('skips permissions for a launch with no configured stance', () => {
    expect(withClaudeSkipPermissions('')).toBe('--dangerously-skip-permissions')
    expect(withClaudeSkipPermissions('--model opus')).toBe(
      '--model opus --dangerously-skip-permissions'
    )
  })

  it('replaces a narrower configured stance so a batch cannot block on a prompt', () => {
    expect(withClaudeSkipPermissions('--permission-mode acceptEdits')).toBe(
      '--dangerously-skip-permissions'
    )
    expect(withClaudeSkipPermissions('--permission-mode plan')).toBe(
      '--dangerously-skip-permissions'
    )
    expect(withClaudeSkipPermissions('--model opus --permission-mode acceptEdits')).toBe(
      '--model opus --dangerously-skip-permissions'
    )
  })

  it('does not duplicate the flag when it is already configured', () => {
    expect(withClaudeSkipPermissions('--dangerously-skip-permissions')).toBe(
      '--dangerously-skip-permissions'
    )
    expect(withClaudeSkipPermissions('--model opus --dangerously-skip-permissions')).toBe(
      '--model opus --dangerously-skip-permissions'
    )
  })
})
