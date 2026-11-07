import { useEffect, useRef, useState } from 'react'
import { url, srcSet, downloadUrl, imgFallback } from './imgix.js'
import Magnet from './Magnet.jsx'
import { askDownload, downloadFile } from './Consent.jsx'

const big = (src) => url(src, { auto: 'format', w: 2000, q: 80 })
const pad = (x) => String(x).padStart(2, '0')

const Arrow = ({ flip }) => (
  <svg viewBox="0 0 24 24" className={`size-5 sm:size-6 ${flip ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
)

export default function Carousel({ photos, onOpen }) {
  const n = photos.length
  const [i, setI] = useState(0)
  const [gl, setGl] = useState(false)
  const canvas = useRef(null)
  const scene = useRef(null)
  const dir = useRef(1)
  const cur = useRef(0)
  cur.current = i

  const go = (d) => {
    if (n < 2) return
    dir.current = d
    setI((x) => (x + d + n) % n)
  }

  // Three.js loads on first interaction so it stays out of the initial page load.
  useEffect(() => {
    if (!n || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let dead = false
    const evts = ['pointermove', 'pointerdown', 'keydown']
    const once = () => {
      evts.forEach((e) => removeEventListener(e, once))
      import('./carouselScene.js').then((m) => {
        if (!dead) scene.current = m.default(canvas.current, big(photos[cur.current].src), () => setGl(true))
      })
    }
    evts.forEach((e) => addEventListener(e, once, { passive: true }))
    return () => {
      dead = true
      evts.forEach((e) => removeEventListener(e, once))
      scene.current?.dispose(); scene.current = null; setGl(false)
    }
  }, [photos, n])

  useEffect(() => {
    if (!n) return
    scene.current?.show(big(photos[i].src), dir.current)
    for (const d of [1, -1]) new Image().src = big(photos[(i + d + n) % n].src)
  }, [i, photos, n])

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  })

  const down = useRef(null)
  const onUp = (e) => {
    if (!down.current) return
    const dx = e.clientX - down.current.x
    down.current = null
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1) // swipe
    else onOpen(i) // tap/click = view full size
  }

  if (!n) return <p className="fixed inset-0 grid place-items-center text-sm text-paper/50">Add photos to public/thanks-for-coming</p>

  const p = photos[i]
  const side = 'hidden size-16 sm:grid lg:size-20'
  return (
    <section className="fixed inset-0 flex flex-col" aria-roledescription="carousel" aria-label="Photographs">
      <div className="mt-14 flex min-h-0 flex-1 items-center gap-[clamp(12px,3vw,48px)] px-gut">
        <Magnet className={side} onClick={() => go(-1)} aria-label="Previous photo"><Arrow flip /></Magnet>
        <div
          className="relative h-full min-w-0 flex-1 cursor-pointer touch-pan-y select-none"
          onPointerDown={(e) => (down.current = { x: e.clientX })} onPointerUp={onUp} onPointerCancel={() => (down.current = null)}
        >
          <div className="absolute inset-0">
            {!gl && (
              <img
                key={p.src} className="absolute inset-0 size-full object-contain"
                src={big(p.src)} srcSet={srcSet(p.src)} sizes="100vw"
                alt={p.title || `Photograph ${i + 1}`} fetchPriority="high" draggable={false} onError={imgFallback}
              />
            )}
            <canvas ref={canvas} aria-hidden="true" className={`absolute inset-0 size-full transition-opacity duration-500 ${gl ? 'opacity-100' : 'opacity-0'}`} />
          </div>
        </div>
        <Magnet className={side} onClick={() => go(1)} aria-label="Next photo"><Arrow /></Magnet>
      </div>
      <div className="flex h-16 items-center justify-between px-gut text-[13px] text-paper/55 tabular-nums sm:h-14">
        <span aria-live="polite">{pad(i + 1)} / {pad(n)}</span>
        <div className="flex gap-3 sm:hidden">
          <Magnet className="size-11" onClick={() => go(-1)} aria-label="Previous photo"><Arrow flip /></Magnet>
          <Magnet className="size-11" onClick={() => go(1)} aria-label="Next photo"><Arrow /></Magnet>
        </div>
        <button onClick={() => askDownload(() => downloadFile(downloadUrl(p.src)), p)} className="transition-colors hover:text-paper">Download</button>
      </div>
    </section>
  )
}
