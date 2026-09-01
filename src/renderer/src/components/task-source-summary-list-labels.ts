export function formatShortTaskSourceList(labels: readonly string[]): string {
  return labels.length <= 2 ? labels.join(', ') : `${labels[0]} +${labels.length - 1}`
}

export function formatLongTaskSourceList(labels: readonly string[]): string {
  return labels.join(', ')
}

export function getTaskSourceAvailabilityLabel(
  unavailableHosts: readonly { hostLabel: string; statusLabel: string }[]
): string | null {
  if (unavailableHosts.length === 0) {
    return null
  }
  return unavailableHosts.length === 1
    ? unavailableHosts[0].statusLabel
    : `${unavailableHosts.length} unavailable`
}
