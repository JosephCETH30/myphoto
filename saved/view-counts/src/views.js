import { useEffect, useState } from 'react'

// Live view counts from the Netlify function (/api/views). Polls every 10s while the tab is visible.
// If the API isn't there (local dev without `netlify dev`), counts simply stay hidden.
const API = '/api/views'
let counts = null // null = not available (yet)
const subs = new Set()
const emit = () => subs.forEach((f) => f(counts))

async function refresh() {
  try {
    const r = await fetch(API, { cache: 'no-store' })
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return
    counts = { ...(counts || {}), ...(await r.json()) }
    emit()
  } catch { /* offline or no API: keep what we have */ }
}

let started = false
let firstLoad = null // resolves after the first fetch: tells us whether the API exists
const start = () => {
  if (started || typeof window === 'undefined') return firstLoad
  started = true
  firstLoad = refresh()
  setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 10_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh() })
  return firstLoad
}

export function useViews() {
  const [c, setC] = useState(counts)
  useEffect(() => { start(); subs.add(setC); return () => subs.delete(setC) }, [])
  return c
}

// One view per photo per visit (refreshing the page doesn't inflate it).
export async function countView(id) {
  await start()
  if (!counts) return // no API here (e.g. plain `vite` dev): don't send anything
  const key = `viewed:${id}`
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1') } catch { /* storage blocked: still count */ }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
      if (r.ok) {
        const { views } = await r.json()
        counts = { ...(counts || {}), [id]: views }
        return emit()
      }
      if (r.status !== 409) return // only "busy" is worth retrying
    } catch { return }
    await new Promise((res) => setTimeout(res, 800))
  }
}

const fmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
export const formatViews = (n) => fmt.format(n)
