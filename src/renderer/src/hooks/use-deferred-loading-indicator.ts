import { useEffect, useState } from 'react'

/** Matches the SSH round-trip budget in docs/STYLEGUIDE.md → UX rule 1. */
const DEFAULT_DELAY_MS = 200

/**
 * Holds a loading indicator back so a fast local response never flashes one,
 * while a slow remote (SSH) response still reports progress. Bind the disabled
 * state to the raw flag; bind only the visible treatment to this one.
 */
export function useDeferredLoadingIndicator(loading: boolean, delayMs = DEFAULT_DELAY_MS): boolean {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!loading) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs, loading])

  return visible
}
