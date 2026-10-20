import ClassroomBatchScope from './ClassroomBatchScope';
import { useState } from 'react';
import type { RecordProject, TaskResult } from '../../domain/classroomTasks';
import type { RosterStudent } from '../../domain/types';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import { action, control, primary } from './ClassroomTaskDialogs';
import { useQuickRecording } from './useQuickRecording';
import { RecordingFeedback, RecordingStatus } from './useRecordingQueue';

export default function ClassroomQuickRecord({classId,identityKey,project,date,onOpenTask,students}:{classId:string;identityKey:string;project:RecordProject;date:string;onOpenTask:(id:string)=>void;students:RosterStudent[]}) {
  const [query,setQuery]=useState('');
  const [batch,setBatch]=useState(false); const [allScope,setAllScope]=useState(false); const [exceptions,setExceptions]=useState<string[]>([]);
  const {round,setRound,context,content,setContent,last,notice,loading,loadError,load,record,quickRetest,undo,queue}=useQuickRecording(classId,project.key,date,identityKey);
  const detail=context?.detail; const writable=!detail||detail.task.lifecycle==='active';
  const busy=queue.jobs.length>0, pending=queue.unresolved;
  const inFlight=(studentId:string)=>queue.jobs.find(job=>job.intent?.scope.classId===classId&&job.intent.scope.projectKey===project.key&&job.intent.scope.checkDate===date&&job.intent.scope.round===round&&(job.intent.members?.some(m=>m.studentId===studentId)||job.intent.studentId===studentId));
  const fallback=students.filter(p=>p.classId===classId&&['active','suspended'].includes(p.enrollmentStatus)).map(p=>({studentId:p.id,name:p.name,studentNo:p.studentNo,included:p.enrollmentStatus==='active'}));
  const rows=[...(context?.participants??fallback)].sort((a,b)=>a.studentNo.localeCompare(b.studentNo,'zh-CN',{numeric:true})).map(p=>({...p,current:detail?.participants.find(v=>v.studentId===p.studentId)}));
  const visible=rows.filter(p=>!query||(p.name+' '+p.studentNo).includes(query));
  const eligibleAll=rows.filter(p=>p.included&&!p.current?.exempt&&!p.current?.result&&!inFlight(p.studentId));
  const eligible=visible.filter(p=>p.included&&!p.current?.exempt&&!p.current?.result&&!inFlight(p.studentId));
  const batchEligible=allScope?eligibleAll:eligible;
  const selectedExceptions=exceptions.filter(id=>batchEligible.some(p=>p.studentId===id));
  const negative=project.negative,positive=project.positive;
  return <div className="space-y-4">
    <div className="rounded-xl bg-slate-100/80 px-3 py-2 dark:bg-zinc-800/70">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:flex sm:flex-wrap">
        <h3 className="min-w-0 break-words text-base font-bold">正在记录：{detail?.task.name??project.label}</h3>
        <div className="w-28 text-right sm:text-left"><RecordingStatus jobs={queue.jobs} syncing={loading}/></div>
        <div className="col-span-2 flex flex-wrap gap-x-3 gap-y-1 text-sm sm:ml-auto"><span className="font-semibold text-emerald-700 dark:text-emerald-300">{positive} {detail?.counts.positive??0}</span><span className="text-amber-800 dark:text-amber-300">{negative} {detail?.counts.negative??0}</span><span className="text-slate-500">未记录 {detail?.counts.unrecorded??rows.filter(p=>p.included).length}</span></div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{date}</span>
        {Math.max(context?.latestRound??0,context?.round??1)>1?<select aria-label="切换检查轮次" className={action} value={context?.round??round??1} disabled={busy||loading} onChange={e=>setRound(Number(e.target.value))}>{Array.from({length:Math.max(context?.latestRound??1,context?.round??1)},(_,i)=><option key={i+1} value={i+1}>第{i+1}轮</option>)}</select>:<span>第{context?.round??round??1}轮</span>}
        <button className={action} disabled={!detail||busy||loading} onClick={()=>{setRound((context?.latestRound??0)+1);setContent('');}}>新一轮检查</button>
        <span>{!detail&&!loading?'首笔保存时建立本轮':project.mode==='pass'?'点击姓名记通过':'点击姓名记'+positive}</span>
      </div>
    </div>
    {!writable&&<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">本轮已结束或归档，请在更多中查看详情恢复，或再记一轮。</p>}
    <RecordingFeedback {...queue} discard={id=>queue.queue.discard(id)}/>
    {loadError&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{loadError}<button className={action+' ml-2'} onClick={()=>void load().catch(()=>undefined)}>重新读取</button></p>}
    <div className="flex flex-wrap items-center gap-2"><input className={control+' flex-1 basis-36 sm:max-w-xs'} aria-label="搜索姓名或学号" placeholder="搜姓名／学号" value={query} onChange={e=>setQuery(e.target.value)}/><button className={action} disabled={!eligibleAll.length||busy||Boolean(pending)||!writable||loading} onClick={()=>{setExceptions([]);setAllScope(false);setBatch(true);}}>批量记录</button><button className={action} disabled={!last||busy||Boolean(pending)} onClick={()=>void undo()}>撤销</button><details className="relative"><summary className="flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-sm font-semibold text-slate-500">更多 ▾</summary><div className="absolute right-0 z-20 mt-1 grid w-56 gap-2 rounded-xl border bg-white p-3 shadow-lg dark:bg-zinc-900">{detail&&<button className={action} onClick={()=>onOpenTask(detail.task.id)}>详情与历史</button>}{!detail&&<label className="grid gap-1 text-xs">本次检查内容（可选）<input className={control} maxLength={100} value={content} onChange={e=>setContent(e.target.value)} disabled={busy||Boolean(pending)}/></label>}</div></details></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">{visible.map(p=>{
      const job=inFlight(p.studentId);const optimistic=job?.intent?.members?.find(m=>m.studentId===p.studentId)?.result??(job?.intent?.type==='retest'?'positive':undefined);const result=optimistic??p.current?.result;const allowed=writable&&p.included&&!p.current?.exempt;
      const blocked=Boolean(job)||pending||!allowed;
      const text=job?(job.status==='unknown'?'待核对':'保存中'):!p.included?'不参与':p.current?.exempt?'免做':result==='positive'?positive:result==='negative'?negative:'未记录';
      return <div key={p.studentId} className={'min-w-0 overflow-hidden rounded-xl border transition-colors '+(result==='positive'?'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40':result==='negative'?'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30':'border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-900')}>
        <button className="flex min-h-14 w-full min-w-0 items-center gap-2 px-3 py-2 text-left disabled:opacity-50" aria-label={!result?'标记'+p.name+positive:'查看'+p.name+'记录'} aria-busy={Boolean(job)} disabled={blocked} onClick={()=>{if(!result)void record([{studentId:p.studentId,result:'positive'}]);else if(detail)onOpenTask(detail.task.id);}}><span className="shrink-0 text-xs text-slate-400">{p.studentNo}</span><span className="break-words text-base font-bold">{p.name}</span>{result==='positive'&&<span className="ml-auto text-emerald-700" aria-hidden="true">✓</span>}</button>
        <div className="flex min-h-11 items-center justify-between gap-1 border-t border-black/5 px-2"><span className={'pl-1 text-xs '+(result==='positive'?'text-emerald-800 dark:text-emerald-300':result==='negative'?'text-amber-900 dark:text-amber-300':'text-slate-400')}>{text}</span>{allowed&&!result&&<button className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-amber-100 dark:text-slate-300" aria-label={'标记'+p.name+negative} aria-busy={Boolean(job)} disabled={blocked} onClick={()=>void record([{studentId:p.studentId,result:'negative'}])}>{negative}</button>}{allowed&&result==='negative'&&<button className="min-h-11 rounded-lg px-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300" aria-busy={Boolean(job)} disabled={blocked} onClick={()=>quickRetest(p.studentId)}>{project.mode==='pass'?'补测通过':'补交完成'}</button>}</div>
      </div>;
    })}</div>
    <div role="status" className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-sm text-slate-500"><span>{busy?'点名已保留，正在按顺序保存。':notice||'点击姓名记'+positive+'，例外点“'+negative+'”。'}</span>{last&&<button className={action} disabled={busy||Boolean(pending)} onClick={()=>void undo()}>撤销上一操作</button>}</div>
    {batch&&<ResponsiveDialog title="批量记录与例外" busy={busy} onClose={()=>setBatch(false)}><ClassroomBatchScope name="quick-batch-scope" allScope={allScope} onChange={value=>{setAllScope(value);setExceptions([]);}} visibleCount={visible.length} allCount={rows.length} visibleEligible={eligible.length} allEligible={eligibleAll.length}/><p className="text-sm">范围：{allScope?'整个名册':query?'当前搜索结果':'本轮名单'}中的 {batchEligible.length} 名未记录学生。已有结果保留。勾选{negative}的学生，其余确认{positive}。</p><p className="font-bold">{positive} {batchEligible.length-selectedExceptions.length}人 · {negative} {selectedExceptions.length}人</p>{batchEligible.map(p=><label key={p.studentId} className="flex min-h-11 items-center gap-3 rounded-xl border p-3"><input type="checkbox" checked={exceptions.includes(p.studentId)} onChange={e=>setExceptions(ids=>e.target.checked?[...ids,p.studentId]:ids.filter(id=>id!==p.studentId))}/>{p.studentNo} {p.name}<span className="ml-auto text-sm">{exceptions.includes(p.studentId)?negative:positive}</span></label>)}{queue.error&&<p role="alert" className="text-sm text-red-700">{queue.error}</p>}<button className={primary+' w-full'} disabled={!batchEligible.length||busy||Boolean(pending)||loading} onClick={()=>{setBatch(false);void record(batchEligible.map(p=>({studentId:p.studentId,result:(exceptions.includes(p.studentId)?'negative':'positive') as TaskResult})));}}>确认范围并保存</button></ResponsiveDialog>}
  </div>;
}
