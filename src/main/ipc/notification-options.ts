import { translateMain } from '../i18n/main-i18n'
import type { NotificationDispatchRequest } from '../../shared/types'

const NOTIFICATION_AGENT_LABEL_MAX_LENGTH = 40
const NOTIFICATION_TITLE_CONTEXT_MAX_LENGTH = 80
const NOTIFICATION_BODY_PREVIEW_MAX_LENGTH = 180

const AGENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  claude: 'Claude',
  openclaude: 'OpenClaude',
  codex: 'Codex',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  opencode: 'OpenCode',
  cursor: 'Cursor',
  aider: 'Aider',
  pi: 'Pi',
  omp: 'OMP',
  droid: 'Droid',
  grok: 'Grok',
  hermes: 'Hermes'
}

export function buildNotificationOptions(args: NotificationDispatchRequest): {
  title: string
  body: string
  silent?: boolean
  sound?: string
} {
  if (args.source === 'terminal-bell') {
    return {
      title: `Bell in ${args.worktreeLabel ?? 'workspace'}`,
      body: args.repoLabel ? `${args.repoLabel} · Attention requested` : 'Attention requested'
    }
  }

  if (args.source === 'test') {
    return {
      title: 'Orca notifications are on',
      body: 'This is a test notification from Orca.'
    }
  }

  if (args.source === 'yunxiao-work-item-change') {
    return buildYunxiaoWorkItemChangeNotificationOptions(args)
  }

  const richOptions = buildAgentTaskCompleteNotificationOptions(args)
  if (richOptions) {
    return richOptions
  }

  return buildAgentTaskCompleteFallbackNotificationOptions(args)
}

/** Native copy for a 云效 change, keyed off the same locale strings the in-app
 *  toast renders so both surfaces stay worded alike in every language. */
function buildYunxiaoWorkItemChangeNotificationOptions(args: NotificationDispatchRequest): {
  title: string
  body: string
} {
  const change = args.yunxiaoChange
  const body = change?.itemTitle ?? ''
  if (!change || change.kind === 'bulk') {
    return {
      title: translateMain(
        'auto.components.TaskPage.yunxiao_toast_bulk_changes',
        '{{value0}} 云效 work items changed',
        { value0: change?.count ?? 0 }
      ),
      body: ''
    }
  }
  if (change.kind === 'added') {
    return {
      title: translateMain(
        'auto.components.TaskPage.yunxiao_toast_new_item',
        'New {{value0}}: {{value1}}',
        { value0: change.workItemTypeName ?? '', value1: change.serialNumber ?? '' }
      ),
      body
    }
  }
  if (change.kind === 'removed') {
    return {
      title: translateMain(
        'auto.components.TaskPage.yunxiao_toast_item_unassigned',
        '{{value0}} is no longer assigned to you',
        { value0: change.serialNumber ?? '' }
      ),
      body
    }
  }
  return {
    title: translateMain(
      'auto.components.TaskPage.yunxiao_toast_item_updated',
      '{{value0}} updated ({{value1}})',
      { value0: change.serialNumber ?? '', value1: change.statusName ?? '' }
    ),
    body
  }
}

function buildAgentTaskCompleteNotificationOptions(
  args: NotificationDispatchRequest
): { title: string; body: string } | null {
  if (!hasAgentNotificationSnapshot(args)) {
    return null
  }

  const agentLabel = formatNotificationAgentLabel(args.agentType)
  const worktreeContext = formatNotificationWorktreeContext(args)
  const statusText =
    args.agentState === 'blocked' || args.agentState === 'waiting'
      ? 'needs input'
      : args.agentState === 'done' && args.agentInterrupted
        ? 'stopped'
        : 'finished'

  return {
    title: `${worktreeContext} - ${agentLabel} ${statusText}`,
    body: buildAgentTaskCompleteRichBody(args) ?? `${agentLabel} ${statusText}.`
  }
}

function formatNotificationWorktreeContext(args: NotificationDispatchRequest): string {
  const worktreeLabel = normalizeNotificationText(
    args.worktreeLabel,
    NOTIFICATION_TITLE_CONTEXT_MAX_LENGTH
  )
  const repoLabel = normalizeNotificationText(args.repoLabel, NOTIFICATION_TITLE_CONTEXT_MAX_LENGTH)
  if (args.hasMultipleActiveRepos && repoLabel && worktreeLabel) {
    return normalizeNotificationText(
      `${repoLabel} / ${worktreeLabel}`,
      NOTIFICATION_TITLE_CONTEXT_MAX_LENGTH
    )
  }
  return worktreeLabel || repoLabel || 'workspace'
}

function hasAgentNotificationSnapshot(args: NotificationDispatchRequest): boolean {
  return Boolean(
    args.agentType ||
    args.agentState ||
    args.agentPrompt ||
    args.agentToolName ||
    args.agentToolInput ||
    args.agentLastAssistantMessage ||
    args.agentInterrupted
  )
}

function buildAgentTaskCompleteRichBody(args: NotificationDispatchRequest): string | null {
  const assistantMessage = normalizeNotificationText(
    args.agentLastAssistantMessage,
    NOTIFICATION_BODY_PREVIEW_MAX_LENGTH
  )
  if (assistantMessage) {
    return assistantMessage
  }

  const toolName = normalizeNotificationText(args.agentToolName, 60)
  const toolInput = normalizeNotificationText(
    args.agentToolInput,
    NOTIFICATION_BODY_PREVIEW_MAX_LENGTH
  )
  if (toolName && toolInput) {
    return `Using ${toolName}: ${toolInput}`
  }
  if (toolName) {
    return `Using ${toolName}`
  }
  if (toolInput) {
    return `Tool input: ${toolInput}`
  }

  return null
}

function buildAgentTaskCompleteFallbackNotificationOptions(args: NotificationDispatchRequest): {
  title: string
  body: string
} {
  return {
    title: `Task complete in ${args.worktreeLabel ?? 'workspace'}`,
    body: buildAgentTaskCompleteFallbackBody(args)
  }
}

function buildAgentTaskCompleteFallbackBody(args: NotificationDispatchRequest): string {
  return args.repoLabel
    ? `${args.repoLabel}${args.terminalTitle ? ` · ${args.terminalTitle}` : ''}`
    : (args.terminalTitle ?? 'A coding agent finished working.')
}

function formatNotificationAgentLabel(agentType: string | null | undefined): string {
  const normalized = normalizeNotificationText(agentType, NOTIFICATION_AGENT_LABEL_MAX_LENGTH)
  if (!normalized || normalized === 'unknown') {
    return 'Agent'
  }
  return AGENT_TYPE_LABELS[normalized] ?? normalized
}

function normalizeNotificationText(value: string | null | undefined, maxLength: number): string {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (normalized.length <= maxLength) {
    return normalized
  }
  const truncated = normalized.slice(0, maxLength - 1)
  const lastCode = truncated.charCodeAt(truncated.length - 1)
  const safeTruncated =
    lastCode >= 0xd800 && lastCode <= 0xdbff ? truncated.slice(0, -1) : truncated
  return `${safeTruncated}…`
}
