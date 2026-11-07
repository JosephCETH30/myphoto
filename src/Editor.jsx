import { useEffect, useRef, useState } from 'react'
import { WebGLRenderer, Scene, OrthographicCamera, PlaneGeometry, Mesh, ShaderMaterial, TextureLoader, Vector2, Vector4, CanvasTexture, LinearFilter } from 'three'
import { url } from './imgix.js'
import { CONTROLS, MAX_MASKS, MASK_TYPE, RANGE_MODE, toIQ } from './controls.js'

const vertexShader = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`
// Sliders arrive as -1..1. Order: detail (sharpen, clarity) on the source → exposure + white balance in linear
// light → tone (contrast, highlights, shadows, whites, blacks) → dehaze → color → effects (fade, vignette, grain).
const fragmentShader = `
uniform sampler2D uTex; uniform vec2 uTexel, uSize; uniform float uAspect, uBypass;
uniform float exposure, brightness, contrast, highlights, shadows, whites, blacks;
uniform float temperature, tint, saturation, vibrance, hue, clarity, sharpness, dehaze, vignette, fade, grain;
// Masks (up to 4). Geometry is in image coords 0..1, y down. type: 0 none, 1 radial, 2 linear, 3 painted, 4 whole photo.
// uMO = (feather, invert, amount, angle rad). uMR = range (mode, a, b, c): luminance (1, lo, hi, smooth), color (2, I, Q, tolerance).
// Local deltas: uMA = (exposure, contrast, highlights, shadows), uMB = (temperature, tint, saturation, clarity), uMC = (whites, blacks, dehaze, sharpness).
uniform float uMT[4]; uniform vec4 uMG[4], uMO[4], uMR[4], uMA[4], uMB[4], uMC[4];
uniform sampler2D uM0, uM1, uM2, uM3; uniform float uShow;
varying vec2 vUv;
float luma(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
float rand(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float maskW(float type, vec4 g, vec4 o, vec4 rg, sampler2D t, vec2 ip, vec3 src){
  if (type < .5) return 0.;
  float w;
  if (type < 1.5) {          // radial ellipse (in pixels, rotated by o.w)
    vec2 d = (ip - g.xy) * uSize;
    float ca = cos(o.w), sa = sin(o.w);
    d = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
    float dist = length(d / max(g.zw * uSize, vec2(1e-3)));
    w = 1. - smoothstep(1. - o.x, 1.0001, dist);
  } else if (type < 2.5) {   // linear: full effect at g.xy fading to none at g.zw
    vec2 a = g.xy * uSize, ab = g.zw * uSize - a;
    w = 1. - smoothstep(0., 1., dot(ip * uSize - a, ab) / max(dot(ab, ab), 1e-4));
  } else if (type < 3.5) {   // brush / AI object: painted alpha
    w = texture2D(t, vUv).a;
  } else {                   // whole photo, narrowed by the range below
    w = 1.;
  }
  if (o.y > .5) w = 1. - w;
  if (rg.x > .5 && rg.x < 1.5) {        // luminance range
    float L = luma(src), s = max(rg.w, .001);
    w *= smoothstep(rg.y - s, rg.y, L) * (1. - smoothstep(rg.z, rg.z + s, L));
  } else if (rg.x > 1.5) {              // color range (distance in YIQ chroma)
    vec2 iq = vec2(dot(src, vec3(.596, -.274, -.322)), dot(src, vec3(.211, -.523, .312)));
    w *= 1. - smoothstep(rg.w * .5, rg.w, length(iq - rg.yz));
  }
  return w * o.z;
}
void main(){
  vec3 c = texture2D(uTex, vUv).rgb;
  if (uBypass > .5) { gl_FragColor = vec4(c, 1.); return; }

  vec2 ip = vec2(vUv.x, 1. - vUv.y);
  vec3 src = c;
  float w0 = maskW(uMT[0], uMG[0], uMO[0], uMR[0], uM0, ip, src), w1 = maskW(uMT[1], uMG[1], uMO[1], uMR[1], uM1, ip, src);
  float w2 = maskW(uMT[2], uMG[2], uMO[2], uMR[2], uM2, ip, src), w3 = maskW(uMT[3], uMG[3], uMO[3], uMR[3], uM3, ip, src);
  vec4 la = w0 * uMA[0] + w1 * uMA[1] + w2 * uMA[2] + w3 * uMA[3];
  vec4 lb = w0 * uMB[0] + w1 * uMB[1] + w2 * uMB[2] + w3 * uMB[3];
  vec4 lc = w0 * uMC[0] + w1 * uMC[1] + w2 * uMC[2] + w3 * uMC[3];
  // Per-pixel values = global slider + masked local deltas.
  float pEx = exposure + la.x, pCo = contrast + la.y, pHi = highlights + la.z, pSh = shadows + la.w;
  float pTe = temperature + lb.x, pTi = tint + lb.y, pSa = saturation + lb.z, pCl = clarity + lb.w;
  float pWh = whites + lc.x, pBl = blacks + lc.y, pDh = dehaze + lc.z, pSp = sharpness + lc.w;

  if (pSp != 0.) {
    vec3 n = texture2D(uTex, vUv + vec2(uTexel.x, 0.)).rgb + texture2D(uTex, vUv - vec2(uTexel.x, 0.)).rgb
           + texture2D(uTex, vUv + vec2(0., uTexel.y)).rgb + texture2D(uTex, vUv - vec2(0., uTexel.y)).rgb;
    c += (c - n * .25) * pSp * 1.5;
  }
  if (pCl != 0.) {
    vec2 r = vec2(.006 / uAspect, .006); // same radius in pixels on both axes, scale-independent
    float b = 0.;
    for (int i = 0; i < 8; i++) { float a = float(i) * .7854; b += luma(texture2D(uTex, vUv + r * vec2(cos(a), sin(a))).rgb); }
    float L0 = luma(c);
    c += (L0 - b / 8.) * pCl * 1.4 * (1. - abs(L0 - .5)); // local contrast, strongest in midtones
  }

  vec3 l = pow(max(c, 0.), vec3(2.2)) * exp2(pEx * 2.);
  l *= vec3(1. + pTe * .25, 1. - pTi * .2, 1. - pTe * .25);
  c = pow(max(l, 0.), vec3(1. / 2.2));

  c += brightness * .25;
  c = (c - .5) * (1. + pCo * (pCo > 0. ? 1. : .8)) + .5;
  float L = luma(c);
  c += pHi * .3 * smoothstep(.45, 1., L);
  c += pSh * .3 * (1. - smoothstep(0., .55, L));
  c += pWh * .2 * smoothstep(.7, 1., L);
  c += pBl * .2 * (1. - smoothstep(0., .3, L));

  if (pDh > 0.) c = (c - .12 * pDh) / (1. - .12 * pDh);
  else c = mix(c, vec3(.78), -pDh * .35);

  L = luma(c);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(L), c, (1. + pSa + max(pDh, 0.) * .25) * (1. + vibrance * (1. - sat)));
  if (hue != 0.) { // rotate hue in YIQ space, ±180°
    mat3 toYiq = mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312);
    mat3 toRgb = mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703);
    vec3 q = toYiq * c;
    float h = hue * 3.14159, cs = cos(h), sn = sin(h);
    q.yz = vec2(q.y * cs - q.z * sn, q.y * sn + q.z * cs);
    c = toRgb * q;
  }

  c = mix(c, c * .82 + .1, fade); // lifted blacks, softer whites
  float vf = smoothstep(.25, .85, length(vUv - .5) * 1.414);
  c = vignette < 0. ? c * (1. + vignette * vf) : mix(c, vec3(1.), vignette * vf * .8);
  c += (rand(floor(vUv * uSize)) - .5) * grain * .18;

  if (uShow > -.5) { // red overlay on the selected mask (preview only)
    float ws = uShow < .5 ? w0 : uShow < 1.5 ? w1 : uShow < 2.5 ? w2 : w3;
    c = mix(clamp(c, 0., 1.), vec3(1., .16, .12), ws * .5);
  }

  gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
}`

// Adjusted photo on a canvas that fills its parent box. Preview renders at `res` (longest side, px)
// so slider moves stay cheap; apiRef.current.snapshot() renders once at full resolution for export.
export default function AdjustCanvas({ src, values, before, masks = [], show = -1, res, canvasRef, apiRef, onReady }) {
  const api = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const renderer = new WebGLRenderer({ canvas, antialias: false })
    renderer.setPixelRatio(1)
    const max = Math.min(renderer.capabilities.maxTextureSize, 8192)
    const four = (f) => Array.from({ length: MAX_MASKS }, f)
    const u = {
      uTex: { value: null }, uBypass: { value: 0 }, uTexel: { value: new Vector2() }, uSize: { value: new Vector2() }, uAspect: { value: 1 },
      ...Object.fromEntries(CONTROLS.map(([k]) => [k, { value: 0 }])),
      uMT: { value: four(() => 0) }, uMG: { value: four(() => new Vector4()) }, uMO: { value: four(() => new Vector4()) },
      uMR: { value: four(() => new Vector4()) }, uMA: { value: four(() => new Vector4()) }, uMB: { value: four(() => new Vector4()) },
      uMC: { value: four(() => new Vector4()) },
      uM0: { value: null }, uM1: { value: null }, uM2: { value: null }, uM3: { value: null }, uShow: { value: -1 },
    }
    const brushTex = new Map() // brush canvas → texture
    const geo = new PlaneGeometry(2, 2)
    const mat = new ShaderMaterial({ uniforms: u, vertexShader, fragmentShader })
    const scene = new Scene()
    scene.add(new Mesh(geo, mat))
    const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    let tex, tw = 0, th = 0, pw = 1, ph = 1, raf = 0, dead = false, sampler = null
    const draw = () => { if (tex) renderer.render(scene, cam) }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw() }) } // max one render per frame

    api.current = {
      set(vals, bypass) {
        for (const [k] of CONTROLS) u[k].value = vals[k] / 100
        u.uBypass.value = bypass ? 1 : 0
        schedule()
      },
      setMasks(ms, show) {
        const live = new Set()
        for (let i = 0; i < MAX_MASKS; i++) {
          const m = ms[i]
          // A color mask does nothing until a color is picked (otherwise it would cover the whole photo).
          const off = m?.type === 'color' && !m.range.color
          u.uMT.value[i] = m && !off ? MASK_TYPE[m.type] : 0
          if (m) {
            const v = (k) => m.vals[k] / 100, rg = m.range
            u.uMG.value[i].set(...m.geo)
            u.uMO.value[i].set(m.feather, m.invert ? 1 : 0, m.amount / 100, (m.angle * Math.PI) / 180)
            u.uMA.value[i].set(v('exposure'), v('contrast'), v('highlights'), v('shadows'))
            u.uMB.value[i].set(v('temperature'), v('tint'), v('saturation'), v('clarity'))
            u.uMC.value[i].set(v('whites'), v('blacks'), v('dehaze'), v('sharpness'))
            if (rg.mode === 'luminance') u.uMR.value[i].set(RANGE_MODE.luminance, rg.lo / 100, rg.hi / 100, rg.smooth / 100)
            else if (rg.mode === 'color' && rg.color) u.uMR.value[i].set(RANGE_MODE.color, ...toIQ(rg.color), 0.02 + (rg.tol / 100) * 0.38)
            else u.uMR.value[i].set(0, 0, 0, 0)
          }
          let t = null
          if (m?.canvas) {
            t = brushTex.get(m.canvas)
            if (!t) {
              t = new CanvasTexture(m.canvas)
              t.generateMipmaps = false; t.minFilter = LinearFilter
              brushTex.set(m.canvas, t)
            }
            if (t.userData.ver !== m.ver) { t.userData.ver = m.ver; t.needsUpdate = true } // AI selection rewrote it
            live.add(m.canvas)
          }
          u['uM' + i].value = t
        }
        for (const [cv, t] of brushTex) if (!live.has(cv)) { t.dispose(); brushTex.delete(cv) }
        u.uShow.value = show
        schedule()
      },
      // Original color at image coords (0..1, y down), averaged over a few pixels. Used by the color-range picker.
      sample(x, y) {
        if (!tex) return null
        if (!sampler) {
          const s = Math.min(1, 512 / Math.max(tw, th))
          sampler = Object.assign(document.createElement('canvas'), { width: Math.round(tw * s), height: Math.round(th * s) })
          sampler.getContext('2d', { willReadFrequently: true }).drawImage(tex.image, 0, 0, sampler.width, sampler.height)
        }
        const px = Math.round(x * (sampler.width - 1)), py = Math.round(y * (sampler.height - 1))
        const d = sampler.getContext('2d').getImageData(Math.max(0, px - 1), Math.max(0, py - 1), 3, 3).data
        const avg = [0, 1, 2].map((ch) => { let t = 0, n = 0; for (let j = ch; j < d.length; j += 4) { t += d[j]; n++ } return t / n / 255 })
        return avg
      },
      // The loaded photo drawn at ≤ maxSide px (input for the AI object segmenter).
      imageCanvas(maxSide = 1024) {
        if (!tex) return null
        const s = Math.min(1, maxSide / Math.max(tw, th))
        const cv = Object.assign(document.createElement('canvas'), { width: Math.round(tw * s), height: Math.round(th * s) })
        cv.getContext('2d').drawImage(tex.image, 0, 0, cv.width, cv.height)
        return cv
      },
      // A brush stroke changed mask i's canvas: re-upload it (at most once per frame).
      refreshMask(i) {
        const t = u['uM' + i]?.value
        if (t) { t.needsUpdate = true; schedule() }
      },
      resize(r) {
        if (!tex) return
        const s = Math.min(1, r / Math.max(tw, th))
        pw = Math.max(1, Math.round(tw * s)); ph = Math.max(1, Math.round(th * s))
        renderer.setSize(pw, ph, false)
        draw()
      },
      // Full-size render copied to a 2D canvas (must read in the same task as the render).
      snapshot() {
        const bypass = u.uBypass.value, showing = u.uShow.value
        u.uBypass.value = 0; u.uShow.value = -1 // export without the red overlay
        renderer.setSize(tw, th, false)
        draw()
        const out = Object.assign(document.createElement('canvas'), { width: tw, height: th })
        out.getContext('2d').drawImage(canvas, 0, 0)
        u.uBypass.value = bypass; u.uShow.value = showing
        renderer.setSize(pw, ph, false)
        draw()
        return out
      },
    }
    if (apiRef) apiRef.current = api.current

    new TextureLoader().setCrossOrigin('anonymous').load(url(src, { fit: 'max', w: max, h: max, q: 95 }), (t) => {
      if (dead) return t.dispose()
      tex = t; u.uTex.value = t
      tw = t.image.width; th = t.image.height
      u.uTexel.value.set(1 / tw, 1 / th); u.uSize.value.set(tw, th); u.uAspect.value = tw / th
      setReady(true); onReady?.()
    })

    return () => {
      dead = true
      cancelAnimationFrame(raf)
      if (apiRef) apiRef.current = null
      tex?.dispose(); geo.dispose(); mat.dispose()
      for (const t of brushTex.values()) t.dispose()
      renderer.dispose(); renderer.forceContextLoss()
    }
  }, [src]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { api.current?.resize(res) }, [res, ready])
  useEffect(() => { api.current?.set(values, before) }, [values, before, ready])
  useEffect(() => { api.current?.setMasks(masks, show) }, [masks, show, ready])

  return <canvas ref={canvasRef} aria-hidden="true" className={`absolute inset-0 size-full ${ready ? '' : 'opacity-0'}`} />
}
