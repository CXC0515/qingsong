import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuickContext, QuickRecordInput, TaskResult } from '../../domain/classroomTasks';
import { quickProjects } from '../../domain/classroomTasks';
import { ClassroomTaskError, taskApi } from '../../services/classroomTaskApi';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import { action, control, primary, today } from './ClassroomTaskDialogs';

export default function ClassroomQuickRecord({classId,identityKey,onOpenTask}:{classId:string;identityKey:string;onOpenTask:(id:string)=>void}) {
  const [projectKey,setProjectKey]=useState(()=>{try{const saved=localStorage.getItem('qingsong:quick-project:'+identityKey+':'+classId);return quickProjects.some(p=>p.key===saved)?saved!:'collection';}catch{return 'collection';}});
  const [date,setDate]=useState(today); const [round,setRound]=useState<number>();
  const [context,setContext]=useState<QuickContext|null>(null); const [content,setContent]=useState('');
  const [query,setQuery]=useState(''); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false); const lock=useRef(false); const [loading,setLoading]=useState(false);
  const [batch,setBatch]=useState(false); const [exceptions,setExceptions]=useState<string[]>([]);
  const [last,setLast]=useState<{taskId:string;studentId?:string;operationId:string}|null>(null);
  const key='qingsong:quick-pending:'+identityKey;
  const [pending,setPending]=useState<string|null>(()=>{try{return sessionStorage.getItem(key);}catch{return null;}});
  const [notFound,setNotFound]=useState(false);
  const retry=useRef<(()=>Promise<unknown>)|null>(null);
  const generation=useRef(0);
  const project=quickProjects.find(p=>p.key===projectKey)!;
  useEffect(()=>{try{localStorage.setItem('qingsong:quick-project:'+identityKey+':'+classId,projectKey);}catch{/* Optional preference only. */}},[identityKey,classId,projectKey]);
  const scope=classId+'|'+projectKey+'|'+date+'|'+round;
  const scopeRef=useRef(scope); scopeRef.current=scope;
  const load=useCallback(async()=>{
    if(!classId)return;const n=++generation.current;setLoading(true);
    try{const result=await taskApi.quickContext({classId,projectKey,checkDate:date,...(round?{round}:{})});if(n===generation.current){setContext(result);setError('');}}
    catch(e){if(n===generation.current)setError(e instanceof Error?e.message:'名单读取失败，请重试。');}
    finally{if(n===generation.current)setLoading(false);}
  },[classId,projectKey,date,round]);
  useEffect(()=>{setContext(null);setContent('');setLast(null);setNotice('');void load();return()=>{generation.current++;};},[load]);
  useEffect(()=>{const refresh=()=>void load();window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[load]);
  useEffect(()=>{
    const leave=(e:Event)=>{if((pending||lock.current)&&!window.confirm('还有记录未确认保存，离开后请返回核对。确定离开吗？'))e.preventDefault();};
    const unload=(e:BeforeUnloadEvent)=>{if(pending||lock.current){e.preventDefault();e.returnValue='';}};
    window.addEventListener('classroom-task-before-leave',leave);window.addEventListener('beforeunload',unload);
    return()=>{window.removeEventListener('classroom-task-before-leave',leave);window.removeEventListener('beforeunload',unload);};
  },[pending]);
  const send=async(id:string,run:()=>Promise<unknown>)=>{
    if(lock.current)return false;lock.current=true;setBusy(true);setError('');
    const originalScope=scopeRef.current;
    try{sessionStorage.setItem(key,id);setPending(id);}catch{setError('浏览器不能保留核对标识，本次尚未发送。');lock.current=false;setBusy(false);return false;}
    retry.current=run;
    try{await run();sessionStorage.removeItem(key);setPending(null);retry.current=null;if(originalScope===scopeRef.current)setNotice('已保存，可撤销或查看历史。');return true;}
    catch(e){if(e instanceof ClassroomTaskError&&[400,404,409,422].includes(e.status)){sessionStorage.removeItem(key);setPending(null);retry.current=null;}setError(e instanceof Error?e.message:'尚未确认是否保存，请核对。');return false;}
    finally{lock.current=false;setBusy(false);if(originalScope===scopeRef.current)void load();}
  };
  const record=async(members:QuickRecordInput['members'])=>{
    if(!context||pending||busy)return;
    const id=crypto.randomUUID();const request:QuickRecordInput={classId,projectKey,checkDate:date,round:context.round,contextToken:context.contextToken,operationId:id,expectedMetadataVersion:context.detail?.task.metadataVersion??0,members,...(!context.detail?{content}: {})};
    let savedTask='';
    const ok=await send(id,async()=>{const result=await taskApi.quickRecord(request);savedTask=result.taskId;});
    if(ok){setLast({taskId:savedTask,studentId:members.length===1?members[0].studentId:undefined,operationId:id});setBatch(false);}
  };
  const reconcile=async()=>{if(!pending||lock.current)return;setBusy(true);lock.current=true;setNotFound(false);try{await taskApi.operation(pending);sessionStorage.removeItem(key);setPending(null);retry.current=null;setNotice('已核对：这笔已保存。');void load();}catch(e){setNotFound(e instanceof ClassroomTaskError&&e.status===404);setError(e instanceof ClassroomTaskError&&e.status===404?'查询时尚未找到这笔，请稍后再核对；保留原操作重试，不另建新记录。':e instanceof Error?e.message:'核对失败，请重试。');}finally{setBusy(false);lock.current=false;}};
  const detail=context?.detail; const writable=!detail||detail.task.lifecycle==='active';
  const rows=[...(context?.participants??[])].sort((a,b)=>a.studentNo.localeCompare(b.studentNo,'zh-CN',{numeric:true})).map(p=>({...p,current:detail?.participants.find(v=>v.studentId===p.studentId)}));
  const visible=rows.filter(p=>!query||(p.name+' '+p.studentNo).includes(query));
  const eligible=visible.filter(p=>p.included&&!p.current?.exempt&&!p.current?.result);
  const negative=project.negative,positive=project.positive;
  const quickRetest=(studentId:string)=>{
    const p=detail?.participants.find(p=>p.studentId===studentId);if(!p||!detail||pending)return;
    const id=crypto.randomUUID();void send(id,()=>taskApi.operate(detail.task.id,{operationId:id,kind:'retest',participantId:p.id,expectedVersion:p.version,expectedMetadataVersion:detail.task.metadataVersion,result:'positive',source:'quick-record'})).then(ok=>{if(ok)setLast({taskId:detail.task.id,studentId,operationId:id});});
  };
  const undo=async()=>{
    if(!last||pending)return;const original=last;const id=crypto.randomUUID();
    // Refresh before building a retract. Only the still-current events of this exact operation are eligible.
    try{
      const d=await taskApi.detail(original.taskId);const events=d.events.filter(e=>e.operationId===original.operationId&&e.participantId);
      const members=events.map(e=>{const p=d.participants.find(p=>p.id===e.participantId);if(!p||p.currentEventId!==e.id)throw new Error('这笔已有后续变化，未撤销，请进入历史核对。');return{participantId:p.id,expectedVersion:p.version,targetEventId:e.id};});
      if(!members.length)throw new Error('找不到可撤销结果，请进入历史核对。');
      const input={kind:'retract' as const,members,reason:'教师撤销刚才操作',expectedMetadataVersion:d.task.metadataVersion};
      const preview=await taskApi.preview(original.taskId,input);
      if(preview.conflicts.length)throw new Error('记录已有变化，未撤销，请进入历史核对。');
      if(await send(id,()=>taskApi.operate(original.taskId,{...input,operationId:id,previewToken:preview.previewToken!})))setLast(null);
    }catch(e){setError(e instanceof Error?e.message:'未能撤销，请重试。');}
  };
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2" aria-label="记录事项">{quickProjects.map(p=><button key={p.key} className={projectKey===p.key?primary:action} disabled={busy||Boolean(pending)} aria-pressed={projectKey===p.key} onClick={()=>{setProjectKey(p.key);setRound(undefined);}}>{p.label}</button>)}</div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">{project.label} · 第{context?.round??round??1}轮</h3><input className={control+' max-w-44'} aria-label="检查日期" type="date" value={date} disabled={busy||Boolean(pending)} onChange={e=>{setDate(e.target.value);setRound(undefined);}}/></div>
      {date!==today()&&<p className="mt-2 text-sm text-amber-800">正在记录 {date}。补做旧检查请从“待跟进”进入。<button className={action+' ml-2'} onClick={()=>{setDate(today());setRound(undefined);}}>切换今天</button></p>}
      {detail?<div className="mt-3 space-y-2"><p className="font-semibold">{detail.task.name}</p><p className="text-sm">{positive} {detail.counts.positive} · {negative} {detail.counts.negative} · 未记录 {detail.counts.unrecorded} · 免做 {detail.counts.exempt}</p></div>:<label className="mt-3 grid gap-1 text-sm text-slate-500">可补充内容，直接记录也可以<input className={control} placeholder={projectKey==='recitation'?'例如：《陋室铭》': '例如：第六课练习'} maxLength={100} value={content} onChange={e=>setContent(e.target.value)} disabled={busy||Boolean(pending)}/></label>}
      <div className="mt-3 flex flex-wrap gap-2">{detail&&<button className={action} onClick={()=>onOpenTask(detail.task.id)}>详情与历史</button>}<button className={action} disabled={!context||busy||Boolean(pending)} onClick={()=>{setRound((context?.latestRound??0)+1);setContent('');}}>再记一轮</button>{(context?.latestRound??0)>1&&<select aria-label="切换检查轮次" className={action} value={context?.round} disabled={busy||Boolean(pending)} onChange={e=>setRound(Number(e.target.value))}>{Array.from({length:Math.max(context?.latestRound??1,context?.round??1)},(_,i)=><option key={i+1} value={i+1}>第{i+1}轮</option>)}</select>}</div>
      {!writable&&<p className="mt-3 text-sm text-amber-800">本轮已结束或归档。可查看详情恢复原检查，或再记一轮。</p>}
    </div>
    {pending&&<div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">有一笔保存结果待确认。<button className={action+' ml-2'} disabled={busy} onClick={()=>void reconcile()}>核对保存状态</button>{retry.current&&<button className={action+' ml-2'} disabled={busy} onClick={()=>{const run=retry.current;if(run)void send(pending,run);}}>原操作重试</button>}{notFound&&!retry.current&&<button className={action+' ml-2'} onClick={()=>{if(window.confirm('查询时未找到不代表请求绝不会保存。请先核对原检查与历史；仅确认未保存后清除核对标识。确定清除吗？')){sessionStorage.removeItem(key);setPending(null);setNotFound(false);}}}>核对后清除标识</button>}</div>}
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}<button className={action+' ml-2'} onClick={()=>void load()}>重新读取</button></p>}
    <div className="flex gap-2"><input className={control} aria-label="搜索姓名或学号" placeholder="搜索姓名或学号" value={query} onChange={e=>setQuery(e.target.value)}/><button className={action+' shrink-0'} disabled={!eligible.length||busy||Boolean(pending)||!writable||loading} onClick={()=>{setExceptions([]);setBatch(true);}}>批量记录</button></div>
    {loading&&<p role="status" className="text-sm text-slate-500">正在读取名单…</p>}
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{visible.map(p=><div key={p.studentId} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"><div className="flex items-center justify-between gap-2"><span className="break-words font-bold">{p.studentNo} {p.name}</span><span className="shrink-0 text-sm text-slate-500">{!p.included?'不参与':p.current?.exempt?'免做':p.current?.result==='positive'?positive:p.current?.result==='negative'?negative:'未记录'}</span></div>{writable&&p.included&&!p.current?.exempt&&<div className="mt-2 flex gap-2">{!p.current?.result?<><button className={primary+' flex-1'} disabled={busy||Boolean(pending)||loading} onClick={()=>void record([{studentId:p.studentId,expectedVersion:p.current?.version??0,result:'positive'}])}>{positive}</button><button className={action+' flex-1'} disabled={busy||Boolean(pending)||loading} onClick={()=>void record([{studentId:p.studentId,expectedVersion:p.current?.version??0,result:'negative'}])}>{negative}</button></>:p.current.result==='negative'?<button className={primary+' w-full'} disabled={busy||Boolean(pending)||loading} onClick={()=>quickRetest(p.studentId)}>{project.mode==='pass'?'补测通过':'补交完成'}</button>:<button className={action+' w-full'} onClick={()=>detail&&onOpenTask(detail.task.id)}>查看记录</button>}</div>}</div>)}</div>
    <div role="status" className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white/95 p-3 text-sm dark:bg-zinc-900/95"><span>{busy?'正在保存，请稍候…':pending?'有一笔待核对':notice||'点学生结果即可保存，无需创建任务。'}</span>{last&&<button className={action} disabled={busy||Boolean(pending)} onClick={()=>void undo()}>撤销上一操作</button>}</div>
    {batch&&<ResponsiveDialog title="批量记录与例外" busy={busy} onClose={()=>setBatch(false)}><p className="text-sm">范围：{query?'当前搜索结果':'本轮名单'}中的 {eligible.length} 名未记录学生。已有结果保留。勾选{negative}的学生，其余确认{positive}。</p><p className="font-bold">{positive} {eligible.length-exceptions.length}人 · {negative} {exceptions.length}人</p>{eligible.map(p=><label key={p.studentId} className="flex min-h-11 items-center gap-3 rounded-xl border p-3"><input type="checkbox" checked={exceptions.includes(p.studentId)} onChange={e=>setExceptions(ids=>e.target.checked?[...ids,p.studentId]:ids.filter(id=>id!==p.studentId))}/>{p.studentNo} {p.name}<span className="ml-auto text-sm">{exceptions.includes(p.studentId)?negative:positive}</span></label>)}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<button className={primary+' w-full'} disabled={busy||Boolean(pending)||loading} onClick={()=>void record(eligible.map(p=>({studentId:p.studentId,expectedVersion:p.current?.version??0,result:(exceptions.includes(p.studentId)?'negative':'positive') as TaskResult})))}>确认范围并保存</button></ResponsiveDialog>}
  </div>;
}
