import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GlassSurface } from './glass/Glass';
import { X } from 'lucide-react';

/** Native modal provides focus containment, Escape and focus restoration. */
export default function ResponsiveDialog({ children, title, onClose, busy = false, sideOnMedium = false }: {
  children: ReactNode; title: string; onClose: () => void; busy?: boolean; sideOnMedium?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const dragStart = useRef<number | null>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return createPortal(
    <dialog ref={ref} aria-label={title} data-responsive-dialog
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}
      className={`qs-dialog m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl border-0 bg-transparent p-0 text-slate-900 shadow-none backdrop:bg-black/40 sm:m-auto sm:max-w-lg sm:rounded-2xl dark:bg-zinc-900 dark:text-slate-100 ${sideOnMedium ? 'sm:ml-auto sm:mr-0 sm:my-0 sm:h-dvh sm:max-h-dvh sm:rounded-none' : ''}`}>
      <GlassSurface className="qs-dialog-surface"><div className="flex max-h-[92dvh] flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="flex shrink-0 touch-none justify-center sm:hidden"
          onPointerDown={event => { dragStart.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerUp={event => { if (dragStart.current !== null && event.clientY - dragStart.current > 70 && !busy) onClose(); dragStart.current = null; }}
          onPointerCancel={() => { dragStart.current = null; }}>
          <span className="my-3 h-1 w-10 rounded-full bg-slate-300" />
        </div>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-2 dark:border-zinc-800">
          <h3 className="text-lg font-bold">{title}</h3>
          <button type="button" disabled={busy} onClick={onClose} aria-label="关闭" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
      </div></GlassSurface>
      <style>{`@keyframes management-sheet-enter { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @media (max-width: 639px) and (prefers-reduced-motion: no-preference) { dialog[open][data-responsive-dialog] { animation: management-sheet-enter .22s ease-out; } }`}</style>
    </dialog>, document.body
  );
}
