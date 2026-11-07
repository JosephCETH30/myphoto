import { lazy, Suspense, useEffect, useState } from 'react'
import photos from './photos.js'
import Carousel from './Carousel.jsx'
import Gallery from './Gallery.jsx'
import Consent, { askDownload } from './Consent.jsx'
import { InAppSheet } from './InApp.jsx'
import Agreement, { openAgreement } from './Agreement.jsx'

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
      <header className="fixed inset-x-0 top-0 z-10 flex h-14 items-center justify-between px-gut text-sm mix-blend-difference">
        <a href="/" aria-label="Yoseph Photos — home" className="-ml-1.5">
          <img src="/logo/logo_atransumbaru_bgblack.png" alt="Yoseph Rafael" width="40" height="40" className="size-10" draggable={false} />
        </a>
        <nav className="flex items-center gap-3.5 sm:gap-5" aria-label="Site">
          <button onClick={() => askDownload()} className="text-paper/50 transition-colors hover:text-paper">
            <span className="sm:hidden">Copyright</span><span className="max-sm:hidden">Copyright policy</span>
          </button>
          <button onClick={openAgreement} className="text-paper/50 transition-colors hover:text-paper">Agreement</button>
          <span className="h-4 w-px bg-paper/25" aria-hidden="true" />
          {MODES.map((m) => (
            <button
              key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
              className={`capitalize transition-colors ${mode === m ? 'text-paper' : 'text-paper/50 hover:text-paper'}`}
            >{m}</button>
          ))}
        </nav>
      </header>
      {mode === 'carousel' ? (
        <main><Carousel photos={photos} onOpen={setOpen} /></main>
      ) : (
        <>
          <main><Gallery photos={photos} onOpen={setOpen} /></main>
          <footer className="flex justify-between px-gut py-12 text-[13px] text-paper/50">
            <span>© {new Date().getFullYear()} Yoseph Rafael</span>
            <button onClick={() => askDownload()} className="transition-colors hover:text-paper">Copyright policy</button>
          </footer>
        </>
      )}
      {open > -1 && (
        <Suspense fallback={null}>
          <Lightbox photos={photos} index={open} setIndex={setOpen} />
        </Suspense>
      )}
      <Consent />
      <Agreement />
      <InAppSheet />
    </>
  )
}
