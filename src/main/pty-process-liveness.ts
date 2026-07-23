/**
 * Process-table tiebreaker for teardown paths that would otherwise trust a PTY
 * exit event that never arrived. Signal 0 runs the kernel's existence check
 * without delivering anything, on POSIX and Windows alike.
 *
 * Only a definitive ESRCH counts as gone: EPERM means the process exists under
 * another owner, and an unrecognized failure is not evidence of death. PID
 * reuse can likewise make a recycled number read as alive. Both err toward
 * "alive", which preserves the caller's fail-closed path.
 */
export function isProcessAlive(pid: number): boolean {
  // An unusable pid cannot prove death.
  if (!Number.isInteger(pid) || pid <= 0) {
    return true
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException | null)?.code !== 'ESRCH'
  }
}
