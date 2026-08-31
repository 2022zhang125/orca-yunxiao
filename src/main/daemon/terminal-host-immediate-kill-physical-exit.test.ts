import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IMMEDIATE_KILL_PHYSICAL_EXIT_TIMEOUT_MS } from './session-termination-controller'
import type { SubprocessHandle } from './session-subprocess-handle'
import { TerminalHost } from './terminal-host'
import type { TuiAgent } from '../../shared/tui-agent'

// An immediate kill must not acknowledge teardown until the child is physically
// gone — destructive worktree removal fails closed on anything less. The two
// halves of that contract live together here: a wedged child keeps its session,
// while a child the process table says is already reaped gets reconciled rather
// than stranded alive for the daemon's life.

const killWithDescendantSweepMock = vi.hoisted(() => vi.fn())
vi.mock('../pty-descendant-termination', () => ({
  killWithDescendantSweep: killWithDescendantSweepMock
}))

const isProcessAliveMock = vi.hoisted(() => vi.fn())
vi.mock('../pty-process-liveness', () => ({
  isProcessAlive: isProcessAliveMock
}))

const SUBPROCESS_PID = 99999

type MockSubprocess = SubprocessHandle & { _onExitCb: ((code: number) => void) | null }

type MockSpawnFn = (opts: {
  sessionId: string
  cols: number
  rows: number
  cwd?: string
  env?: Record<string, string>
  command?: string
  launchAgent?: TuiAgent
}) => SubprocessHandle

function createMockSubprocess(): MockSubprocess {
  let onExitCb: ((code: number) => void) | null = null
  return {
    pid: SUBPROCESS_PID,
    getForegroundProcess: vi.fn(() => null),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    forceKill: vi.fn(() => onExitCb?.(137)),
    terminateOwnedTree: vi.fn(() => 'unavailable' as const),
    signal: vi.fn(),
    onData() {},
    onExit(cb) {
      onExitCb = cb
    },
    dispose: vi.fn(),
    get _onExitCb() {
      return onExitCb
    }
  } as MockSubprocess
}

describe('TerminalHost immediate kill physical exit', () => {
  let host: TerminalHost
  let lastSubprocess: MockSubprocess
  let clientExitCodes: number[]

  beforeEach(() => {
    killWithDescendantSweepMock.mockReset()
    isProcessAliveMock.mockReset()
    // Default alive: a mock pid is absent from the real process table, so every
    // timeout here would otherwise read as an already-reaped child.
    isProcessAliveMock.mockReturnValue(true)
    clientExitCodes = []
    const spawnFn = ((): SubprocessHandle => {
      lastSubprocess = createMockSubprocess()
      return lastSubprocess
    }) as MockSpawnFn
    host = new TerminalHost({ spawnSubprocess: spawnFn })
  })

  /** Session whose force-kill never fans an exit — the wedged/lost-event shape. */
  async function startWedgedSession(): Promise<void> {
    await host.createOrAttach({
      sessionId: 'session-1',
      cols: 80,
      rows: 24,
      streamClient: {
        onData: () => {},
        onExit: (code: number) => clientExitCodes.push(code)
      }
    })
    lastSubprocess.forceKill = vi.fn()
  }

  it('retains the session when physical exit times out on a live child', async () => {
    vi.useFakeTimers()
    try {
      await startWedgedSession()

      const killed = host.kill('session-1', { immediate: true })
      const rejected = expect(killed).rejects.toThrow('Timed out waiting for PTY process exit')
      await vi.advanceTimersByTimeAsync(IMMEDIATE_KILL_PHYSICAL_EXIT_TIMEOUT_MS)
      await rejected

      expect(lastSubprocess.forceKill).toHaveBeenCalledTimes(1)
      expect(lastSubprocess.dispose).not.toHaveBeenCalled()
      expect(host.listSessions()).toHaveLength(1)
      await expect(
        host.createOrAttach({
          sessionId: 'session-1',
          cols: 80,
          rows: 24,
          streamClient: { onData: () => {}, onExit: () => {} }
        })
      ).rejects.toThrow('Session not found')

      lastSubprocess._onExitCb?.(137)
      expect(host.listSessions()).toHaveLength(0)
      expect(clientExitCodes).toEqual([137])
    } finally {
      vi.useRealTimers()
    }
  })

  // Why: a lost exit event used to strand the session as alive for the daemon's
  // life, so destructive removal of that workspace could never prove its PTYs
  // stopped and failed closed on every later attempt.
  it('reaps the session when the timed-out child is gone from the process table', async () => {
    vi.useFakeTimers()
    try {
      await startWedgedSession()
      isProcessAliveMock.mockReturnValue(false)

      const killed = host.kill('session-1', { immediate: true })
      const settled = expect(killed).resolves.toBeUndefined()
      await vi.advanceTimersByTimeAsync(IMMEDIATE_KILL_PHYSICAL_EXIT_TIMEOUT_MS)
      await settled

      expect(isProcessAliveMock).toHaveBeenCalledWith(SUBPROCESS_PID)
      expect(host.listSessions()).toHaveLength(0)
      expect(clientExitCodes).toEqual([-1])
    } finally {
      vi.useRealTimers()
    }
  })
})
