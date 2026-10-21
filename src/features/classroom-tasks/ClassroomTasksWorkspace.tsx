import ClassroomHistoryItem from './ClassroomHistoryItem';
import { behaviorKinds } from '../../domain/classroomBehavior';
import { quickProjects } from '../../domain/classroomTasks';
import ClassroomProjectPanel from './ClassroomProjectPanel';
import ClassroomQuickRecord from './ClassroomQuickRecord';
import ClassroomBehaviorRecord from './ClassroomBehaviorRecord';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import ResponsiveChoiceDialog from '../../components/ResponsiveChoiceDialog';
import type { SchoolClass, RosterStudent } from '../../domain/types';
import type { CreateTaskInput, CreationPreview, TaskListItem, RecordProject } from '../../domain/classroomTasks';
import { ClassroomTaskError, taskApi } from '../../services/classroomTaskApi';
import { CreateTaskDialog, action, control, primary, today } from './ClassroomTaskDialogs';
import { useClassroomTasks } from './useClassroomTasks';
import ClassroomTaskDetail from './ClassroomTaskDetail';
const projectCache = new Map<string, RecordProject[]>();
const readProjects=(identity:string)=>{
  if(projectCache.has(identity))return projectCache.get(identity)!;
  try{const stored=JSON.parse(sessionStorage.getItem('qingsong:project-list:'+identity)??'null');if(Array.isArray(stored)&&stored.length&&stored.every(p=>typeof p.key==='string'&&typeof p.label==='string'&&['study','behavior'].includes(p.category)&&['completion','pass','event'].includes(p.mode)))return stored as RecordProject[];}catch{/* Optional display cache; server still validates every write. */}
  return defaults;
};
const rememberProjects=(identity:string,data:RecordProject[])=>{projectCache.set(identity,data);try{sessionStorage.setItem('qingsong:project-list:'+identity,JSON.stringify(data));}catch{/* Display cache is optional. */}};
const defaults: RecordProject[] = [
  ...quickProjects.map(p=>({...p,category:'study' as const})),
  ...behaviorKinds.map(p=>({...p,category:'behavior' as const,mode:'event' as const,positive:'',negative:''})),
];
export default function ClassroomTasksWorkspace({ students, classes, initialClassId, initialTaskId, initialStudentId, identityKey, onOpenTask, onBack, onNavigate }: { students: RosterStudent[]; classes: SchoolClass[]; initialClassId: string; initialTaskId?: string; initialStudentId?: string; identityKey: string; onOpenTask: (id: string) => void; onBack: () => void; onNavigate: (id: string) => void }) {
  const state = useClassroomTasks(identityKey, initialTaskId);
  const [tab,setTab]=useState<'record'|'followup'|'history'>('record');
  const [projects,setProjects]=useState<RecordProject[]>(()=>readProjects(identityKey));
  const [selectedProject,setSelectedProject]=useState(()=>{try{return localStorage.getItem('qingsong:selected-project:'+identityKey)||'collection';}catch{return 'collection';}});
  const [recordDate,setRecordDate]=useState(today);
  const [roundControls,setRoundControls]=useState<HTMLDivElement|null>(null);
  const [projectError,setProjectError]=useState('');
  const loadProjects=useCallback(async()=>{try{const data=await taskApi.projects();setProjects(data);rememberProjects(identityKey,data);setProjectError('');}catch(e){setProjectError(e instanceof Error?e.message:'项目读取失败，请重试。');}},[]);
  useEffect(()=>{let current=true;void taskApi.projects().then(data=>{if(current){setProjects(data);rememberProjects(identityKey,data);}}).catch(e=>{if(current)setProjectError(e.message);});return()=>{current=false;};},[]);
  const project=projects.find(p=>p.key===selectedProject);
  const selectProject=(p:RecordProject)=>{if(window.dispatchEvent(new Event('classroom-task-before-leave',{cancelable:true}))){setSelectedProject(p.key);try{localStorage.setItem('qingsong:selected-project:'+identityKey,p.key);}catch{/* Optional preference. */}}};

  const [classId, setClassId] = useState(initialClassId); const [lifecycle, setLifecycle] = useState(''); const [query, setQuery] = useState('');
  const [items, setItems] = useState<TaskListItem[]>([]); const [total, setTotal] = useState(0); const [offset, setOffset] = useState(0); const [loading, setLoading] = useState(false); const [create, setCreate] = useState(false); const [picker, setPicker] = useState(false);
  const [seed, setSeed] = useState<Partial<CreateTaskInput>>();
  const creation = useRef<{ fingerprint: string; operationId: string }>();
  const [archiveBusy,setArchiveBusy]=useState<string|null>(null);
  const archiveLock=useRef(false);
  const archiveItem=async(item:TaskListItem)=>{
    if(archiveLock.current)return;
    const restoring=item.lifecycle==='archived';
    if(!window.confirm(restoring?'恢复归档前的状态，保留原记录？':'本次检查仍有待跟进'+item.counts.negative+'人、未记录'+item.counts.unrecorded+'人。归档后从活动列表移除，历史保留，可恢复。确认归档？'))return;
    archiveLock.current=true;setArchiveBusy(item.id);
    try{const result=await state.perform(item.id,{operationId:crypto.randomUUID(),kind:'lifecycle',lifecycle:restoring?(item.previousLifecycle??'active'):'archived',expectedMetadataVersion:item.metadataVersion});if(result)await load();}
    finally{archiveLock.current=false;setArchiveBusy(null);}
  };
  const loadSequence = useRef(0);
  const load = useCallback(async () => { const sequence = ++loadSequence.current; setLoading(true); try { const params = new URLSearchParams({ lifecycle:tab==='followup'?'active':lifecycle, ...(tab==='followup'?{negativeOnly:'true'}:{}), offset:String(offset), limit:'30', ...(classId ? {classId} : {}), ...(query ? {search:query} : {}) }); const data = await taskApi.list(params); if (sequence === loadSequence.current) { setItems(data.tasks); setTotal(data.total); } } catch(e) { if (sequence === loadSequence.current) state.setError(e instanceof Error ? e.message : '任务列表读取失败，请重试。'); } finally { if (sequence === loadSequence.current) setLoading(false); } }, [classId, lifecycle, offset, query, tab]);
  useEffect(() => { if (!initialTaskId && tab!=='record') void load(); return () => { loadSequence.current++; }; }, [initialTaskId, load, tab]);
  useEffect(() => { const refresh = () => { if (initialTaskId) void state.reload().catch(e => state.setError(e.message)); else if(tab!=='record') void load(); }; window.addEventListener('focus',refresh); return () => window.removeEventListener('focus',refresh); }, [initialTaskId, load, state.reload, tab]);
  const createTask = async (input: CreateTaskInput, preview: CreationPreview) => {
    const fingerprint = JSON.stringify(input);
    const unresolved = state.pending.find(p => p.kind === 'create');
    if (unresolved && (!creation.current || creation.current.fingerprint !== fingerprint)) { throw new Error('前一次建任务结果尚未确认，请先关闭表单核对，避免重复建立任务。'); }
    if (!creation.current || creation.current.fingerprint !== fingerprint) creation.current = {fingerprint,operationId:crypto.randomUUID()};
    const id = creation.current.operationId;
    try { state.register(id, '', 'create'); } catch { state.setError('浏览器不能保存核对标识，任务尚未发送。'); return false; }
    try { const detail = await taskApi.create({...input,previewToken:preview.previewToken,operationId:id}); state.clear(id); creation.current = undefined; onOpenTask(detail.task.id); return true; }
    catch(e) { if (e instanceof ClassroomTaskError && [400,409,422].includes(e.status)) { state.clear(id); creation.current = undefined; } state.setError(e instanceof Error ? e.message : '尚未确认任务是否创建，请核对。'); throw e; }
  };
  return <section id="classroom-tasks-page" className="w-full min-w-0 space-y-3 text-slate-900 dark:text-slate-100">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-zinc-700"><div className="flex items-center gap-2">{initialTaskId&&<button className={action} onClick={onBack} aria-label="返回来源页面"><ArrowLeft className="h-5 w-5"/></button>}<h2 className="text-xl font-bold">课堂任务</h2></div>{!initialTaskId&&<nav className="flex gap-1" aria-label="课堂记录页面">{([['record','记录'],['followup','待跟进'],['history','历史']] as const).map(([value,label])=><button key={value} aria-pressed={tab===value} className={'min-h-11 rounded-lg px-3 text-sm font-semibold '+(tab===value?'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':'text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800')} onClick={()=>{if(window.dispatchEvent(new Event('classroom-task-before-leave',{cancelable:true}))){setTab(value);setOffset(0);}}}>{label}</button>)}</nav>}</header>
    {!initialTaskId&&<div className="flex flex-wrap items-center gap-2"><button className={action+' max-w-24 truncate sm:max-w-none'} onClick={()=>setPicker(true)}>{classes.find(c=>c.id===classId)?.name??'全部班级'} ▾</button>{tab==='record'&&<label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-slate-500"><span className="hidden sm:inline">日期</span><input type="date" className={control.replace('w-full','')+' w-35 sm:w-40'} aria-label="记录日期" value={recordDate} onChange={e=>{if(window.dispatchEvent(new Event('classroom-task-before-leave',{cancelable:true})))setRecordDate(e.target.value);}}/></label>}{tab==='record'&&<div ref={setRoundControls} className="flex shrink-0 items-center"/>}</div>}
    {!initialTaskId&&tab==='record'&&<>{projectError?<div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{projectError}<button className={action+' ml-2'} onClick={()=>void loadProjects()}>重新读取项目</button></div>:<ClassroomProjectPanel projects={projects} selected={project?.key??''} identityKey={identityKey} onSelect={selectProject} onCreated={p=>{setProjects(current=>{const next=current.some(v=>v.key===p.key)?current:[...current,p];rememberProjects(identityKey,next);return next;});selectProject(p);}}/>}</>}
    {state.error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{state.error}<button className={action + ' ml-2'} onClick={()=>{state.setError(''); void (initialTaskId ? state.reload() : load()).catch(e=>state.setError(e.message));}}>重新读取</button></div>}
    {state.pending.length > 0 && <aside className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><h3 className="font-bold">{state.pending.length}笔结果待核对</h3>{state.pending.map(p=><div key={p.id} className="flex flex-wrap items-center gap-2"><span>{p.kind === 'create' ? '新建任务' : '任务记录'} · {new Date(p.at).toLocaleString('zh-CN')}</span><button className={action} onClick={()=>void state.reconcile(p.id).then(result=>{if(result && p.kind==='create')onOpenTask(result.taskId);})}>核对保存状态</button><button className={action} onClick={()=>void state.retry(p.id)}>原操作重试</button><button className={action} onClick={()=>{if(window.confirm('仅在已核对确认未保存后清除。若先前请求仍在处理，后续仍可能保存；请核对任务和历史。确认清除核对标识吗？'))state.clear(p.id);}}>确认后清除</button></div>)}</aside>}
    {initialTaskId ? state.detail ? <div key={state.detail.task.id}><ClassroomTaskDetail detail={state.detail} initialStudentId={initialStudentId} state={state} onList={()=>onOpenTask('')} onRepeat={()=>{setSeed({name:state.detail!.task.name,mode:state.detail!.task.mode,description:state.detail!.task.description});setCreate(true);}}/></div> : <p role="status" className="p-6 text-sm">{state.error ? '任务暂时无法读取。' : '正在读取任务与名册…'}</p> : tab==='record' ? !classes.some(c=>c.id===classId&&c.status==='active') ? <p className="rounded-xl border p-6 text-sm">请选择有效班级后直接记录。没有班级时，请先到班级管理创建并导入学生。</p> : !project ? <p role="status" className="p-4 text-sm text-slate-500">正在读取项目…</p> : <div key={identityKey+classId+project.key+recordDate}>{project.category==='study'?<ClassroomQuickRecord roundControls={roundControls} students={students} classId={classId} identityKey={identityKey} project={project} date={recordDate} onOpenTask={onOpenTask}/>:<ClassroomBehaviorRecord students={students} classId={classId} identityKey={identityKey} project={project} date={recordDate}/>}</div> : <>
      <div className="flex flex-wrap gap-2">{tab==='history'&&<div className="flex flex-wrap gap-1" aria-label="任务状态">{[['','全部'],['active','进行中'],['ended','已结束'],['archived','已归档']].map(([value,label])=><button key={value} aria-pressed={lifecycle===value} className={lifecycle===value?primary:action} onClick={()=>{setLifecycle(value);setOffset(0);}}>{label}</button>)}</div>}</div>
      <div className="flex gap-2"><input className={control} aria-label="搜索任务" placeholder="搜索任务名称" value={query} onChange={e=>{setQuery(e.target.value);setOffset(0);}}/><button className={action} aria-label="刷新任务列表" onClick={()=>void load()}><RefreshCw className="h-5 w-5"/></button></div>
      <p role="status" className="text-sm text-slate-500">{loading?'正在刷新…':'共'+total+'项任务'}</p>
      {!loading && !items.length && <div className="rounded-2xl border border-dashed p-8 text-center"><h3 className="font-bold">{classes.length?'当前条件下没有任务':'先创建班级'}</h3><p className="mt-2 text-sm text-slate-500">{tab==='followup'?'当前没有明确未完成或未通过的检查。未记录人数请进入检查核对。':'可以回到“记录”，选择事项后直接点学生结果。'}</p>{!classes.length&&<button className={primary+' mt-4'} onClick={()=>onNavigate('class-mgmt')}>创建班级</button>}</div>}
      <div className="grid gap-3">{items.map(item=><ClassroomHistoryItem key={item.id} item={item} busy={archiveBusy!==null} onOpen={()=>onOpenTask(item.id)} onArchive={()=>void archiveItem(item)}/>)}</div>
      {total>30&&<div className="flex items-center justify-between gap-2"><button className={action} disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-30))}>上一页</button><span className="text-sm">{Math.floor(offset/30)+1} / {Math.ceil(total/30)}</span><button className={action} disabled={offset+30>=total} onClick={()=>setOffset(offset+30)}>下一页</button></div>}
    </>}
    {picker&&<ResponsiveChoiceDialog title="筛选班级" value={classId} options={[...(tab==='record'?[]:[{value:'',label:'全部班级'}]),...classes.map(c=>({value:c.id,label:c.name}))]} onChange={id=>{if(window.dispatchEvent(new Event('classroom-task-before-leave',{cancelable:true}))){setClassId(id);setOffset(0);}}} onClose={()=>setPicker(false)}/>}
    {create&&<CreateTaskDialog classes={classes.filter(c=>c.status==='active')} initialClassId={state.detail?.task.classId??classId} seed={seed} onClose={()=>setCreate(false)} onCreate={createTask}/>}
  </section>;
}
