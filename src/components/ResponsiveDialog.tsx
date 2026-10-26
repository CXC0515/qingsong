import { ReactNode, useEffect, useRef, useState, useImperativeHandle, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { GlassButton, GlassSurface } from './glass/Glass';
import { X } from 'lucide-react';

let openDialogs = 0;
let originalBodyOverflow = '';

/** Native modal provides focus containment, Escape and focus restoration. */
export default function ResponsiveDialog({ children, title, subtitle, onClose, busy = false, sideOnMedium = false, wide = false, compactFull = false, footer, confirmDiscard = false, closeRef }: {
  children: ReactNode; title: string; subtitle?: ReactNode; onClose: () => void; busy?: boolean; sideOnMedium?: boolean; wide?:boolean; compactFull?:boolean; footer?:ReactNode; confirmDiscard?:boolean; closeRef?:Ref<()=>void>;
}) {
  const [discardOpen,setDiscardOpen]=useState(false);
  const requestClose=()=>{if(busy)return;if(confirmDiscard)setDiscardOpen(true);else onClose();};
  useImperativeHandle(closeRef,()=>requestClose);
  const ref = useRef<HTMLDialogElement>(null);
  const dragStart = useRef<number | null>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    if (openDialogs === 0) originalBodyOverflow = document.body.style.overflow;
    openDialogs++;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      openDialogs--;
      if (openDialogs === 0) document.body.style.overflow = originalBodyOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return createPortal(
    <><dialog ref={ref} aria-label={title} aria-busy={busy} data-responsive-dialog data-side-on-medium={sideOnMedium || undefined}
      onCancel={event => { event.preventDefault(); requestClose(); }}
      onClick={event => { if (event.target === event.currentTarget) {
        const bounds=event.currentTarget.getBoundingClientRect();
        if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)requestClose();
      } }}
      className={`qs-dialog m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl border-0 bg-transparent p-0 text-slate-900 shadow-none backdrop:bg-black/40 sm:m-auto ${wide?'sm:max-w-5xl':'sm:max-w-lg'} sm:rounded-2xl dark:bg-zinc-900 dark:text-slate-100 ${compactFull?'qs-dialog-full':''} ${sideOnMedium ? 'sm:ml-auto sm:mr-0 sm:my-0 sm:h-dvh sm:max-h-dvh sm:rounded-none' : ''}`}>
      <GlassSurface className="qs-dialog-surface"><div className="qs-dialog-frame">
        <div className="flex shrink-0 touch-none justify-center sm:hidden"
          onPointerDown={event => { dragStart.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerUp={event => { if (dragStart.current !== null && event.clientY - dragStart.current > 70) requestClose(); dragStart.current = null; }}
          onPointerCancel={() => { dragStart.current = null; }}>
          <span className="my-3 h-1 w-10 rounded-full bg-slate-300" />
        </div>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-2 dark:border-zinc-800">
          <div className="min-w-0"><h3 className="break-words text-lg font-bold">{title}</h3>{subtitle && <p className="mt-1 break-words text-xs leading-5 text-slate-500 dark:text-slate-400">{subtitle}</p>}</div>
          <button type="button" disabled={busy} onClick={requestClose} aria-label="关闭" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800"><X className="h-5 w-5" /></button>
        </header>
        <div data-dialog-scroll className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
        {footer&&<footer className="shrink-0 flex flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3 dark:border-zinc-800">{footer}</footer>}
      </div></GlassSurface>
      <style>{`@keyframes management-sheet-enter { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @media (max-width: 639px) and (prefers-reduced-motion: no-preference) { dialog[open][data-responsive-dialog] { animation: management-sheet-enter .22s ease-out; } }`}</style>
    </dialog>
    {discardOpen&&<ResponsiveDialog title="放弃未保存的修改？" onClose={()=>setDiscardOpen(false)}>
      <p className="text-sm">修改尚未保存。继续编辑会保留当前填写内容；放弃后无法恢复本次修改。</p>
      <div className="flex flex-wrap justify-end gap-2"><GlassButton onClick={()=>setDiscardOpen(false)}>继续编辑</GlassButton><GlassButton variant="danger" onClick={()=>{if(!busy){setDiscardOpen(false);onClose();}}}>放弃修改</GlassButton></div>
    </ResponsiveDialog>}
    </>, document.body
  );
}
