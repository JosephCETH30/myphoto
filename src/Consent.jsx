import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { url } from './imgix.js'

const OWNER = 'Yoseph Rafael'
// Shown in the policy when set, e.g. 'hello@yosephrafael.com'.
const CONTACT = ''

let openModal = () => {}
// Every download goes through here. fn runs only after the visitor agrees.
// No fn = read-only policy. photo (optional) shows what is being downloaded.
export const askDownload = (fn, photo) => openModal(fn, photo)

export const downloadFile = (href) => {
  const a = Object.assign(document.createElement('a'), { href, download: '' })
  document.body.append(a)
  a.click()
  a.remove()
}

const ALLOWED = ['Personal use and prints for your home', 'Wallpapers and keepsakes', `Sharing with credit “Photo by ${OWNER}”`, 'Editing for yourself']
const NOT_ALLOWED = ['Commercial or client work', 'Selling or redistributing the files', 'Removing credit or claiming as yours', 'AI training and datasets']

const Icon = ({ ok }) => (
  <svg viewBox="0 0 16 16" className={`mt-[3px] size-3.5 shrink-0 ${ok ? 'text-paper' : 'text-dim'}`} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    {ok ? <path d="M3 8.5l3 3 7-7" /> : <path d="M4 4l8 8M12 4l-8 8" />}
  </svg>
)

export default function Consent() {
  const [req, setReq] = useState(null) // null = closed; { fn, photo } = open
  const [agreed, setAgreed] = useState(false)
  const backdrop = useRef(null)
  const panel = useRef(null)
  const first = useRef(null)
  const lastFocus = useRef(null)

  useEffect(() => {
    openModal = (fn, photo) => { lastFocus.current = document.activeElement; setAgreed(false); setReq({ fn, photo }) }
    return () => { openModal = () => {} }
  }, [])

  const close = (then) => {
    gsap.to(panel.current, { y: 24, opacity: 0, duration: 0.25, ease: 'power2.in' })
    gsap.to(backdrop.current, {
      opacity: 0, duration: 0.25,
      onComplete: () => { setReq(null); lastFocus.current?.focus?.(); then?.() },
    })
  }

  useLayoutEffect(() => {
    if (!req) return
    gsap.fromTo(backdrop.current, { opacity: 0 }, { opacity: 1, duration: 0.35 })
    gsap.fromTo(panel.current, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out' })
    gsap.fromTo(panel.current.querySelectorAll('[data-in]'), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', stagger: 0.05, delay: 0.08 })
    first.current?.focus({ preventScroll: true })
    // Capture phase so Escape closes only this modal, not the photo viewer underneath.
    const key = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close() } }
    addEventListener('keydown', key, true)
    const html = document.documentElement, prev = html.style.overflow
    html.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', key, true); html.style.overflow = prev }
  }, [req]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!req) return null
  const { fn, photo } = req
  const name = photo?.src.split('/').pop()
  const label = 'text-[11px] uppercase tracking-[.2em]'

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-gut" role="dialog" aria-modal="true" aria-labelledby="license-title">
      <div ref={backdrop} className="absolute inset-0 bg-ink/90" onClick={() => close()} />
      <div ref={panel} className="relative flex max-h-[92svh] w-full flex-col bg-ink ring-1 ring-paper/10 sm:max-w-[600px]">
        <button
          onClick={() => close()} aria-label="Close"
          className="absolute top-4 right-4 z-10 grid size-9 place-items-center rounded-full text-dim transition-colors hover:bg-paper/10 hover:text-paper"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        <div className="overflow-y-auto px-6 pt-6 pb-2 sm:px-10 sm:pt-10">
          {photo && (
            <div data-in className="mb-8 flex items-center gap-4 pr-10">
              <img src={url(photo.src, { auto: 'format', w: 160, h: 160, fit: 'crop' })} alt="" className="size-14 shrink-0 object-cover" />
              <div className="min-w-0">
                <p className={`${label} text-dim`}>{photo.edited ? 'Your edit of' : 'Downloading'}</p>
                <p className="mt-1 truncate text-sm text-paper">{name}</p>
              </div>
            </div>
          )}

          <h2 data-in id="license-title" className="pr-10 text-[28px] leading-[1.1] font-medium tracking-[-.02em] text-paper sm:text-[34px]">
            Free to download.<br /><span className="text-dim">Not free to sell.</span>
          </h2>
          <p data-in className="mt-4 max-w-md text-[15px] leading-relaxed text-paper/70">
            All photographs © {new Date().getFullYear()} {OWNER}. All rights reserved. Use them, love them, credit them.
          </p>

          <div data-in className="mt-8 grid gap-6 border-t border-paper/10 pt-6 sm:grid-cols-2 sm:gap-8">
            <div>
              <p className={`${label} text-paper`}>Allowed</p>
              <ul className="mt-3 space-y-2.5 text-[14px] leading-snug text-paper/80">
                {ALLOWED.map((t) => <li key={t} className="flex gap-2.5"><Icon ok />{t}</li>)}
              </ul>
            </div>
            <div>
              <p className={`${label} text-paper`}>Ask first</p>
              <ul className="mt-3 space-y-2.5 text-[14px] leading-snug text-paper/50">
                {NOT_ALLOWED.map((t) => <li key={t} className="flex gap-2.5"><Icon />{t}</li>)}
              </ul>
            </div>
          </div>

          <p data-in className="mt-8 text-[13px] leading-relaxed text-dim">
            Need a commercial license? Contact the photographer{CONTACT ? <> at <a className="text-paper underline underline-offset-4" href={`mailto:${CONTACT}`}>{CONTACT}</a></> : ''}.
            Misuse may lead to takedown requests or action under copyright law.
          </p>
        </div>

        <div className="px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-10 sm:pb-10">
          {fn ? (
            <>
              <label data-in className="group flex cursor-pointer items-center gap-3 text-[14px] text-paper select-none">
                <input ref={first} type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="peer sr-only" />
                <span className="grid size-5 shrink-0 place-items-center border border-paper/40 transition-colors group-hover:border-paper peer-checked:border-paper peer-checked:bg-paper peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-paper">
                  <svg viewBox="0 0 16 16" className={`size-3.5 text-ink transition-opacity ${agreed ? 'opacity-100' : 'opacity-0'}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>
                </span>
                I’ve read and agree to the copyright policy
              </label>
              <button
                onClick={() => close(fn)} disabled={!agreed} // no data-in: GSAP's inline opacity would hide the disabled state
                className="mt-5 flex w-full items-center justify-between bg-paper px-6 py-4 text-ink transition-[opacity,background-color] hover:bg-paper/85 disabled:cursor-not-allowed disabled:opacity-20"
              >
                <span className={label}>Agree &amp; download</span>
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 4v14M6 12l6 6 6-6M5 21h14" /></svg>
              </button>
            </>
          ) : (
            <button ref={first} data-in onClick={() => close()} className={`w-full bg-paper px-6 py-4 text-ink ${label}`}>Got it</button>
          )}
        </div>
      </div>
    </div>
  )
}
