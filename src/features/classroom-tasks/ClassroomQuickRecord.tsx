import { StudentSearch, RecordingNote } from '../../components/RecordingFields';
import RecordingRoundPicker from './RecordingRoundPicker';
import { GlassButton } from '../../components/glass/Glass';
import ClassroomBatchScope from './ClassroomBatchScope';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { RecordProject, TaskResult } from '../../domain/classroomTasks';
import type { RosterStudent } from '../../domain/types';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import { action, primary } from './ClassroomTaskDialogs';
import { useQuickRecording } from './useQuickRecording';
import { RecordingFeedback, RecordingStatus } from './useRecordingQueue';

export default function ClassroomQuickRecord({classId,identityKey,project,date,onOpenTask,students,roundControls,scheduleItemId}:{scheduleItemId?:string;roundControls:HTMLElement|null;classId:string;identityKey:string;project:RecordProject;date:string;onOpenTask:(id:string)=>void;students:RosterStudent[]}) {
  const [query,setQuery]=useState('');
  const [batch,setBatch]=useState(false); const [allScope,setAllScope]=useState(true); const [exceptions,setExceptions]=useState<string[]>([]);
  const {round,setRound,context,content,setContent,loading,loadError,load,record,quickRetest,undo,queue,projected,canUndo}=useQuickRecording(classId,project.key,date,identityKey,scheduleItemId);
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
  return <div className="space-y-2">
    {roundControls&&createPortal(<RecordingRoundPicker value={context?.round??round??1} rounds={[...new Set([...(context?.availableRounds??[]),context?.round??round??1])].sort((a,b)=>a-b)} disabled={busy||loading} onChange={setRound}/>,roundControls)}
    {!writable&&<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">本轮已结束或归档，请在本次记录中恢复，或新开一轮。</p>}
    <RecordingFeedback {...queue} discard={id=>queue.queue.discard(id)}/>
    {loadError&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{loadError}<button className={action+' ml-2'} onClick={()=>void load().catch(()=>undefined)}>重新读取</button></p>}
    <div className="qs-record-meta"><StudentSearch aria-label="搜索姓名或学号" value={query} onChange={e=>setQuery(e.target.value)}/>
      <span className="text-sm text-emerald-700">{positive} {rows.filter(p=>p.result==='positive').length}</span><span className="text-sm text-amber-800">{negative} {rows.filter(p=>p.result==='negative').length}</span><span className="text-sm text-slate-500">未登记 {eligibleAll.length}</span><RecordingStatus jobs={queue.jobs} syncing={loading}/>
      <RecordingNote label="检查内容" maxLength={100} aria-label="本次检查内容（可选）" placeholder="检查内容（可选）" value={detail?(detail.task.name===project.label?'':detail.task.name):content} onChange={e=>setContent(e.target.value)} disabled={busy||Boolean(detail)} title={detail?'已开始的检查内容请在本次记录中修改':undefined}/>
      <GlassButton disabled={!eligibleAll.length||!writable||loading} onClick={()=>{setExceptions([]);setAllScope(true);setBatch(true);}}>登记{negative}名单</GlassButton><GlassButton disabled={!canUndo} onClick={()=>void undo()}>撤销</GlassButton><GlassButton disabled={!detail||busy||loading} onClick={()=>{setRound((context?.latestRound??0)+1);setContent('');}}>＋新一轮</GlassButton><GlassButton disabled={!detail||busy} onClick={()=>detail&&onOpenTask(detail.task.id)}>本次记录</GlassButton>
    </div>
    <div className="qs-student-grid">{visible.map(p=>{
      const result=p.result, allowed=writable&&p.included&&!p.current?.exempt;
      const text=!p.included?'不参与':p.current?.exempt?'免做':result==='negative'?negative:'';
      return <div key={p.studentId} className="qs-student-card transition-colors" data-result={result??''}>
        <button className="qs-student-main disabled:opacity-50" aria-label={'记录'+p.name+positive} disabled={!allowed} onClick={()=>{if(!result)void record([{studentId:p.studentId,result:'positive'}]);else if(result==='negative')quickRetest(p.studentId);}}><span className="qs-student-no">{p.studentNo}</span><span className="qs-student-name">{p.name}</span><span className="qs-student-state">{result==='positive'?'✓':text}</span></button>
        {allowed&&<button disabled={Boolean(result)} className="qs-student-exception disabled:invisible rounded-lg text-amber-800 hover:bg-amber-100 dark:text-amber-300" aria-label={'标记'+p.name+negative} onClick={()=>void record([{studentId:p.studentId,result:'negative'}])}>{negative}</button>}
      </div>;
    })}</div>
    <p className="text-xs text-slate-500">点卡片记{positive}，点“{negative}”登记例外；{negative}后再点卡片可补做。</p>
    {batch&&<ResponsiveDialog title={'登记'+negative+'名单'} onClose={()=>setBatch(false)}><ClassroomBatchScope name="quick-batch-scope" allScope={allScope} onChange={value=>{setAllScope(value);setExceptions([]);}} visibleCount={visible.length} allCount={rows.length} visibleEligible={eligible.length} allEligible={eligibleAll.length}/><p className="text-sm">范围：{allScope?'整个名册':query?'当前搜索结果':'本轮名单'}中的 {batchEligible.length} 名未登记学生。已有结果保留。只勾选{negative}者，其余确认{positive}。</p><p className="font-bold">本次{positive} {batchEligible.length-selectedExceptions.length}人 · {negative} {selectedExceptions.length}人</p>{batchEligible.map(p=><label key={p.studentId} className="flex min-h-11 items-center gap-3 rounded-xl border p-3"><input type="checkbox" checked={exceptions.includes(p.studentId)} onChange={e=>setExceptions(ids=>e.target.checked?[...ids,p.studentId]:ids.filter(id=>id!==p.studentId))}/>{p.studentNo} {p.name}<span className="ml-auto text-sm">{exceptions.includes(p.studentId)?negative:positive}</span></label>)}<button className={primary+' w-full'} disabled={!batchEligible.length||loading} onClick={()=>{if(record(batchEligible.map(p=>({studentId:p.studentId,result:(exceptions.includes(p.studentId)?'negative':'positive') as TaskResult}))))setBatch(false);}}>确认登记 {batchEligible.length} 人</button></ResponsiveDialog>}
  </div>;
}
