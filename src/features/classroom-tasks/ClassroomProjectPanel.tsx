import { GlassButton, GlassSegments } from '../../components/glass/Glass';
import { useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { CreateRecordProject, RecordProject } from '../../domain/classroomTasks';
import { ClassroomTaskError, taskApi } from '../../services/classroomTaskApi';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import { action, control } from './ClassroomTaskDialogs';

export default function ClassroomProjectPanel({projects,selected,onSelect,onCreated,identityKey,category,actions}:{actions?:ReactNode;category:RecordProject['category'];projects:RecordProject[];selected:string;onSelect:(project:RecordProject)=>void;onCreated:(project:RecordProject)=>void;identityKey:string}) {
  const storageKey='qingsong:project-draft:'+identityKey;
  const [draft,setDraft]=useState<CreateRecordProject|null>(()=>{try{return JSON.parse(sessionStorage.getItem(storageKey)??'null');}catch{return null;}});
  const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const lock=useRef(false);
  const [sent,setSent]=useState(Boolean(draft));
  const start=(category:RecordProject['category'])=>{if(!window.dispatchEvent(new Event('classroom-task-before-leave',{cancelable:true})))return;setError('');if(!sent)setDraft({operationId:crypto.randomUUID(),name:'',category,mode:category==='behavior'?'event':'completion'});setOpen(true);};
  const save=async()=>{
    if(!draft||lock.current)return;lock.current=true;setBusy(true);setError('');
    try{sessionStorage.setItem(storageKey,JSON.stringify(draft));setSent(true);}catch{setError('浏览器不能保留核对信息，项目尚未发送。');setBusy(false);lock.current=false;return;}
    try{const project=await taskApi.createProject(draft);sessionStorage.removeItem(storageKey);setSent(false);setDraft(null);setOpen(false);onCreated(project);}
    catch(e){if(e instanceof ClassroomTaskError&&[400,409,422].includes(e.status)){sessionStorage.removeItem(storageKey);setSent(false);setDraft({...draft,operationId:crypto.randomUUID()});}setError(e instanceof Error?e.message:'尚未确认项目是否保存，请保留原内容重试。');}
    finally{lock.current=false;setBusy(false);}
  };
  return <div className="space-y-1 border-b border-slate-200 pb-2 dark:border-zinc-700">
    <div className="qs-project-row"><div className="qs-project-list" aria-label={category==='study'?'学业项目':'表现项目'}>{projects.filter(p=>p.category===category).map(p=><GlassButton key={p.key} aria-pressed={selected===p.key} onClick={()=>onSelect(p)}>{p.label}</GlassButton>)}<GlassButton onClick={()=>start(category)}><Plus className="h-4 w-4"/>新项目</GlassButton></div><div className="qs-project-actions">{actions}</div></div>

    {sent&&!busy&&<p role="status" className="text-sm text-amber-800">有一个项目保存待核对。<GlassButton variant="secondary" className={action+' ml-2'} onClick={()=>setOpen(true)}>继续核对</GlassButton></p>}
    {open&&draft&&<ResponsiveDialog title={draft.category==='study'?'新建学业项目':'新建表现项目'} busy={busy} onClose={()=>{if(sent||!draft.name||window.confirm('项目尚未保存，确定关闭吗？'))setOpen(false);}}><form className="grid gap-4" onSubmit={e=>{e.preventDefault();void save();}}><label className="grid gap-2 text-sm font-semibold">项目名称<input className={'qs-field-input '+(control)} autoFocus required maxLength={50} value={draft.name} disabled={busy||sent} placeholder={draft.category==='study'?'例如：陋室铭背诵':'例如：认真倾听'} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>{draft.category==='study'?<details><summary className="min-h-11 cursor-pointer py-2 text-sm text-slate-500">记录方式：{draft.mode==='pass'?'通过／未通过':'完成／未完成'}（可调整）</summary><fieldset disabled={busy||sent}><legend className="mb-2 text-sm font-semibold">怎么记录</legend><GlassSegments label="记录方式" value={draft.mode==='pass'?'pass':'completion'} options={[{value:'completion',label:'完成／未完成'},{value:'pass',label:'通过／未通过'}]} onChange={mode=>{if(busy||sent)return false;setDraft({...draft,mode});}}/></fieldset><p className="mt-2 text-sm text-slate-500">完成用于交作业等事项；通过用于背诵等需要达到要求的检查。</p></details>:<p className="text-sm text-slate-500">每发生一次记一笔，同一学生可以多次记录。</p>}<p className="text-sm text-slate-500">保存后立即进入名单，以后各班都可选用，记录分别保存。</p>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<GlassButton type="submit" disabled={busy}>{busy?'正在保存…':sent?'核对并重试原保存':'保存并开始记录'}</GlassButton>{sent&&<GlassButton variant="secondary" type="button" className={action} disabled={busy} onClick={async()=>{try{const project=await taskApi.projectOperation(draft.operationId);sessionStorage.removeItem(storageKey);setSent(false);setDraft(null);setOpen(false);onCreated(project);}catch(e){setError(e instanceof Error?e.message:'核对失败。');}}}>查询保存结果</GlassButton>}{sent&&<GlassButton variant="secondary" type="button" className={action} disabled={busy} onClick={()=>{if(window.confirm('请先查询项目列表及保存结果。仅确认原请求未保存后放弃；仍在处理的原请求可能随后保存。确定清除核对标识吗？')){sessionStorage.removeItem(storageKey);setSent(false);setDraft({...draft,operationId:crypto.randomUUID()});setError('');}}}>核对后重新填写</GlassButton>}</form></ResponsiveDialog>}
  </div>;
}
