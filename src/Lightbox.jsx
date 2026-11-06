import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { url, srcSet, downloadUrl, imgFallback } from './imgix.js'
import Magnet from './Magnet.jsx'
import { askDownload, downloadFile } from './Consent.jsx'
import { CONTROLS, GROUPS, ZERO } from './controls.js'
import Slider from './Slider.jsx'

const AdjustCanvas = lazy(() => import('./Editor.jsx'))

const FULL = { x: 0, y: 0, w: 1, h: 1 }
const ZMAX = 8
const MIN = 0.05
const ASPECTS = [['Free', 0], ['Original', -1], ['1:1', 1], ['4:5', 4 / 5], ['3:2', 3 / 2], ['16:9', 16 / 9], ['9:16', 9 / 16]]
const EASE = 'cubic-bezier(.2,.7,.2,1)'
const SIZE_T = `width .45s ${EASE}, height .45s ${EASE}`
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const pad = (x) => String(x).padStart(2, '0')
const isFull = (c) => c.x < 0.001 && c.y < 0.001 && c.w > 0.999 && c.h > 0.999
// Crop rect after rotating the photo 90° clockwise (all coords normalized 0..1).
const rotCrop = (c) => c && { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w }
// Largest centered rect with normalized aspect an (= w/h in 0..1 units).
const fitAspect = (an) => {
  const w = an >= 1 ? 1 : an, h = an >= 1 ? 1 / an : 1
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}
// Drag one corner of the crop; the opposite corner stays put. an = locked aspect or 0.
const resize = (corner, s, dx, dy, an) => {
  const L = corner.includes('l'), T = corner.includes('t')
  const fx = L ? s.x + s.w : s.x, fy = T ? s.y + s.h : s.y
  const mx = clamp((L ? s.x : s.x + s.w) + dx, 0, 1), my = clamp((T ? s.y : s.y + s.h) + dy, 0, 1)
  let w = Math.max(Math.abs(mx - fx), MIN), h = Math.max(Math.abs(my - fy), MIN)
  if (an) { if (w / h > an) w = h * an; else h = w / an }
  const x = clamp(L ? fx - w : fx, 0, 1 - w), y = clamp(T ? fy - h : fy, 0, 1 - h)
  return { x, y, w, h }
}
const loadImg = (src) => new Promise((res, rej) => {
  const im = new Image()
  im.crossOrigin = 'anonymous'
  im.onload = () => res(im)
  im.onerror = rej
  im.src = src
})

const Icon = ({ d, children, className = 'size-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d && <path d={d} />}{children}
  </svg>
)
const I = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  rotate: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5',
  crop: 'M6 2v16h16M2 6h16v16',
  reset: 'M4 4v5h5M4.6 15A8 8 0 1 0 6 7.3L4 9',
  save: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  prev: 'M20 12H4M10 6l-6 6 6 6',
  next: 'M4 12h16M14 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
}
const AdjustIcon = () => (
  <Icon d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2">
    <circle cx="14" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="16" cy="18" r="2" />
  </Icon>
)

// Icon button with a hover label (desktop). tip = side the label appears on.
function Tool({ label, tip = 'left', active, className = '', children, ...props }) {
  const look = active ? 'bg-paper text-ink' : 'text-paper/70 hover:bg-paper/10 hover:text-paper'
  return (
    <button aria-label={label} aria-pressed={active} className={`group relative grid size-11 shrink-0 place-items-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-25 ${look} ${className}`} {...props}>
      {children}
      <span className={`pointer-events-none absolute top-1/2 z-20 hidden -translate-y-1/2 bg-paper px-2 py-1 text-[10px] whitespace-nowrap uppercase tracking-[.15em] text-ink opacity-0 transition-opacity group-hover:opacity-100 lg:block ${tip === 'left' ? 'right-full mr-3' : 'left-full ml-3'}`}>
        {label}
      </span>
    </button>
  )
}

const chip = (on) => `rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[.15em] transition-colors ${on ? 'border-paper bg-paper text-ink' : 'border-paper/20 text-paper/70 hover:border-paper/60 hover:text-paper'}`
const label = 'text-[11px] uppercase tracking-[.2em]'

export default function Lightbox({ photos, index, setIndex }) {
  const n = photos.length
  const p = photos[index]
  const [show, setShow] = useState(true)
  const close = () => setShow(false)

  const stage = useRef(null)
  const viewEl = useRef(null)
  const canvasRef = useRef(null)
  const glApi = useRef(null)
  const [box, setBox] = useState({ W: 0, H: 0 })
  const [nat, setNat] = useState(null) // photo's natural size (aspect is what matters)
  // Zoom/pan lives in a ref and is written straight to the DOM (no React render per move); zc = committed zoom for the UI.
  const v = useRef({ z: 1, x: 0, y: 0 })
  const animate = useRef(true)
  const [zc, setZc] = useState(1)
  const [r, setR] = useState(0) // degrees, keeps growing so the rotation always animates clockwise
  const [crop, setCrop] = useState(null)
  const [draft, setDraft] = useState(null) // non-null = crop mode
  const [aspect, setAspect] = useState(0)
  const [panel, setPanel] = useState(null) // 'adjust' | null
  const [vals, setVals] = useState(ZERO)
  const [before, setBefore] = useState(false)
  const [ctl, setCtl] = useState('exposure') // mobile: the one control being edited
  const [glReady, setGlReady] = useState(false)
  const [saving, setSaving] = useState(false)

  // New photo = fresh start.
  useEffect(() => {
    setNat(null); setR(0); setCrop(null); setDraft(null); setVals(ZERO); setGlReady(false)
    v.current = { z: 1, x: 0, y: 0 }; setZc(1)
  }, [p.src])

  useLayoutEffect(() => {
    const el = stage.current
    const ro = new ResizeObserver(() => setBox({ W: el.clientWidth, H: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const adjusted = CONTROLS.some(([k]) => vals[k] !== 0)
  const useGl = adjusted || panel === 'adjust'
  useEffect(() => { if (!useGl) setGlReady(false) }, [useGl])
  const cropping = !!draft
  const edited = adjusted || !!crop || r % 360 !== 0

  // Layout: the visible (rotated, cropped) photo is fit into the stage; k = screen px per photo px.
  const rot = ((r % 360) + 360) % 360
  const side = rot % 180 !== 0
  const RW = nat ? (side ? nat.h : nat.w) : 1
  const RH = nat ? (side ? nat.w : nat.h) : 1
  const c = cropping ? FULL : crop || FULL
  const mobile = box.W < 640
  const PAD = mobile ? 12 : cropping ? 48 : 32
  const TOP = PAD
  const BOT = PAD
  const AH = box.H - TOP - BOT // usable height
  const k = nat && box.W ? Math.max(0, Math.min((box.W - 2 * PAD) / (c.w * RW), AH / (c.h * RH))) : 0
  const VW = c.w * RW * k, VH = c.h * RH * k
  const oy = 0
  const zb = zc > 3 ? 4 : zc > 1.5 ? 2 : 1 // re-pick image resolution only at these zoom steps
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const longSide = nat ? Math.ceil(Math.max(nat.w, nat.h) * k * zb) : 0
  const a = aspect === -1 ? RW / RH : aspect
  const an = a ? (a * RH) / RW : 0

  const limit = (z, x, y) => {
    const mx = Math.max(0, (VW * z - box.W) / 2), my = Math.max(0, (VH * z - AH) / 2)
    return { z, x: clamp(x, -mx, mx), y: clamp(y, -my, my) }
  }
  const paint = () => {
    const el = viewEl.current
    if (!el) return
    const { z, x, y } = v.current
    el.style.transition = animate.current ? `transform .45s ${EASE}, ${SIZE_T}` : SIZE_T
    el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y + oy}px) scale(${z})`
  }
  const commitTimer = useRef(0)
  const commit = (later) => {
    clearTimeout(commitTimer.current)
    if (later) commitTimer.current = setTimeout(() => setZc(v.current.z), 150)
    else setZc(v.current.z)
  }
  const setV = (z, x, y, anim, later) => {
    v.current = limit(z, x, y)
    animate.current = anim
    paint()
    commit(later)
  }
  // Zoom keeping the point (px, py) — relative to the stage center — under the cursor.
  const zoom = (to, px = 0, py = 0, anim = true, later = false) => {
    const o = v.current
    const z = clamp(typeof to === 'function' ? to(o.z) : to, 1, ZMAX), f = z / o.z
    setV(z, px - (px - o.x) * f, py - oy - (py - oy - o.y) * f, anim, later)
  }
  const fit = () => setV(1, 0, 0, true)
  // After each render (resize, rotate, crop): keep the pan inside the new bounds and re-apply.
  useLayoutEffect(() => {
    v.current = limit(v.current.z, v.current.x, v.current.y)
    paint()
  })

  const go = (d) => { if (cropping || n < 2) return; setIndex((index + d + n) % n) }
  const rotate = () => {
    setR((x) => x + 90); setCrop(rotCrop); setDraft(rotCrop); setAspect(0); fit()
  }
  const startCrop = () => {
    if (cropping) return setDraft(null)
    setPanel(null); fit(); setAspect(0); setDraft(crop || FULL)
  }
  const applyCrop = () => { setCrop(isFull(draft) ? null : draft); setDraft(null) }
  const resetAll = () => { setR(0); setCrop(null); setDraft(null); setVals(ZERO); fit() }
  const pickAspect = (v) => {
    setAspect(v)
    const av = v === -1 ? RW / RH : v
    if (av) setDraft(fitAspect((av * RH) / RW))
  }

  // ---- export: (adjusted canvas or full-res original) → rotate → crop → JPEG
  const save = async () => {
    setSaving(true)
    try {
      const src = adjusted && glApi.current
        ? glApi.current.snapshot()
        : await loadImg(url(p.src, { fit: 'max', w: 8192, h: 8192, q: 95 }))
      const W0 = src.naturalWidth || src.width, H0 = src.naturalHeight || src.height
      const RW0 = side ? H0 : W0, RH0 = side ? W0 : H0
      const cc = crop || FULL
      const ow = cc.w * RW0, oh = cc.h * RH0
      const sc = Math.min(1, Math.sqrt(16e6 / (ow * oh))) // iOS Safari refuses canvases over ~16.7MP
      const out = document.createElement('canvas')
      out.width = Math.round(ow * sc); out.height = Math.round(oh * sc)
      const g = out.getContext('2d')
      g.imageSmoothingQuality = 'high'
      g.scale(sc, sc)
      g.translate(-cc.x * RW0 + RW0 / 2, -cc.y * RH0 + RH0 / 2)
      g.rotate((rot * Math.PI) / 180)
      g.drawImage(src, -W0 / 2, -H0 / 2)
      const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.95))
      if (!blob) throw new Error('export failed')
      const link = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: p.src.split('/').pop().replace(/\.\w+$/, '') + '-edited.jpg',
      })
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 2000)
    } catch {
      alert('Could not save this photo. Try another browser.')
    }
    setSaving(false)
  }
  // Edited → export the edit; untouched → the original file.
  const saveAndDownload = () => edited
    ? askDownload(save, { ...p, edited: true })
    : askDownload(() => downloadFile(downloadUrl(p.src)), p)
  const saveDisabled = cropping || saving || (adjusted && !glReady)

  // Unsaved edits: the browser asks before refresh / closing the tab (it shows its own wording).
  useEffect(() => {
    if (!edited) return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [edited])

  // ---- gestures on the stage: drag = pan (or swipe when not zoomed), pinch = zoom, double-tap = zoom toggle
  const pts = useRef(new Map())
  const gest = useRef(null)
  const lastTap = useRef(0)
  const rel = (e) => {
    const b = stage.current.getBoundingClientRect()
    return [e.clientX - b.left - b.width / 2, e.clientY - b.top - b.height / 2]
  }
  const begin = () => {
    const q = [...pts.current.values()], o = v.current
    if (q.length >= 2) {
      gest.current = { type: 'pinch', d0: Math.hypot(q[0][0] - q[1][0], q[0][1] - q[1][1]) || 1, z0: o.z, m: [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2 - oy], x0: o.x, y0: o.y }
    } else if (q.length === 1) {
      gest.current = { type: 'pan', s: q[0], x0: o.x, y0: o.y, dx: 0, dy: 0, moved: 0 }
    } else gest.current = null
  }
  const onDown = (e) => {
    if (cropping || e.button > 0) return
    stage.current.setPointerCapture(e.pointerId)
    pts.current.set(e.pointerId, rel(e))
    begin()
  }
  const onMove = (e) => {
    if (!pts.current.has(e.pointerId)) return
    pts.current.set(e.pointerId, rel(e))
    const q = [...pts.current.values()], G = gest.current
    if (!G) return
    if (G.type === 'pinch' && q.length >= 2) {
      const z = clamp((G.z0 * Math.hypot(q[0][0] - q[1][0], q[0][1] - q[1][1])) / G.d0, 1, ZMAX), f = z / G.z0
      const m = [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2 - oy]
      setV(z, m[0] - (G.m[0] - G.x0) * f, m[1] - (G.m[1] - G.y0) * f, false, true)
    } else if (G.type === 'pan') {
      G.dx = q[0][0] - G.s[0]; G.dy = q[0][1] - G.s[1]
      G.moved = Math.max(G.moved, Math.hypot(G.dx, G.dy))
      if (v.current.z > 1.001) setV(v.current.z, G.x0 + G.dx, G.y0 + G.dy, false, true)
    }
  }
  const onUp = (e) => {
    if (!pts.current.has(e.pointerId)) return
    const G = gest.current, at = pts.current.get(e.pointerId)
    pts.current.delete(e.pointerId)
    if (G?.type === 'pan') {
      if (v.current.z <= 1.001 && Math.abs(G.dx) > 60 && Math.abs(G.dx) > Math.abs(G.dy)) go(G.dx < 0 ? 1 : -1)
      else if (G.moved < 8) {
        const now = performance.now()
        if (now - lastTap.current < 300) { v.current.z > 1.001 ? fit() : zoom(2.5, at[0], at[1]); lastTap.current = 0 }
        else lastTap.current = now
      }
    }
    commit()
    begin() // pinch → pan with the finger that's left
  }

  // Wheel / trackpad pinch zoom. Native listener: React's wheel handler is passive and can't stop page zoom.
  useEffect(() => {
    const el = stage.current
    const wheel = (e) => {
      e.preventDefault()
      if (cropping) return
      const [px, py] = rel(e)
      zoom((z) => z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), px, py, false, true)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  })

  // ---- crop box dragging
  const cd = useRef(null)
  const grab = (mode) => (e) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    cd.current = { mode, sx: e.clientX, sy: e.clientY, s: draft }
  }
  const drag = (e) => {
    const C = cd.current
    if (!C) return
    const dx = (e.clientX - C.sx) / VW, dy = (e.clientY - C.sy) / VH
    setDraft(C.mode === 'move'
      ? { ...C.s, x: clamp(C.s.x + dx, 0, 1 - C.s.w), y: clamp(C.s.y + dy, 0, 1 - C.s.h) }
      : resize(C.mode, C.s, dx, dy, an))
  }
  const drop = () => { cd.current = null }

  // ---- keyboard
  useEffect(() => {
    const key = (e) => {
      if (e.target.closest?.('input')) return // sliders use arrow keys
      const k2 = e.key, z1 = v.current.z <= 1.001
      if (k2 === 'Escape') cropping ? setDraft(null) : panel ? setPanel(null) : close()
      else if (k2 === 'Enter' && cropping) applyCrop()
      else if (k2 === 'ArrowRight' && z1) go(1)
      else if (k2 === 'ArrowLeft' && z1) go(-1)
      else if ((k2 === '+' || k2 === '=') && !cropping) zoom((z) => z * 1.5)
      else if (k2 === '-' && !cropping) zoom((z) => z / 1.5)
      else if (k2 === '0') fit()
      else if (k2 === 'r' || k2 === 'R') rotate()
      else if (k2 === 'c' || k2 === 'C') startCrop()
    }
    addEventListener('keydown', key)
    document.documentElement.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', key); document.documentElement.style.overflow = '' }
  })
  useEffect(() => {
    for (const d of [1, -1]) new Image().src = url(photos[(index + d + n) % n].src, { auto: 'format', w: 2400, q: 85 })
  }, [index, n, photos])

  const t = (props) => props.map((x) => `${x} .45s ${EASE}`).join(', ')
  const imgProps = {
    src: url(p.src, { auto: 'format', w: 2400, q: 85 }),
    srcSet: srcSet(p.src, [1200, 2000, 2800, 3600]),
    alt: p.title || `Photograph ${index + 1}`,
    draggable: false,
    onError: imgFallback,
  }

  return (
    <AnimatePresence onExitComplete={() => setIndex(-1)}>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col bg-ink outline-none lg:flex-row" tabIndex={-1} autoFocus role="dialog" aria-modal="true" aria-label="Photo viewer"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
        >
          {/* Left sidebar (desktop) / top bar (mobile) */}
          <nav className="relative z-10 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-2 border-b border-paper/10 px-3 pt-[env(safe-area-inset-top)] lg:h-auto lg:w-20 lg:flex-col lg:justify-start lg:border-r lg:border-b-0 lg:px-0 lg:py-gut">
            <Magnet look="accent" strength={0.3} className="size-11" onClick={close} aria-label="Close">
              <Icon d={I.close} className="size-4" />
            </Magnet>
            <div className="flex items-center gap-1 lg:my-auto lg:flex-col lg:gap-4">
              <Tool className="hidden lg:grid" label="Previous" tip="right" onClick={() => go(-1)} disabled={n < 2 || cropping}><Icon d={I.prev} /></Tool>
              <span className={`${label} text-paper tabular-nums lg:[writing-mode:vertical-rl]`}>{pad(index + 1)} / {pad(n)}</span>
              <Tool className="hidden lg:grid" label="Next" tip="right" onClick={() => go(1)} disabled={n < 2 || cropping}><Icon d={I.next} /></Tool>
            </div>
            <SaveButton className="relative lg:hidden" onClick={saveAndDownload} disabled={saveDisabled} saving={saving} />
          </nav>

          {/* Photo */}
          <div
            ref={stage}
            className={`relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden select-none ${zc > 1.001 ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          >
            <motion.div key={p.src} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
              {!nat ? (
                <img {...imgProps} sizes="100vw" className="absolute object-contain" style={{ left: PAD, top: TOP, width: Math.max(0, box.W - 2 * PAD), height: Math.max(0, AH) }}
                  onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
              ) : (
                <div ref={viewEl} className="absolute top-1/2 left-1/2 overflow-hidden" style={{ width: VW, height: VH }}>
                  <div className="absolute" style={{ left: -c.x * RW * k, top: -c.y * RH * k, width: RW * k, height: RH * k, transition: t(['left', 'top', 'width', 'height']) }}>
                    <div
                      className="absolute top-1/2 left-1/2"
                      style={{ width: nat.w * k, height: nat.h * k, transform: `translate(-50%, -50%) rotate(${r}deg)`, transition: t(['transform', 'width', 'height']) }}
                    >
                      <img {...imgProps} sizes={`${longSide}px`} decoding="async" className={`absolute inset-0 size-full ${useGl && glReady ? 'opacity-0' : ''}`} />
                      {useGl && (
                        <Suspense fallback={null}>
                          <AdjustCanvas src={p.src} values={vals} before={before} res={Math.ceil(longSide * dpr)} canvasRef={canvasRef} apiRef={glApi} onReady={() => setGlReady(true)} />
                        </Suspense>
                      )}
                    </div>
                  </div>

                  {cropping && (
                    <div
                      className="absolute cursor-move outline outline-1 outline-paper"
                      style={{ left: draft.x * VW, top: draft.y * VH, width: draft.w * VW, height: draft.h * VH, boxShadow: '0 0 0 9999px rgb(0 0 0 / .62)' }}
                      onPointerDown={grab('move')} onPointerMove={drag} onPointerUp={drop} onPointerCancel={drop}
                    >
                      {[1, 2].map((j) => (
                        <span key={j}>
                          <span className="pointer-events-none absolute inset-y-0 w-px bg-paper/30" style={{ left: `${(j * 100) / 3}%` }} />
                          <span className="pointer-events-none absolute inset-x-0 h-px bg-paper/30" style={{ top: `${(j * 100) / 3}%` }} />
                        </span>
                      ))}
                      {['tl', 'tr', 'bl', 'br'].map((h) => (
                        <span
                          key={h}
                          onPointerDown={grab(h)} onPointerMove={drag} onPointerUp={drop} onPointerCancel={drop}
                          className={`absolute size-7 ${h[0] === 't' ? 'top-0' : 'bottom-0'} ${h[1] === 'l' ? 'left-0' : 'right-0'} ${h === 'tr' || h === 'bl' ? 'cursor-nesw-resize' : 'cursor-nwse-resize'}`}
                        >
                          <span className={`absolute size-4 border-paper ${h[0] === 't' ? 'top-0 border-t-2' : 'bottom-0 border-b-2'} ${h[1] === 'l' ? 'left-0 border-l-2' : 'right-0 border-r-2'}`} />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>

          {/* Tool panel: crop presets or adjustment sliders */}
          <AnimatePresence initial={false}>
            {(cropping || panel === 'adjust') && (
              <motion.aside
                key={cropping ? 'crop' : 'adjust'}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                className="shrink-0 overflow-y-auto border-t border-paper/10 px-gut py-4 lg:max-h-none lg:w-72 lg:border-t-0 lg:border-l lg:py-gut"
              >
                {cropping ? (
                  <>
                    <p className={`${label} text-dim`}>Crop</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {ASPECTS.map(([name, v]) => <button key={name} className={chip(aspect === v)} onClick={() => pickAspect(v)}>{name}</button>)}
                    </div>
                    <p className="mt-4 hidden text-[13px] leading-relaxed text-dim lg:block">Drag the corners or move the box. Enter to apply, Esc to cancel.</p>
                    <div className="mt-5 flex gap-2">
                      <button className="flex-1 rounded-full border border-paper/25 px-4 py-3 text-[11px] uppercase tracking-[.2em] text-paper transition-colors hover:border-paper" onClick={() => setDraft(null)}>Cancel</button>
                      <button className="flex-1 rounded-full bg-paper px-4 py-3 text-[11px] uppercase tracking-[.2em] text-ink transition-opacity hover:opacity-85" onClick={applyCrop}>Apply</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className={`${label} text-dim`}>Adjust</p>
                      <div className="flex gap-4">
                        <button
                          className={`${label} text-dim transition-colors hover:text-paper select-none`}
                          onPointerDown={() => setBefore(true)} onPointerUp={() => setBefore(false)} onPointerLeave={() => setBefore(false)}
                          onContextMenu={(e) => e.preventDefault()}
                        >Before</button>
                        <button className={`${label} text-dim transition-colors hover:text-paper disabled:opacity-30`} disabled={!adjusted} onClick={() => setVals(ZERO)}>Reset</button>
                      </div>
                    </div>
                    {/* Mobile: pick a control from the chips, edit it with one big slider */}
                    {(() => {
                      const [key, name, , min = -100] = CONTROLS.find((x) => x[0] === ctl)
                      return (
                        <div className="lg:hidden">
                          <div className="mt-3 flex items-baseline justify-between">
                            <span className={`${label} text-paper`}>{name}</span>
                            <span className="text-sm text-paper tabular-nums">{vals[key] > 0 && min < 0 ? '+' : ''}{vals[key]}</span>
                          </div>
                          <Slider big label={name} min={min} value={vals[key]} onChange={(n) => setVals((x) => ({ ...x, [key]: n }))} />
                          <div className="-mx-gut flex gap-2 overflow-x-auto px-gut pt-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {CONTROLS.map(([k2, n2]) => (
                              <button key={k2} onClick={() => setCtl(k2)} className={`relative shrink-0 ${chip(ctl === k2)}`}>
                                {n2}
                                {vals[k2] !== 0 && <span className={`absolute -top-0.5 -right-0.5 size-2 rounded-full ${ctl === k2 ? 'bg-accent' : 'bg-paper'}`} />}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                    {/* Desktop: everything, grouped */}
                    <div className="hidden lg:block">
                      {GROUPS.map((g) => (
                        <section key={g} className="mt-5 border-t border-paper/10 pt-4 first:border-t-0 first:pt-1">
                          <p className="mb-1 text-[10px] uppercase tracking-[.25em] text-paper">{g}</p>
                          {CONTROLS.filter((x) => x[2] === g).map(([key, name, , min = -100]) => (
                            <div key={key} className="py-1">
                              <span className={`flex justify-between ${label} text-dim`}>
                                <span>{name}</span>
                                <span className="text-paper tabular-nums">{vals[key] > 0 && min < 0 ? '+' : ''}{vals[key]}</span>
                              </span>
                              <Slider label={name} min={min} value={vals[key]} onChange={(n) => setVals((x) => ({ ...x, [key]: n }))} />
                            </div>
                          ))}
                        </section>
                      ))}
                    </div>
                    {!glReady && <p className={`mt-2 ${label} text-dim`}>Loading full resolution…</p>}
                  </>
                )}
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Tool rail: right (desktop) / bottom (mobile) */}
          <div className="relative z-10 flex shrink-0 items-center justify-center gap-2 border-t border-paper/10 px-3 pt-2 pb-[max(.75rem,env(safe-area-inset-bottom))] lg:h-auto lg:w-20 lg:flex-col lg:justify-between lg:border-t-0 lg:border-l lg:px-0 lg:py-gut">
            {/* Desktop: save sits at the top, level with Close on the left */}
            <SaveButton className="max-lg:hidden" onClick={saveAndDownload} disabled={saveDisabled} saving={saving} />
            <div className="contents lg:flex lg:flex-col lg:items-center lg:gap-2">
            <Tool className="hidden lg:grid" label="Zoom in (+)" onClick={() => zoom((z) => z * 1.5)} disabled={cropping || zc >= ZMAX}><Icon d={I.plus} /></Tool>
            <span className={`hidden w-12 text-center text-[10px] tracking-[.1em] text-dim tabular-nums lg:block`}>{Math.round(zc * 100)}%</span>
            <Tool className="hidden lg:grid" label="Zoom out (−)" onClick={() => zoom((z) => z / 1.5)} disabled={cropping || zc <= 1.001}><Icon d={I.minus} /></Tool>
            <Tool className="hidden lg:grid" label="Fit (0)" onClick={fit} disabled={zc <= 1.001}><Icon d={I.fit} /></Tool>
            <span className="hidden h-px w-6 shrink-0 bg-paper/10 lg:my-1 lg:block" />
            <Tool label="Rotate (R)" onClick={rotate}><Icon d={I.rotate} /></Tool>
            <Tool label="Crop (C)" active={cropping} onClick={startCrop}><Icon d={I.crop} /></Tool>
            <Tool label="Adjust" active={panel === 'adjust'} onClick={() => { setDraft(null); setPanel((x) => (x === 'adjust' ? null : 'adjust')) }}><AdjustIcon /></Tool>
            <span className="mx-1 h-6 w-px shrink-0 bg-paper/10 lg:mx-0 lg:my-1 lg:h-px lg:w-6" />
            <Tool label="Reset edits" onClick={resetAll} disabled={!edited}><Icon d={I.reset} /></Tool>
            </div>
            <span className="hidden size-11 lg:block" aria-hidden="true" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SaveButton({ className = '', saving, ...props }) {
  return (
    <button
      aria-label="Save & Download"
      className={`group grid size-11 shrink-0 place-items-center rounded-full bg-paper text-ink transition-[background-color,opacity] hover:bg-paper/80 disabled:opacity-40 ${className}`}
      {...props}
    >
      <Icon d={I.save} className={`size-5 ${saving ? 'animate-pulse' : ''}`} />
      <span className="pointer-events-none absolute top-1/2 right-full mr-3 hidden -translate-y-1/2 bg-paper px-2 py-1 text-[10px] whitespace-nowrap uppercase tracking-[.15em] text-ink opacity-0 transition-opacity group-hover:opacity-100 lg:block">
        {saving ? 'Saving…' : 'Save & Download'}
      </span>
    </button>
  )
}
