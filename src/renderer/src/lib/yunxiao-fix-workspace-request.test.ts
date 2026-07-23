import { describe, expect, it } from 'vitest'
import {
  buildYunxiaoFixPrompt,
  buildYunxiaoFixWorkspaceName,
  withClaudeAutoAcceptEdits
} from './yunxiao-fix-workspace-request'
import type { YunxiaoWorkItem } from '../../../shared/types'

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

describe('claude auto-accept mode for fixes', () => {
  it('turns auto-accept edits on for a launch with no permission stance', () => {
    expect(withClaudeAutoAcceptEdits('')).toBe('--permission-mode acceptEdits')
    expect(withClaudeAutoAcceptEdits('--model opus')).toBe(
      '--model opus --permission-mode acceptEdits'
    )
  })

  it('replaces a bypass stance with auto-accept — fixes run auto mode, not bypass', () => {
    expect(withClaudeAutoAcceptEdits('--dangerously-skip-permissions')).toBe(
      '--permission-mode acceptEdits'
    )
    expect(withClaudeAutoAcceptEdits('--permission-mode bypassPermissions')).toBe(
      '--permission-mode acceptEdits'
    )
    expect(withClaudeAutoAcceptEdits('--model opus --permission-mode plan')).toBe(
      '--model opus --permission-mode acceptEdits'
    )
  })
})
