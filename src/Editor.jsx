import { useEffect, useRef, useState } from 'react'
import { WebGLRenderer, Scene, OrthographicCamera, PlaneGeometry, Mesh, ShaderMaterial, TextureLoader, Vector2, Vector4, CanvasTexture, LinearFilter } from 'three'
import { url } from './imgix.js'
import { CONTROLS, ALL_KEYS, LOOK_KEYS, HSL_BANDS, MAX_LAYERS, MAX_COMPS, MASK_TYPE, RANGE_MODE, OPS, toIQ, flatComps } from './controls.js'

const vertexShader = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`
// Sliders arrive as -1..1. Order: detail (sharpen, clarity) on the source → exposure + white balance in linear
// light → tone (contrast, highlights, shadows, whites, blacks) → dehaze → color → effects (fade, vignette, grain).
const fragmentShader = `
uniform sampler2D uTex; uniform vec2 uTexel, uSize; uniform float uAspect, uBypass;
uniform float exposure, brightness, contrast, highlights, shadows, whites, blacks;
uniform float temperature, tint, saturation, vibrance, hue, clarity, sharpness, dehaze, vignette, fade, grain;
uniform float ${LOOK_KEYS.join(', ')};
// Layers (≤4) of local adjustments. Each layer's mask = its components (≤8 total) combined in order with
// add (max) / subtract / intersect. Component geometry is in image coords 0..1, y down.
// type: 0 none, 1 radial, 2 linear, 3 painted (brush / AI object), 4 whole photo (narrowed by a range).
// uCO = (feather, invert, angle rad, op). uCR = range (mode, a, b, c): luminance (1, lo, hi, smooth), color (2, I, Q, tolerance).
// Layer deltas: uLA = (exposure, contrast, highlights, shadows), uLB = (temperature, tint, saturation, clarity), uLC = (whites, blacks, dehaze, sharpness).
uniform float uCT[8], uCL[8]; uniform vec4 uCG[8], uCO[8], uCR[8];
uniform sampler2D uC0, uC1, uC2, uC3, uC4, uC5, uC6, uC7;
uniform vec4 uLA[4], uLB[4], uLC[4], uLAmt; uniform float uShow;
varying vec2 vUv;
float luma(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
float rand(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float compW(float type, vec4 g, vec4 o, vec4 rg, sampler2D t, vec2 ip, vec3 src){
  float w;
  if (type < 1.5) {          // radial ellipse (in pixels, rotated by o.z)
    vec2 d = (ip - g.xy) * uSize;
    float ca = cos(o.z), sa = sin(o.z);
    d = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
    w = 1. - smoothstep(1. - o.x, 1.0001, length(d / max(g.zw * uSize, vec2(1e-3))));
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
  return w;
}
// Combine component weight c into layer li of W: 0 add, 1 subtract, 2 intersect.
void applyC(inout vec4 W, float li, float op, float c){
  vec4 sel = vec4(equal(vec4(li), vec4(0., 1., 2., 3.)));
  vec4 r = op < .5 ? max(W, vec4(c)) : op < 1.5 ? W * (1. - c) : W * c;
  W = mix(W, r, sel);
}
vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0., -1. / 3., 2. / 3., -1.);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y), e = 1e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6. * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c){
  vec3 p = abs(fract(c.xxx + vec3(1., 2. / 3., 1. / 3.)) * 6. - 3.);
  return c.z * mix(vec3(1.), clamp(p - 1., 0., 1.), c.y);
}
// Per-color HSL: eight soft hue bands (centers and half-widths as fractions of the hue circle).
const float BC[8] = float[8](0., .0833, .1667, .3333, .5, .6667, .7778, .8889);
const float BW[8] = float[8](.111, .0833, .1667, .1667, .1667, .1667, .111, .111);
vec3 applyHsl(vec3 c){
  float H[8] = float[8](${HSL_BANDS.map((b) => 'hue' + b).join(', ')});
  float S[8] = float[8](${HSL_BANDS.map((b) => 'sat' + b).join(', ')});
  float V[8] = float[8](${HSL_BANDS.map((b) => 'lum' + b).join(', ')});
  vec3 h = rgb2hsv(clamp(c, 0., 1.));
  float tot = 0., dh = 0., ds = 0., dl = 0.;
  for (int i = 0; i < 8; i++) {
    float t = clamp(1. - abs(fract(h.x - BC[i] + .5) - .5) / BW[i], 0., 1.);
    t = t * t * (3. - 2. * t);
    tot += t; dh += t * H[i]; ds += t * S[i]; dl += t * V[i];
  }
  if (tot <= 0.) return c;
  float chroma = smoothstep(0., .25, h.y); // grays have no color to shift
  h.x = fract(h.x + (dh / tot) * .125 * chroma); // full slider = 45 degrees
  h.y = clamp(h.y * (1. + ds / tot), 0., 1.);
  h.z = clamp(h.z * (1. + (dl / tot) * .6 * chroma), 0., 1.);
  return hsv2rgb(h);
}
// Tone curve (S-curve, lifted blacks, rolled-off whites), then shadow/highlight color grading.
vec3 applyGrade(vec3 c){
  c = clamp(c, 0., 1.);
  c = mix(c, c * c * (3. - 2. * c), curve);
  c = lift * .2 + c * (1. - lift * .2);
  c *= 1. - roll * .18;
  float L = luma(c);
  vec3 sT = vec3(shadowR, shadowG, shadowB), hT = vec3(highR, highG, highB);
  return c + (sT - luma(sT)) * .4 * (1. - smoothstep(0., .55, L)) + (hT - luma(hT)) * .3 * smoothstep(.45, 1., L);
}
void main(){
  vec3 c = texture2D(uTex, vUv).rgb;
  if (uBypass > .5) { gl_FragColor = vec4(c, 1.); return; }

  vec2 ip = vec2(vUv.x, 1. - vUv.y);
  vec3 src = c;
  vec4 W = vec4(0.);
  if (uCT[0] > .5) applyC(W, uCL[0], uCO[0].w, compW(uCT[0], uCG[0], uCO[0], uCR[0], uC0, ip, src));
  if (uCT[1] > .5) applyC(W, uCL[1], uCO[1].w, compW(uCT[1], uCG[1], uCO[1], uCR[1], uC1, ip, src));
  if (uCT[2] > .5) applyC(W, uCL[2], uCO[2].w, compW(uCT[2], uCG[2], uCO[2], uCR[2], uC2, ip, src));
  if (uCT[3] > .5) applyC(W, uCL[3], uCO[3].w, compW(uCT[3], uCG[3], uCO[3], uCR[3], uC3, ip, src));
  if (uCT[4] > .5) applyC(W, uCL[4], uCO[4].w, compW(uCT[4], uCG[4], uCO[4], uCR[4], uC4, ip, src));
  if (uCT[5] > .5) applyC(W, uCL[5], uCO[5].w, compW(uCT[5], uCG[5], uCO[5], uCR[5], uC5, ip, src));
  if (uCT[6] > .5) applyC(W, uCL[6], uCO[6].w, compW(uCT[6], uCG[6], uCO[6], uCR[6], uC6, ip, src));
  if (uCT[7] > .5) applyC(W, uCL[7], uCO[7].w, compW(uCT[7], uCG[7], uCO[7], uCR[7], uC7, ip, src));
  vec4 M = W; // mask coverage per layer (for the overlay)
  W *= uLAmt; // layer amount (0 when hidden)
  vec4 la = W.x * uLA[0] + W.y * uLA[1] + W.z * uLA[2] + W.w * uLA[3];
  vec4 lb = W.x * uLB[0] + W.y * uLB[1] + W.z * uLB[2] + W.w * uLB[3];
  vec4 lc = W.x * uLC[0] + W.y * uLC[1] + W.z * uLC[2] + W.w * uLC[3];
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

  c = applyHsl(c); // before saturation, so per-color brightness also shapes black & white
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

  c = applyGrade(c);
  c = mix(c, c * .82 + .1, fade); // lifted blacks, softer whites
  float vf = smoothstep(.25, .85, length(vUv - .5) * 1.414);
  c = vignette < 0. ? c * (1. + vignette * vf) : mix(c, vec3(1.), vignette * vf * .8);
  c += (rand(floor(vUv * uSize)) - .5) * grain * .18;

  if (uShow > -.5) { // red overlay on the selected mask (preview only)
    float ws = uShow < .5 ? M.x : uShow < 1.5 ? M.y : uShow < 2.5 ? M.z : M.w;
    c = mix(clamp(c, 0., 1.), vec3(1., .16, .12), ws * .5);
  }

  gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
}`

// Adjusted photo on a canvas that fills its parent box. Preview renders at `res` (longest side, px)
// so slider moves stay cheap; apiRef.current.snapshot() renders once at full resolution for export.
export default function AdjustCanvas({ src, values, before, layers = [], show = -1, res, canvasRef, apiRef, onReady }) {
  const api = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const renderer = new WebGLRenderer({ canvas, antialias: false })
    renderer.setPixelRatio(1)
    const max = Math.min(renderer.capabilities.maxTextureSize, 8192)
    const four = (f) => Array.from({ length: MAX_LAYERS }, f)
    const eight = (f) => Array.from({ length: MAX_COMPS }, f)
    const u = {
      uTex: { value: null }, uBypass: { value: 0 }, uTexel: { value: new Vector2() }, uSize: { value: new Vector2() }, uAspect: { value: 1 },
      ...Object.fromEntries(ALL_KEYS.map((k) => [k, { value: 0 }])),
      uCT: { value: eight(() => 0) }, uCL: { value: eight(() => 0) },
      uCG: { value: eight(() => new Vector4()) }, uCO: { value: eight(() => new Vector4()) }, uCR: { value: eight(() => new Vector4()) },
      ...Object.fromEntries(eight((_, k) => [`uC${k}`, { value: null }])),
      uLA: { value: four(() => new Vector4()) }, uLB: { value: four(() => new Vector4()) }, uLC: { value: four(() => new Vector4()) },
      uLAmt: { value: new Vector4() }, uShow: { value: -1 },
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
        for (const k of ALL_KEYS) u[k].value = vals[k] / 100
        u.uBypass.value = bypass ? 1 : 0
        schedule()
      },
      setLayers(layers, show) {
        const live = new Set(), comps = flatComps(layers)
        for (let k = 0; k < MAX_COMPS; k++) {
          const c = comps[k]
          // A color mask does nothing until a color is picked (otherwise it would cover the whole photo).
          const off = !c || (c.type === 'color' && !c.range.color)
          u.uCT.value[k] = off ? 0 : MASK_TYPE[c.type]
          let t = null
          if (c) {
            const rg = c.range
            u.uCL.value[k] = c.li
            u.uCG.value[k].set(...c.geo)
            u.uCO.value[k].set(c.feather, c.invert ? 1 : 0, (c.angle * Math.PI) / 180, OPS[c.op])
            if (rg.mode === 'luminance') u.uCR.value[k].set(RANGE_MODE.luminance, rg.lo / 100, rg.hi / 100, rg.smooth / 100)
            else if (rg.mode === 'color' && rg.color) u.uCR.value[k].set(RANGE_MODE.color, ...toIQ(rg.color), 0.02 + (rg.tol / 100) * 0.38)
            else u.uCR.value[k].set(0, 0, 0, 0)
            if (c.canvas) {
              t = brushTex.get(c.canvas)
              if (!t) {
                t = new CanvasTexture(c.canvas)
                t.generateMipmaps = false; t.minFilter = LinearFilter
                brushTex.set(c.canvas, t)
              }
              if (t.userData.ver !== c.ver) { t.userData.ver = c.ver; t.needsUpdate = true } // AI selection rewrote it
              live.add(c.canvas)
            }
          }
          u['uC' + k].value = t
        }
        for (const [cv, t] of brushTex) if (!live.has(cv)) { t.dispose(); brushTex.delete(cv) }
        const amt = [0, 0, 0, 0]
        for (let i = 0; i < MAX_LAYERS; i++) {
          const L = layers[i]
          if (!L) continue
          const v = (key) => L.vals[key] / 100
          amt[i] = L.visible ? L.amount / 100 : 0
          u.uLA.value[i].set(v('exposure'), v('contrast'), v('highlights'), v('shadows'))
          u.uLB.value[i].set(v('temperature'), v('tint'), v('saturation'), v('clarity'))
          u.uLC.value[i].set(v('whites'), v('blacks'), v('dehaze'), v('sharpness'))
        }
        u.uLAmt.value.set(...amt)
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
      // Small JPEG previews of slider sets on this photo (global sliders only: no masks, overlay or bypass).
      thumbs(list, maxSide = 220) {
        if (!tex) return []
        const saved = ALL_KEYS.map((k) => u[k].value), bypass = u.uBypass.value, showing = u.uShow.value, amt = u.uLAmt.value.clone()
        u.uBypass.value = 0; u.uShow.value = -1; u.uLAmt.value.set(0, 0, 0, 0)
        const s = maxSide / Math.max(tw, th)
        renderer.setSize(Math.max(1, Math.round(tw * s)), Math.max(1, Math.round(th * s)), false)
        const urls = list.map((vals) => {
          for (const k of ALL_KEYS) u[k].value = (vals[k] || 0) / 100
          draw()
          return canvas.toDataURL('image/jpeg', 0.8) // must read in the same task as the render
        })
        ALL_KEYS.forEach((k, i) => { u[k].value = saved[i] })
        u.uBypass.value = bypass; u.uShow.value = showing; u.uLAmt.value.copy(amt)
        renderer.setSize(pw, ph, false)
        draw()
        return urls
      },
      // Instant before/after: flip the shader's bypass without touching React state.
      setBypass(on) { u.uBypass.value = on ? 1 : 0; draw() },
      // A brush stroke changed mask i's canvas: re-upload it (at most once per frame).
      refreshMask(i) {
        const t = u['uC' + i]?.value
        if (t) { t.needsUpdate = true; schedule() }
      },
      resize(r) {
        if (!tex) return
        const s = Math.min(1, r / Math.max(tw, th))
        pw = Math.max(1, Math.round(tw * s)); ph = Math.max(1, Math.round(th * s))
        renderer.setSize(pw, ph, false)
        draw()
      },
      // Render copied to a 2D canvas (must read in the same task as the render).
      // Full size for downloads; maxSide (longest edge, px) for quick previews.
      snapshot(maxSide = Infinity) {
        const bypass = u.uBypass.value, showing = u.uShow.value
        u.uBypass.value = 0; u.uShow.value = -1 // export without the red overlay
        const s = Math.min(1, maxSide / Math.max(tw, th))
        const sw = Math.max(1, Math.round(tw * s)), sh = Math.max(1, Math.round(th * s))
        renderer.setSize(sw, sh, false)
        draw()
        const out = Object.assign(document.createElement('canvas'), { width: sw, height: sh })
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
  useEffect(() => { api.current?.setLayers(layers, show) }, [layers, show, ready])

  return <canvas ref={canvasRef} aria-hidden="true" className={`absolute inset-0 size-full ${ready ? '' : 'opacity-0'}`} />
}
