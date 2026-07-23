/**
 * 云效's rich-text editor stores a description as a JSON envelope holding both
 * an HTML rendering and a JsonML AST, e.g.
 * `{"htmlValue":"<article>…</article>","jsonMLValue":[…]}`. Handing that raw
 * string to the UI prints the JSON itself, so unwrap it down to the HTML.
 * Plain-string descriptions (older items, other endpoints) pass through.
 */
export function unwrapWorkItemDescription(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed || !trimmed.startsWith('{')) {
    return trimmed || undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // A description that merely opens with a brace is not an envelope.
    return trimmed
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return trimmed
  }
  const record = parsed as Record<string, unknown>
  for (const key of ['htmlValue', 'html', 'textValue', 'text']) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  // An envelope we recognise but cannot read is worse than nothing: printing
  // the raw JSON at a defect reader is noise, not content.
  return undefined
}
