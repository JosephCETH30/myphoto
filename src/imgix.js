const BASE = 'https://photoyoseph.imgix.net/'
// In dev, imgix can't reach your laptop, so load straight from public/thanks-for-coming/.
const LOCAL = import.meta.env.DEV

export const url = (path, params = {}) => {
  if (LOCAL) return `/thanks-for-coming/${encodeURIComponent(path)}`
  const u = new URL(encodeURIComponent(path), BASE)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return u.href
}

// Source defaults have auto format disabled, so request it per URL.
// Not auto=compress: imgix 404s some photos with format,compress at w=2000 (seen Nov 2026).
export const srcSet = (path, widths = [400, 700, 1000, 1400, 2000]) =>
  LOCAL ? undefined : widths.map((w) => `${url(path, { auto: 'format', w, q: 72 })} ${w}w`).join(', ')

// No resize params = untouched original; dl= makes imgix send Content-Disposition: attachment.
export const downloadUrl = (path) => (LOCAL ? url(path) : url(path, { dl: path }))

// If an imgix variant fails, retry once as the plain resized JPEG so the photo still shows.
export const imgFallback = (e) => {
  const img = e.currentTarget
  if (img.dataset.fallback || LOCAL) return
  img.dataset.fallback = '1'
  img.removeAttribute('srcset')
  const u = new URL(img.currentSrc || img.src)
  u.searchParams.delete('auto')
  u.searchParams.set('fm', 'jpg')
  img.src = u.href
}
