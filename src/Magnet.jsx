import { useEffect, useRef } from 'react'
import gsap from 'gsap'

// Button whose circle (and, a bit more, its icon) is pulled toward the cursor while hovered.
const LOOK = {
  outline: ['border-paper/25 group-hover:border-paper group-hover:bg-paper', 'text-paper group-hover:text-ink'],
  solid: ['border-transparent bg-paper group-hover:bg-ink group-hover:border-paper/40', 'text-ink group-hover:text-paper'],
  accent: ['border-transparent bg-accent group-hover:brightness-110', 'text-white'],
}

export default function Magnet({ children, className = '', strength = 0.35, look = 'outline', ...props }) {
  const hit = useRef(null)
  const ring = useRef(null)
  const icon = useRef(null)

  useEffect(() => {
    const el = hit.current
    const opts = { duration: 0.7, ease: 'power3.out' }
    const rx = gsap.quickTo(ring.current, 'x', opts), ry = gsap.quickTo(ring.current, 'y', opts)
    const ix = gsap.quickTo(icon.current, 'x', opts), iy = gsap.quickTo(icon.current, 'y', opts)
    const move = (e) => {
      if (e.pointerType !== 'mouse') return
      const r = el.getBoundingClientRect()
      const dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2
      rx(dx * strength); ry(dy * strength); ix(dx * strength * 0.5); iy(dy * strength * 0.5)
    }
    const leave = () => { rx(0); ry(0); ix(0); iy(0) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave) }
  }, [strength])

  return (
    <button ref={hit} className={`group grid shrink-0 place-items-center ${className}`} {...props}>
      <span ref={ring} className={`grid size-full place-items-center rounded-full border transition-colors duration-300 group-active:scale-95 ${LOOK[look][0]}`}>
        <span ref={icon} className={`grid place-items-center transition-colors duration-300 ${LOOK[look][1]}`}>{children}</span>
      </span>
    </button>
  )
}
