import { useEffect, useRef, useState } from 'react'
import { WebGLRenderer, Scene, OrthographicCamera, PlaneGeometry, Mesh, ShaderMaterial, TextureLoader } from 'three'
import { url } from './imgix.js'
import { askDownload } from './Consent.jsx'

const CONTROLS = [
  ['exposure', 'Exposure'], ['brightness', 'Brightness'], ['contrast', 'Contrast'],
  ['highlights', 'Highlights'], ['shadows', 'Shadows'], ['saturation', 'Saturation'],
  ['vibrance', 'Vibrance'], ['temperature', 'Temperature'], ['tint', 'Tint'],
]
const ZERO = Object.fromEntries(CONTROLS.map(([k]) => [k, 0]))

const vertexShader = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`
// All sliders arrive as -1..1. Exposure + white balance work in linear light, the rest in display (sRGB) space.
const fragmentShader = `
uniform sampler2D uTex; uniform float uBypass, exposure, brightness, contrast, highlights, shadows, saturation, vibrance, temperature, tint;
varying vec2 vUv;
float luma(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
void main(){
  vec3 c = texture2D(uTex, vUv).rgb;
  if (uBypass > .5) { gl_FragColor = vec4(c, 1.); return; }
  vec3 l = pow(c, vec3(2.2)) * exp2(exposure * 2.);
  l *= vec3(1. + temperature * .25, 1. - tint * .2, 1. - temperature * .25);
  c = pow(max(l, 0.), vec3(1. / 2.2));
  c += brightness * .25;
  c = (c - .5) * (1. + contrast * (contrast > 0. ? 1. : .8)) + .5;
  float L = luma(c);
  c += highlights * .3 * smoothstep(.45, 1., L);
  c += shadows * .3 * (1. - smoothstep(0., .55, L));
  L = luma(c);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(L), c, (1. + saturation) * (1. + vibrance * (1. - sat)));
  gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
}`

export default function Editor({ photo }) {
  const box = useRef(null)
  const canvas = useRef(null)
  const api = useRef(null)
  const [v, setV] = useState(ZERO)
  const [before, setBefore] = useState(false)
  const [state, setState] = useState('loading') // loading | ready | error
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const renderer = new WebGLRenderer({ canvas: canvas.current, preserveDrawingBuffer: true, antialias: false })
    const max = Math.min(renderer.capabilities.maxTextureSize, 8192)
    const u = { uTex: { value: null }, uBypass: { value: 0 }, ...Object.fromEntries(CONTROLS.map(([k]) => [k, { value: 0 }])) }
    const geo = new PlaneGeometry(2, 2)
    const mat = new ShaderMaterial({ uniforms: u, vertexShader, fragmentShader })
    const scene = new Scene()
    scene.add(new Mesh(geo, mat))
    const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    let tex, w = 1, h = 1, dead = false

    const draw = () => tex && renderer.render(scene, cam)
    const fit = () => {
      if (!tex) return
      const s = Math.min(box.current.clientWidth / w, box.current.clientHeight / h)
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
      renderer.setSize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)))
      draw()
    }
    const ro = new ResizeObserver(fit)
    ro.observe(box.current)

    // Full resolution (capped by the GPU's max texture size) so the saved file is full size.
    new TextureLoader().setCrossOrigin('anonymous').load(
      url(photo.src, { fit: 'max', w: max, h: max, q: 95 }),
      (t) => {
        if (dead) return t.dispose()
        tex = t; u.uTex.value = t
        w = t.image.width; h = t.image.height
        fit(); setState('ready')
      },
      undefined,
      () => !dead && setState('error'),
    )

    api.current = {
      set(vals, bypass) {
        for (const [k] of CONTROLS) u[k].value = vals[k] / 100
        u.uBypass.value = bypass ? 1 : 0
        draw()
      },
      save: () => new Promise((res) => {
        renderer.setPixelRatio(1)
        renderer.setSize(w, h, false) // full-size buffer; CSS size untouched so nothing jumps
        u.uBypass.value = 0
        draw()
        canvas.current.toBlob((b) => { fit(); res(b) }, 'image/jpeg', 0.95)
      }),
    }

    return () => {
      dead = true
      ro.disconnect()
      tex?.dispose(); geo.dispose(); mat.dispose()
      renderer.dispose(); renderer.forceContextLoss()
    }
  }, [photo.src])

  useEffect(() => { api.current?.set(v, before) }, [v, before, state])

  const save = async () => {
    setSaving(true)
    try {
      const blob = await api.current.save()
      if (!blob) throw new Error('export failed')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = photo.src.split('/').pop().replace(/\.\w+$/, '') + '-edited.jpg'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    } catch {
      alert('Could not save this photo. Try a smaller window or another browser.')
    }
    setSaving(false)
  }

  const btn = 'whitespace-nowrap text-[11px] uppercase tracking-[.2em] transition-opacity disabled:opacity-30'
  return (
    <div className="absolute inset-x-0 top-16 bottom-0 flex flex-col lg:flex-row">
      <div className="relative min-h-0 flex-1">
        <div ref={box} className="absolute inset-gut grid place-items-center">
          <canvas ref={canvas} className={state === 'ready' ? '' : 'opacity-0'} />
          {state !== 'ready' && (
            <p className="absolute text-[11px] uppercase tracking-[.2em] text-dim">{state === 'error' ? 'Could not load photo' : 'Loading full resolution…'}</p>
          )}
        </div>
      </div>
      <aside className="max-h-[45svh] shrink-0 overflow-y-auto border-t border-paper/10 px-gut py-4 lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l lg:py-gut">
        {CONTROLS.map(([k, label]) => (
          <label key={k} className="block py-1.5" onDoubleClick={() => setV((x) => ({ ...x, [k]: 0 }))}>
            <span className="flex justify-between text-[11px] uppercase tracking-[.2em] text-dim">
              <span>{label}</span>
              <span className="tabular-nums text-paper">{v[k] > 0 ? '+' : ''}{v[k]}</span>
            </span>
            <input
              type="range" min="-100" max="100" step="1" value={v[k]} className="slider"
              onChange={(e) => setV((x) => ({ ...x, [k]: +e.target.value }))}
            />
          </label>
        ))}
        <div className="mt-4 flex items-center justify-between gap-3 pb-2">
          <button
            className={`${btn} text-dim hover:text-paper select-none`}
            onPointerDown={() => setBefore(true)} onPointerUp={() => setBefore(false)} onPointerLeave={() => setBefore(false)}
            onContextMenu={(e) => e.preventDefault()}
          >Before</button>
          <button className={`${btn} text-dim hover:text-paper`} onClick={() => setV(ZERO)}>Reset</button>
          <button className={`${btn} rounded-full bg-paper px-4 py-2.5 text-ink hover:opacity-80`} onClick={() => askDownload(save, { ...photo, edited: true })} disabled={state !== 'ready' || saving}>
            {saving ? 'Saving…' : 'Save edited'}
          </button>
        </div>
      </aside>
    </div>
  )
}
