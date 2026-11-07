import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'

const OWNER = 'Yoseph Rafael'

let open = () => {}
export const openAgreement = () => open()

// The photographer's own promise: photos taken in public are never sold, and are free to download.
const POINTS = [
  'I will never sell the photos I take in public. Not as prints, not as stock, not as licenses.',
  'Every photo on this site is free to download.',
  'The only condition: don’t sell them either, edited or not.',
]

export default function Agreement() {
  const [shown, setShown] = useState(false)
  const backdrop = useRef(null)
  const panel = useRef(null)
  const closeBtn = useRef(null)
  const lastFocus = useRef(null)

  useEffect(() => {
    open = () => { lastFocus.current = document.activeElement; setShown(true) }
    return () => { open = () => {} }
  }, [])

  const close = () => {
    gsap.to(panel.current, { y: 24, opacity: 0, duration: 0.25, ease: 'power2.in' })
    gsap.to(backdrop.current, { opacity: 0, duration: 0.25, onComplete: () => { setShown(false); lastFocus.current?.focus?.() } })
  }

  useLayoutEffect(() => {
    if (!shown) return
    gsap.fromTo(backdrop.current, { opacity: 0 }, { opacity: 1, duration: 0.35 })
    gsap.fromTo(panel.current, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out' })
    closeBtn.current?.focus({ preventScroll: true })
    const key = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close() } }
    addEventListener('keydown', key, true)
    const html = document.documentElement, prev = html.style.overflow
    html.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', key, true); html.style.overflow = prev }
  }, [shown]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-gut" role="dialog" aria-modal="true" aria-labelledby="agreement-title">
      <div ref={backdrop} className="absolute inset-0 bg-ink/90" onClick={close} />
      <div ref={panel} className="relative w-full rounded-t-3xl border-t border-paper/10 bg-[#0b0b0b] px-6 pt-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-3xl sm:border sm:px-10 sm:py-10">
        <p className="text-[13px] text-paper/55">Agreement</p>
        <h2 id="agreement-title" className="mt-2 text-[26px] leading-[1.15] font-medium tracking-[-.02em] text-paper sm:text-[30px]">
          Free to download.<br /><span className="text-paper/45">Never for sale.</span>
        </h2>
        <p className="mt-5 text-[15px] leading-relaxed text-paper/70">I, {OWNER}, declare that:</p>
        <ol className="mt-3 space-y-3">
          {POINTS.map((t, i) => (
            <li key={t} className="flex gap-3 text-[15px] leading-relaxed text-paper/85">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-paper/[.08] text-[12px] text-paper">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[15px] text-paper">— {OWNER}</p>
        <button ref={closeBtn} onClick={close} className="mt-6 h-12 w-full rounded-full bg-paper text-[15px] font-medium text-ink transition-opacity hover:opacity-85">Close</button>
      </div>
    </div>
  )
}
