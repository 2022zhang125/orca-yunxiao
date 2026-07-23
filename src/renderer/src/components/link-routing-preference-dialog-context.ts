import { createContext, useContext } from 'react'

export type LinkRoutingPreferenceDialogOptions = {
  url?: string
  preview?: boolean
  openLinksInAppDefault?: boolean
}

export type LinkRoutingPreferenceDialogContextValue = (
  options?: LinkRoutingPreferenceDialogOptions
) => Promise<boolean>

/**
 * Deliberately alone in a module that exports no component.
 *
 * React Fast Refresh cannot refresh a module in place once it exports a hook
 * alongside its components, so it invalidates the importers instead. When the
 * context lived beside the provider, an edit to the dialog re-ran
 * `createContext` and handed the provider a new context object while consumers
 * that were not re-executed kept reading the old one — the provider was right
 * there in the tree and `useContext` still came back null. Keeping the context
 * in a file nobody edits keeps that identity stable across a hot update.
 */
export const LinkRoutingPreferenceDialogContext =
  createContext<LinkRoutingPreferenceDialogContextValue | null>(null)

export function useLinkRoutingPreferenceDialog(): LinkRoutingPreferenceDialogContextValue {
  const requestPreference = useContext(LinkRoutingPreferenceDialogContext)
  if (!requestPreference) {
    throw new Error(
      'useLinkRoutingPreferenceDialog must be used inside LinkRoutingPreferenceDialogProvider'
    )
  }
  return requestPreference
}
