import { useEffect, useRef, useSyncExternalStore, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { mountGlass } from './runtime/liquid-glass.js';
import { mountSegmented } from './runtime/segmented.js';

const listeners = new Set<() => void>();
let themeObserver: MutationObserver | undefined;
const getTheme = () => document.documentElement.classList.contains('dark') ? 'dark' : 'light';
const subscribeTheme = (listener: () => void) => {
  listeners.add(listener);
  if (!themeObserver) {
    themeObserver = new MutationObserver(() => listeners.forEach(notify => notify()));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  return () => { listeners.delete(listener); if (!listeners.size) { themeObserver?.disconnect(); themeObserver = undefined; } };
};
export function useGlassTheme() { return useSyncExternalStore(subscribeTheme, getTheme, () => 'light'); }

export function GlassSurface({ children, className = '', preset = 'toolbar', ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode; preset?: 'toolbar' | 'button' }) {
  const host = useRef<HTMLDivElement>(null);
  const theme = useGlassTheme();
  useEffect(() => {
    const element=host.current!;
    let glass:ReturnType<typeof mountGlass>|undefined;
    let observer:IntersectionObserver|undefined;
    let disposed=false;
    const mount=()=>{if(!disposed&&!glass){glass=mountGlass(element,{preset,theme,lightAngle:225,reflection:1});observer?.disconnect();}};
    const bounds=element.getBoundingClientRect();
    if(bounds.width&&bounds.height&&bounds.bottom>=-180&&bounds.top<=window.innerHeight+180)mount();
    else{
      observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting&&entry.boundingClientRect.width>0&&entry.boundingClientRect.height>0))mount();},{rootMargin:'180px'});
      observer.observe(element);
    }
    return ()=>{disposed=true;observer?.disconnect();glass?.destroy();};
  }, [preset, theme]);
  return <div ref={host} className={'qs-glass ' + className} {...props}><div className="lg-content">{children}</div></div>;
}
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function GlassButton({ className = '', children, variant = 'secondary', containerClassName = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {variant?:ButtonVariant;containerClassName?:string}) {
  if(variant==='ghost')return <button type="button" {...props} data-variant={variant} className={'qs-button qs-button-ghost '+className}>{children}</button>;
  return <GlassSurface preset="button" data-variant={variant} className={'qs-button-host '+containerClassName}><button type="button" {...props} className={'qs-button ' + className}>{children}</button></GlassSurface>;
}
export function GlassSegments<T extends string>({ value, options, onChange, label, density = 'normal' }: { value: T; options: ReadonlyArray<{ value: T; label: ReactNode }>; onChange: (value: T) => boolean | void; label: string; density?:'normal'|'compact' }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ReturnType<typeof mountSegmented> | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const theme = useGlassTheme();
  const keys = JSON.stringify(options.map(option => option.value));
  useEffect(() => {
    const instance = mountSegmented(host.current!, {
      value: latest.current.value, trackRim: false, liftPx: 2,
      ...(density==='compact'?{stretch:.098,bulge:.238,liftPx:1.4}:{}),
      glass: { theme, lightAngle: 225, reflection: 1 },
      onChange: (next: T) => {
        if (latest.current.onChange(next) === false) instance.select(latest.current.value, { notify: false });
      },
    });
    api.current = instance;
    return () => { api.current = null; instance.destroy(); };
  }, [keys, theme, density]);
  useEffect(() => { api.current?.select(value, { notify: false }); }, [value]);
  return <div className="qs-segment-scroll" data-density={density}><GlassSurface className="qs-segments"><div ref={host} aria-label={label}>{options.map(option => <button type="button" key={option.value} data-value={option.value}>{option.label}</button>)}</div></GlassSurface></div>;
}
