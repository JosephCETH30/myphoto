const BASE = 'https://photoyoseph.imgix.net/'
// In dev, imgix can't reach your laptop, so load straight from public/thanks-for-coming/.
const LOCAL = import.meta.env.DEV

export const url = (path, params = {}) => {
  if (LOCAL) return `/thanks-for-coming/${encodeURIComponent(path)}`
  const u = new URL(encodeURIComponent(path), BASE)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return u.href
}

// Source defaults have auto format/compress disabled, so request them per URL.
export const srcSet = (path, widths = [400, 700, 1000, 1400, 2000]) =>
  LOCAL ? undefined : widths.map((w) => `${url(path, { auto: 'format,compress', w, q: 72 })} ${w}w`).join(', ')

// No resize params = untouched original; dl= makes imgix send Content-Disposition: attachment.
export const downloadUrl = (path) => (LOCAL ? url(path) : url(path, { dl: path }))
