import { useViews, formatViews } from './views.js'

// "👁 1.2K" for one photo. Renders nothing until live counts are available.
export default function Views({ id, className = '' }) {
  const counts = useViews()
  if (!counts) return null
  const n = counts[id] || 0
  return (
    <span className={`inline-flex items-center gap-1.5 tabular-nums ${className}`} title={`${n.toLocaleString('en')} views`} aria-label={`${n.toLocaleString('en')} views`}>
      <svg viewBox="0 0 24 24" className="size-[1.1em]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
      </svg>
      {formatViews(n)}
    </span>
  )
}
