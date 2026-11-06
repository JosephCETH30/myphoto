import { useEffect, useRef, useState } from 'react'
import { WebGLRenderer, Scene, OrthographicCamera, PlaneGeometry, Mesh, ShaderMaterial, TextureLoader, Vector2 } from 'three'
import { url } from './imgix.js'
import { CONTROLS } from './controls.js'

const vertexShader = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`
// All sliders arrive as -1..1. Exposure + white balance work in linear light, the rest in display (sRGB) space.
// Sliders arrive as -1..1. Order: detail (sharpen, clarity) on the source → exposure + white balance in linear
// light → tone (contrast, highlights, shadows, whites, blacks) → dehaze → color → effects (fade, vignette, grain).
const fragmentShader = `
uniform sampler2D uTex; uniform vec2 uTexel, uSize; uniform float uAspect, uBypass;
uniform float exposure, brightness, contrast, highlights, shadows, whites, blacks;
uniform float temperature, tint, saturation, vibrance, hue, clarity, sharpness, dehaze, vignette, fade, grain;
varying vec2 vUv;
float luma(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
float rand(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 c = texture2D(uTex, vUv).rgb;
  if (uBypass > .5) { gl_FragColor = vec4(c, 1.); return; }

  if (sharpness != 0.) {
    vec3 n = texture2D(uTex, vUv + vec2(uTexel.x, 0.)).rgb + texture2D(uTex, vUv - vec2(uTexel.x, 0.)).rgb
           + texture2D(uTex, vUv + vec2(0., uTexel.y)).rgb + texture2D(uTex, vUv - vec2(0., uTexel.y)).rgb;
    c += (c - n * .25) * sharpness * 1.5;
  }
  if (clarity != 0.) {
    vec2 r = vec2(.006 / uAspect, .006); // same radius in pixels on both axes, scale-independent
    float b = 0.;
    for (int i = 0; i < 8; i++) { float a = float(i) * .7854; b += luma(texture2D(uTex, vUv + r * vec2(cos(a), sin(a))).rgb); }
    float L0 = luma(c);
    c += (L0 - b / 8.) * clarity * 1.4 * (1. - abs(L0 - .5)); // local contrast, strongest in midtones
  }

  vec3 l = pow(max(c, 0.), vec3(2.2)) * exp2(exposure * 2.);
  l *= vec3(1. + temperature * .25, 1. - tint * .2, 1. - temperature * .25);
  c = pow(max(l, 0.), vec3(1. / 2.2));

  c += brightness * .25;
  c = (c - .5) * (1. + contrast * (contrast > 0. ? 1. : .8)) + .5;
  float L = luma(c);
  c += highlights * .3 * smoothstep(.45, 1., L);
  c += shadows * .3 * (1. - smoothstep(0., .55, L));
  c += whites * .2 * smoothstep(.7, 1., L);
  c += blacks * .2 * (1. - smoothstep(0., .3, L));

  if (dehaze > 0.) c = (c - .12 * dehaze) / (1. - .12 * dehaze);
  else c = mix(c, vec3(.78), -dehaze * .35);

  L = luma(c);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(L), c, (1. + saturation + max(dehaze, 0.) * .25) * (1. + vibrance * (1. - sat)));
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

  gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
}`

// Adjusted photo on a canvas that fills its parent box. Preview renders at `res` (longest side, px)
// so slider moves stay cheap; apiRef.current.snapshot() renders once at full resolution for export.
export default function AdjustCanvas({ src, values, before, res, canvasRef, apiRef, onReady }) {
  const api = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const renderer = new WebGLRenderer({ canvas, antialias: false })
    renderer.setPixelRatio(1)
    const max = Math.min(renderer.capabilities.maxTextureSize, 8192)
    const u = { uTex: { value: null }, uBypass: { value: 0 }, uTexel: { value: new Vector2() }, uSize: { value: new Vector2() }, uAspect: { value: 1 }, ...Object.fromEntries(CONTROLS.map(([k]) => [k, { value: 0 }])) }
    const geo = new PlaneGeometry(2, 2)
    const mat = new ShaderMaterial({ uniforms: u, vertexShader, fragmentShader })
    const scene = new Scene()
    scene.add(new Mesh(geo, mat))
    const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    let tex, tw = 0, th = 0, pw = 1, ph = 1, raf = 0, dead = false
    const draw = () => { if (tex) renderer.render(scene, cam) }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw() }) } // max one render per frame

    api.current = {
      set(vals, bypass) {
        for (const [k] of CONTROLS) u[k].value = vals[k] / 100
        u.uBypass.value = bypass ? 1 : 0
        schedule()
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
        const bypass = u.uBypass.value
        u.uBypass.value = 0
        renderer.setSize(tw, th, false)
        draw()
        const out = Object.assign(document.createElement('canvas'), { width: tw, height: th })
        out.getContext('2d').drawImage(canvas, 0, 0)
        u.uBypass.value = bypass
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
      renderer.dispose(); renderer.forceContextLoss()
    }
  }, [src]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { api.current?.resize(res) }, [res, ready])
  useEffect(() => { api.current?.set(values, before) }, [values, before, ready])

  return <canvas ref={canvasRef} aria-hidden="true" className={`absolute inset-0 size-full ${ready ? '' : 'opacity-0'}`} />
}
