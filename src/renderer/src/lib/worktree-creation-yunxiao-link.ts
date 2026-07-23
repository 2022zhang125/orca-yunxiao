import { useAppStore } from '@/store'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'

/**
 * Stamps the 云效 back-reference once the workspace exists, rather than
 * threading it through `createWorktree`'s positional argument list. The task
 * list reads it to know the defect is already being worked on; losing the stamp
 * costs the row its running state, never the fix itself.
 */
export async function stampLinkedYunxiaoWorkItem(
  request: WorktreeCreationRequest,
  worktreeId: string
): Promise<void> {
  if (!request.linkedYunxiaoWorkItem) {
    return
  }
  await useAppStore
    .getState()
    .updateWorktreeMeta(worktreeId, { linkedYunxiaoWorkItem: request.linkedYunxiaoWorkItem })
    .catch(() => {})
}
