import { lazy, Suspense, useEffect, useState } from 'react'
import photos from './photos.js'
import Carousel from './Carousel.jsx'
import Gallery from './Gallery.jsx'
import Consent, { askDownload } from './Consent.jsx'

const Lightbox = lazy(() => import('./Lightbox.jsx'))
const MODES = ['carousel', 'grid']

export default function App() {
  const [mode, setMode] = useState(() => {
    try { return MODES.includes(localStorage.mode) ? localStorage.mode : 'carousel' } catch { return 'carousel' }
  })
  const [open, setOpen] = useState(-1)

  useEffect(() => {
    try { localStorage.mode = mode } catch { /* private mode */ }
    scrollTo(0, 0)
  }, [mode])

  return (
    <>
      <h1 className="sr-only">Yoseph Photos</h1>
      <header className="fixed inset-x-0 top-0 z-10 flex h-14 items-center justify-between px-gut text-[11px] uppercase tracking-[.2em] mix-blend-difference">
        <span>Yoseph Rafael</span>
        <nav className="flex gap-5" aria-label="View">
          {MODES.map((m) => (
            <button
              key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
              className={`uppercase tracking-[.2em] transition-colors ${mode === m ? 'text-paper' : 'text-dim hover:text-paper'}`}
            >{m}</button>
          ))}
        </nav>
      </header>
      {mode === 'carousel' ? (
        <main><Carousel photos={photos} onOpen={setOpen} /></main>
      ) : (
        <>
          <main><Gallery photos={photos} onOpen={setOpen} /></main>
          <footer className="flex justify-between px-gut py-12 text-[11px] uppercase tracking-[.2em] text-dim">
            <span>© {new Date().getFullYear()} Yoseph Rafael</span>
            <button onClick={() => askDownload()} className="uppercase tracking-[.2em] transition-colors hover:text-paper">Copyright policy</button>
          </footer>
        </>
      )}
      {open > -1 && (
        <Suspense fallback={null}>
          <Lightbox photos={photos} index={open} setIndex={setOpen} />
        </Suspense>
      )}
      <Consent />
    </>
  )
}
