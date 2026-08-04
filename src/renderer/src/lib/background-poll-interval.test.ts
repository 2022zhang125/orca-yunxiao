import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installBackgroundPollInterval } from './background-poll-interval'

function stubDocument(initial: DocumentVisibilityState): {
  setVisibility: (next: DocumentVisibilityState) => void
  fireVisibilityChange: () => void
  removeEventListener: ReturnType<typeof vi.fn>
} {
  let visibilityState = initial
  const listeners = new Map<string, () => void>()
  const removeEventListener = vi.fn()
  vi.stubGlobal('document', {
    get visibilityState() {
      return visibilityState
    },
    addEventListener: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener)
    }),
    removeEventListener
  })
  return {
    setVisibility: (next) => {
      visibilityState = next
    },
    fireVisibilityChange: () => listeners.get('visibilitychange')?.(),
    removeEventListener
  }
}

describe('installBackgroundPollInterval', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('starts the interval even when the document is already hidden', () => {
    stubDocument('hidden')
    const run = vi.fn()
    const setIntervalMock = vi.fn(() => 1 as unknown as ReturnType<typeof setInterval>)

    installBackgroundPollInterval({
      run,
      intervalMs: 30_000,
      setIntervalFn: setIntervalMock,
      clearIntervalFn: vi.fn()
    })

    expect(run).toHaveBeenCalledTimes(1)
    expect(setIntervalMock).toHaveBeenCalledTimes(1)
    expect(setIntervalMock).toHaveBeenCalledWith(run, 30_000)
  })

  it('keeps the single interval alive across a hide, rather than stopping it', () => {
    const doc = stubDocument('visible')
    const run = vi.fn()
    const setIntervalMock = vi.fn(() => 1 as unknown as ReturnType<typeof setInterval>)
    const clearIntervalMock = vi.fn()

    installBackgroundPollInterval({
      run,
      intervalMs: 30_000,
      setIntervalFn: setIntervalMock,
      clearIntervalFn: clearIntervalMock
    })
    doc.setVisibility('hidden')
    doc.fireVisibilityChange()

    expect(clearIntervalMock).not.toHaveBeenCalled()
    expect(setIntervalMock).toHaveBeenCalledTimes(1)
    // Only the initial run — the hidden edge is not a catch-up point.
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs immediately on becoming visible so a throttled hidden tick catches up', () => {
    const doc = stubDocument('hidden')
    const run = vi.fn()

    installBackgroundPollInterval({
      run,
      intervalMs: 30_000,
      setIntervalFn: vi.fn(() => 1 as unknown as ReturnType<typeof setInterval>),
      clearIntervalFn: vi.fn()
    })
    expect(run).toHaveBeenCalledTimes(1)

    doc.setVisibility('visible')
    doc.fireVisibilityChange()

    expect(run).toHaveBeenCalledTimes(2)
  })

  it('clears the interval and the listener on cleanup', () => {
    const doc = stubDocument('visible')
    const clearIntervalMock = vi.fn()
    const handle = 7 as unknown as ReturnType<typeof setInterval>

    const cleanup = installBackgroundPollInterval({
      run: vi.fn(),
      intervalMs: 30_000,
      setIntervalFn: vi.fn(() => handle),
      clearIntervalFn: clearIntervalMock
    })
    cleanup()

    expect(clearIntervalMock).toHaveBeenCalledWith(handle)
    expect(doc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})
