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
  const [batch,setBatch]=useState(false); const [allScope,setAllScope]=useState(true); const [exceptions,setExceptions]=useState<string[]>([]);
  const {round,setRound,context,content,setContent,loading,loadError,load,record,quickRetest,undo,queue,projected,canUndo}=useQuickRecording(classId,project.key,date,identityKey);
  const detail=context?.detail, writable=!detail||detail.task.lifecycle==='active';
  const busy=queue.jobs.length>0;
  const fallback=students.filter(p=>p.classId===classId&&['active','suspended'].includes(p.enrollmentStatus)).map(p=>({studentId:p.id,name:p.name,studentNo:p.studentNo,included:p.enrollmentStatus==='active'}));
  const rows=[...(context?.participants??fallback)].sort((a,b)=>a.studentNo.localeCompare(b.studentNo,'zh-CN',{numeric:true})).map(p=>({...p,current:detail?.participants.find(v=>v.studentId===p.studentId),result:projected.get(p.studentId)}));
  const visible=rows.filter(p=>!query||(p.name+' '+p.studentNo).includes(query));
  const eligibleAll=rows.filter(p=>p.included&&!p.current?.exempt&&!p.result);
  const eligible=visible.filter(p=>p.included&&!p.current?.exempt&&!p.result);
  const batchEligible=allScope?eligibleAll:eligible;
  const selectedExceptions=exceptions.filter(id=>batchEligible.some(p=>p.studentId===id));
  const negative=project.negative,positive=project.positive;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      {Math.max(context?.latestRound??0,context?.round??1)>1?<select aria-label="切换检查轮次" className={action} value={context?.round??round??1} disabled={busy||loading} onChange={e=>setRound(Number(e.target.value))}>{Array.from({length:Math.max(context?.latestRound??1,context?.round??1)},(_,i)=><option key={i+1} value={i+1}>第{i+1}轮</option>)}</select>:<span>第{context?.round??round??1}轮</span>}
      <button className={action} disabled={!detail||busy||loading} onClick={()=>{setRound((context?.latestRound??0)+1);setContent('');}}>新一轮检查</button>
      <button className={action} disabled={!detail||busy} onClick={()=>detail&&onOpenTask(detail.task.id)}>本次记录 ↗</button>
      {!detail&&<input className={control+' max-w-48'} maxLength={100} aria-label="本次检查内容（可选）" placeholder="检查内容（可选）" value={content} onChange={e=>setContent(e.target.value)} disabled={busy}/>}
    </div>
    <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="font-semibold text-emerald-700 dark:text-emerald-300">{positive} {rows.filter(p=>p.result==='positive').length}</span>
      <span className="text-amber-800 dark:text-amber-300">{negative} {rows.filter(p=>p.result==='negative').length}</span>
      <span className="text-slate-500">未登记 {eligibleAll.length}</span>
      <span className="ml-auto"><RecordingStatus jobs={queue.jobs} syncing={loading}/></span>
    </div>
    {!writable&&<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">本轮已结束或归档，请在本次记录中恢复，或新开一轮。</p>}
    <RecordingFeedback {...queue} discard={id=>queue.queue.discard(id)}/>
    {loadError&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{loadError}<button className={action+' ml-2'} onClick={()=>void load().catch(()=>undefined)}>重新读取</button></p>}
    <div className="flex flex-wrap items-center gap-2"><input className={control+' flex-1 basis-36 sm:max-w-xs'} aria-label="搜索姓名或学号" placeholder="搜姓名／学号" value={query} onChange={e=>setQuery(e.target.value)}/><button className={action} disabled={!eligibleAll.length||!writable||loading} onClick={()=>{setExceptions([]);setAllScope(true);setBatch(true);}}>登记{negative}名单</button><button className={action} disabled={!canUndo} onClick={()=>void undo()}>撤销</button></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">{visible.map(p=>{
      const result=p.result, allowed=writable&&p.included&&!p.current?.exempt;
      const text=!p.included?'不参与':p.current?.exempt?'免做':result==='positive'?positive:result==='negative'?negative:'未登记';
      return <div key={p.studentId} className={'relative min-w-0 overflow-hidden rounded-xl border transition-colors '+(result==='positive'?'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40':result==='negative'?'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30':'border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-900')}>
        <button className="flex min-h-21 w-full min-w-0 items-center gap-2 px-3 py-3 text-left disabled:opacity-50" aria-label={'记录'+p.name+positive} disabled={!allowed} onClick={()=>{if(!result)void record([{studentId:p.studentId,result:'positive'}]);else if(result==='negative')quickRetest(p.studentId);}}><span className="shrink-0 text-xs text-slate-400">{p.studentNo}</span><span className="grid min-w-0 gap-1"><span className="break-words text-base font-bold">{p.name}</span><span className="text-xs text-slate-500">{text}</span></span>{result==='positive'&&<span className="ml-auto text-emerald-700" aria-hidden="true">✓</span>}</button>
        {allowed&&!result&&<button className="absolute bottom-0 right-1 min-h-11 min-w-11 rounded-lg px-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:text-amber-300" aria-label={'标记'+p.name+negative} onClick={()=>void record([{studentId:p.studentId,result:'negative'}])}>{negative}</button>}
      </div>;
    })}</div>
    <p className="text-xs text-slate-500">点卡片记{positive}，点“{negative}”登记例外；{negative}后再点卡片可补做。</p>
    {batch&&<ResponsiveDialog title={'登记'+negative+'名单'} onClose={()=>setBatch(false)}><ClassroomBatchScope name="quick-batch-scope" allScope={allScope} onChange={value=>{setAllScope(value);setExceptions([]);}} visibleCount={visible.length} allCount={rows.length} visibleEligible={eligible.length} allEligible={eligibleAll.length}/><p className="text-sm">范围：{allScope?'整个名册':query?'当前搜索结果':'本轮名单'}中的 {batchEligible.length} 名未登记学生。已有结果保留。只勾选{negative}者，其余确认{positive}。</p><p className="font-bold">本次{positive} {batchEligible.length-selectedExceptions.length}人 · {negative} {selectedExceptions.length}人</p>{batchEligible.map(p=><label key={p.studentId} className="flex min-h-11 items-center gap-3 rounded-xl border p-3"><input type="checkbox" checked={exceptions.includes(p.studentId)} onChange={e=>setExceptions(ids=>e.target.checked?[...ids,p.studentId]:ids.filter(id=>id!==p.studentId))}/>{p.studentNo} {p.name}<span className="ml-auto text-sm">{exceptions.includes(p.studentId)?negative:positive}</span></label>)}<button className={primary+' w-full'} disabled={!batchEligible.length||loading} onClick={()=>{if(record(batchEligible.map(p=>({studentId:p.studentId,result:(exceptions.includes(p.studentId)?'negative':'positive') as TaskResult}))))setBatch(false);}}>确认登记 {batchEligible.length} 人</button></ResponsiveDialog>}
  </div>;
}
