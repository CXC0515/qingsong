import { useRef, useState } from 'react';
import type { RecordProject, RenameRecordProject } from '../../domain/classroomTasks';
import { ClassroomTaskError, taskApi } from '../../services/classroomTaskApi';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import { GlassButton } from '../../components/glass/Glass';
import { control } from './ClassroomTaskDialogs';

export default function RenameProjectDialog({ project, identityKey, onClose, onChanged }: { project: RecordProject; identityKey: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const storageKey = 'qingsong:project-rename:' + identityKey;
  const [restored] = useState<RenameRecordProject|null>(()=>{
    try{const value=JSON.parse(sessionStorage.getItem(storageKey)||'null');
      if(value&&typeof value.operationId==='string'&&value.operationId&&typeof value.projectKey==='string'&&value.projectKey&&typeof value.name==='string'&&Number.isInteger(value.expectedVersion)&&value.expectedVersion>=0)return value;
    }catch{/* Storage is optional until a write is sent. */}return null;
  });
  const [draft,setDraft]=useState<RenameRecordProject>(restored??{operationId:crypto.randomUUID(),projectKey:project.key,name:project.label,expectedVersion:project.version??0});
  const [sent,setSent]=useState(Boolean(restored));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const complete = async () => { sessionStorage.removeItem(storageKey); await onChanged(); onClose(); };
  const save = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      try{sessionStorage.setItem(storageKey, JSON.stringify(draft));}catch{throw new Error('浏览器不能保留核对信息，改名尚未发送。请恢复浏览器存储后重试。');} setSent(true);
      await taskApi.renameProject(draft); await complete();
    } catch (e) {
      if (e instanceof ClassroomTaskError && [400, 409, 422].includes(e.status)) {
        sessionStorage.removeItem(storageKey); setSent(false); setDraft(value => ({ ...value, operationId: crypto.randomUUID() }));
      }
      setError(e instanceof Error ? e.message : '尚未确认改名结果，请保留原内容核对。');
    } finally { lock.current = false; setBusy(false); }
  };
  return <ResponsiveDialog title="项目改名" busy={busy} onClose={onClose}>
    <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void save(); }}>
      <p className="text-sm text-slate-500">名称会在你的各个班级中更新，记录和次数保留。具体检查的标题与内容不变。</p>
      <label className="grid gap-2 text-sm font-semibold">项目名称<input className={'qs-field-input '+(control)} required maxLength={50} disabled={busy || sent} value={draft.name} onChange={e => setDraft(value => ({ ...value, name: e.target.value }))} /></label>
      {sent && <p role="status" className="text-sm text-amber-800">正在核对此前的改名；关闭后可从“项目改名”继续核对。</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <GlassButton type="submit" disabled={busy}>{busy ? '正在保存…' : sent ? '用原操作核对并重试' : '保存名称'}</GlassButton>
        {sent && <GlassButton disabled={busy} onClick={async () => {
          if(lock.current)return;lock.current=true;setBusy(true);
          try { await taskApi.renameOperation(draft.operationId); await complete(); } catch (e) { setError(e instanceof Error ? e.message : '核对失败，请保留原内容重试。'); } finally { lock.current=false;setBusy(false); }
        }}>查询改名结果</GlassButton>}
        {!sent && <GlassButton disabled={busy} onClick={async () => {
          if(lock.current)return;lock.current=true;setBusy(true);
          try { const current=(await taskApi.projects()).find(item=>item.key===draft.projectKey); if(!current)throw new Error('项目暂不可用，请关闭后刷新项目列表。');setDraft(value=>({...value,expectedVersion:current.version??0}));setError('已读取当前版本，请核对名称后保存。'); } catch(e){setError(e instanceof Error?e.message:'读取失败，请重试。');}finally{lock.current=false;setBusy(false);}
        }}>读取最新版本</GlassButton>}
        <GlassButton disabled={busy} onClick={onClose}>关闭</GlassButton>
      </div>
    </form>
  </ResponsiveDialog>;
}
