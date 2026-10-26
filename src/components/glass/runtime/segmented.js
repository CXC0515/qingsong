import { mountGlass } from './liquid-glass.js';
import { EdgeLight } from './edge-light.js';
// One persistent glass indicator moves between options; labels never move.
export function mountSegmented(root, options = {}) {
  function motionConfig(input){
    const c={transition:'soft',durationMs:380,response90Ms:155,stretch:.045,bulge:.12,liftPx:0,overshootPx:0,...input};
    if(!['soft','slide'].includes(c.transition))throw new TypeError('transition must be soft or slide');
    for(const k of ['durationMs','response90Ms','stretch','bulge','liftPx','overshootPx'])if(!Number.isFinite(c[k])||c[k]<0)throw new TypeError(k+' must be finite and nonnegative');
    return c;
  }
  let motion=motionConfig(Object.fromEntries(['transition','durationMs','response90Ms','stretch','bulge','liftPx','overshootPx'].filter(k=>options[k]!==undefined).map(k=>[k,options[k]])));
  const buttons = [...root.querySelectorAll('[data-value]')];
  if (!buttons.length) throw new Error('Provide buttons with unique data-value');
  const values = buttons.map(b => b.dataset.value);
  if (new Set(values).size !== values.length) throw new Error('Segment values must be unique');
  let value = options.value ?? values[0];
  if (!values.includes(value)) throw new Error('Unknown segment value');
  const indicator = document.createElement('div'); indicator.className = 'lg-indicator';
  indicator.setAttribute('aria-hidden', 'true'); indicator.innerHTML = '<div class="lg-content"></div>';
  root.prepend(indicator); root.classList.add('lg-segmented');
  const saved = buttons.map(b => ({ pressed: b.getAttribute('aria-pressed'), tab: b.getAttribute('tabindex') }));
  const material = mountGlass(indicator, { preset: 'segmented', radius: 999, edgeWidth: 7, displacement: 3, blur: .7, dispersion:1.35, ...options.glass });
  let rimConfig={lightAngle:225,reflection:.8,theme:'dark',...options.glass};
  const rimCanvas=options.trackRim?document.createElement('canvas'):null;
  const rim=rimCanvas?new EdgeLight(rimCanvas):null;
  if(rimCanvas){rimCanvas.className='lg-light lg-track-light';rimCanvas.setAttribute('aria-hidden','true');root.prepend(rimCanvas);root.classList.add('lg-track-rim');}
  function drawRim(){if(rim){rim.configure(root.clientWidth,root.clientHeight,999,1.05);rim.draw(rimConfig.lightAngle,rimConfig.reflection,rimConfig.theme);}}
  const prism=indicator.querySelector('.lg-prism');let prismAnimation=null;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let animation = null, destroyed = false, trajectory=null;
  function move(animate) {
    const button = buttons[values.indexOf(value)], rr = root.getBoundingClientRect(), br = button.getBoundingClientRect();
    if (!rr.width || !br.width) return;
    const old = indicator.getBoundingClientRect(), x = br.left - rr.left - root.clientLeft, y = br.top - rr.top - root.clientTop;
    const fromWidth = old.width || br.width;
    const fromX = old.left - rr.left - root.clientLeft + (fromWidth - br.width) / 2;
    let initialVelocity=0;
    if(animate&&trajectory&&animation?.playState==='running'){
      const t=Math.max(0,Number(animation.currentTime)||0)/1000;
      const {a,v,w}=trajectory;
      initialVelocity=(v-w*(v+w*a)*t)*Math.exp(-w*t);
    }
    animation?.cancel();prismAnimation?.cancel();trajectory=null;
    indicator.style.width = br.width + 'px'; indicator.style.height = br.height + 'px'; indicator.style.top = y + 'px';
    indicator.style.transform = `translateX(${x}px)`;
    buttons.forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.value === value)); b.tabIndex = b.dataset.value === value ? 0 : -1; });
    if (animate && !reduce.matches && Math.abs(fromX - x) > .5) {
      const travel=x-fromX, duration=Math.max(motion.durationMs,motion.response90Ms*2.5), T=Math.max(.001,duration/1000);
      const fromScaleY=old.height/br.height||1;
      const bulge=motion.liftPx>0?Math.max(motion.bulge,(root.clientHeight+2*motion.liftPx)/br.height-1):motion.bulge;
      const smooth=t=>{const n=Math.max(0,Math.min(1,t));return n*n*(3-2*n);};
      // One continuous critically-damped position response. No intermediate stops.
      // These are our web approximation parameters, not Apple's native values.
      const w=3.889/Math.max(.001,motion.response90Ms/1000);
      const response=t=>1-(1+w*t)*Math.exp(-w*t), end=response(T);
      const frames=[],prismFrames=[];
      const a=fromX-x,v=motion.transition==='soft'?initialVelocity:0;
      trajectory={a,v,w};
      for(let i=0;i<=40;i++){
        const u=i/40,t=u*T,p=i===40?1:response(t)/end;
        const shapeProgress=Math.min(1,t/Math.max(.001,motion.durationMs/1000));
        const tail=1-smooth((shapeProgress-.75)/.25);
        const shapeTime=shapeProgress*.260;
        const pulse=(1-Math.exp(-180*shapeTime))*Math.exp(-15*shapeTime)*Math.sin(2*Math.PI*4.2*shapeTime)*tail;
        const stretch=(shapeTime/.045)*Math.exp(1-shapeTime/.045)*tail;
        const liquid=motion.transition==='soft';
        const sx=fromWidth/br.width+(1-fromWidth/br.width)*p+(liquid?motion.stretch*stretch:0);
        const baseY=fromScaleY+(1-fromScaleY)*p, wave=2.1*pulse;
        // Retargeting blends into the existing lift; impulses never stack height.
        const sy=baseY+(liquid?(wave>=0?Math.max(0,1+bulge-baseY)*Math.min(1,wave):bulge*wave*.3):0);
        const over=Math.sign(travel)*motion.overshootPx*pulse;
        const position=i===40?x:x+(a+(v+w*a)*t)*Math.exp(-w*t);
        prismFrames.push({opacity:.3+(liquid ? .7*Math.min(1,Math.max(0,wave)) : 0),offset:u});
        frames.push({transform:`translateX(${position+over}px) scale(${sx},${sy})`,offset:u});
      }
      animation=indicator.animate(frames,{duration,easing:'linear'});
      prismAnimation=prism?.animate(prismFrames,{duration,easing:'linear'});
    }
  }
  function select(next, { animate = true, notify = true } = {}) {
    if (destroyed) return;
    if (!values.includes(next)) throw new Error('Unknown segment value');
    if (next === value) return;
    value = next; move(animate); if (notify) options.onChange?.(value);
  }
  const click = e => { const b = e.target.closest('[data-value]'); if (buttons.includes(b)) select(b.dataset.value); };
  const key = e => {
    const current = buttons.indexOf(e.target); if (current < 0) return;
    const direction = getComputedStyle(root).direction === 'rtl' ? -1 : 1;
    let n = current;
    if (e.key === 'ArrowRight') n = (current + direction + buttons.length) % buttons.length;
    else if (e.key === 'ArrowLeft') n = (current - direction + buttons.length) % buttons.length;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = buttons.length - 1; else return;
    e.preventDefault(); buttons[n].focus(); select(values[n]);
  };
  const reducedChanged = () => { if (reduce.matches) { animation?.cancel(); move(false); } };
  root.addEventListener('click', click); root.addEventListener('keydown', key); reduce.addEventListener('change', reducedChanged);
  let geometryKey='';
  const observer = new ResizeObserver(() => {
    const key=[root.clientWidth,root.clientHeight,...buttons.flatMap(b=>[b.offsetLeft,b.offsetTop,b.offsetWidth,b.offsetHeight])].join(',');
    if(key!==geometryKey){geometryKey=key;drawRim();move(false);}
  }); observer.observe(root); buttons.forEach(b => observer.observe(b));
  move(false);
  return {
    select, getValue: () => value,
    updateGlass(patch){material.update(patch);rimConfig={...rimConfig,...patch};drawRim();},
    updateMotion(patch){motion=motionConfig({...motion,...patch});animation?.cancel();move(false);},
    destroy() { if (destroyed) return; destroyed = true; animation?.cancel(); observer.disconnect(); reduce.removeEventListener('change', reducedChanged); root.removeEventListener('click', click); root.removeEventListener('keydown', key); prismAnimation?.cancel();rimCanvas?.remove();if(rimCanvas)root.classList.remove('lg-track-rim');material.destroy(); indicator.remove(); root.classList.remove('lg-segmented'); buttons.forEach((b, i) => { for (const [key, attr] of [['pressed','aria-pressed'],['tab','tabindex']]) saved[i][key] === null ? b.removeAttribute(attr) : b.setAttribute(attr, saved[i][key]); }); }
  };
}
