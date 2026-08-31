import type {
  YunxiaoConnectionStatus,
  YunxiaoProject,
  YunxiaoWorkItem
} from '../../../../../shared/yunxiao-types'

const projectNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
})

export function getYunxiaoProjectKey(project: YunxiaoProject): string {
  return `${project.accountId ?? 'selected'}:${project.id}`
}

export function normalizeYunxiaoProjects(projects: YunxiaoProject[]): YunxiaoProject[] {
  const seen = new Set<string>()
  return projects
    .filter((project) => {
      const key = getYunxiaoProjectKey(project)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .sort((a, b) => projectNameCollator.compare(a.name, b.name))
}

export function getYunxiaoProjectViewerUserId(
  status: YunxiaoConnectionStatus,
  project: YunxiaoProject
): string | null {
  if (project.accountId) {
    const account = status.accounts?.find((candidate) => candidate.id === project.accountId)
    if (account) {
      return account.userId
    }
  }
  return status.viewer?.userId ?? null
}

export function filterYunxiaoProjectWorkItems(
  workItems: YunxiaoWorkItem[],
  project: YunxiaoProject,
  viewerUserId: string | null,
  query: string
): YunxiaoWorkItem[] {
  const normalizedQuery = query.trim().toLowerCase()
  return workItems.filter((workItem) => {
    if (workItem.project.id !== project.id) {
      return false
    }
    if (project.accountId && workItem.accountId && project.accountId !== workItem.accountId) {
      return false
    }
    if (viewerUserId && workItem.assignee?.userId !== viewerUserId) {
      return false
    }
    return (
      !normalizedQuery ||
      workItem.title.toLowerCase().includes(normalizedQuery) ||
      workItem.serialNumber.toLowerCase().includes(normalizedQuery)
    )
  })
}
