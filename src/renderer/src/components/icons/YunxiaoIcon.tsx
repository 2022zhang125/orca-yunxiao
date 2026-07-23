export function YunxiaoIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      {/* Why: a monochrome cloud + workflow-node mark stands in for the 云效
      product logo so it matches Orca's other provider icons. */}
      <path d="M17.7 9.02a5.75 5.75 0 0 0-11.02-1.3A4.5 4.5 0 0 0 7 16.7h3.25v-1.7H7a2.8 2.8 0 0 1-.2-5.59l.7-.05.18-.68a4.05 4.05 0 0 1 7.85.24l.15.72.73.05a2.8 2.8 0 0 1-.16 5.6h-2.95v1.7h2.95a4.5 4.5 0 0 0 1.45-8.77z" />
      <path d="M12 11.05a2.1 2.1 0 0 0-.85 4.02v2.9h-2.4v1.7h6.5v-1.7h-2.4v-2.9A2.1 2.1 0 0 0 12 11.05zm0 1.7a.4.4 0 1 1 0 .8.4.4 0 0 1 0-.8z" />
    </svg>
  )
}
