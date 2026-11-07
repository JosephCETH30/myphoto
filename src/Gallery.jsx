import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { url, srcSet, downloadUrl, imgFallback } from './imgix.js'
import { askDownload, downloadFile } from './Consent.jsx'

gsap.registerPlugin(ScrollTrigger)

export default function Gallery({ photos, onOpen }) {
  const root = useRef(null)

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set('.shot', { opacity: 0 })
      ScrollTrigger.batch('.shot', {
        start: 'top 92%',
        once: true,
        onEnter: (els) =>
          gsap.fromTo(els,
            { y: 40, opacity: 0 },
            { y: 0, opacity: 1, duration: 1.2, ease: 'expo.out', stagger: 0.08 }),
      })
    }, root)
    // Lazy images change column heights; re-measure trigger positions as they arrive.
    let t
    const refresh = () => { clearTimeout(t); t = setTimeout(() => ScrollTrigger.refresh(), 150) }
    root.current.addEventListener('load', refresh, true)
    const el = root.current
    return () => { ctx.revert(); el.removeEventListener('load', refresh, true); clearTimeout(t) }
  }, [photos])

  return (
    <section id="work" ref={root} className="px-gut pt-14">
      {photos.length === 0 ? (
        <p className="py-40 text-center text-sm text-paper/50">Add photos to public/thanks-for-coming</p>
      ) : (
        <div className="columns-1 gap-gut sm:columns-2 lg:columns-3">
          {photos.map((p, i) => (
            <figure key={p.src} className="shot group relative mb-gut break-inside-avoid">
              <button className="block w-full cursor-pointer overflow-hidden" onClick={() => onOpen(i)} aria-label={`Open ${p.title || `photo ${i + 1}`}`}>
                <img
                  src={url(p.src, { auto: 'format', w: 700, q: 72 })}
                  srcSet={srcSet(p.src)}
                  sizes="(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 33vw"
                  width={p.w} height={p.h}
                  loading={i < 3 ? 'eager' : 'lazy'}
                  decoding="async" onError={imgFallback}
                  alt={p.title || `Photograph ${i + 1}`}
                  className="h-auto min-h-[120px] w-full transition-[transform,opacity] duration-700 ease-out group-hover:scale-[1.02]"
                />
              </button>
              <button
                onClick={() => askDownload(() => downloadFile(downloadUrl(p.src)), p)} aria-label={`Download ${p.title || `photo ${i + 1}`}`}
                className="absolute right-2 bottom-2 rounded-full bg-ink/85 px-3 py-1.5 text-[13px] font-medium text-paper opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >Download</button>
            </figure>
          ))}
        </div>
      )}
    </section>
  )
}
