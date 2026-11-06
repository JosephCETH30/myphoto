import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { url, srcSet, downloadUrl } from './imgix.js'
import Magnet from './Magnet.jsx'
import { askDownload, downloadFile } from './Consent.jsx'

const Editor = lazy(() => import('./Editor.jsx'))

const variants = {
  enter: (dir) => ({ x: dir * 40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir * -40, opacity: 0 }),
}
const pad = (x) => String(x).padStart(2, '0')
const link = 'text-[11px] uppercase tracking-[.2em] text-dim transition-colors hover:text-paper aria-pressed:text-paper'

export default function Lightbox({ photos, index, setIndex }) {
  const [dir, setDir] = useState(0)
  const [show, setShow] = useState(true)
  const [edit, setEdit] = useState(false)
  const n = photos.length
  const p = photos[index]
  const go = (d) => { if (edit) return; setDir(d); setIndex((index + d + n) % n) }
  const close = () => setShow(false)
  const downX = useRef(0)

  useEffect(() => {
    const key = (e) => {
      if (e.target.closest?.('input')) return // let sliders use arrow keys
      if (e.key === 'Escape') edit ? setEdit(false) : close()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    addEventListener('keydown', key)
    document.documentElement.style.overflow = 'hidden'
    // Warm the neighbours so arrowing feels instant.
    for (const d of [1, -1]) new Image().src = url(photos[(index + d + n) % n].src, { auto: 'format,compress', w: 2400, q: 85 })
    return () => { removeEventListener('keydown', key); document.documentElement.style.overflow = '' }
  })

  return (
    <AnimatePresence onExitComplete={() => setIndex(-1)}>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 bg-ink outline-none" tabIndex={-1} autoFocus role="dialog" aria-modal="true" aria-label="Photo viewer"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          {edit ? (
            <Suspense fallback={null}><Editor key={p.src} photo={p} /></Suspense>
          ) : (
            <>
              <div className="absolute inset-x-0 top-16 bottom-0 grid place-items-center overflow-hidden">
                <AnimatePresence initial={false} custom={dir} mode="popLayout">
                  <motion.img
                    key={p.src}
                    custom={dir} variants={variants} initial="enter" animate="center" exit="exit"
                    transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
                    src={url(p.src, { auto: 'format,compress', w: 2400, q: 85 })}
                    srcSet={srcSet(p.src, [1200, 2000, 2800, 3600])}
                    sizes="100vw"
                    draggable={false}
                    className="size-full cursor-pointer touch-pan-y object-contain select-none"
                    alt={p.title || `Photograph ${index + 1}`}
                    drag={n > 1 ? 'x' : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.6}
                    onPointerDown={(e) => (downX.current = e.clientX)}
                    onClick={(e) => Math.abs(e.clientX - downX.current) < 10 && close()} // click closes; drag navigates
                    onDragEnd={(_, i) => { if (Math.abs(i.offset.x) > 80) go(i.offset.x < 0 ? 1 : -1) }}
                  />
                </AnimatePresence>
              </div>
              {n > 1 && (
                <>
                  <button className="absolute top-1/2 left-1 z-10 hidden -translate-y-1/2 p-6 text-lg text-paper mix-blend-difference sm:block" onClick={() => go(-1)} aria-label="Previous">←</button>
                  <button className="absolute top-1/2 right-1 z-10 hidden -translate-y-1/2 p-6 text-lg text-paper mix-blend-difference sm:block" onClick={() => go(1)} aria-label="Next">→</button>
                </>
              )}
            </>
          )}
          <div className="absolute inset-x-0 top-0 z-10 flex h-16 items-center gap-6 pr-[calc(var(--spacing-gut)+3.5rem)] pl-gut bg-ink text-[11px] tracking-[.2em] text-paper tabular-nums">
            <span className="mr-auto">{pad(index + 1)} / {pad(n)}</span>
            <button className={link} onClick={() => setEdit((x) => !x)} aria-pressed={edit}>{edit ? 'Done' : 'Edit'}</button>
            <button className={link} onClick={() => askDownload(() => downloadFile(downloadUrl(p.src)), p)}>Original</button>
          </div>
          <Magnet look="solid" strength={0.3} className="absolute top-3 right-gut z-20 size-11" onClick={close} aria-label="Close">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </Magnet>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
