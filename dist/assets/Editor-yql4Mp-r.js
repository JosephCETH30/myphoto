import{a as e,d as t,p as n,u as r}from"./index-DZqOrENm.js";import{a as i,c as a,d as o,i as s,l as c,n as l,o as u,r as d,s as f,t as p,u as m}from"./three.module-UohsqIHN.js";import{a as h,i as g,n as _,o as v,r as y,s as b}from"./Lightbox-BpYr9Ddk.js";var x=n(t(),1),S=e(),C=`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,w=`
uniform sampler2D uTex; uniform vec2 uTexel, uSize; uniform float uAspect, uBypass;
uniform float exposure, brightness, contrast, highlights, shadows, whites, blacks;
uniform float temperature, tint, saturation, vibrance, hue, clarity, sharpness, dehaze, vignette, fade, grain;
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
    float ws = uShow < .5 ? M.x : uShow < 1.5 ? M.y : uShow < 2.5 ? M.z : M.w;
    c = mix(clamp(c, 0., 1.), vec3(1., .16, .12), ws * .5);
  }

  gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
}`;function T({src:e,values:t,before:n,layers:T=[],show:E=-1,res:D,canvasRef:O,apiRef:k,onReady:A}){let j=(0,x.useRef)(null),[M,N]=(0,x.useState)(!1);return(0,x.useEffect)(()=>{let t=O.current,n=new p({canvas:t,antialias:!1});n.setPixelRatio(1);let x=Math.min(n.capabilities.maxTextureSize,8192),S=e=>Array.from({length:4},e),T=e=>Array.from({length:8},e),E={uTex:{value:null},uBypass:{value:0},uTexel:{value:new m},uSize:{value:new m},uAspect:{value:1},...Object.fromEntries(_.map(([e])=>[e,{value:0}])),uCT:{value:T(()=>0)},uCL:{value:T(()=>0)},uCG:{value:T(()=>new o)},uCO:{value:T(()=>new o)},uCR:{value:T(()=>new o)},...Object.fromEntries(T((e,t)=>[`uC${t}`,{value:null}])),uLA:{value:S(()=>new o)},uLB:{value:S(()=>new o)},uLC:{value:S(()=>new o)},uLAmt:{value:new o},uShow:{value:-1}},D=new Map,M=new u(2,2),P=new a({uniforms:E,vertexShader:C,fragmentShader:w}),F=new f;F.add(new s(M,P));let I=new i(-1,1,1,-1,0,1),L,R=0,z=0,B=1,V=1,H=0,U=!1,W=null,G=()=>{L&&n.render(F,I)},K=()=>{H||=requestAnimationFrame(()=>{H=0,G()})};return j.current={set(e,t){for(let[t]of _)E[t].value=e[t]/100;E.uBypass.value=+!!t,K()},setLayers(e,t){let n=new Set,r=v(e);for(let e=0;e<8;e++){let t=r[e],i=!t||t.type===`color`&&!t.range.color;E.uCT.value[e]=i?0:y[t.type];let a=null;if(t){let r=t.range;E.uCL.value[e]=t.li,E.uCG.value[e].set(...t.geo),E.uCO.value[e].set(t.feather,+!!t.invert,t.angle*Math.PI/180,g[t.op]),r.mode===`luminance`?E.uCR.value[e].set(h.luminance,r.lo/100,r.hi/100,r.smooth/100):r.mode===`color`&&r.color?E.uCR.value[e].set(h.color,...b(r.color),.02+r.tol/100*.38):E.uCR.value[e].set(0,0,0,0),t.canvas&&(a=D.get(t.canvas),a||(a=new l(t.canvas),a.generateMipmaps=!1,a.minFilter=d,D.set(t.canvas,a)),a.userData.ver!==t.ver&&(a.userData.ver=t.ver,a.needsUpdate=!0),n.add(t.canvas))}E[`uC`+e].value=a}for(let[e,t]of D)n.has(e)||(t.dispose(),D.delete(e));let i=[0,0,0,0];for(let t=0;t<4;t++){let n=e[t];if(!n)continue;let r=e=>n.vals[e]/100;i[t]=n.visible?n.amount/100:0,E.uLA.value[t].set(r(`exposure`),r(`contrast`),r(`highlights`),r(`shadows`)),E.uLB.value[t].set(r(`temperature`),r(`tint`),r(`saturation`),r(`clarity`)),E.uLC.value[t].set(r(`whites`),r(`blacks`),r(`dehaze`),r(`sharpness`))}E.uLAmt.value.set(...i),E.uShow.value=t,K()},sample(e,t){if(!L)return null;if(!W){let e=Math.min(1,512/Math.max(R,z));W=Object.assign(document.createElement(`canvas`),{width:Math.round(R*e),height:Math.round(z*e)}),W.getContext(`2d`,{willReadFrequently:!0}).drawImage(L.image,0,0,W.width,W.height)}let n=Math.round(e*(W.width-1)),r=Math.round(t*(W.height-1)),i=W.getContext(`2d`).getImageData(Math.max(0,n-1),Math.max(0,r-1),3,3).data;return[0,1,2].map(e=>{let t=0,n=0;for(let r=e;r<i.length;r+=4)t+=i[r],n++;return t/n/255})},imageCanvas(e=1024){if(!L)return null;let t=Math.min(1,e/Math.max(R,z)),n=Object.assign(document.createElement(`canvas`),{width:Math.round(R*t),height:Math.round(z*t)});return n.getContext(`2d`).drawImage(L.image,0,0,n.width,n.height),n},refreshMask(e){let t=E[`uC`+e]?.value;t&&(t.needsUpdate=!0,K())},resize(e){if(!L)return;let t=Math.min(1,e/Math.max(R,z));B=Math.max(1,Math.round(R*t)),V=Math.max(1,Math.round(z*t)),n.setSize(B,V,!1),G()},snapshot(){let e=E.uBypass.value,r=E.uShow.value;E.uBypass.value=0,E.uShow.value=-1,n.setSize(R,z,!1),G();let i=Object.assign(document.createElement(`canvas`),{width:R,height:z});return i.getContext(`2d`).drawImage(t,0,0),E.uBypass.value=e,E.uShow.value=r,n.setSize(B,V,!1),G(),i}},k&&(k.current=j.current),new c().setCrossOrigin(`anonymous`).load(r(e,{fit:`max`,w:x,h:x,q:95}),e=>{if(U)return e.dispose();L=e,E.uTex.value=e,R=e.image.width,z=e.image.height,E.uTexel.value.set(1/R,1/z),E.uSize.value.set(R,z),E.uAspect.value=R/z,N(!0),A?.()}),()=>{U=!0,cancelAnimationFrame(H),k&&(k.current=null),L?.dispose(),M.dispose(),P.dispose();for(let e of D.values())e.dispose();n.dispose(),n.forceContextLoss()}},[e]),(0,x.useEffect)(()=>{j.current?.resize(D)},[D,M]),(0,x.useEffect)(()=>{j.current?.set(t,n)},[t,n,M]),(0,x.useEffect)(()=>{j.current?.setLayers(T,E)},[T,E,M]),(0,S.jsx)(`canvas`,{ref:O,"aria-hidden":`true`,className:`absolute inset-0 size-full ${M?``:`opacity-0`}`})}export{T as default};