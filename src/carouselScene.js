import { WebGLRenderer, Scene, OrthographicCamera, PlaneGeometry, Mesh, ShaderMaterial, TextureLoader, Vector2 } from 'three'
import gsap from 'gsap'

const vertexShader = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`
// Two photos, each "contain"-fit; transparent outside so the black page shows. uP 0→1 slides A out, B in.
const fragmentShader = `
uniform sampler2D uA, uB; uniform vec2 uRes, uSA, uSB, uMouse; uniform float uTime, uHover, uP, uDir;
varying vec2 vUv;
vec4 pic(sampler2D t, vec2 size, vec2 uv){
  float rs = uRes.x/uRes.y, ri = size.x/size.y;
  vec2 c = (uv - .5) * (rs > ri ? vec2(rs/ri, 1.) : vec2(1., ri/rs)) + .5;
  if (c.x < 0. || c.x > 1. || c.y < 0. || c.y > 1.) return vec4(0.);
  return vec4(texture2D(t, c).rgb, 1.);
}
void main(){
  vec2 d = vUv - uMouse; d.x *= uRes.x/uRes.y;
  float dist = length(d);
  vec2 uv = vUv + normalize(d + 1e-5) * sin(dist*28. - uTime*2.2) * exp(-dist*7.) * .008 * uHover;
  vec2 off = vec2(uDir * (.12 + .08 * sin(uv.y * 9.4248)), 0.);
  vec4 a = pic(uA, uSA, uv + off * uP);
  vec4 b = pic(uB, uSB, uv - off * (1. - uP));
  gl_FragColor = mix(a, b, smoothstep(.15, .85, uP));
}`

export default function start(canvas, first, onReady) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  const scene = new Scene()
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const u = {
    uA: { value: null }, uB: { value: null }, uSA: { value: new Vector2(1, 1) }, uSB: { value: new Vector2(1, 1) },
    uRes: { value: new Vector2() }, uMouse: { value: new Vector2(0.5, 0.5) },
    uTime: { value: 0 }, uHover: { value: 0 }, uP: { value: 0 }, uDir: { value: 1 },
  }
  const geo = new PlaneGeometry(2, 2)
  const mat = new ShaderMaterial({ uniforms: u, vertexShader, fragmentShader, transparent: true })
  scene.add(new Mesh(geo, mat))
  const loader = new TextureLoader().setCrossOrigin('anonymous')
  const load = (src) => new Promise((res, rej) => loader.load(src, res, undefined, rej))

  // Transitions run one at a time; the latest request made during one wins.
  let busy = false, pending = null, dead = false
  async function show(src, dir = 1) {
    if (busy) { pending = [src, dir]; return }
    busy = true
    try {
      const t = await load(src)
      if (dead) return t.dispose()
      if (!u.uA.value) {
        u.uA.value = t; u.uSA.value.set(t.image.width, t.image.height)
        render(); onReady()
      } else {
        u.uB.value = t; u.uSB.value.set(t.image.width, t.image.height); u.uDir.value = dir
        await gsap.fromTo(u.uP, { value: 0 }, { value: 1, duration: 1.1, ease: 'expo.inOut' })
        u.uA.value.dispose()
        u.uA.value = t; u.uSA.value.copy(u.uSB.value); u.uB.value = null; u.uP.value = 0
      }
    } catch { /* failed photo: keep showing the previous one */ }
    busy = false
    if (pending) { const p = pending; pending = null; show(...p) }
  }

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas
    renderer.setSize(w, h, false)
    u.uRes.value.set(w, h)
  }
  resize()

  const target = new Vector2(0.5, 0.5)
  let hover = 0
  const move = (e) => {
    const r = canvas.getBoundingClientRect()
    target.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height)
    hover = e.pointerType === 'mouse' ? 1 : 0
  }
  const leave = () => (hover = 0)

  const t0 = performance.now()
  let raf = 0
  function render() {
    u.uTime.value = (performance.now() - t0) / 1000
    u.uMouse.value.lerp(target, 0.06)
    u.uHover.value += (hover - u.uHover.value) * 0.05
    renderer.render(scene, camera)
  }
  function loop() {
    cancelAnimationFrame(raf)
    if (document.hidden) return
    render()
    raf = requestAnimationFrame(loop)
  }

  addEventListener('resize', resize)
  addEventListener('pointermove', move, { passive: true })
  document.addEventListener('pointerleave', leave)
  document.addEventListener('visibilitychange', loop)
  loop()
  show(first)

  return {
    show,
    dispose() {
      dead = true
      cancelAnimationFrame(raf)
      gsap.killTweensOf(u.uP)
      removeEventListener('resize', resize)
      removeEventListener('pointermove', move)
      document.removeEventListener('pointerleave', leave)
      document.removeEventListener('visibilitychange', loop)
      u.uA.value?.dispose(); u.uB.value?.dispose()
      geo.dispose(); mat.dispose(); renderer.dispose()
    },
  }
}
