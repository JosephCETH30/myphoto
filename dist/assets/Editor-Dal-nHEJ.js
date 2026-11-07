import{a as e,d as t,p as n,u as r}from"./index-q4oHc5MU.js";import{a as i,c as a,d as o,i as s,l as c,n as l,o as u,r as d,s as f,t as p,u as m}from"./three.module-UohsqIHN.js";import{a as h,i as g,n as _,r as v}from"./Lightbox-BijnY575.js";var y=n(t(),1),b=e(),x=`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,S=`
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
}`;function C({src:e,values:t,before:n,masks:C=[],show:w=-1,res:T,canvasRef:E,apiRef:D,onReady:O}){let k=(0,y.useRef)(null),[A,j]=(0,y.useState)(!1);return(0,y.useEffect)(()=>{let t=E.current,n=new p({canvas:t,antialias:!1});n.setPixelRatio(1);let y=Math.min(n.capabilities.maxTextureSize,8192),b=e=>Array.from({length:4},e),C={uTex:{value:null},uBypass:{value:0},uTexel:{value:new m},uSize:{value:new m},uAspect:{value:1},...Object.fromEntries(_.map(([e])=>[e,{value:0}])),uMT:{value:b(()=>0)},uMG:{value:b(()=>new o)},uMO:{value:b(()=>new o)},uMR:{value:b(()=>new o)},uMA:{value:b(()=>new o)},uMB:{value:b(()=>new o)},uMC:{value:b(()=>new o)},uM0:{value:null},uM1:{value:null},uM2:{value:null},uM3:{value:null},uShow:{value:-1}},w=new Map,T=new u(2,2),A=new a({uniforms:C,vertexShader:x,fragmentShader:S}),M=new f;M.add(new s(T,A));let N=new i(-1,1,1,-1,0,1),P,F=0,I=0,L=1,R=1,z=0,B=!1,V=null,H=()=>{P&&n.render(M,N)},U=()=>{z||=requestAnimationFrame(()=>{z=0,H()})};return k.current={set(e,t){for(let[t]of _)C[t].value=e[t]/100;C.uBypass.value=+!!t,U()},setMasks(e,t){let n=new Set;for(let t=0;t<4;t++){let r=e[t],i=r?.type===`color`&&!r.range.color;if(C.uMT.value[t]=r&&!i?v[r.type]:0,r){let e=e=>r.vals[e]/100,n=r.range;C.uMG.value[t].set(...r.geo),C.uMO.value[t].set(r.feather,+!!r.invert,r.amount/100,r.angle*Math.PI/180),C.uMA.value[t].set(e(`exposure`),e(`contrast`),e(`highlights`),e(`shadows`)),C.uMB.value[t].set(e(`temperature`),e(`tint`),e(`saturation`),e(`clarity`)),C.uMC.value[t].set(e(`whites`),e(`blacks`),e(`dehaze`),e(`sharpness`)),n.mode===`luminance`?C.uMR.value[t].set(g.luminance,n.lo/100,n.hi/100,n.smooth/100):n.mode===`color`&&n.color?C.uMR.value[t].set(g.color,...h(n.color),.02+n.tol/100*.38):C.uMR.value[t].set(0,0,0,0)}let a=null;r?.canvas&&(a=w.get(r.canvas),a||(a=new l(r.canvas),a.generateMipmaps=!1,a.minFilter=d,w.set(r.canvas,a)),a.userData.ver!==r.ver&&(a.userData.ver=r.ver,a.needsUpdate=!0),n.add(r.canvas)),C[`uM`+t].value=a}for(let[e,t]of w)n.has(e)||(t.dispose(),w.delete(e));C.uShow.value=t,U()},sample(e,t){if(!P)return null;if(!V){let e=Math.min(1,512/Math.max(F,I));V=Object.assign(document.createElement(`canvas`),{width:Math.round(F*e),height:Math.round(I*e)}),V.getContext(`2d`,{willReadFrequently:!0}).drawImage(P.image,0,0,V.width,V.height)}let n=Math.round(e*(V.width-1)),r=Math.round(t*(V.height-1)),i=V.getContext(`2d`).getImageData(Math.max(0,n-1),Math.max(0,r-1),3,3).data;return[0,1,2].map(e=>{let t=0,n=0;for(let r=e;r<i.length;r+=4)t+=i[r],n++;return t/n/255})},imageCanvas(e=1024){if(!P)return null;let t=Math.min(1,e/Math.max(F,I)),n=Object.assign(document.createElement(`canvas`),{width:Math.round(F*t),height:Math.round(I*t)});return n.getContext(`2d`).drawImage(P.image,0,0,n.width,n.height),n},refreshMask(e){let t=C[`uM`+e]?.value;t&&(t.needsUpdate=!0,U())},resize(e){if(!P)return;let t=Math.min(1,e/Math.max(F,I));L=Math.max(1,Math.round(F*t)),R=Math.max(1,Math.round(I*t)),n.setSize(L,R,!1),H()},snapshot(){let e=C.uBypass.value,r=C.uShow.value;C.uBypass.value=0,C.uShow.value=-1,n.setSize(F,I,!1),H();let i=Object.assign(document.createElement(`canvas`),{width:F,height:I});return i.getContext(`2d`).drawImage(t,0,0),C.uBypass.value=e,C.uShow.value=r,n.setSize(L,R,!1),H(),i}},D&&(D.current=k.current),new c().setCrossOrigin(`anonymous`).load(r(e,{fit:`max`,w:y,h:y,q:95}),e=>{if(B)return e.dispose();P=e,C.uTex.value=e,F=e.image.width,I=e.image.height,C.uTexel.value.set(1/F,1/I),C.uSize.value.set(F,I),C.uAspect.value=F/I,j(!0),O?.()}),()=>{B=!0,cancelAnimationFrame(z),D&&(D.current=null),P?.dispose(),T.dispose(),A.dispose();for(let e of w.values())e.dispose();n.dispose(),n.forceContextLoss()}},[e]),(0,y.useEffect)(()=>{k.current?.resize(T)},[T,A]),(0,y.useEffect)(()=>{k.current?.set(t,n)},[t,n,A]),(0,y.useEffect)(()=>{k.current?.setMasks(C,w)},[C,w,A]),(0,b.jsx)(`canvas`,{ref:E,"aria-hidden":`true`,className:`absolute inset-0 size-full ${A?``:`opacity-0`}`})}export{C as default};