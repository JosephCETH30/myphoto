// View counter: GET /api/views → { "photo.jpg": 123, … }, POST /api/views { id } → { id, views }.
// Counts live in Netlify Blobs (one entry per photo). Increments use ETag-conditional writes,
// so simultaneous views never overwrite each other.
import { getStore } from '@netlify/blobs'

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

// Only photos that are actually on the site can be counted (list is generated at build: /photos.json).
let cache = { at: 0, list: null }
async function allowedPhotos(origin) {
  if (cache.list && Date.now() - cache.at < 60_000) return cache.list
  const r = await fetch(`${origin}/photos.json`)
  if (!r.ok) throw new Error(`photo list unavailable (${r.status})`)
  cache = { at: Date.now(), list: new Set(await r.json()) }
  return cache.list
}

export async function handle(req, { store, allowed }) {
  if (req.method === 'GET') {
    const { blobs } = await store.list()
    const out = {}
    await Promise.all(blobs.map(async ({ key }) => {
      const id = decodeURIComponent(key)
      if (allowed.has(id)) out[id] = Number(await store.get(key, { type: 'text' })) || 0
    }))
    return json(out)
  }
  if (req.method === 'POST') {
    let id
    try { ({ id } = await req.json()) } catch { return json({ error: 'invalid body' }, 400) }
    if (typeof id !== 'string' || !allowed.has(id)) return json({ error: 'unknown photo' }, 400)
    const key = encodeURIComponent(id)
    for (let attempt = 0; attempt < 10; attempt++) {
      const cur = await store.getWithMetadata(key, { type: 'text' })
      const views = (Number(cur?.data) || 0) + 1
      // Conditional write: fails (modified: false) if someone else updated it since we read it.
      // (If a read ever comes back without an ETag, write anyway: a rare lost view beats a lost counter.)
      const res = await store.set(key, String(views), !cur ? { onlyIfNew: true } : cur.etag ? { onlyIfMatch: cur.etag } : {})
      if (res.modified) return json({ id, views })
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 60)) // someone else wrote first: retry
    }
    return json({ error: 'busy, try again' }, 409)
  }
  return json({ error: 'method not allowed' }, 405)
}

export default async (req) => {
  try {
    return await handle(req, {
      store: getStore({ name: 'views', consistency: 'strong' }),
      allowed: await allowedPhotos(new URL(req.url).origin),
    })
  } catch (err) {
    console.error('views', err)
    return json({ error: 'unavailable' }, 503)
  }
}

export const config = { path: '/api/views' }
