import { useRef } from 'react'

// Pointer capture can throw on iOS (e.g. pointer already gone); dragging must keep working without it.
const capture = (el, e) => { try { el.setPointerCapture(e.pointerId) } catch { /* ignore */ } }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

// Touch-friendly slider.
// Mouse: click or drag sets the value under the cursor.
// Touch: tap jumps there; horizontal drag moves relative to where the finger started (no jumps);
// vertical swipes stay with the page so the panel can scroll. Double-tap / double-click resets to `def`.
export default function Slider({ value, onChange, min = -100, max = 100, def = 0, label, big }) {
  const track = useRef(null)
  const g = useRef(null)
  const lastTap = useRef(0)

  const at = (x) => {
    const r = track.current.getBoundingClientRect()
    return Math.round(clamp(min + ((x - r.left) / r.width) * (max - min), min, max))
  }
  const down = (e) => {
    if (e.button > 0) return
    capture(e.currentTarget, e)
    const mouse = e.pointerType === 'mouse'
    g.current = { x: e.clientX, y: e.clientY, v0: value, mouse, dragging: mouse, w: track.current.getBoundingClientRect().width }
    if (mouse) onChange(at(e.clientX))
  }
  const move = (e) => {
    const G = g.current
    if (!G) return
    const dx = e.clientX - G.x, dy = e.clientY - G.y
    if (!G.dragging) {
      if (Math.abs(dx) < 4 || Math.abs(dx) < Math.abs(dy)) return
      G.dragging = true
    }
    onChange(G.mouse ? at(e.clientX) : Math.round(clamp(G.v0 + (dx / G.w) * (max - min), min, max)))
  }
  const up = (e) => {
    const G = g.current
    g.current = null
    if (!G) return
    const now = performance.now()
    if (now - lastTap.current < 300) { onChange(clamp(def, min, max)); lastTap.current = 0; return }
    lastTap.current = now
    if (!G.mouse && !G.dragging) onChange(at(e.clientX)) // plain tap
  }
  const key = (e) => {
    const step = e.shiftKey ? 10 : 1
    const next = { ArrowRight: value + step, ArrowUp: value + step, ArrowLeft: value - step, ArrowDown: value - step, Home: min, End: max }[e.key]
    if (next === undefined) return
    e.preventDefault()
    onChange(clamp(next, min, max))
  }

  const pct = (v) => ((v - min) / (max - min)) * 100
  const zero = pct(clamp(0, min, max))
  const now = pct(value)
  return (
    <div
      role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
      className={`group relative flex cursor-pointer touch-pan-y items-center outline-none select-none ${big ? 'h-12' : 'h-9 lg:h-7'}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => (g.current = null)} onKeyDown={key}
    >
      <div ref={track} className="relative h-[3px] w-full rounded-full bg-paper/15">
        {min < 0 && <span className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-paper/40" style={{ left: `${zero}%` }} />}
        <span className="absolute inset-y-0 rounded-full bg-paper" style={{ left: `${Math.min(zero, now)}%`, width: `${Math.abs(now - zero)}%` }} />
        <span
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper shadow-[0_0_0_4px_rgb(0_0_0/.6)] transition-transform group-active:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-paper/60 ${big ? 'size-6' : 'size-5 lg:size-3.5'}`}
          style={{ left: `${now}%` }}
        />
      </div>
    </div>
  )
}
