import { isWindowVisible } from './window-visibility-interval'

/**
 * An interval that keeps running while the window is hidden — for watches whose
 * result reaches the user through a channel a hidden window can still deliver
 * (a native notification, the tray), not only through in-app UI.
 *
 * Contrast `installWindowVisibilityInterval`, which stops while hidden because
 * its callers only refresh on-screen state.
 *
 * Chromium throttles timers in a background page, so a hidden window ticks later
 * than `intervalMs` — up to about once a minute under intensive throttling. The
 * becoming-visible run closes that gap the moment the user comes back.
 */
export function installBackgroundPollInterval(args: {
  run: () => void
  intervalMs: number
  setIntervalFn?: (callback: () => void, intervalMs: number) => ReturnType<typeof setInterval>
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void
}): () => void {
  const setIntervalFn =
    args.setIntervalFn ??
    ((callback: () => void, intervalMs: number) => setInterval(callback, intervalMs))
  const clearIntervalFn =
    args.clearIntervalFn ?? ((handle: ReturnType<typeof setInterval>) => clearInterval(handle))

  args.run()
  const intervalId = setIntervalFn(args.run, args.intervalMs)

  // Why only on the visible edge: the hidden edge changes nothing — the interval
  // keeps running — and re-running there would poll twice for one transition.
  const onVisibilityChange = (): void => {
    if (isWindowVisible()) {
      args.run()
    }
  }
  const listening =
    typeof document !== 'undefined' && typeof document.addEventListener === 'function'
  if (listening) {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  return () => {
    clearIntervalFn(intervalId)
    if (listening) {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }
}
