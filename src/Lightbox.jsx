import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { url, srcSet, downloadUrl, imgFallback } from './imgix.js'
import Magnet from './Magnet.jsx'
import { askDownload, downloadFile } from './Consent.jsx'
import { CONTROLS, ALL_KEYS, GROUPS, ZERO, MASK_CONTROLS, MASK_GROUPS, MASK_ZERO, MAX_LAYERS, MAX_COMPS, flatComps } from './controls.js'
import Slider from './Slider.jsx'
import { PRESET_CATEGORIES, PRESET_COUNT } from './presets.js'

const AdjustCanvas = lazy(() => import('./Editor.jsx'))

const FULL = { x: 0, y: 0, w: 1, h: 1 }
const ZMAX = 8
const MIN = 0.05
const ASPECTS = [['Free', 0], ['Original', -1], ['1:1', 1], ['4:5', 4 / 5], ['3:2', 3 / 2], ['16:9', 16 / 9], ['9:16', 9 / 16]]
const EASE = 'cubic-bezier(.2,.7,.2,1)'
const SIZE_T = `width .45s ${EASE}, height .45s ${EASE}`
// Pointer capture can throw on iOS (e.g. pointer already gone); dragging must keep working without it.
const capture = (el, e) => { try { el.setPointerCapture(e.pointerId) } catch { /* ignore */ } }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
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
const copyCanvas = (cv) => {
  const o = Object.assign(document.createElement('canvas'), { width: cv.width, height: cv.height })
  o.getContext('2d').drawImage(cv, 0, 0)
  return o
}
const loadImg = (src) => new Promise((res, rej) => {
  const im = new Image()
  im.crossOrigin = 'anonymous'
  im.onload = () => res(im)
  im.onerror = rej
  im.src = src
})
// A mask component, in image coords (0..1, y down). Brush/object components paint into their own canvas (≤1024px).
// op = how it combines with the components before it in the same layer.
const newMask = (type, nat, id, op = 'add') => {
  const base = {
    id, type, op, feather: 0.5, invert: false, angle: 0, geo: [0, 0, 0, 0],
    range: { mode: 'none', lo: 0, hi: 100, smooth: 20, color: null, tol: 30 },
  }
  if (type === 'radial') return { ...base, geo: [0.5, 0.5, 0.22, (0.22 * nat.w) / nat.h] }
  if (type === 'linear') return { ...base, geo: [0.5, 0.1, 0.5, 0.5] }
  if (type === 'color') return { ...base, range: { ...base.range, mode: 'color' } }
  if (type === 'luminance') return { ...base, range: { ...base.range, mode: 'luminance', lo: 60, hi: 100 } }
  // brush + object: painted alpha canvas (object = filled by the AI segmenter, then refinable with the brush)
  const s = Math.min(1, 1024 / Math.max(nat.w, nat.h))
  return { ...base, ver: 0, canvas: Object.assign(document.createElement('canvas'), { width: Math.round(nat.w * s), height: Math.round(nat.h * s) }) }
}
const cloneComp = (c, id) => {
  const out = { ...c, id, range: { ...c.range }, geo: [...c.geo] }
  if (c.canvas) {
    out.canvas = Object.assign(document.createElement('canvas'), { width: c.canvas.width, height: c.canvas.height })
    out.canvas.getContext('2d').drawImage(c.canvas, 0, 0)
  }
  return out
}
// An adjustment layer: its own sliders + amount, masked by its components.
const newLayer = (id, comp, no) => ({ id, name: `Layer ${no}`, visible: true, amount: 100, vals: { ...MASK_ZERO }, comps: [comp] })
const OP_UI = { add: ['+', 'Add'], subtract: ['−', 'Subtract'], intersect: ['∩', 'Intersect'] }
const HINTS = {
  radial: 'Drag the middle to move · drag the dots to resize',
  linear: 'Solid line = full effect · dashed line = none',
  brush: 'Paint over the area you want to change',
  object: 'Paint to add to the selection · Erase to remove',
  erase: 'Paint over areas to remove them from the mask',
  color: 'Tap the photo to pick a color',
  pickObject: 'Tap the object you want to select',
  sel_lasso: 'Draw around the area you want',
  sel_rect: 'Drag to select a rectangle',
  sel_ellipse: 'Drag to select an ellipse',
  sel_wand: 'Tap an area to select similar colors',
  sel_brush: 'Paint the selection by hand',
  sel_pen: 'Click to add points · drag to curve · click the first point to close',
  sel_pen_closed: 'Drag points or handles to adjust · Enter to apply',
  busy: 'Selecting object…',
  luminance: 'Affects bright or dark tones across the photo',
  colorDone: 'Changes only this color · adjust Range to widen it',
}
const TYPES = [
  ['select', 'Selection'], ['object', 'Object'], ['color', 'Color range'], ['luminance', 'Light range'],
  ['radial', 'Radial'], ['linear', 'Linear'], ['brush', 'Brush'],
]
// JPEG blob → file download.
const downloadBlob = (blob, name) => {
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name })
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 2000)
}
const typeName = (t) => TYPES.find(([k]) => k === t)[1]
const scalePreset = (pv, amount) => Object.fromEntries(ALL_KEYS.map((k) => [k, Math.round(((pv[k] || 0) * amount) / 100)]))
const fmt = (v, min = -100) => (v > 0 && min < 0 ? '+' : '') + v

// ---- look
const T = { title: 'text-[13px] font-medium text-paper', muted: 'text-[13px] text-paper/55' }
const chip = (on) => `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors ${on ? 'bg-paper text-ink' : 'bg-paper/[.07] text-paper/75 hover:bg-paper/[.12] hover:text-paper'}`
const btn = (primary) => `inline-flex h-10 items-center justify-center rounded-full px-5 text-[13px] font-medium transition-colors ${primary ? 'bg-paper text-ink hover:bg-paper/85' : 'bg-paper/[.08] text-paper hover:bg-paper/[.14]'}`

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
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  save: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  prev: 'M20 12H4M10 6l-6 6 6 6',
  next: 'M4 12h16M14 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  linear: 'M3 8h18M3 16h18M12 4v16',
  brush: 'M14 4l6 6-8.5 8.5a3 3 0 0 1-4.2 0l-1.8-1.8a3 3 0 0 1 0-4.2zM4 20h5',
}
const AdjustIcon = () => (
  <Icon d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2">
    <circle cx="14" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="16" cy="18" r="2" />
  </Icon>
)
const MaskIcon = () => <Icon><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" /></Icon>
const TypeIcon = ({ type }) => ({
  radial: <Icon><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" strokeDasharray="2 2" /></Icon>,
  linear: <Icon d="M3 8h18M3 16h18M12 4v16" />,
  brush: <Icon d="M14 4l6 6-8.5 8.5a3 3 0 0 1-4.2 0l-1.8-1.8a3 3 0 0 1 0-4.2zM4 20h5" />,
  select: <Icon d="M4 4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4M4 7V4" />,
  object: <Icon d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />,
  color: <Icon d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" />,
  luminance: <Icon d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"><circle cx="12" cy="12" r="4" /></Icon>,
}[type])

// Icon button. Desktop: square with a hover label. Mobile: icon with a small caption (short).
function Tool({ label, short, tip = 'left', active, className = '', children, ...props }) {
  return (
    <button
      aria-label={label} aria-pressed={active}
      className={`group relative flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl transition-colors disabled:pointer-events-none disabled:opacity-30 max-lg:min-w-12 max-lg:py-1 lg:size-10 ${active ? 'text-paper lg:bg-paper/[.12]' : 'text-paper/60 hover:text-paper lg:hover:bg-paper/[.07]'} ${className}`}
      {...props}
    >
      {children}
      {short && <span className="text-[11px] leading-none lg:hidden">{short}</span>}
      <span className={`pointer-events-none absolute top-1/2 z-30 hidden -translate-y-1/2 rounded-md border border-paper/10 bg-[#1a1a1a] px-2 py-1 text-xs whitespace-nowrap text-paper opacity-0 transition-opacity group-hover:opacity-100 lg:block ${tip === 'left' ? 'right-full mr-2' : 'left-full ml-2'}`}>
        {label}
      </span>
    </button>
  )
}

// Slider list. Mobile: chips pick one control + one big slider. Desktop: every control, optionally grouped.
function Sliders({ controls, values, onChange, active, setActive, groups }) {
  const cur = controls.find((x) => x[0] === active) || controls[0]
  const [ck, cname, , cmin = -100] = cur
  return (
    <>
      <div className="lg:hidden">
        <div className="flex items-baseline justify-between">
          <span className={T.title}>{cname}</span>
          <span className="text-[13px] text-paper tabular-nums">{fmt(values[ck], cmin)}</span>
        </div>
        <Slider big label={cname} min={cmin} value={values[ck]} onChange={(n) => onChange(ck, n)} />
        <div className="-mx-gut flex gap-2 overflow-x-auto px-gut pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {controls.map(([k, name]) => (
            <button key={k} onClick={() => setActive(k)} className={chip(ck === k)}>
              {name}
              {values[k] !== 0 && <span className={`size-1.5 rounded-full ${ck === k ? 'bg-ink' : 'bg-paper'}`} />}
            </button>
          ))}
        </div>
      </div>
      <div className="hidden lg:block">
        {(groups || [null]).map((g) => (
          <section key={g || 'all'} className="border-t border-paper/[.07] py-4 first:border-t-0 first:pt-0">
            {g && <p className={`mb-1.5 ${T.title}`}>{g}</p>}
            {controls.filter((x) => !g || x[2] === g).map(([k, name, , min = -100]) => (
              <div key={k}>
                <div className="flex justify-between text-[13px]">
                  <span className="text-paper/55">{name}</span>
                  <span className="text-paper tabular-nums">{fmt(values[k], min)}</span>
                </div>
                <Slider label={name} min={min} value={values[k]} onChange={(n) => onChange(k, n)} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  )
}

function Field({ name, value, min = 0, max = 100, def = 0, unit = '', onChange }) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[13px]">
        <span className="text-paper/55">{name}</span>
        <span className="text-paper tabular-nums">{value}{unit}</span>
      </div>
      <Slider label={name} min={min} max={max} def={def} value={value} onChange={onChange} />
    </div>
  )
}

export default function Lightbox({ photos, index, setIndex }) {
  const n = photos.length
  const p = photos[index]
  const [show, setShow] = useState(true)
  const close = () => setShow(false)

  const stage = useRef(null)
  const viewEl = useRef(null)
  const canvasRef = useRef(null)
  const glApi = useRef(null)
  const svgRef = useRef(null)
  const cursorRef = useRef(null)
  const [box, setBox] = useState({ W: 0, H: 0 })
  const [nat, setNat] = useState(null) // photo's natural size (aspect is what matters)
  const [loadErr, setLoadErr] = useState(false)
  // Zoom/pan lives in a ref and is written straight to the DOM (no React render per move); zc = committed zoom for the UI.
  const v = useRef({ z: 1, x: 0, y: 0 })
  const animate = useRef(true)
  const [zc, setZc] = useState(1)
  const [r, setR] = useState(0) // degrees, keeps growing so the rotation always animates clockwise
  const [crop, setCrop] = useState(null)
  const [draft, setDraft] = useState(null) // non-null = crop mode
  const [aspect, setAspect] = useState(0)
  const [panel, setPanel] = useState(null) // 'adjust' | 'mask' | null
  const [vals, setVals] = useState(ZERO)
  const [before, setBefore] = useState(false)
  const [ctl, setCtl] = useState('exposure')
  const [preset, setPreset] = useState(null) // last applied: { id, vals, amount }
  const [pcat, setPcat] = useState(PRESET_CATEGORIES[0].name)
  const [thumbs, setThumbs] = useState({}) // preset id → preview of this photo
  const [layers, setLayers] = useState([])
  const [li, setLi] = useState(-1) // selected layer
  const [ci, setCi] = useState(0) // selected component in that layer
  const [adding, setAdding] = useState(null) // null | { op, fresh: true (new layer) }
  const [mctl, setMctl] = useState('exposure')
  const [overlay, setOverlay] = useState(true)
  const [brush, setBrush] = useState({ size: 60, hard: 50, erase: false })
  // Selection tools (for "Selection" masks): tool, how a new selection combines, feather, magic-wand settings.
  const [sel, setSel] = useState({ tool: 'lasso', mode: 'add', feather: 0, tol: 30, contiguous: true })
  const [selDraft, setSelDraft] = useState(null) // shape being drawn: { tool, a, b, pts }
  // Pen path (image coords 0..1): anchors with a mirrored bezier handle (hx, hy) each.
  const [pen, setPen] = useState(null) // null | { pts: [{ x, y, hx, hy }], closed }
  const [picking, setPicking] = useState(false) // false | 'color' (eyedropper) | 'object' (AI tap)
  const [segBusy, setSegBusy] = useState(false)
  const [preview, setPreview] = useState(null) // { before, after, blob } object URLs of the final render
  const [building, setBuilding] = useState(false)
  const [guide, setGuide] = useState(() => { try { return localStorage.maskGuide !== 'off' } catch { return true } })
  // Every time the viewer opens: highlight the edit tools and explain why they're here (until dismissed).
  const [editTip, setEditTip] = useState(false)
  const tipSeen = useRef(false) // per opening of the viewer
  const closeEditTip = () => { setEditTip(false); tipSeen.current = true }
  const closeGuide = () => { setGuide(false); try { localStorage.maskGuide = 'off' } catch { /* private mode */ } }
  const nextId = useRef(1)
  const layerNo = useRef(0) // for "Layer 1, 2…" names
  const [glReady, setGlReady] = useState(false)

  // New photo = fresh start.
  useEffect(() => {
    setNat(null); setR(0); setCrop(null); setDraft(null); setVals(ZERO); setThumbs({}); setGlReady(false); setLoadErr(false); setLayers([]); setLi(-1); setCi(0); setAdding(null); setPicking(false); layerNo.current = 0
    v.current = { z: 1, x: 0, y: 0 }; setZc(1)
  }, [p.src])

  useLayoutEffect(() => {
    const el = stage.current
    const ro = new ResizeObserver(() => setBox({ W: el.clientWidth, H: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const maskEdited = layers.some((L) => L.visible && L.amount > 0 && MASK_CONTROLS.some(([k]) => L.vals[k] !== 0))
  const adjusted = ALL_KEYS.some((k) => vals[k] !== 0) || maskEdited
  const useGl = adjusted || panel === 'adjust' || panel === 'mask' || panel === 'presets'
  const presetScaled = preset && scalePreset(preset.vals, preset.amount)
  const activePreset = preset && ALL_KEYS.every((k) => vals[k] === presetScaled[k]) ? preset : null // manual slider moves or undo end it
  const presetItems = PRESET_CATEGORIES.find((x) => x.name === pcat).items
  const noGlobal = ALL_KEYS.every((k) => vals[k] === 0)
  useEffect(() => {
    if (panel !== 'presets' || !glReady) return
    const missing = [{ id: 'original', vals: {} }, ...presetItems].filter((x) => !thumbs[x.id])
    if (!missing.length || !glApi.current) return
    const urls = glApi.current.thumbs(missing.map((x) => x.vals))
    if (!urls.length) return
    setThumbs((t) => ({ ...t, ...Object.fromEntries(missing.map((x, i) => [x.id, urls[i]])) }))
  }, [panel, glReady, pcat, thumbs]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!useGl) setGlReady(false) }, [useGl])
  const cropping = !!draft
  const masking = panel === 'mask' && !cropping
  const al = layers[li] // selected layer
  const am = al?.comps[ci] // selected mask component
  const nComps = layers.reduce((n, L) => n + L.comps.length, 0)
  const edited = adjusted || !!crop || r % 360 !== 0

  // Layout: the visible (rotated, cropped) photo is fit into the stage; k = screen px per photo px.
  const rot = ((r % 360) + 360) % 360
  const side = rot % 180 !== 0
  const RW = nat ? (side ? nat.h : nat.w) : 1
  const RH = nat ? (side ? nat.w : nat.h) : 1
  const c = cropping ? FULL : crop || FULL
  const mobile = box.W < 640
  const PAD = mobile ? 12 : cropping ? 48 : 32
  const AH = box.H - 2 * PAD // usable height
  const k = nat && box.W ? Math.max(0, Math.min((box.W - 2 * PAD) / (c.w * RW), AH / (c.h * RH))) : 0
  const VW = c.w * RW * k, VH = c.h * RH * k
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
    el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${z})`
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
    setV(z, px - (px - o.x) * f, py - (py - o.y) * f, anim, later)
  }
  const fit = () => setV(1, 0, 0, true)
  // After each render (resize, rotate, crop): keep the pan inside the new bounds and re-apply.
  useLayoutEffect(() => {
    v.current = limit(v.current.z, v.current.x, v.current.y)
    paint()
  })

  // Photo size from the first <img>. Cached images can finish before React attaches onLoad (WebKit/iOS),
  // so also read it straight away when the element mounts.
  const measure = (img) => {
    if (img?.complete && img.naturalWidth) setNat((n) => n || { w: img.naturalWidth, h: img.naturalHeight })
  }

  const go = (d) => { if (cropping || n < 2) return; setIndex((index + d + n) % n) }
  const rotate = () => {
    setR((x) => x + 90); setCrop(rotCrop); setDraft(rotCrop); setAspect(0); fit()
  }
  const startCrop = () => {
    if (cropping) return setDraft(null)
    setPanel(null); fit(); setAspect(0); setDraft(crop || FULL)
  }
  const applyCrop = () => { setCrop(isFull(draft) ? null : draft); setDraft(null) }
  const togglePanel = (name) => { setDraft(null); setPanel((x) => (x === name ? null : name)) }
  const resetAll = () => { setR(0); setCrop(null); setDraft(null); setVals(ZERO); setLayers([]); setLi(-1); setCi(0); setAdding(null); setPicking(false); fit() }

  // ---- undo history. Edits settle for 300ms before becoming one step (a slider drag = one step).
  // Painted canvases change in place, so each step keeps its own copy of them.
  const snap = (st) => ({ ...st, layers: st.layers.map((L) => ({ ...L, comps: L.comps.map((c2) => (c2.canvas ? { ...c2, canvas: copyCanvas(c2.canvas) } : c2)) })) })
  const hist = useRef([])
  const committed = useRef(null)
  const pending = useRef(0) // timer id while a change hasn't settled yet
  const restoring = useRef(false)
  const [canUndo, setCanUndo] = useState(false)
  useEffect(() => {
    const cur = { r, crop, vals, layers }
    if (!committed.current || restoring.current) {
      restoring.current = false
      committed.current = snap(cur)
      return
    }
    pending.current = setTimeout(() => {
      pending.current = 0
      if (!committed.current) { committed.current = snap(cur); return }
      hist.current.push(committed.current)
      if (hist.current.length > 40) hist.current.shift()
      committed.current = snap(cur)
      setCanUndo(true)
    }, 300)
    return () => { clearTimeout(pending.current); pending.current = 0 }
  }, [r, crop, vals, layers]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { clearTimeout(pending.current); pending.current = 0; hist.current = []; committed.current = null; setCanUndo(false) }, [p.src])
  const undo = () => {
    // A change still settling is undone first; otherwise step back one saved step.
    const S = pending.current ? committed.current : hist.current.pop()
    if (!S) return
    clearTimeout(pending.current); pending.current = 0
    restoring.current = true
    setR(S.r); setCrop(S.crop); setVals(S.vals); setDraft(null); setPicking(false); setAdding(null)
    setLayers(S.layers.map((L) => ({ ...L, comps: L.comps.map((c2) => (c2.canvas ? { ...c2, canvas: copyCanvas(c2.canvas), ver: (c2.ver || 0) + 1 } : c2)) })))
    setLi((i) => Math.min(i, S.layers.length - 1)); setCi(0)
    setCanUndo(hist.current.length > 0)
    fit()
  }
  const dirty = edited || layers.length > 0
  const pickAspect = (val) => {
    setAspect(val)
    const av = val === -1 ? RW / RH : val
    if (av) setDraft(fitAspect((av * RH) / RW))
  }

  useEffect(() => {
    if (!nat || tipSeen.current) return
    const t2 = setTimeout(() => setEditTip(true), 700)
    return () => clearTimeout(t2)
  }, [nat])

  // ---- layers + mask components
  const updLayer = (patch) => setLayers((ls) => ls.map((L, i) => (i === li ? { ...L, ...(typeof patch === 'function' ? patch(L) : patch) } : L)))
  const updMask = (patch) => updLayer((L) => ({ comps: L.comps.map((c, j) => (j === ci ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)) }))
  const armPicker = (type) => setPicking(type === 'color' ? 'color' : type === 'object' ? 'object' : false)
  // Add a component of `type`: as a new layer, or into the selected layer with adding.op.
  const addMask = (type) => {
    if (!nat || nComps >= MAX_COMPS) return
    const comp = newMask(type, nat, nextId.current++, adding?.fresh || !al ? 'add' : adding.op)
    if (adding?.fresh || !al) {
      if (layers.length >= MAX_LAYERS) return
      setLayers((ls) => [...ls, newLayer(nextId.current++, comp, ++layerNo.current)])
      setLi(layers.length); setCi(0)
    } else {
      updLayer((L) => ({ comps: [...L.comps, comp] }))
      setCi(al.comps.length)
    }
    setAdding(null); setOverlay(true); armPicker(type)
  }
  const delMask = () => { // remove the selected component (the layer goes with its last one)
    if (al.comps.length <= 1) return delLayer()
    updLayer((L) => ({ comps: L.comps.filter((_, j) => j !== ci) }))
    setCi((j) => Math.max(0, j - 1)); setPicking(false)
  }
  const delLayer = () => {
    setLayers((ls) => ls.filter((_, i) => i !== li))
    setLi((i) => Math.min(i, layers.length - 2)); setCi(0); setPicking(false)
  }
  const dupLayer = () => {
    if (!al || layers.length >= MAX_LAYERS || nComps + al.comps.length > MAX_COMPS) return
    const copy = { ...al, id: nextId.current++, name: `Layer ${++layerNo.current}`, vals: { ...al.vals }, comps: al.comps.map((c) => cloneComp(c, nextId.current++)) }
    setLayers((ls) => [...ls, copy]); setLi(layers.length); setCi(0)
  }
  const moveLayer = (d) => {
    const j = li + d
    if (j < 0 || j >= layers.length) return
    setLayers((ls) => { const out = [...ls]; [out[li], out[j]] = [out[j], out[li]]; return out })
    setLi(j)
  }
  const toggleLayer = (i) => setLayers((ls) => ls.map((L, k) => (k === i ? { ...L, visible: !L.visible } : L)))
  const selectLayer = (i) => { setLi(i); setCi(0); setPicking(false); setAdding(null) }
  const slotOf = (id) => flatComps(layers).findIndex((c) => c.id === id)
  const updRange = (patch) => updMask((m) => ({ range: { ...m.range, ...patch } }))
  const pickColor = (e) => {
    e.stopPropagation()
    const [x, y] = toImg(e)
    const col = glApi.current?.sample(clamp(x, 0, 1), clamp(y, 0, 1))
    if (col) updRange({ mode: 'color', color: col })
    setPicking(false)
  }
  // AI object: segment around the tap, write the confidence into the mask's alpha canvas.
  const pickObject = async (e) => {
    e.stopPropagation()
    const [x, y] = toImg(e), m = am
    const img = glApi.current?.imageCanvas(1024)
    if (!img || !m?.canvas) return
    setPicking(false); setSegBusy(true)
    try {
      const { segmentAt } = await import('./segment.js')
      const r = await segmentAt(img, clamp(x, 0, 1), clamp(y, 0, 1))
      const tmp = Object.assign(document.createElement('canvas'), { width: r.w, height: r.h })
      const tg = tmp.getContext('2d'), id = tg.createImageData(r.w, r.h)
      for (let i = 0; i < r.data.length; i++) {
        const c0 = r.data[i]
        id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255
        id.data[i * 4 + 3] = c0 <= 0.3 ? 0 : c0 >= 0.7 ? 255 : Math.round(((c0 - 0.3) / 0.4) * 255) // soft edge
      }
      tg.putImageData(id, 0, 0)
      const g = m.canvas.getContext('2d')
      g.globalCompositeOperation = 'source-over'
      g.clearRect(0, 0, m.canvas.width, m.canvas.height)
      g.drawImage(tmp, 0, 0, m.canvas.width, m.canvas.height)
      setLayers((ls) => ls.map((L) => ({ ...L, comps: L.comps.map((x2) => (x2.id === m.id ? { ...x2, ver: (x2.ver || 0) + 1, selected: true } : x2)) })))
    } catch {
      alert('Object selection could not run on this device. Use the Brush to paint the area instead.')
    }
    setSegBusy(false)
  }
  // Client point → image coords (0..1). getScreenCTM folds in every CSS transform (zoom, rotation).
  const toImg = (e) => {
    const svg = svgRef.current, pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const q = pt.matrixTransform(svg.getScreenCTM().inverse())
    return [q.x / nat.w, q.y / nat.h]
  }
  const screenPerImg = () => { const m = svgRef.current.getScreenCTM(); return Math.hypot(m.a, m.b) }
  const md = useRef(null)
  const dab = (x, y) => {
    const cv = am.canvas, g = cv.getContext('2d')
    const rad = (brush.size / 2 / screenPerImg()) * (cv.width / nat.w) // canvas px
    const cx = x * cv.width, cy = y * cv.height
    const grad = g.createRadialGradient(cx, cy, rad * (brush.hard / 100) * 0.95, cx, cy, rad)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    const erase = am.type === 'select' ? sel.mode === 'subtract' : brush.erase
    g.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
    g.fillStyle = grad
    g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill()
    md.current.last = [x, y]
    glApi.current?.refreshMask(slotOf(am.id))
  }
  const stroke = (x, y) => {
    const L = md.current.last
    if (!L) return dab(x, y)
    const cv = am.canvas
    const rad = (brush.size / 2 / screenPerImg()) * (cv.width / nat.w)
    const dist = Math.hypot((x - L[0]) * cv.width, (y - L[1]) * cv.height)
    const steps = Math.max(1, Math.ceil(dist / Math.max(1, rad * 0.25)))
    for (let i = 1; i <= steps; i++) dab(L[0] + ((x - L[0]) * i) / steps, L[1] + ((y - L[1]) * i) / steps)
  }
  const moveCursor = (e) => {
    const el = cursorRef.current
    if (!el || !am?.canvas || (am.type === 'select' && sel.tool !== 'brush')) return
    const [x, y] = toImg(e)
    el.setAttribute('cx', x * nat.w); el.setAttribute('cy', y * nat.h)
    el.setAttribute('r', brush.size / 2 / screenPerImg())
    el.style.opacity = 1
  }
  const grabMask = (mode) => (e) => {
    e.stopPropagation()
    capture(e.currentTarget, e)
    const [x, y] = toImg(e)
    md.current = { mode, x, y, g: [...am.geo], last: null }
    if (mode === 'paint') dab(x, y)
  }
  const dragMask = (e) => {
    moveCursor(e)
    const D = md.current
    if (!D) return
    const [x, y] = toImg(e)
    if (D.mode === 'paint') return stroke(x, y)
    if (D.mode.startsWith('pen')) return penDrag(D, x, y)
    if (D.mode === 'sel') {
      const L = D.pts[D.pts.length - 1]
      if (D.tool === 'lasso' && Math.hypot(x - L[0], y - L[1]) > 0.002) D.pts.push([x, y])
      D.b = [x, y]
      return setSelDraft({ ...D, pts: [...D.pts] })
    }
    const [g0, g1, g2, g3] = D.g, dx = x - D.x, dy = y - D.y
    // Radial radii: distance along the ellipse's own (rotated) axes, in pixels.
    const W = nat.w, H = nat.h, an2 = (am.angle * Math.PI) / 180
    const ox = (x - g0) * W, oy2 = (y - g1) * H
    const alongX = Math.abs(ox * Math.cos(an2) + oy2 * Math.sin(an2)) / W
    const alongY = Math.abs(-ox * Math.sin(an2) + oy2 * Math.cos(an2)) / H
    const geo = {
      move: am.type === 'linear' ? [g0 + dx, g1 + dy, g2 + dx, g3 + dy] : [g0 + dx, g1 + dy, g2, g3],
      rx: [g0, g1, Math.max(0.01, alongX), g3],
      ry: [g0, g1, g2, Math.max(0.01, alongY)],
      p0: [x, y, g2, g3],
      p1: [g0, g1, x, y],
    }[D.mode]
    updMask({ geo })
  }
  const dropMask = () => {
    const D = md.current
    md.current = null
    if (D?.mode === 'paint' && am) bumpVer(am.id) // makes the stroke an undo step
    if (D?.mode !== 'sel') return
    setSelDraft(null)
    const [x0, y0] = D.a, [x1, y1] = D.b
    if (D.tool === 'lasso') {
      if (D.pts.length > 2) commitSel((g, W, H) => { g.beginPath(); D.pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H))); g.closePath(); g.fill() })
    } else if (Math.abs(x1 - x0) > 0.004 && Math.abs(y1 - y0) > 0.004) {
      commitSel((g, W, H) => {
        if (D.tool === 'rect') g.fillRect(Math.min(x0, x1) * W, Math.min(y0, y1) * H, Math.abs(x1 - x0) * W, Math.abs(y1 - y0) * H)
        else { g.beginPath(); g.ellipse(((x0 + x1) / 2) * W, ((y0 + y1) / 2) * H, (Math.abs(x1 - x0) / 2) * W, (Math.abs(y1 - y0) / 2) * H, 0, 0, Math.PI * 2); g.fill() }
      })
    }
  }
  const bumpVer = (id) => setLayers((ls) => ls.map((L) => ({ ...L, comps: L.comps.map((c) => (c.id === id ? { ...c, ver: (c.ver || 0) + 1 } : c)) })))
  // Draw a shape (white) into the selection canvas: New replaces, Add unions, Subtract cuts. Feather = blur.
  const commitSel = (draw) => {
    const cv = am.canvas, W = cv.width, H = cv.height
    const shape = Object.assign(document.createElement('canvas'), { width: W, height: H })
    const sg = shape.getContext('2d')
    sg.fillStyle = '#fff'
    draw(sg, W, H)
    let src = shape
    const fpx = (sel.feather / 100) * 0.03 * Math.max(W, H)
    if (fpx > 0.5) {
      src = Object.assign(document.createElement('canvas'), { width: W, height: H })
      const bg = src.getContext('2d')
      bg.filter = `blur(${fpx}px)` // browsers without canvas filters just get a hard edge
      bg.drawImage(shape, 0, 0)
    }
    const g = cv.getContext('2d')
    g.save()
    if (sel.mode === 'new') g.clearRect(0, 0, W, H)
    g.globalCompositeOperation = sel.mode === 'subtract' ? 'destination-out' : 'source-over'
    g.drawImage(src, 0, 0)
    g.restore()
    bumpVer(am.id)
  }
  // Magic wand: pixels within tolerance of the tapped color; contiguous = flood fill from the tap.
  const wand = (x, y) => {
    const cv = am.canvas, W = cv.width, H = cv.height
    const img = glApi.current?.imageCanvas(Math.max(W, H))
    if (!img) return
    const tc = Object.assign(document.createElement('canvas'), { width: W, height: H })
    const tg = tc.getContext('2d', { willReadFrequently: true })
    tg.drawImage(img, 0, 0, W, H)
    const d = tg.getImageData(0, 0, W, H).data
    const si = (clamp(Math.round(y * (H - 1)), 0, H - 1) * W + clamp(Math.round(x * (W - 1)), 0, W - 1)) * 4
    const r0 = d[si], g0 = d[si + 1], b0 = d[si + 2], lim2 = ((sel.tol / 100) * 170) ** 2
    const near = (i) => { const q = i * 4, dr = d[q] - r0, dg = d[q + 1] - g0, db = d[q + 2] - b0; return dr * dr + dg * dg + db * db <= lim2 }
    const hit = new Uint8Array(W * H)
    if (sel.contiguous) {
      const stack = [si / 4]
      hit[si / 4] = 1
      while (stack.length) {
        const i = stack.pop(), px = i % W
        if (px > 0 && !hit[i - 1] && near(i - 1)) { hit[i - 1] = 1; stack.push(i - 1) }
        if (px < W - 1 && !hit[i + 1] && near(i + 1)) { hit[i + 1] = 1; stack.push(i + 1) }
        if (i >= W && !hit[i - W] && near(i - W)) { hit[i - W] = 1; stack.push(i - W) }
        if (i < W * (H - 1) && !hit[i + W] && near(i + W)) { hit[i + W] = 1; stack.push(i + W) }
      }
    } else for (let i = 0; i < W * H; i++) hit[i] = near(i) ? 1 : 0
    commitSel((g) => {
      const id = g.createImageData(W, H)
      for (let i = 0; i < W * H; i++) if (hit[i]) id.data.fill(255, i * 4, i * 4 + 4)
      g.putImageData(id, 0, 0)
    })
  }
  // ---- pen: click = corner point, click-drag = curve, first point closes, points/handles stay draggable
  const penPathTo = (g, pts, closed, W, H) => {
    g.moveTo(pts[0].x * W, pts[0].y * H)
    const seg = (a, b) => g.bezierCurveTo((a.x + a.hx) * W, (a.y + a.hy) * H, (b.x - b.hx) * W, (b.y - b.hy) * H, b.x * W, b.y * H)
    for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i])
    if (closed) seg(pts[pts.length - 1], pts[0])
  }
  const penD = (P) => {
    if (!P?.pts.length) return ''
    const W = nat.w, H = nat.h, f = (x, y) => `${x * W} ${y * H}`
    let d = `M${f(P.pts[0].x, P.pts[0].y)}`
    const seg = (a, b) => { d += `C${f(a.x + a.hx, a.y + a.hy)} ${f(b.x - b.hx, b.y - b.hy)} ${f(b.x, b.y)}` }
    for (let i = 1; i < P.pts.length; i++) seg(P.pts[i - 1], P.pts[i])
    if (P.closed) { seg(P.pts[P.pts.length - 1], P.pts[0]); d += 'Z' }
    return d
  }
  const penDown = (x, y) => {
    const P = pen || { pts: [], closed: false }
    const W = nat.w, H = nat.h, r = 12 / screenPerImg() // hit radius in image px
    const near = (px, py) => Math.hypot((x - px) * W, (y - py) * H) < r
    const hi = P.pts.findIndex((a) => (a.hx || a.hy) && (near(a.x + a.hx, a.y + a.hy) || near(a.x - a.hx, a.y - a.hy)))
    if (hi >= 0) { md.current = { mode: 'penHandle', i: hi, flip: !near(P.pts[hi].x + P.pts[hi].hx, P.pts[hi].y + P.pts[hi].hy) }; return }
    const ai = P.pts.findIndex((a) => near(a.x, a.y))
    if (ai === 0 && !P.closed && P.pts.length >= 3) { setPen({ ...P, closed: true }); return }
    if (ai >= 0) { md.current = { mode: 'penMove', i: ai, sx: x, sy: y, a: { ...P.pts[ai] } }; return }
    if (P.closed) return
    setPen({ ...P, pts: [...P.pts, { x, y, hx: 0, hy: 0 }] })
    md.current = { mode: 'penNew', i: P.pts.length, sx: x, sy: y }
  }
  const penDrag = (D, x, y) => setPen((P) => {
    if (!P) return P
    const pts = P.pts.map((a, i) => {
      if (i !== D.i) return a
      if (D.mode === 'penMove') return { ...a, x: D.a.x + x - D.sx, y: D.a.y + y - D.sy }
      if (D.mode === 'penNew') return { ...a, hx: x - a.x, hy: y - a.y }
      const s2 = D.flip ? -1 : 1 // dragging the mirrored handle
      return { ...a, hx: s2 * (x - a.x), hy: s2 * (y - a.y) }
    })
    return { ...P, pts }
  })
  const penApply = () => {
    if (!pen || pen.pts.length < 3) return
    const P = pen
    commitSel((g, W, H) => { g.beginPath(); penPathTo(g, P.pts, true, W, H); g.closePath(); g.fill() })
    setPen(null)
  }
  const penUndoPoint = () => setPen((P) => (!P ? P : P.closed ? { ...P, closed: false } : P.pts.length > 1 ? { ...P, pts: P.pts.slice(0, -1) } : null))
  useEffect(() => { setPen(null) }, [sel.tool, am?.id])

  const selStart = (e) => {
    e.stopPropagation()
    capture(e.currentTarget, e)
    const [x, y] = toImg(e)
    if (sel.tool === 'pen') return penDown(x, y)
    if (sel.tool === 'wand') return wand(clamp(x, 0, 1), clamp(y, 0, 1))
    if (sel.tool === 'brush') { md.current = { mode: 'paint', last: null }; return dab(x, y) }
    md.current = { mode: 'sel', tool: sel.tool, a: [x, y], b: [x, y], pts: [[x, y]] }
    setSelDraft({ ...md.current })
  }
  const selAll = (fill) => {
    const cv = am.canvas, g = cv.getContext('2d')
    g.save(); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, cv.width, cv.height)
    if (fill) { g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height) }
    g.restore(); bumpVer(am.id)
  }

  // ---- render the final JPEG: (adjusted snapshot or full-res original) → rotate → crop.
  // withEdits=false gives the matching "before" (same rotation + crop, no adjustments).
  // maxSide: longest edge for quick previews (screen-sized); Infinity = full resolution for downloads.
  const origImg = useRef({})
  useEffect(() => { origImg.current = {} }, [p.src])
  const render = async (withEdits, maxSide = Infinity) => {
    let src
    if (withEdits && adjusted && glApi.current) src = glApi.current.snapshot(maxSide)
    else if (maxSide < Infinity && glApi.current?.imageCanvas) src = glApi.current.imageCanvas(maxSide) // already loaded: no fetch
    else {
      const w = maxSide < Infinity ? maxSide : 8192
      origImg.current[w] ??= loadImg(url(p.src, { fit: 'max', w, h: w, q: 95 }))
      src = await origImg.current[w]
    }
    if (!src) throw new Error('image not ready')
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
    const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', maxSide < Infinity ? 0.9 : 0.95))
    if (!blob) throw new Error('render failed')
    return blob
  }
  const previewSize = () => Math.min(2560, Math.ceil(Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2)))
  const editedName = p.src.split('/').pop().replace(/\.\w+$/, '') + '-edited.jpg'
  const openPreview = async () => {
    setBuilding(true)
    try {
      // Screen-sized renders: instant even after heavy edits. Downloads still render full resolution.
      const size = previewSize()
      const [after, beforeBlob] = await Promise.all([render(true, size), render(false, size)])
      setPreview({ after: URL.createObjectURL(after), before: URL.createObjectURL(beforeBlob) })
    } catch (err) {
      console.error('preview render failed', err)
      alert('Could not prepare the preview. Try another browser.')
    }
    setBuilding(false)
  }
  const closePreview = () => {
    if (preview) { URL.revokeObjectURL(preview.after); URL.revokeObjectURL(preview.before) }
    setPreview(null)
  }
  const downloadEdited = async () => {
    setBuilding(true)
    try { downloadBlob(await render(true), editedName) } catch (err) {
      console.error('render failed', err)
      alert('Could not save this photo. Try another browser.')
    }
    setBuilding(false)
  }
  // Edited → the edited JPEG; untouched → the original file. Both behind the copyright check.
  const saveAndDownload = () => edited
    ? askDownload(downloadEdited, { ...p, edited: true })
    : askDownload(() => downloadFile(downloadUrl(p.src)), p)
  const previewDisabled = !edited || cropping || building || segBusy || (adjusted && !glReady)
  const saving = building
  const saveDisabled = cropping || building || segBusy || (adjusted && !glReady)

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
      gest.current = { type: 'pinch', d0: Math.hypot(q[0][0] - q[1][0], q[0][1] - q[1][1]) || 1, z0: o.z, m: [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2], x0: o.x, y0: o.y }
    } else if (q.length === 1) {
      gest.current = { type: 'pan', s: q[0], x0: o.x, y0: o.y, dx: 0, dy: 0, moved: 0 }
    } else gest.current = null
  }
  const onDown = (e) => {
    if (cropping || e.button > 0) return
    capture(stage.current, e)
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
      const m = [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2]
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
    capture(e.currentTarget, e)
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
      if (e.key !== 'Escape' && !e.metaKey && !e.ctrlKey && e.target.closest?.('input, [role=slider]')) return // sliders keep their arrow keys; Esc / ⌘Z always work
      const k2 = e.key, z1 = v.current.z <= 1.001
      if (preview) { if (k2 === 'Escape') closePreview(); return }
      if (pen && (k2 === 'Escape' || k2 === 'Enter' || k2 === 'Backspace')) {
        e.preventDefault()
        if (k2 === 'Escape') setPen(null)
        else if (k2 === 'Enter') penApply()
        else penUndoPoint()
        return
      }
      if (k2 === 'Escape') picking ? setPicking(false) : cropping ? setDraft(null) : panel ? setPanel(null) : close()
      else if (k2 === 'Enter' && cropping) applyCrop()
      else if (k2 === 'ArrowRight' && z1) go(1)
      else if (k2 === 'ArrowLeft' && z1) go(-1)
      else if ((k2 === '+' || k2 === '=') && !cropping) zoom((z) => z * 1.5)
      else if (k2 === '-' && !cropping) zoom((z) => z / 1.5)
      else if (k2 === '0') fit()
      else if (k2 === 'r' || k2 === 'R') rotate()
      else if ((e.metaKey || e.ctrlKey) && (k2 === 'z' || k2 === 'Z')) { e.preventDefault(); undo() }
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
  // Mask handles keep a constant on-screen size: image px per screen px.
  const hs = nat && k ? 1 / (k * zc) : 1

  return (
    <AnimatePresence onExitComplete={() => setIndex(-1)}>
      {show && (
        <motion.div
          className="fixed inset-x-0 top-0 z-50 flex h-dvh flex-col bg-ink outline-none lg:flex-row" tabIndex={-1} autoFocus role="dialog" aria-modal="true" aria-label="Photo viewer"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
        >
          {/* Left sidebar (desktop) / top bar (mobile) */}
          <nav className="relative z-10 flex h-[calc(3.75rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-2 px-3 pt-[env(safe-area-inset-top)] lg:h-auto lg:w-20 lg:flex-col lg:justify-start lg:border-r lg:border-paper/[.06] lg:px-0 lg:py-gut">
            <Magnet look="accent" strength={0.3} className="size-10" onClick={close} aria-label="Close">
              <Icon d={I.close} className="size-4" />
            </Magnet>
            <div className="flex items-center gap-1 lg:my-auto lg:flex-col lg:gap-3">
              <Tool className="hidden lg:flex" label="Previous" tip="right" onClick={() => go(-1)} disabled={n < 2 || cropping}><Icon d={I.prev} /></Tool>
              <span className="text-[13px] text-paper/60 tabular-nums">{index + 1} / {n}</span>
              <Tool className="hidden lg:flex" label="Next" tip="right" onClick={() => go(1)} disabled={n < 2 || cropping}><Icon d={I.next} /></Tool>
            </div>
            <div className="flex gap-2 lg:hidden">
              <PreviewButton onClick={openPreview} disabled={previewDisabled} busy={building && !preview} />
              <SaveButton onClick={saveAndDownload} disabled={saveDisabled} saving={saving} />
            </div>
          </nav>

          {/* Photo */}
          <div
            ref={stage}
            className={`relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden select-none ${zc > 1.001 ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          >
            {masking && am && (
              <p className="pointer-events-none absolute top-3 left-1/2 z-10 max-w-[90%] -translate-x-1/2 truncate rounded-full bg-ink/75 px-3.5 py-1.5 text-[12px] text-paper/90">
                {HINTS[segBusy ? 'busy' : picking === 'object' ? 'pickObject' : picking ? 'color' : am.type === 'select' ? (sel.tool === 'pen' && pen?.closed ? 'sel_pen_closed' : `sel_${sel.tool}`) : am.canvas && brush.erase ? 'erase' : am.type === 'color' ? 'colorDone' : am.type]}
              </p>
            )}
            {loadErr && !nat && (
              <div className="absolute inset-0 z-10 grid place-items-center p-6 text-center">
                <div>
                  <p className="text-[15px] text-paper">This photo couldn’t be loaded</p>
                  <p className="mt-1 text-[13px] text-paper/55">It may not be online yet. Try another photo or come back later.</p>
                </div>
              </div>
            )}
            <motion.div key={p.src} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
              {!nat ? (
                <img {...imgProps} sizes="100vw" className="absolute object-contain" style={{ left: PAD, top: PAD, width: Math.max(0, box.W - 2 * PAD), height: Math.max(0, AH) }}
                  onLoad={(e) => measure(e.currentTarget)} ref={measure}
                  onError={(e) => { if (e.currentTarget.dataset.fallback || !e.currentTarget.src.includes('imgix')) setLoadErr(true); imgFallback(e) }} />
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
                          <AdjustCanvas
                            src={p.src} values={vals} before={before} layers={layers} show={masking && overlay && al ? li : -1}
                            res={Math.ceil(longSide * dpr)} canvasRef={canvasRef} apiRef={glApi} onReady={() => setGlReady(true)}
                          />
                        </Suspense>
                      )}

                      {/* Mask handles, drawn in image pixels inside the rotated photo */}
                      {masking && am && (
                        <svg
                          ref={svgRef} viewBox={`0 0 ${nat.w} ${nat.h}`} preserveAspectRatio="none"
                          className={`absolute inset-0 size-full overflow-visible ${!am.canvas || picking ? 'pointer-events-none' : am.type === 'select' && sel.tool !== 'brush' ? 'cursor-crosshair' : 'cursor-none'}`}
                          onPointerMove={dragMask} onPointerUp={dropMask} onPointerCancel={dropMask}
                          onPointerLeave={() => cursorRef.current && (cursorRef.current.style.opacity = 0)}
                        >
                          {picking && <rect width={nat.w} height={nat.h} fill="transparent" className="pointer-events-auto cursor-crosshair" onPointerDown={picking === 'object' ? pickObject : pickColor} />}
                          {!picking && !segBusy && am.canvas && (
                            <>
                              <rect width={nat.w} height={nat.h} fill="transparent" className="pointer-events-auto" onPointerDown={am.type === 'select' ? selStart : grabMask('paint')} />
                              {am.type === 'select' && sel.tool === 'pen' && pen && (
                                <g className="pointer-events-none">
                                  <path d={penD(pen)} fill={pen.closed ? 'rgb(255 255 255 / .14)' : 'none'} stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                                  {pen.pts.map((a, i) => (
                                    <g key={i}>
                                      {(a.hx || a.hy) ? (
                                        <>
                                          <line x1={(a.x - a.hx) * nat.w} y1={(a.y - a.hy) * nat.h} x2={(a.x + a.hx) * nat.w} y2={(a.y + a.hy) * nat.h} stroke="white" strokeOpacity=".6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                                          <circle cx={(a.x + a.hx) * nat.w} cy={(a.y + a.hy) * nat.h} r={4 * hs} fill="white" />
                                          <circle cx={(a.x - a.hx) * nat.w} cy={(a.y - a.hy) * nat.h} r={4 * hs} fill="white" />
                                        </>
                                      ) : null}
                                      <rect
                                        x={a.x * nat.w - (i === 0 && !pen.closed && pen.pts.length >= 3 ? 7 : 5) * hs} y={a.y * nat.h - (i === 0 && !pen.closed && pen.pts.length >= 3 ? 7 : 5) * hs}
                                        width={(i === 0 && !pen.closed && pen.pts.length >= 3 ? 14 : 10) * hs} height={(i === 0 && !pen.closed && pen.pts.length >= 3 ? 14 : 10) * hs}
                                        fill={i === 0 && !pen.closed && pen.pts.length >= 3 ? '#e10600' : 'white'} stroke="black" strokeOpacity=".5" strokeWidth="1" vectorEffect="non-scaling-stroke"
                                      />
                                    </g>
                                  ))}
                                </g>
                              )}
                              {selDraft && (() => {
                                const W = nat.w, H = nat.h, [x0, y0] = selDraft.a, [x1, y1] = selDraft.b
                                const look = { fill: 'rgb(255 255 255 / .12)', stroke: 'white', strokeWidth: 1.5, strokeDasharray: '6 4', vectorEffect: 'non-scaling-stroke', className: 'pointer-events-none' }
                                if (selDraft.tool === 'lasso') return <polygon points={selDraft.pts.map(([x, y]) => `${x * W},${y * H}`).join(' ')} {...look} />
                                if (selDraft.tool === 'rect') return <rect x={Math.min(x0, x1) * W} y={Math.min(y0, y1) * H} width={Math.abs(x1 - x0) * W} height={Math.abs(y1 - y0) * H} {...look} />
                                return <ellipse cx={((x0 + x1) / 2) * W} cy={((y0 + y1) / 2) * H} rx={(Math.abs(x1 - x0) / 2) * W} ry={(Math.abs(y1 - y0) / 2) * H} {...look} />
                              })()}
                              <circle ref={cursorRef} r="0" fill="none" stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" style={{ opacity: 0 }} className="pointer-events-none" />
                            </>
                          )}
                          {!picking && am.type === 'radial' && (() => {
                            const [cx, cy, rx, ry] = am.geo, W = nat.w, H = nat.h, ar = (am.angle * Math.PI) / 180
                            const rot2 = `rotate(${am.angle} ${cx * W} ${cy * H})`
                            return (
                              <>
                                <ellipse transform={rot2} cx={cx * W} cy={cy * H} rx={rx * W} ry={ry * H} fill="transparent" stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="pointer-events-auto cursor-move" onPointerDown={grabMask('move')} />
                                <ellipse transform={rot2} cx={cx * W} cy={cy * H} rx={rx * W * (1 - am.feather)} ry={ry * H * (1 - am.feather)} fill="none" stroke="white" strokeOpacity=".6" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" className="pointer-events-none" />
                                <Handle x={cx * W + Math.cos(ar) * rx * W} y={cy * H + Math.sin(ar) * rx * W} s={hs} cursor="ew-resize" onPointerDown={grabMask('rx')} />
                                <Handle x={cx * W - Math.sin(ar) * ry * H} y={cy * H + Math.cos(ar) * ry * H} s={hs} cursor="ns-resize" onPointerDown={grabMask('ry')} />
                                <Handle x={cx * W} y={cy * H} s={hs} cursor="move" onPointerDown={grabMask('move')} />
                              </>
                            )
                          })()}
                          {!picking && am.type === 'linear' && (() => {
                            const W = nat.w, H = nat.h, [x0, y0, x1, y1] = am.geo.map((g, i) => g * (i % 2 ? H : W))
                            const len = Math.hypot(x1 - x0, y1 - y0) || 1, px = -(y1 - y0) / len, py = (x1 - x0) / len, L = (W + H) * 2
                            const line = (x, y, dash) => (
                              <line x1={x - px * L} y1={y - py * L} x2={x + px * L} y2={y + py * L} stroke="white" strokeWidth="1.5" strokeDasharray={dash} vectorEffect="non-scaling-stroke" className="pointer-events-none" />
                            )
                            return (
                              <>
                                {line(x0, y0)}{line(x1, y1, '4 4')}
                                <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="transparent" strokeWidth="24" vectorEffect="non-scaling-stroke" className="pointer-events-auto cursor-move" onPointerDown={grabMask('move')} />
                                <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="white" strokeOpacity=".6" strokeWidth="1" vectorEffect="non-scaling-stroke" className="pointer-events-none" />
                                <Handle x={x0} y={y0} s={hs} cursor="move" onPointerDown={grabMask('p0')} />
                                <Handle x={x1} y={y1} s={hs} cursor="move" onPointerDown={grabMask('p1')} />
                              </>
                            )
                          })()}
                        </svg>
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

          {/* Tool panel */}
          <AnimatePresence initial={false}>
            {(cropping || panel) && (
              <motion.aside
                key={cropping ? 'crop' : panel}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                className="max-h-[46dvh] shrink-0 overflow-y-auto border-t border-paper/[.08] bg-[#0b0b0b] px-gut pt-4 pb-3 lg:m-3 lg:max-h-none lg:w-80 lg:rounded-2xl lg:border lg:border-paper/[.07] lg:p-5"
              >
                {cropping ? (
                  <>
                    <p className={T.title}>Crop</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {ASPECTS.map(([name, val]) => <button key={name} className={chip(aspect === val)} onClick={() => pickAspect(val)}>{name}</button>)}
                    </div>
                    <p className={`mt-4 hidden lg:block ${T.muted}`}>Drag the corners or move the box. Enter to apply, Esc to cancel.</p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button className={btn(false)} onClick={() => setDraft(null)}>Cancel</button>
                      <button className={btn(true)} onClick={applyCrop}>Apply</button>
                    </div>
                  </>
                ) : panel === 'presets' ? (
                  <>
                    <div className="flex items-center justify-between">
                      <p className={T.title}>Presets</p>
                      <span className={T.muted}>{PRESET_COUNT}</span>
                    </div>
                    <div className="-mx-gut mt-3 flex gap-2 overflow-x-auto px-gut [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden">
                      {PRESET_CATEGORIES.map((x) => <button key={x.name} className={chip(pcat === x.name)} onClick={() => setPcat(x.name)}>{x.name}</button>)}
                    </div>
                    <div className="-mx-gut mt-3 flex gap-2 overflow-x-auto px-gut pt-1 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
                      <PresetTile label="Original" thumb={thumbs.original} rot={rot} active={noGlobal} onClick={() => { setPreset(null); setVals(ZERO) }} />
                      {presetItems.map((x) => (
                        <PresetTile
                          key={x.id} label={x.label} thumb={thumbs[x.id]} rot={rot} active={activePreset?.id === x.id}
                          onClick={() => { setPreset({ id: x.id, vals: x.vals, amount: 100 }); setVals(scalePreset(x.vals, 100)) }}
                        />
                      ))}
                    </div>
                    {activePreset && (
                      <Field name="Amount" value={activePreset.amount} def={100} unit="%" onChange={(val) => { setPreset({ ...activePreset, amount: val }); setVals(scalePreset(activePreset.vals, val)) }} />
                    )}
                    {!glReady && <p className={`mt-2 ${T.muted}`}>Loading full resolution…</p>}
                  </>
                ) : panel === 'adjust' ? (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <p className={T.title}>Adjust</p>
                      <div className="flex gap-1">
                        <button
                          className={`${chip(false)} select-none active:bg-paper active:text-ink`}
                          onPointerDown={() => glApi.current?.setBypass(true)} onPointerUp={() => glApi.current?.setBypass(false)}
                          onPointerLeave={() => glApi.current?.setBypass(false)} onPointerCancel={() => glApi.current?.setBypass(false)}
                          onContextMenu={(e) => e.preventDefault()}
                        >Before</button>
                        <button className={`${chip(false)} disabled:opacity-30`} disabled={noGlobal} onClick={() => setVals(ZERO)}>Reset</button>
                      </div>
                    </div>
                    <Sliders controls={CONTROLS} groups={GROUPS} values={vals} onChange={(k2, val) => setVals((x) => ({ ...x, [k2]: val }))} active={ctl} setActive={setCtl} />
                    {!glReady && <p className={`mt-2 ${T.muted}`}>Loading full resolution…</p>}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className={T.title}>Layers</p>
                      <div className="flex items-center gap-3">
                        <span className={T.muted}>{layers.length} / {MAX_LAYERS}</span>
                        <button aria-label="How masking works" onClick={() => setGuide((g) => !g)} className={`grid size-7 place-items-center rounded-full text-[13px] transition-colors ${guide ? 'bg-paper text-ink' : 'bg-paper/[.08] text-paper/70 hover:text-paper'}`}>?</button>
                      </div>
                    </div>
                    {guide && <MaskGuide onClose={closeGuide} />}
                    {!glReady && <p className={`mt-3 ${T.muted}`}>Loading full resolution…</p>}

                    {/* Layer list */}
                    {layers.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {layers.map((L, i) => (
                          <li key={L.id}>
                            <div className={`flex h-11 items-center gap-2 rounded-xl pr-2 pl-1 transition-colors ${i === li ? 'bg-paper/[.1]' : 'hover:bg-paper/[.05]'}`}>
                              <button aria-label={L.visible ? 'Hide layer' : 'Show layer'} onClick={() => toggleLayer(i)} className={`grid size-9 place-items-center rounded-lg ${L.visible ? 'text-paper' : 'text-paper/30'}`}>
                                <Icon d={L.visible ? 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z' : 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3 3.6M6.6 6.6C3.9 8.3 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6'} className="size-4">{L.visible && <circle cx="12" cy="12" r="3" />}</Icon>
                              </button>
                              <button className="flex min-w-0 flex-1 items-center justify-between text-left" onClick={() => selectLayer(i)}>
                                <span className={`truncate text-[13px] ${L.visible ? 'text-paper' : 'text-paper/40'}`}>{L.name}</span>
                                <span className="ml-2 shrink-0 text-xs text-paper/45">{L.comps.map((c) => typeName(c.type)).join(' · ')}</span>
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      className={`mt-3 w-full ${btn(adding?.fresh)} disabled:opacity-30`}
                      disabled={layers.length >= MAX_LAYERS || nComps >= MAX_COMPS || !nat}
                      onClick={() => setAdding((a2) => (a2?.fresh ? null : { op: 'add', fresh: true }))}
                    >+ New layer</button>

                    {/* Type picker: for a new layer or a new mask inside the selected layer */}
                    {adding && (
                      <div className="mt-3 rounded-xl bg-paper/[.04] p-3">
                        <div className="flex items-center justify-between">
                          <p className={T.title}>{adding.fresh ? 'New layer: choose a mask' : `${OP_UI[adding.op][1]} a mask ${adding.op === 'add' ? 'to' : adding.op === 'subtract' ? 'from' : 'with'} ${al?.name}`}</p>
                          <button className="text-[13px] text-paper/55 hover:text-paper" onClick={() => setAdding(null)}>Cancel</button>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {TYPES.map(([type, name]) => (
                            <button
                              key={type} onClick={() => addMask(type)}
                              className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-paper/[.06] text-[13px] text-paper/80 transition-colors hover:bg-paper/[.1] hover:text-paper lg:h-16 lg:flex-col lg:gap-1"
                            >
                              <TypeIcon type={type} />{name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {al && am ? (
                      <>
                        <Section title={al.name}>
                          <div className="-mx-gut flex gap-2 overflow-x-auto px-gut [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden">
                            <button className={chip(overlay)} onClick={() => setOverlay((o) => !o)}>Overlay</button>
                            <button className={chip(false)} disabled={li === 0} onClick={() => moveLayer(-1)} aria-label="Move layer up">↑</button>
                            <button className={chip(false)} disabled={li === layers.length - 1} onClick={() => moveLayer(1)} aria-label="Move layer down">↓</button>
                            <button className={`${chip(false)} disabled:opacity-30`} disabled={layers.length >= MAX_LAYERS || nComps + al.comps.length > MAX_COMPS} onClick={dupLayer}>Duplicate</button>
                            <button className={chip(false)} onClick={delLayer}>Delete layer</button>
                          </div>
                          <Field name="Layer amount" value={al.amount} def={100} unit="%" onChange={(val) => updLayer({ amount: val })} />
                        </Section>

                        <Section title="Masks in this layer">
                          <div className="-mx-gut flex gap-2 overflow-x-auto px-gut [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden">
                            {al.comps.map((c2, j) => (
                              <button key={c2.id} className={chip(j === ci)} onClick={() => { setCi(j); setPicking(false) }}>
                                <span className="opacity-60">{j === 0 ? '' : OP_UI[c2.op][0]}</span>{typeName(c2.type)}{c2.invert ? ' (inv)' : ''}
                              </button>
                            ))}
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {['add', 'subtract', 'intersect'].map((op) => (
                              <button
                                key={op} disabled={nComps >= MAX_COMPS}
                                className={`h-9 rounded-full text-[13px] transition-colors disabled:opacity-30 ${adding && !adding.fresh && adding.op === op ? 'bg-paper text-ink' : 'bg-paper/[.07] text-paper/75 hover:bg-paper/[.12] hover:text-paper'}`}
                                onClick={() => setAdding((a2) => (a2 && !a2.fresh && a2.op === op ? null : { op, fresh: false }))}
                              >{OP_UI[op][0]} {OP_UI[op][1]}</button>
                            ))}
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button className={chip(am.invert)} onClick={() => updMask((m) => ({ invert: !m.invert }))}>Invert</button>
                            {ci > 0 && (
                              <div className="flex rounded-full bg-paper/[.07] p-0.5">
                                {['add', 'subtract', 'intersect'].map((op) => (
                                  <button key={op} title={OP_UI[op][1]} className={`h-7 rounded-full px-2.5 text-[13px] ${am.op === op ? 'bg-paper text-ink' : 'text-paper/70'}`} onClick={() => updMask({ op })}>{OP_UI[op][0]}</button>
                                ))}
                              </div>
                            )}
                            <button className={`${chip(false)} ml-auto`} onClick={delMask}>Remove</button>
                          </div>
                        </Section>

                        {am.type === 'object' && (
                          <Section title="Selection">
                            <p className={T.muted}>
                              {segBusy ? 'Finding the object… (first time loads the AI model, a few seconds)' : am.selected ? 'Object selected. Tap “Select again” to pick something else.' : 'Tap the object on the photo.'}
                            </p>
                            <button className={`mt-3 ${btn(picking === 'object')}`} disabled={segBusy} onClick={() => setPicking((x) => (x === 'object' ? false : 'object'))}>
                              {picking === 'object' ? 'Tap the photo…' : am.selected ? 'Select again' : 'Select object'}
                            </button>
                          </Section>
                        )}
                        {am.type === 'color' && (
                          <Section title="Selection">
                            <div className="flex items-center gap-3">
                              <span className="size-8 shrink-0 rounded-full border border-paper/20" style={{ background: am.range.color ? `rgb(${am.range.color.map((x) => Math.round(x * 255)).join(',')})` : 'transparent' }} />
                              <button className={btn(picking === 'color')} onClick={() => setPicking((x) => (x === 'color' ? false : 'color'))}>{picking === 'color' ? 'Tap the photo…' : am.range.color ? 'Pick again' : 'Pick a color'}</button>
                            </div>
                            <Field name="Range" value={am.range.tol} def={30} onChange={(val) => updRange({ tol: val })} />
                          </Section>
                        )}
                        {am.type === 'luminance' && (
                          <Section title="Selection">
                            <Field name="Dark limit" value={am.range.lo} onChange={(val) => updRange({ lo: Math.min(val, am.range.hi) })} />
                            <Field name="Bright limit" value={am.range.hi} def={100} onChange={(val) => updRange({ hi: Math.max(val, am.range.lo) })} />
                            <Field name="Smoothness" value={am.range.smooth} def={20} onChange={(val) => updRange({ smooth: val })} />
                          </Section>
                        )}

                        {am.type === 'select' && (
                          <Section title="Selection tools">
                            <div className="grid grid-cols-3 gap-1.5">
                              {[['pen', 'Pen', 'M12 19l7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6M11 11a2 2 0 1 0 0-.01'],
                                ['lasso', 'Lasso', 'M7 17c-2.5-1-4-3-4-5.5C3 7.4 7 4 12 4s9 3.4 9 7.5S17 19 12 19c-1.2 0-2.3-.2-3.3-.5M7 17l-1 4 3-2'],
                                ['rect', 'Rect', 'M4 5h16v14H4z'],
                                ['ellipse', 'Ellipse', 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z'],
                                ['wand', 'Wand', 'M4 20L15 9M15 4v2M15 12v2M20 9h-2M12 9h-2M18.5 5.5l-1.4 1.4M18.5 12.5l-1.4-1.4'],
                                ['brush', 'Brush', 'M14 4l6 6-8.5 8.5a3 3 0 0 1-4.2 0l-1.8-1.8a3 3 0 0 1 0-4.2zM4 20h5']].map(([tool, name, d]) => (
                                <button
                                  key={tool} onClick={() => setSel((x) => ({ ...x, tool }))} aria-pressed={sel.tool === tool}
                                  className={`flex h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition-colors ${sel.tool === tool ? 'bg-paper text-ink' : 'bg-paper/[.06] text-paper/75 hover:bg-paper/[.1] hover:text-paper'}`}
                                ><Icon d={d} className="size-[18px]" />{name}</button>
                              ))}
                            </div>
                            <Segmented value={sel.mode} options={[['New', 'new'], ['Add', 'add'], ['Subtract', 'subtract']]} onChange={(mode) => setSel((x) => ({ ...x, mode }))} />
                            {sel.tool === 'pen' && (
                              <div className="mt-3 rounded-xl bg-paper/[.04] p-3">
                                <p className={T.muted}>{!pen ? 'Click on the photo to start a path.' : pen.closed ? 'Path closed. Adjust points, then apply.' : `${pen.pts.length} point${pen.pts.length === 1 ? '' : 's'} · click the red point to close`}</p>
                                <div className="mt-2 grid grid-cols-3 gap-2">
                                  <button className={`${chip(false)} justify-center disabled:opacity-30`} disabled={!pen} onClick={penUndoPoint}>Undo point</button>
                                  <button className={`${chip(false)} justify-center disabled:opacity-30`} disabled={!pen} onClick={() => setPen(null)}>Cancel</button>
                                  <button className={`${chip(true)} justify-center disabled:opacity-30`} disabled={!pen || pen.pts.length < 3} onClick={penApply}>Apply</button>
                                </div>
                              </div>
                            )}
                            {sel.tool === 'brush' ? (
                              <>
                                <Field name="Size" value={brush.size} min={10} max={300} def={60} unit="px" onChange={(val) => setBrush((b) => ({ ...b, size: val }))} />
                                <Field name="Hardness" value={brush.hard} def={50} unit="%" onChange={(val) => setBrush((b) => ({ ...b, hard: val }))} />
                              </>
                            ) : (
                              <Field name="Feather" value={sel.feather} onChange={(val) => setSel((x) => ({ ...x, feather: val }))} />
                            )}
                            {sel.tool === 'wand' && (
                              <>
                                <Field name="Tolerance" value={sel.tol} def={30} onChange={(val) => setSel((x) => ({ ...x, tol: val }))} />
                                <button className={`mt-3 ${chip(sel.contiguous)}`} onClick={() => setSel((x) => ({ ...x, contiguous: !x.contiguous }))}>Contiguous</button>
                              </>
                            )}
                            <div className="mt-3 flex gap-2">
                              <button className={chip(false)} onClick={() => selAll(true)}>Select all</button>
                              <button className={chip(false)} onClick={() => selAll(false)}>Clear</button>
                            </div>
                          </Section>
                        )}

                        {(am.type === 'radial' || (am.canvas && am.type !== 'select')) && (
                        <Section title={am.canvas ? 'Brush' : 'Shape'}>
                          {am.canvas && (
                            <>
                              <Segmented value={brush.erase} options={[['Paint', false], ['Erase', true]]} onChange={(er) => setBrush((b) => ({ ...b, erase: er }))} />
                              <Field name="Size" value={brush.size} min={10} max={300} def={60} unit="px" onChange={(val) => setBrush((b) => ({ ...b, size: val }))} />
                              <Field name="Hardness" value={brush.hard} def={50} unit="%" onChange={(val) => setBrush((b) => ({ ...b, hard: val }))} />
                            </>
                          )}
                          {am.type === 'radial' && (
                            <>
                              <Field name="Feather" value={Math.round(am.feather * 100)} def={50} unit="%" onChange={(val) => updMask({ feather: val / 100 })} />
                              <Field name="Angle" value={am.angle} min={-90} max={90} unit="°" onChange={(val) => updMask({ angle: val })} />
                            </>
                          )}
                        </Section>
                        )}

                        {['select', 'radial', 'linear', 'brush', 'object'].includes(am.type) && (
                          <Section title="Refine">
                            <Segmented
                              value={am.range.mode}
                              options={[['None', 'none'], ['Light', 'luminance'], ['Color', 'color']]}
                              onChange={(mode) => { updRange({ mode }); setPicking(mode === 'color' && !am.range.color ? 'color' : false) }}
                            />
                            {am.range.mode === 'luminance' && (
                              <>
                                <Field name="Dark limit" value={am.range.lo} onChange={(val) => updRange({ lo: Math.min(val, am.range.hi) })} />
                                <Field name="Bright limit" value={am.range.hi} def={100} onChange={(val) => updRange({ hi: Math.max(val, am.range.lo) })} />
                                <Field name="Smoothness" value={am.range.smooth} def={20} onChange={(val) => updRange({ smooth: val })} />
                              </>
                            )}
                            {am.range.mode === 'color' && (
                              <>
                                <div className="mt-3 flex items-center gap-3">
                                  <span className="size-8 shrink-0 rounded-full border border-paper/20" style={{ background: am.range.color ? `rgb(${am.range.color.map((x) => Math.round(x * 255)).join(',')})` : 'transparent' }} />
                                  <button className={btn(picking === 'color')} onClick={() => setPicking((x) => (x === 'color' ? false : 'color'))}>{picking === 'color' ? 'Tap the photo…' : am.range.color ? 'Pick again' : 'Pick a color'}</button>
                                </div>
                                <Field name="Range" value={am.range.tol} def={30} onChange={(val) => updRange({ tol: val })} />
                              </>
                            )}
                            {am.range.mode === 'none' && <p className={`mt-2 ${T.muted}`}>Limit the mask to bright or dark tones, or to one color.</p>}
                          </Section>
                        )}

                        <Section title="Adjust this layer">
                          <Sliders controls={MASK_CONTROLS} groups={MASK_GROUPS} values={al.vals} onChange={(k2, val) => updLayer((L) => ({ vals: { ...L.vals, [k2]: val } }))} active={mctl} setActive={setMctl} />
                        </Section>
                      </>
                    ) : (
                      !guide && !adding && <p className={`mt-4 ${T.muted}`}>Create a layer to edit just part of the photo.</p>
                    )}
                  </>
                )}
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Tool rail: right (desktop) / bottom (mobile) */}
          <div className="relative z-10 flex shrink-0 items-center justify-center gap-1 border-t border-paper/[.08] px-2 pt-2 pb-[max(.75rem,env(safe-area-inset-bottom))] lg:h-auto lg:w-20 lg:flex-col lg:justify-between lg:border-t-0 lg:border-l lg:border-paper/[.06] lg:px-0 lg:py-gut">
            <div className="flex flex-col items-center gap-2 max-lg:hidden">
              <SaveButton onClick={saveAndDownload} disabled={saveDisabled} saving={saving} />
              <PreviewButton onClick={openPreview} disabled={previewDisabled} busy={building && !preview} />
            </div>
            <div className="contents lg:flex lg:flex-col lg:items-center lg:gap-1.5">
              <Tool className="hidden lg:flex" label="Zoom in (+)" onClick={() => zoom((z) => z * 1.5)} disabled={cropping || zc >= ZMAX}><Icon d={I.plus} /></Tool>
              <span className="hidden text-center text-xs text-paper/50 tabular-nums lg:block">{Math.round(zc * 100)}%</span>
              <Tool className="hidden lg:flex" label="Zoom out (−)" onClick={() => zoom((z) => z / 1.5)} disabled={cropping || zc <= 1.001}><Icon d={I.minus} /></Tool>
              <Tool className="hidden lg:flex" label="Fit (0)" onClick={fit} disabled={zc <= 1.001}><Icon d={I.fit} /></Tool>
              <span className="hidden h-px w-6 shrink-0 bg-paper/10 lg:my-2 lg:block" />
              {/* Edit tools (highlighted by the first-visit tip) */}
              <div className="relative flex items-center gap-1 lg:flex-col lg:gap-1.5" onPointerDownCapture={() => editTip && closeEditTip()}>
                <Tool label="Rotate (R)" short="Rotate" onClick={rotate}><Icon d={I.rotate} /></Tool>
                <Tool label="Crop (C)" short="Crop" active={cropping} onClick={startCrop}><Icon d={I.crop} /></Tool>
                <Tool label="Presets" short="Presets" active={panel === 'presets' && !cropping} onClick={() => togglePanel('presets')}><Icon d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></Tool>
                <Tool label="Adjust" short="Adjust" active={panel === 'adjust' && !cropping} onClick={() => togglePanel('adjust')}><AdjustIcon /></Tool>
                <Tool label="Mask" short="Mask" active={masking} onClick={() => togglePanel('mask')}><MaskIcon /></Tool>
                <span className="hidden h-px w-6 shrink-0 bg-paper/10 lg:my-2 lg:block" />
                <Tool label="Undo (⌘Z)" short="Undo" onClick={undo} disabled={!canUndo && !pending.current}><Icon d={I.undo} /></Tool>
                <Tool label="Reset all" short="Reset" onClick={resetAll} disabled={!dirty}><Icon d={I.trash} /></Tool>
                <AnimatePresence>{editTip && <EditTip key="tip" onClose={closeEditTip} />}</AnimatePresence>
              </div>
            </div>
            <span className="hidden h-[5.5rem] w-10 lg:block" aria-hidden="true" />
          </div>

          <AnimatePresence>
            {preview && (
              <Preview
                key="preview" before={preview.before} after={preview.after} onBack={closePreview}
                onDownload={() => askDownload(downloadEdited, { ...p, edited: true })}
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Final result before downloading: drag the divider to compare with the original (same crop + rotation).
function Preview({ before, after, onBack, onDownload }) {
  const [mode, setMode] = useState('compare') // compare | after | before
  const [pos, setPos] = useState(50)
  const box = useRef(null)
  const dragging = useRef(false)
  const setFrom = (e) => {
    const r = box.current.getBoundingClientRect()
    setPos(clamp(((e.clientX - r.left) / r.width) * 100, 0, 100))
  }
  return (
    <motion.div
      className="absolute inset-0 z-40 flex flex-col bg-ink"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
      role="dialog" aria-label="Preview"
    >
      <div className="flex h-[calc(3.75rem+env(safe-area-inset-top))] shrink-0 items-center gap-3 px-3 pt-[env(safe-area-inset-top)] lg:px-gut">
        <button className={btn(false)} onClick={onBack}>Back</button>
        <p className="hidden text-[13px] text-paper/55 sm:block">Preview of your edit</p>
        <button className={`ml-auto gap-2 ${btn(true)}`} onClick={onDownload}><Icon d={I.save} className="size-4" />Download</button>
      </div>
      <div className="flex justify-center pb-2">
        <Segmented value={mode} options={[['Compare', 'compare'], ['After', 'after'], ['Before', 'before']]} onChange={setMode} />
      </div>
      <div className="relative min-h-0 flex-1 p-3 lg:p-6">
        <div
          ref={box}
          className={`relative size-full touch-none select-none ${mode === 'compare' ? 'cursor-ew-resize' : ''}`}
          onPointerDown={(e) => { if (mode !== 'compare') return; dragging.current = true; capture(e.currentTarget, e); setFrom(e) }}
          onPointerMove={(e) => dragging.current && setFrom(e)}
          onPointerUp={() => (dragging.current = false)} onPointerCancel={() => (dragging.current = false)}
        >
          <img src={mode === 'before' ? before : after} alt="Edited photo" draggable={false} className="absolute inset-0 size-full object-contain" />
          {mode === 'compare' && (
            <>
              <img src={before} alt="Original photo" draggable={false} className="absolute inset-0 size-full object-contain" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
              <div className="pointer-events-none absolute inset-y-0 w-px bg-paper" style={{ left: `${pos}%` }}>
                <span className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-paper text-ink shadow-lg">
                  <Icon d="M9 7l-5 5 5 5M15 7l5 5-5 5" className="size-4" />
                </span>
              </div>
              <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-ink/70 px-3 py-1 text-xs text-paper">Before</span>
              <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-ink/70 px-3 py-1 text-xs text-paper">After</span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// Coachmark next to the edit tools (shown each time a photo is opened): a pulsing outline around them + a short explanation.
function EditTip({ onClose }) {
  return (
    <>
      <motion.span
        aria-hidden="true" className="pointer-events-none absolute -inset-1.5 rounded-2xl border-2 border-paper"
        initial={{ opacity: 0 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}
        animate={{ opacity: [0.35, 1, 0.35], transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } }}
      />
      <motion.div
        role="dialog" aria-label="Why is there an editing feature?"
        className="absolute bottom-full left-1/2 z-40 mb-5 w-[min(19rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl bg-paper p-4 text-ink shadow-2xl lg:top-1/2 lg:right-full lg:bottom-auto lg:left-auto lg:mr-5 lg:mb-0 lg:-translate-x-0 lg:-translate-y-1/2"
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.25 }}
      >
        <span aria-hidden="true" className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 bg-paper lg:top-1/2 lg:-right-1.5 lg:bottom-auto lg:left-auto lg:-translate-x-0 lg:-translate-y-1/2" />
        <p className="text-[15px] font-medium">Why is there an editing feature?</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink/70">
          So you don’t have to edit the photo twice and lower its resolution. Your edits are applied straight to the full-resolution original.
        </p>
        <button onClick={onClose} className="mt-3 h-9 rounded-full bg-ink px-4 text-[13px] font-medium text-paper">Got it</button>
      </motion.div>
    </>
  )
}

function Section({ title, children }) {
  return (
    <section className="mt-5 border-t border-paper/[.07] pt-4">
      <p className={`mb-1 ${T.title}`}>{title}</p>
      {children}
    </section>
  )
}

function Segmented({ value, options, onChange }) {
  return (
    <div className="mt-2 flex rounded-full bg-paper/[.07] p-1">
      {options.map(([name, val]) => (
        <button key={name} onClick={() => onChange(val)} className={`h-8 flex-1 rounded-full px-3 text-[13px] transition-colors ${value === val ? 'bg-paper text-ink' : 'text-paper/70 hover:text-paper'}`}>{name}</button>
      ))}
    </div>
  )
}

const GUIDE = [
  ['Choose a mask', 'Selection to pick an exact area (lasso, rectangle, magic wand), Object to select a thing with AI, Radial or Linear for soft areas, Brush to paint.'],
  ['Shape it on the photo', 'Drag the handles. The red overlay shows what will change.'],
  ['Adjust that area', 'Use the sliders under “Adjust this area”. The rest of the photo stays the same.'],
  ['Refine', 'Invert flips the area. Luminance or Color keeps the change to bright, dark, or one color.'],
]
function MaskGuide({ onClose }) {
  return (
    <div className="mt-3 rounded-xl bg-paper/[.05] p-4">
      <div className="flex items-center justify-between">
        <p className={T.title}>How masking works</p>
        <button onClick={onClose} className="text-[13px] text-paper/55 transition-colors hover:text-paper">Got it</button>
      </div>
      <ol className="mt-3 space-y-3">
        {GUIDE.map(([title, text], i) => (
          <li key={title} className="flex gap-3">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-paper text-[11px] font-medium text-ink">{i + 1}</span>
            <p className="text-[13px] leading-snug text-paper/60"><span className="text-paper">{title}.</span> {text}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

// Round mask handle with a constant on-screen size (s = image px per screen px).
function Handle({ x, y, s, cursor, onPointerDown }) {
  return (
    <g className="pointer-events-auto" style={{ cursor }} onPointerDown={onPointerDown}>
      <circle cx={x} cy={y} r={16 * s} fill="transparent" />
      <circle cx={x} cy={y} r={6 * s} fill="white" stroke="rgb(0 0 0 / .45)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </g>
  )
}

function PresetTile({ label, thumb, rot, active, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={active} className="w-[4.75rem] shrink-0 text-left lg:w-auto">
      <span className={`block aspect-square overflow-hidden rounded-lg bg-paper/[.06] ring-2 ring-offset-2 ring-offset-[#0b0b0b] transition-shadow ${active ? 'ring-paper' : 'ring-transparent'}`}>
        {thumb && <img src={thumb} alt="" draggable={false} className="size-full object-cover" style={{ transform: `rotate(${rot}deg)` }} />}
      </span>
      <span className={`mt-1.5 block truncate text-[11px] ${active ? 'text-paper' : 'text-paper/60'}`}>{label}</span>
    </button>
  )
}

function PreviewButton({ busy, ...props }) {
  return (
    <button
      aria-label="Preview edit"
      className="group relative grid size-10 shrink-0 place-items-center rounded-full bg-paper/[.1] text-paper transition-[background-color,opacity] hover:bg-paper/[.18] disabled:opacity-30"
      {...props}
    >
      <Icon d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" className={`size-[18px] ${busy ? 'animate-pulse' : ''}`}><circle cx="12" cy="12" r="3" /></Icon>
      <span className="pointer-events-none absolute top-1/2 right-full mr-2 hidden -translate-y-1/2 rounded-md border border-paper/10 bg-[#1a1a1a] px-2 py-1 text-xs whitespace-nowrap text-paper opacity-0 transition-opacity group-hover:opacity-100 lg:block">
        {busy ? 'Preparing preview…' : 'Preview edit'}
      </span>
    </button>
  )
}

function SaveButton({ className = '', saving, ...props }) {
  return (
    <button
      aria-label="Save & download"
      className={`group relative grid size-10 shrink-0 place-items-center rounded-full bg-paper text-ink transition-[background-color,opacity] hover:bg-paper/85 disabled:opacity-40 ${className}`}
      {...props}
    >
      <Icon d={I.save} className={`size-[18px] ${saving ? 'animate-pulse' : ''}`} />
      <span className="pointer-events-none absolute top-1/2 right-full mr-2 hidden -translate-y-1/2 rounded-md border border-paper/10 bg-[#1a1a1a] px-2 py-1 text-xs whitespace-nowrap text-paper opacity-0 transition-opacity group-hover:opacity-100 lg:block">
        {saving ? 'Saving…' : 'Save & download'}
      </span>
    </button>
  )
}
