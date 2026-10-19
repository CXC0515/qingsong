import { useEffect, useState } from 'react';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import ResponsiveChoiceDialog from '../../components/ResponsiveChoiceDialog';
import type { SchoolClass } from '../../domain/types';
import type { CreateTaskInput, CreationPreview } from '../../domain/classroomTasks';
import { taskApi } from '../../services/classroomTaskApi';
export const control = 'min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900';
export const action = 'min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-40 dark:border-zinc-700';
export const primary = 'min-h-11 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40';
export const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
export function useTaskDraftGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: Event) => { if (!event.defaultPrevented && !window.confirm('还有未保存的填写内容，离开后将丢失，确定离开吗？')) event.preventDefault(); };
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue=''; };
    window.addEventListener('classroom-task-before-leave',leave); window.addEventListener('beforeunload',unload);
    return () => { window.removeEventListener('classroom-task-before-leave',leave); window.removeEventListener('beforeunload',unload); };
  },[dirty]);
}
export function CreateTaskDialog({ classes, initialClassId, seed, onClose, onCreate }: { classes: SchoolClass[]; initialClassId: string; seed?: Partial<CreateTaskInput>; onClose: () => void; onCreate: (input: CreateTaskInput, preview: CreationPreview) => Promise<boolean> }) {
  const [input, setInput] = useState<CreateTaskInput>({ classId: initialClassId || classes[0]?.id || '', name: seed?.name || '', mode: seed?.mode || 'completion', checkDate: today(), dueDate: null, description: seed?.description || '' });
  const [preview, setPreview] = useState<CreationPreview | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [chooseClass, setChooseClass] = useState(false);
  useTaskDraftGuard(Boolean(input.name) && !busy);
  const update = (field: string, value: string) => { setInput(p => ({ ...p, [field]: field === 'dueDate' ? value || null : value })); setPreview(null); };
  return <ResponsiveDialog title={preview ? '确认任务与名册' : '新建课堂任务'} onClose={() => { if (!input.name || window.confirm('离开后未保存的表单将丢失，确定关闭吗？')) onClose(); }} busy={busy}>
    <form className="grid gap-4" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { if (preview) { if (await onCreate(input, preview)) onClose(); } else setPreview(await taskApi.creationPreview(input)); } catch (e) { setError(e instanceof Error ? e.message : '预览失败，本次尚未建立任务。'); } finally { setBusy(false); } }}>
      <label className="grid gap-1 text-sm font-semibold">班级<button type="button" className={control + ' text-left'} onClick={() => setChooseClass(true)}>{classes.find(c => c.id === input.classId)?.name ?? '选择班级'}</button></label>
      <label className="grid gap-1 text-sm font-semibold">任务名称<input className={control} required maxLength={100} value={input.name} onChange={e => update('name', e.target.value)} /></label>
      <fieldset><legend className="mb-2 text-sm font-semibold">记录方式</legend><div className="grid grid-cols-2 gap-2">{(['completion', 'pass'] as const).map(mode => <button type="button" key={mode} aria-pressed={input.mode === mode} className={input.mode === mode ? primary : action} onClick={() => update('mode', mode)}>{mode === 'completion' ? '完成情况' : '过关情况'}</button>)}</div></fieldset>
      <label className="grid gap-1 text-sm font-semibold">检查日期<input className={control} type="date" required value={input.checkDate} onChange={e => update('checkDate', e.target.value)} /></label>
      <label className="grid gap-1 text-sm font-semibold">截止日期（可选）<input className={control} type="date" value={input.dueDate ?? ''} onChange={e => update('dueDate', e.target.value)} /></label>
      <label className="grid gap-1 text-sm font-semibold">说明（可选）<textarea className={control} maxLength={1000} value={input.description ?? ''} onChange={e => update('description', e.target.value)} /></label>
      {preview && <section className="rounded-xl bg-slate-50 p-3 dark:bg-zinc-800"><h4 className="font-bold">本次参与名册 · {preview.participants.length}人</h4><p className="mt-1 text-sm">固定此次名册，之后转班不会改写历史。免做和参与调整在任务内明确记录。</p>{preview.duplicates.length > 0 && <p role="alert" className="mt-2 text-sm text-amber-700">有同名任务，请核对是否需要另建一次；确认后建立独立任务，不覆盖原记录。</p>}<div className="mt-2 max-h-36 overflow-y-auto text-sm">{preview.participants.map(p => <label key={p.studentId} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={!(input.excludedStudentIds??[]).includes(p.studentId)} onChange={e=>{setInput(v=>({...v,excludedStudentIds:e.target.checked?(v.excludedStudentIds??[]).filter(id=>id!==p.studentId):[...(v.excludedStudentIds??[]),p.studentId]}));setPreview(null);}}/>{p.studentNo} {p.name} · {p.enrollmentStatus==='suspended'?'休学':'在读'}</label>)}</div></section>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button className={primary} disabled={busy || !input.classId}>{busy ? '正在核对…' : preview ? '确认并保存新任务' : '预览任务与名册'}</button>
    </form>
    {chooseClass && <ResponsiveChoiceDialog title="选择任务班级" value={input.classId} options={classes.map(c => ({ value:c.id, label:c.name }))} onChange={value => update('classId',value)} onClose={() => setChooseClass(false)} />}
  </ResponsiveDialog>;
}
