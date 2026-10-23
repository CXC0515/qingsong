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
    const glass = mountGlass(host.current!, { preset, theme, lightAngle: 225, reflection: 1 });
    return () => glass.destroy();
  }, [preset, theme]);
  return <div ref={host} className={'qs-glass ' + className} {...props}><div className="lg-content">{children}</div></div>;
}
export function GlassButton({ className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <GlassSurface preset="button" className="qs-button-host"><button type="button" {...props} className={'qs-button ' + className}>{children}</button></GlassSurface>;
}
export function GlassSegments<T extends string>({ value, options, onChange, label }: { value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => boolean | void; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ReturnType<typeof mountSegmented> | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const theme = useGlassTheme();
  const keys = JSON.stringify(options.map(option => option.value));
  useEffect(() => {
    const instance = mountSegmented(host.current!, {
      value: latest.current.value, trackRim: false, liftPx: 2,
      glass: { theme, lightAngle: 225, reflection: 1 },
      onChange: (next: T) => {
        if (latest.current.onChange(next) === false) instance.select(latest.current.value, { notify: false });
      },
    });
    api.current = instance;
    return () => { api.current = null; instance.destroy(); };
  }, [keys, theme]);
  useEffect(() => { api.current?.select(value, { notify: false }); }, [value]);
  return <GlassSurface className="qs-segments"><div ref={host} aria-label={label}>{options.map(option => <button type="button" key={option.value} data-value={option.value}>{option.label}</button>)}</div></GlassSurface>;
}
