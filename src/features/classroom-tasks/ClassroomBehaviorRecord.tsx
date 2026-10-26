import { RecordingRoundControls } from './RecordingRoundPicker';
import { StudentSearch, RecordingNote } from '../../components/RecordingFields';
import { GlassButton } from '../../components/glass/Glass';
import { useCallback, useEffect, useRef, useState } from 'react';
import { behaviorKinds, type BehaviorEvent, type BehaviorInput } from '../../domain/classroomBehavior';
import type { RecordProject } from '../../domain/classroomTasks';
import type { RosterStudent } from '../../domain/types';
import { behaviorApi } from '../../services/classroomBehaviorApi';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import { action } from './ClassroomTaskDialogs';
import { RecordingFeedback, RecordingStatus, useRecordingQueue } from './useRecordingQueue';

import { behaviorProjection, type BehaviorIntent } from './behaviorProjection';

export default function ClassroomBehaviorRecord({ classId, identityKey, project, date, students, scheduleItemId, roundControls }: {
  roundControls?:HTMLElement|null;
  scheduleItemId?:string; classId: string; identityKey: string; project: RecordProject; date: string; students: RosterStudent[];
}) {
  const [round,setRound]=useState<number|null>(null);
  const [rounds,setRounds]=useState<number[]>([1]);
  const [creatingRound,setCreatingRound]=useState(false);
  const roundKey='qingsong:behavior-round:'+JSON.stringify([identityKey,classId,project.key,date,scheduleItemId??'']);
  const [pendingRound,setPendingRound]=useState<{operationId:string;basedOn:number}|null>(()=>{
    try{const saved=JSON.parse(localStorage.getItem(roundKey)??'null');return saved&&typeof saved.operationId==='string'&&Number.isInteger(saved.basedOn)?saved:null;}catch{return null;}
  });
  const scope={classId,kind:project.key,occurredDate:date,...(scheduleItemId?{scheduleItemId}:{})};
  const [studentCounts,setStudentCounts]=useState<Record<string,number>>({});
  const [events, setEvents] = useState<BehaviorEvent[]>([]);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const sequence = useRef(0);
  const [roundError,setRoundError]=useState(pendingRound?'上次新建轮次的结果尚未核对，请点击核对新一轮。':'');
  const readRounds=useCallback(()=>behaviorApi.rounds({classId,kind:project.key,occurredDate:date,...(scheduleItemId?{scheduleItemId}:{})}),[classId,project.key,date,scheduleItemId]);
  useEffect(()=>{
    let active=true;
    void readRounds().then(result=>{if(active){setRound(result.round);setRounds(result.availableRounds);if(!pendingRound)setRoundError('');}}).catch(error=>{if(active)setRoundError(error.message);});
    return ()=>{active=false;};
  },[readRounds]);
  const pendingRead = useRef<Promise<unknown> | null>(null);
  const load = useCallback(() => {
    if(round===null)return Promise.resolve();
    const n = ++sequence.current; setLoading(true); setLoadError('');
    const promise = behaviorApi.list({ classId, kind:project.key, round, from: date, to: date, limit: 500, ...(scheduleItemId?{scheduleItemId}:{freeOnly:true}) });
    pendingRead.current = promise;
    void promise.then(history => { if (n === sequence.current) { setEvents(history.events); setStudentCounts(history.studentCounts); setTotal(history.total); } })
      .catch(e => { if (n === sequence.current) setLoadError(e.message); })
      .finally(() => { if (n === sequence.current) { setLoading(false); pendingRead.current = null; } });
    return promise;
  }, [classId, project.key, round, date, scheduleItemId]);
  useEffect(() => { void load().catch(() => undefined); return () => { sequence.current++; }; }, [load]);
  const queue = useRecordingQueue<BehaviorIntent, BehaviorInput, BehaviorEvent>({
    storageKey: 'qingsong:behavior-queue:' + identityKey,
    legacyKey: 'qingsong:behavior-pending:' + identityKey,
    prepare: async (intent, id) => { if (pendingRead.current) await pendingRead.current; const {targetOperationId,...input}=intent; const target=targetOperationId?await behaviorApi.operation(targetOperationId):null; return { ...input, ...(target?{targetId:target.id}:{}), operationId: id }; },
    execute: behaviorApi.record,
    query: behaviorApi.operation,
    saved: (saved, _intent, reconciled) => {
      if (reconciled || saved.kind !== project.key || saved.classId !== classId || saved.occurredDate !== date || saved.scheduleItemId !== scheduleItemId || (saved.round??1)!==round) { void load().catch(() => undefined); return; }
      setStudentCounts(current=>({...current,[saved.studentId]:Math.max(0,(current[saved.studentId]??0)+(saved.targetId?-1:1))}));
      if (saved.targetId) setEvents(current => current.map(event => event.id === saved.targetId ? { ...event, retracted: true } : event));
      else {
        setEvents(current => [saved, ...current.filter(event => event.id !== saved.id)]);
        setTotal(value => value + 1);
      }
      setNotice(saved.targetId ? '已撤销，原记录仍在历史中。' : '已记录 ' + saved.studentName);
    },
    rejected: () => load(),
  });
  useEffect(() => {
    const refresh = () => { if (!queue.queue.jobs.length) void load().catch(() => undefined); };
    window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh);
  }, [load, queue.queue]);
  const roster = students.filter(student => student.classId === classId && student.enrollmentStatus === 'active')
    .sort((a, b) => a.studentNo.localeCompare(b.studentNo, 'zh-CN', { numeric: true }));
  const record = (student: RosterStudent) => {if(round===null||pendingRound||creatingRound||loadError)return;queue.enqueue({ round, operationId: '', studentId: student.id, classId, kind: project.key, note, occurredDate: date, ...(scheduleItemId?{scheduleItemId}:{}) }, student.name);};
  const pending=queue.jobs.filter(job=>job.intent?.classId===classId&&job.intent.occurredDate===date&&job.intent.kind===project.key&&job.intent.scheduleItemId===scheduleItemId&&(job.intent.round??1)===round);
  const visibleEvents=events.filter(event=>event.kind===project.key&&(event.round??1)===round);
  const pendingRetractions=new Set(pending.flatMap(job=>[job.intent?.targetId,job.intent?.targetOperationId].filter(Boolean)));
  const latestPending=[...pending].reverse().find(job=>!job.intent?.targetId&&!job.intent?.targetOperationId&&!pendingRetractions.has(job.id));
  const latestEvent=visibleEvents.find(event=>!event.targetId&&!event.retracted&&!pendingRetractions.has(event.id)&&!pendingRetractions.has(event.operationId));
  const undoLatest=()=>{
    if(latestPending){
      const cancelled=queue.cancelQueued(latestPending.id);
      if(cancelled!==false)return;
      const intent=latestPending.intent!;
      queue.enqueue({...intent,targetOperationId:latestPending.id,note:'教师撤销误记'},'撤销'+latestPending.label);
    }else if(latestEvent)retract(latestEvent);
  };
  const retract=(event:BehaviorEvent)=>queue.enqueue({round:event.round??1,operationId:'',studentId:event.studentId,classId:event.classId,kind:event.kind,note:'教师撤销误记',occurredDate:event.occurredDate,targetId:event.id,...(event.scheduleItemId?{scheduleItemId:event.scheduleItemId}:{})},'撤销'+event.studentName);
  const counts=behaviorProjection(visibleEvents,pending,studentCounts);
  const count=[...counts.values()].reduce((sum,n)=>sum+Math.max(0,n),0);
  const switchRound=(next:number)=>{if(!queue.jobs.length&&!creatingRound&&!pendingRound&&!loading){setEvents([]);setStudentCounts({});setTotal(0);setRound(next);setNotice('');}};
  const newRound=async()=>{
    if(queue.jobs.length||creatingRound||round===null)return;
    const input=pendingRound??{operationId:crypto.randomUUID(),basedOn:Math.max(...rounds)};
    try{localStorage.setItem(roundKey,JSON.stringify(input));}catch{setRoundError('本机无法保存轮次核对信息，未新建。请检查浏览器存储后重试。');return;}
    setPendingRound(input);setCreatingRound(true);setRoundError('');
    try{
      const result=await behaviorApi.newRound({...scope,...input});
      localStorage.removeItem(roundKey);setPendingRound(null);setRounds(result.availableRounds);setEvents([]);setStudentCounts({});setTotal(0);setRound(result.round);setNotice('');
    }catch(error){
      // Keep the exact request on uncertain outcomes, so retries cannot create another round.
      if(error instanceof Error&&'status' in error&&Number(error.status)>=400&&Number(error.status)<500){localStorage.removeItem(roundKey);setPendingRound(null);const result=await readRounds().catch(()=>null);if(result){setRounds(result.availableRounds);setRound(result.round);}}
      setRoundError(error instanceof Error?error.message:'尚未确认新轮次是否建立，请点核对新一轮。');
    }finally{setCreatingRound(false);}
  };
  useEffect(()=>{
    const guard=(event:Event)=>{if(pendingRound||creatingRound){event.preventDefault();setRoundError('新轮次正在建立或等待核对，请先处理完成再切换。');}};
    const unload=(event:BeforeUnloadEvent)=>{if(pendingRound||creatingRound){event.preventDefault();event.returnValue='';}};
    window.addEventListener('classroom-task-before-leave',guard);window.addEventListener('beforeunload',unload);
    return ()=>{window.removeEventListener('classroom-task-before-leave',guard);window.removeEventListener('beforeunload',unload);};
  },[pendingRound,creatingRound]);
  return <div className="space-y-3">
    {roundError&&<p role="alert" className="qs-error">{roundError}<GlassButton onClick={()=>{if(pendingRound)void newRound();else void readRounds().then(result=>{setRound(result.round);setRounds(result.availableRounds);setRoundError('');}).catch(error=>setRoundError(error.message));}}>{pendingRound?'核对新一轮':'重新读取轮次'}</GlassButton></p>}
    <RecordingFeedback {...queue} discard={id => queue.queue.discard(id)}/>
    {loadError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{loadError}<GlassButton variant="secondary" className={action + ' ml-2'} onClick={() => void load().catch(() => undefined)}>重新读取</GlassButton></p>}
    <div className="qs-record-meta"><StudentSearch aria-label="搜索表现记录学生" value={query} onChange={e=>setQuery(e.target.value)}/><span className="text-sm text-emerald-700">已记 {count}次</span><span className="text-sm text-slate-500">涉及 {Array.from(counts.values()).filter(n=>n>0).length}人</span><RecordingStatus jobs={queue.jobs} syncing={loading}/>
      <RecordingNote label="补充说明" aria-label="表现说明" placeholder="用于接下来每一笔（可选）" maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/><div className="qs-record-actions"><GlassButton disabled={round===null||loading||Boolean(queue.jobs.length)||creatingRound} onClick={()=>void newRound()}>{creatingRound?'正在建立…':pendingRound?'核对新一轮':'＋新一轮'}</GlassButton><GlassButton onClick={()=>setHistoryOpen(true)}>本次记录</GlassButton><GlassButton disabled={!latestPending&&!latestEvent} onClick={undoLatest}>撤销</GlassButton>
      {round!==null&&<RecordingRoundControls target={roundControls} noun="表现" value={round} rounds={rounds} disabled={Boolean(queue.jobs.length)||loading||creatingRound||Boolean(pendingRound)} onChange={switchRound}/>}
      </div>
    </div>
    <div className="qs-student-grid">
      {roster.filter(student => !query || (student.name + ' ' + student.studentNo).includes(query)).map(student => {
        const n=Math.max(0,counts.get(student.id)??0);
        return <button disabled={round===null||creatingRound||Boolean(pendingRound)||Boolean(loadError)} key={student.id} aria-label={'记录' + student.name + project.label}
          className="qs-student-card qs-student-main transition-colors" data-result={n>0?'positive':''}
          onClick={() => record(student)}>
          <span className="qs-student-no">{student.studentNo}</span><span className="qs-student-name">{student.name}</span><span className="qs-student-state">{n>0?'＋'+n:''}</span>
        </button>;
      })}
    </div>
    <p className="text-xs text-slate-500">每点一次记一次，同一学生可连续记录。{notice}</p>
    {historyOpen&&<ResponsiveDialog title={date+' · '+project.label+' · 第'+round+'轮'} onClose={()=>setHistoryOpen(false)}>
      {pending.map(job=><p key={job.id} className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{job.label} · 本机已记，{job.status==='unknown'?'待核对':'等待同步'}</p>)}
      {total > events.length && <p className="text-sm text-amber-800">当天共{total}笔，已载入最近{events.length}笔；完整统计请查看画像。</p>}
      {visibleEvents.slice(0, 100).map(event => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3 text-sm dark:bg-zinc-900"><div><strong>{event.studentName} · {event.currentProjectLabel ?? event.projectLabel ?? behaviorKinds.find(kind => kind.key === event.kind)?.label ?? '表现记录'}</strong><p className="mt-1 break-words text-slate-500">{event.note || '未填写说明'} · {new Date(event.recordedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}{event.retracted || pendingRetractions.has(event.id)||pendingRetractions.has(event.operationId) ? ' · 已撤销' : ''}</p></div>{!event.retracted&&!event.targetId&&!pendingRetractions.has(event.id)&&!pendingRetractions.has(event.operationId) && <GlassButton variant="secondary" className={action} onClick={()=>retract(event)}>撤销</GlassButton>}</div>)}
      {!visibleEvents.length&&!pending.length&&!loading&&<p className="text-sm text-slate-500">本次还没有记录。</p>}
    </ResponsiveDialog>}
  </div>;
}
