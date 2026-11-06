import{a as e,d as t,p as n,u as r}from"./index-D2EgF4m4.js";import{a as i,c as a,i as o,n as s,o as c,r as l,s as u,t as d}from"./three.module-Qxv0PcTD.js";import{n as f}from"./Lightbox-D5_K6huB.js";var p=n(t(),1),m=e(),h=`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,g=`
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
}`;function _({src:e,values:t,before:n,res:_,canvasRef:v,apiRef:y,onReady:b}){let x=(0,p.useRef)(null),[S,C]=(0,p.useState)(!1);return(0,p.useEffect)(()=>{let t=v.current,n=new d({canvas:t,antialias:!1});n.setPixelRatio(1);let p=Math.min(n.capabilities.maxTextureSize,8192),m={uTex:{value:null},uBypass:{value:0},uTexel:{value:new a},uSize:{value:new a},uAspect:{value:1},...Object.fromEntries(f.map(([e])=>[e,{value:0}]))},_=new o(2,2),S=new c({uniforms:m,vertexShader:h,fragmentShader:g}),w=new i;w.add(new s(_,S));let T=new l(-1,1,1,-1,0,1),E,D=0,O=0,k=1,A=1,j=0,M=!1,N=()=>{E&&n.render(w,T)},P=()=>{j||=requestAnimationFrame(()=>{j=0,N()})};return x.current={set(e,t){for(let[t]of f)m[t].value=e[t]/100;m.uBypass.value=+!!t,P()},resize(e){if(!E)return;let t=Math.min(1,e/Math.max(D,O));k=Math.max(1,Math.round(D*t)),A=Math.max(1,Math.round(O*t)),n.setSize(k,A,!1),N()},snapshot(){let e=m.uBypass.value;m.uBypass.value=0,n.setSize(D,O,!1),N();let r=Object.assign(document.createElement(`canvas`),{width:D,height:O});return r.getContext(`2d`).drawImage(t,0,0),m.uBypass.value=e,n.setSize(k,A,!1),N(),r}},y&&(y.current=x.current),new u().setCrossOrigin(`anonymous`).load(r(e,{fit:`max`,w:p,h:p,q:95}),e=>{if(M)return e.dispose();E=e,m.uTex.value=e,D=e.image.width,O=e.image.height,m.uTexel.value.set(1/D,1/O),m.uSize.value.set(D,O),m.uAspect.value=D/O,C(!0),b?.()}),()=>{M=!0,cancelAnimationFrame(j),y&&(y.current=null),E?.dispose(),_.dispose(),S.dispose(),n.dispose(),n.forceContextLoss()}},[e]),(0,p.useEffect)(()=>{x.current?.resize(_)},[_,S]),(0,p.useEffect)(()=>{x.current?.set(t,n)},[t,n,S]),(0,m.jsx)(`canvas`,{ref:v,"aria-hidden":`true`,className:`absolute inset-0 size-full ${S?``:`opacity-0`}`})}export{_ as default};