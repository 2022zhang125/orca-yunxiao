import { isWindowVisible } from './window-visibility-interval'

/**
 * Whether the user is actually looking at Orca right now.
 *
 * Visibility alone does not answer that: Electron keeps a window
 * `visibilityState === 'visible'` the whole time it sits behind the editor the
 * user is working in — only minimize/hide flips it. Routing an announcement on
 * visibility therefore sends it to an on-screen-only surface in a window nobody
 * is looking at. Focus is the signal that separates "on screen" from "in front".
 */
export function isWindowInForeground(): boolean {
  if (!isWindowVisible()) {
    return false
  }
  if (typeof document === 'undefined' || typeof document.hasFocus !== 'function') {
    return true
  }
  return document.hasFocus()
}
