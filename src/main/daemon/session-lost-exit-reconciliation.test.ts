import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IMMEDIATE_KILL_PHYSICAL_EXIT_TIMEOUT_MS, Session } from './session'

// A force-killed PTY normally proves its own death through the subprocess exit
// event. When that event is lost — a Windows ConPTY handle held open by a
// surviving grandchild is the known case — the session used to stay 'alive' for
// the daemon's life, and every later worktree removal failed closed on it.

const isProcessAliveMock = vi.hoisted(() => vi.fn())
vi.mock('../pty-process-liveness', () => ({
  isProcessAlive: isProcessAliveMock
}))

// forceKill deliberately never fans an exit: that is the lost-event shape.
function createMockSubprocess() {
  let onExit: ((code: number) => void) | null = null
  return {
    pid: 4242,
    getForegroundProcess: (): string | null => null,
    write(_data: string) {},
    resize(_cols: number, _rows: number) {},
    kill() {},
    forceKill() {},
    signal(_sig: string) {},
    onData(_cb: (data: string) => void) {},
    onExit(cb: (code: number) => void) {
      onExit = cb
    },
    dispose() {},
    simulateExit(code: number) {
      onExit?.(code)
    }
  }
}

describe('Session lost-exit reconciliation', () => {
  let session: Session
  let subprocess: ReturnType<typeof createMockSubprocess>
  /** The owner's reaper — what actually drops the session from listSessions(). */
  let reapedExitCodes: number[]
  let clientExits: { code: number; incarnationId: string }[]

  beforeEach(() => {
    vi.useFakeTimers()
    subprocess = createMockSubprocess()
    isProcessAliveMock.mockReset()
    isProcessAliveMock.mockReturnValue(true)
    reapedExitCodes = []
    clientExits = []
    session = new Session({
      sessionId: 'reconciliation-test',
      cols: 80,
      rows: 24,
      subprocess,
      shellReadySupported: false,
      onExit: (code) => reapedExitCodes.push(code)
    })
    session.attachClient({
      onData: () => {},
      onExit: (code, incarnationId) => clientExits.push({ code, incarnationId })
    })
  })

  afterEach(() => {
    session.dispose()
    vi.useRealTimers()
  })

  it('marks the session exited once the process table proves the pid is gone', async () => {
    isProcessAliveMock.mockReturnValue(false)

    const shutdown = expect(session.forceKillAndWaitForExit()).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(IMMEDIATE_KILL_PHYSICAL_EXIT_TIMEOUT_MS)
    await shutdown

    expect(isProcessAliveMock).toHaveBeenCalledWith(subprocess.pid)
    expect(session.state).toBe('exited')
    expect(session.isAlive).toBe(false)
    expect(clientExits).toEqual([{ code: -1, incarnationId: session.incarnationId }])
    // Reaping is what lets the next removal prove the PTY stopped instead of
    // failing closed on a session that will never report its own exit.
    expect(reapedExitCodes).toEqual([-1])
  })

  it('keeps failing closed while the force-killed process is still alive', async () => {
    isProcessAliveMock.mockReturnValue(true)

    const shutdown = expect(session.forceKillAndWaitForExit()).rejects.toThrow(
      'Timed out waiting for PTY process exit'
    )
    await vi.advanceTimersByTimeAsync(IMMEDIATE_KILL_PHYSICAL_EXIT_TIMEOUT_MS)
    await shutdown

    expect(session.state).toBe('running')
    expect(session.isAlive).toBe(true)
    expect(reapedExitCodes).toEqual([])
  })

  it('fans out one exit when the real event lands after a reconciled one', async () => {
    isProcessAliveMock.mockReturnValue(false)

    const shutdown = expect(session.forceKillAndWaitForExit()).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(IMMEDIATE_KILL_PHYSICAL_EXIT_TIMEOUT_MS)
    await shutdown

    subprocess.simulateExit(137)

    expect(clientExits).toHaveLength(1)
    expect(reapedExitCodes).toEqual([-1])
    expect(session.exitCode).toBe(-1)
  })
})
