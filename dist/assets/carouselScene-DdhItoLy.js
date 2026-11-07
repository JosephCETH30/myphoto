import{a as e,c as t,i as n,l as r,o as i,s as a,t as o,u as s}from"./three.module-UohsqIHN.js";import{o as c}from"./index-DYOdMd9F.js";var l=`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,u=`
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
}`;function d(d,f,p){let m=new o({canvas:d,alpha:!0,antialias:!1,powerPreference:`low-power`});m.setPixelRatio(Math.min(devicePixelRatio,2));let h=new a,g=new e(-1,1,1,-1,0,1),_={uA:{value:null},uB:{value:null},uSA:{value:new s(1,1)},uSB:{value:new s(1,1)},uRes:{value:new s},uMouse:{value:new s(.5,.5)},uTime:{value:0},uHover:{value:0},uP:{value:0},uDir:{value:1}},v=new i(2,2),y=new t({uniforms:_,vertexShader:l,fragmentShader:u,transparent:!0});h.add(new n(v,y));let b=new r().setCrossOrigin(`anonymous`),x=e=>new Promise((t,n)=>b.load(e,t,void 0,n)),S=!1,C=null,w=!1;async function T(e,t=1){if(S)C=[e,t];else{S=!0;try{let n=await x(e);if(w)return n.dispose();_.uA.value?(_.uB.value=n,_.uSB.value.set(n.image.width,n.image.height),_.uDir.value=t,await c.fromTo(_.uP,{value:0},{value:1,duration:1.1,ease:`expo.inOut`}),_.uA.value.dispose(),_.uA.value=n,_.uSA.value.copy(_.uSB.value),_.uB.value=null,_.uP.value=0):(_.uA.value=n,_.uSA.value.set(n.image.width,n.image.height),N(),p())}catch{}if(S=!1,C){let e=C;C=null,T(...e)}}}let E=()=>{let{clientWidth:e,clientHeight:t}=d;m.setSize(e,t,!1),_.uRes.value.set(e,t)};E();let D=new s(.5,.5),O=0,k=e=>{let t=d.getBoundingClientRect();D.set((e.clientX-t.left)/t.width,1-(e.clientY-t.top)/t.height),O=+(e.pointerType===`mouse`)},A=()=>O=0,j=performance.now(),M=0;function N(){_.uTime.value=(performance.now()-j)/1e3,_.uMouse.value.lerp(D,.06),_.uHover.value+=(O-_.uHover.value)*.05,m.render(h,g)}function P(){cancelAnimationFrame(M),document.hidden||(N(),M=requestAnimationFrame(P))}return addEventListener(`resize`,E),addEventListener(`pointermove`,k,{passive:!0}),document.addEventListener(`pointerleave`,A),document.addEventListener(`visibilitychange`,P),P(),T(f),{show:T,dispose(){w=!0,cancelAnimationFrame(M),c.killTweensOf(_.uP),removeEventListener(`resize`,E),removeEventListener(`pointermove`,k),document.removeEventListener(`pointerleave`,A),document.removeEventListener(`visibilitychange`,P),_.uA.value?.dispose(),_.uB.value?.dispose(),v.dispose(),y.dispose(),m.dispose()}}}export{d as default};