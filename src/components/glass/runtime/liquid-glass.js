import { NativeBackdrop } from './native-backdrop.js';
import { EdgeLight, ChromaticRim } from './edge-light.js';
import { defaults, presets } from './config.js';
const active = new WeakMap();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function normalize(input) {
  if(!presets[input.preset])throw new TypeError('Unknown glass preset');
  if(!['light','dark'].includes(input.theme))throw new TypeError('theme must be light or dark');
  if(!['static','orbit'].includes(input.motion.mode))throw new TypeError('motion.mode must be static or orbit');
  const c={...presets[input.preset],...input,motion:{...input.motion}};
  for(const key of ['radius','edgeWidth','displacement','blur','rimWidth','lightAngle','reflection','dispersion'])if(!Number.isFinite(c[key]))throw new TypeError(key+' must be finite');
  c.radius=Math.max(0,c.radius);c.edgeWidth=Math.max(1,c.edgeWidth);c.displacement=Math.max(0,c.displacement);c.blur=Math.max(0,c.blur);c.rimWidth=Math.max(.1,c.rimWidth);
  c.dispersion=clamp(c.dispersion,0,5);
  c.reflection=clamp(c.reflection,0,1);c.lightAngle=((c.lightAngle%360)+360)%360;
  if(!Number.isFinite(c.motion.periodMs)||c.motion.periodMs<1000)throw new TypeError('motion.periodMs must be at least 1000');
  return c;
}
export function mountGlass(host, options={}) {
  if(active.has(host))throw new Error('Glass already mounted on this element');
  const existing=host.querySelector(':scope > .lg-content');
  if(!existing)throw new Error('Provide one direct .lg-content child; business content stays outside filter layers');
  let input={...defaults,...options,motion:{...defaults.motion,...options.motion}},config=normalize(input);
  const saved={class:host.getAttribute('class'),style:host.getAttribute('style'),theme:host.getAttribute('data-lg-theme'),profile:host.getAttribute('data-lg-profile'),fallback:host.getAttribute('data-lg-fallback')};
  const layer=document.createElement('div');layer.className='lg-backdrop';layer.setAttribute('aria-hidden','true');
  const canvas=document.createElement('canvas');canvas.className='lg-light';canvas.setAttribute('aria-hidden','true');
  const prism=document.createElement('canvas');prism.className='lg-light lg-prism';prism.setAttribute('aria-hidden','true');
  host.prepend(layer,canvas,prism);host.classList.add('lg-surface');
  const light=new EdgeLight(canvas),spectral=new ChromaticRim(prism);let native=null,raf=0,visible=true,destroyed=false,lastTime=0,phase=0,lastDraw=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function draw(){light.draw(config.lightAngle+phase,config.reflection,config.theme);spectral.draw(config.lightAngle+phase,config.dispersion,config.theme);}
  function stop(){cancelAnimationFrame(raf);raf=0;lastTime=0;}
  function frame(t){
    if(destroyed)return;
    if(lastTime)phase=(phase+(t-lastTime)*360/config.motion.periodMs)%360;
    lastTime=t;
    // Reflection only. Cache geometry; never regenerate displacement per frame.
    if(t-lastDraw>=1000/30){draw();lastDraw=t;}
    raf=requestAnimationFrame(frame);
  }
  function reconcile(){
    stop();
    if(config.motion.mode==='orbit'&&!reduced.matches&&visible&&!document.hidden)raf=requestAnimationFrame(frame);
    else { if(reduced.matches||config.motion.mode==='static')phase=0;draw(); }
  }
  function geometry(){
    if(destroyed)return;
    const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
    host.style.setProperty('--lg-radius',Math.min(config.radius,w/2,h/2)+'px');host.style.setProperty('--lg-blur',config.blur+'px');
    light.configure(w,h,config.radius,config.rimWidth);spectral.configure(w,h,config.radius,config.rimWidth);draw();
  }
  function material(){
    host.dataset.lgTheme=config.theme;host.dataset.lgProfile=config.blur===0?'clear':'control';
    const nativeOptions={radius:config.radius,band:config.edgeWidth,strength:config.refraction?config.displacement:0,blur:config.blur,dispersion:config.refraction?config.dispersion:0};
    const enabled=config.nativeRefraction&&('backdropFilter' in layer.style);
    host.dataset.lgFallback=String(!enabled);
    if(enabled){if(native)native.set(nativeOptions);else native=new NativeBackdrop(layer,nativeOptions);}
    else{if(native){native.destroy();native=null;}layer.style.backdropFilter=`blur(${config.blur}px)`;layer.style.webkitBackdropFilter=layer.style.backdropFilter;}
    geometry();
  }
  const observer=new ResizeObserver(geometry);observer.observe(host);
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;reconcile();});intersection.observe(host);
  reduced.addEventListener('change',reconcile);document.addEventListener('visibilitychange',reconcile);
  material();reconcile();
  const api={
    update(patch){
      if(destroyed)throw new Error('Glass was destroyed');
      const nextInput={...input,...patch,motion:{...input.motion,...patch.motion}};
      const next=normalize(nextInput),optical=['preset','radius','edgeWidth','displacement','blur','rimWidth','refraction','nativeRefraction','theme','dispersion'].some(k=>next[k]!==config[k]);
      input=nextInput;config=next;
      if(patch.lightAngle!==undefined||patch.motion?.mode==='static')phase=0;
      if(optical)material();else draw();reconcile();
    },
    getConfig(){return {...config,motion:{...config.motion}};},
    destroy(){
      if(destroyed)return;destroyed=true;stop();observer.disconnect();intersection.disconnect();
      reduced.removeEventListener('change',reconcile);document.removeEventListener('visibilitychange',reconcile);native?.destroy();layer.remove();canvas.remove();prism.remove();active.delete(host);
      for(const [key,attr]of Object.entries({class:'class',style:'style',theme:'data-lg-theme',profile:'data-lg-profile',fallback:'data-lg-fallback'})){if(saved[key]===null)host.removeAttribute(attr);else host.setAttribute(attr,saved[key]);}
    }
  };
  active.set(host,api);return api;
}
export { defaults, presets };
