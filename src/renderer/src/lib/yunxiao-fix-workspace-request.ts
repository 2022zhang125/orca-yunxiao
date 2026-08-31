import { buildAgentStartupPlan } from '@/lib/tui-agent-startup'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import { getLocalRepoProjectExecutionRuntimeContext } from '@/lib/local-preflight-context'
import { resolveSourceControlLaunchPlatform } from '@/lib/source-control-launch-platform'
import { buildDirectWorkItemStartupOpts } from '@/lib/launch-work-item-direct-agent'
import { tuiAgentToAgentKind } from '@/lib/telemetry'
import { repoIsRemote } from '../../../shared/agent-launch-remote'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../shared/tui-agent-launch-defaults'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import { projectHostSetupProjectionFromRepos } from '../../../shared/project-host-setup-projection'
import { resolveLocalWindowsAgentStartupShell } from '../../../shared/windows-terminal-shell'
import type { useAppStore } from '@/store'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'
import type { Repo } from '../../../shared/repo-types'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { YunxiaoWorkItem } from '../../../shared/yunxiao-types'
import type { TaskSourceContext, WorkspaceRunContext } from '../../../shared/task-source-context'

/** 云效 defect fixes always run the repo's bug workflow under Claude. */
export const YUNXIAO_FIX_AGENT: TuiAgent = 'claude'

type StoreSnapshot = ReturnType<typeof useAppStore.getState>

/** `/flow-bug #DEMO-8` — the serial number is the handle the workflow expects. */
export function buildYunxiaoFixPrompt(workItem: YunxiaoWorkItem): string {
  return `/flow-bug #${workItem.serialNumber}`
}

/**
 * Pins the fix launch to fully unattended permissions — edits, commands, and
 * installs all run without a prompt. A batch fix is launched from the task list
 * and nobody watches the panes, so any approval prompt stalls that workspace
 * indefinitely; the row's attention state is the surface for what needs a human.
 *
 * Replaces whatever stance is configured (including a narrower
 * `--permission-mode`) so the batch can't inherit one that blocks on commands.
 */
export function withClaudeSkipPermissions(args: string): string {
  const stripped = args
    .replace(/--dangerously-skip-permissions\b/g, '')
    .replace(/--permission-mode(?:[= ]\S+)?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `${stripped} --dangerously-skip-permissions`.trim()
}

/** Branch/workspace seed: `fix-demo-8`, kept git-safe for any serial format. */
export function buildYunxiaoFixWorkspaceName(workItem: YunxiaoWorkItem): string {
  const slug = workItem.serialNumber
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `fix-${slug}` : 'fix-yunxiao-bug'
}

function getWorkspaceRunContextForRepo(repo: Repo): WorkspaceRunContext | null {
  const projection = projectHostSetupProjectionFromRepos([repo])
  const project = projection.projects[0]
  const setup = projection.setups[0]
  if (!project || !setup) {
    return null
  }
  return {
    kind: 'workspace-run',
    projectId: project.id,
    hostId: getRepoExecutionHostId(repo),
    projectHostSetupId: setup.id,
    repoId: repo.id,
    path: repo.path
  }
}

function resolveLaunchPlatform(store: StoreSnapshot, repo: Repo): NodeJS.Platform {
  const host = parseExecutionHostId(getRepoExecutionHostId(repo))
  if (host?.kind === 'runtime') {
    return (
      store.runtimeStatusByEnvironmentId.get(host.environmentId)?.status?.hostPlatform ?? 'linux'
    )
  }
  const projectRuntime = repo.connectionId
    ? undefined
    : getLocalRepoProjectExecutionRuntimeContext(store, repo.id, CLIENT_PLATFORM)
  return resolveSourceControlLaunchPlatform({
    connectionId: repo.connectionId,
    worktreePath: repo.path,
    projectRuntime
  })
}

/**
 * Builds the background-create request for the row's one-click fix: a workspace
 * on `repo` whose first Claude session starts on `/flow-bug #<serial>`. Mirrors
 * the GitHub work-item background create rather than the composer, so no modal
 * is involved.
 */
export function buildYunxiaoFixWorkspaceRequest(args: {
  workItem: YunxiaoWorkItem
  repo: Repo
  store: StoreSnapshot
  taskSourceContext?: TaskSourceContext | null
}): WorktreeCreationRequest {
  const { workItem, repo, store, taskSourceContext } = args
  const prompt = buildYunxiaoFixPrompt(workItem)
  const platform = resolveLaunchPlatform(store, repo)
  const isRemote = repoIsRemote(repo)
  const workspaceRunContext = getWorkspaceRunContextForRepo(repo)
  const ownerHost = parseExecutionHostId(getRepoExecutionHostId(repo))

  const startupPlan = buildAgentStartupPlan({
    agent: YUNXIAO_FIX_AGENT,
    prompt,
    cmdOverrides: store.settings?.agentCmdOverrides ?? {},
    agentArgs: withClaudeSkipPermissions(
      resolveTuiAgentLaunchArgs(YUNXIAO_FIX_AGENT, store.settings?.agentDefaultArgs)
    ),
    agentEnv: resolveTuiAgentLaunchEnv(YUNXIAO_FIX_AGENT, store.settings?.agentDefaultEnv),
    platform,
    shell: resolveLocalWindowsAgentStartupShell({
      platform,
      isRemote,
      terminalWindowsShell: store.settings?.terminalWindowsShell
    }),
    isRemote,
    allowEmptyPromptLaunch: true
  })
  const quickTelemetry = {
    agent_kind: tuiAgentToAgentKind(YUNXIAO_FIX_AGENT),
    launch_source: 'new_workspace_composer' as const,
    request_kind: 'new' as const
  }
  const startup = buildDirectWorkItemStartupOpts(
    YUNXIAO_FIX_AGENT,
    startupPlan,
    'new_workspace_composer'
  ).startup

  return {
    repoId: repo.id,
    worktreeCreateProgressMode: ownerHost?.kind === 'local' ? 'stepped' : 'indeterminate',
    ...(taskSourceContext ? { taskSourceContext } : {}),
    ...(workspaceRunContext ? { workspaceRunContext } : {}),
    name: buildYunxiaoFixWorkspaceName(workItem),
    displayName: `${workItem.serialNumber} ${workItem.title}`.trim(),
    // The task list matches rows to their fix workspace on this, so it survives
    // a restart and a workspace rename.
    linkedYunxiaoWorkItem: workItem.serialNumber,
    // The task list row is the progress surface; the click must not yank the
    // user off the list they are batch-fixing from.
    stayOnCurrentView: true,
    // A batch fix opens several workspaces at once, and each one running the
    // repo's setup meant a parallel `pnpm install` per workspace — enough to
    // saturate CPU and memory. Sharing the primary checkout's already-installed
    // dependencies skips that entirely; `inherit` is the fallback for a primary
    // checkout with nothing installed yet.
    shareDependencyDirectories: true,
    setupDecision: 'inherit',
    telemetrySource: 'sidebar',
    agent: YUNXIAO_FIX_AGENT,
    pendingFirstAgentMessageRename: false,
    // 云效 has no linked-work-item field on the create request, so the URL is
    // preserved as the workspace note instead of being dropped.
    note: workItem.url,
    startupPlan,
    ...(startup ? { startup } : {}),
    quickPrompt: prompt,
    quickTelemetry
  }
}
