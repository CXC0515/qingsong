import { useCallback, useEffect, useRef, useState } from 'react';
import { behaviorKinds, type BehaviorEvent, type BehaviorInput } from '../../domain/classroomBehavior';
import type { RecordProject } from '../../domain/classroomTasks';
import type { RosterStudent } from '../../domain/types';
import { behaviorApi } from '../../services/classroomBehaviorApi';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import { action, control } from './ClassroomTaskDialogs';
import { RecordingFeedback, RecordingStatus, useRecordingQueue } from './useRecordingQueue';

import { behaviorProjection, type BehaviorIntent } from './behaviorProjection';

export default function ClassroomBehaviorRecord({ classId, identityKey, project, date, students }: {
  classId: string; identityKey: string; project: RecordProject; date: string; students: RosterStudent[];
}) {
  const [events, setEvents] = useState<BehaviorEvent[]>([]);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const sequence = useRef(0);
  const pendingRead = useRef<Promise<unknown> | null>(null);
  const load = useCallback(() => {
    const n = ++sequence.current; setLoading(true); setLoadError('');
    const promise = behaviorApi.list({ classId, from: date, to: date, limit: 500 });
    pendingRead.current = promise;
    void promise.then(history => { if (n === sequence.current) { setEvents(history.events); setTotal(history.total); } })
      .catch(e => { if (n === sequence.current) setLoadError(e.message); })
      .finally(() => { if (n === sequence.current) { setLoading(false); pendingRead.current = null; } });
    return promise;
  }, [classId, date]);
  useEffect(() => { void load().catch(() => undefined); return () => { sequence.current++; }; }, [load]);
  const queue = useRecordingQueue<BehaviorIntent, BehaviorInput, BehaviorEvent>({
    storageKey: 'qingsong:behavior-queue:' + identityKey,
    legacyKey: 'qingsong:behavior-pending:' + identityKey,
    prepare: async (intent, id) => { if (pendingRead.current) await pendingRead.current; const {targetOperationId,...input}=intent; const target=targetOperationId?await behaviorApi.operation(targetOperationId):null; return { ...input, ...(target?{targetId:target.id}:{}), operationId: id }; },
    execute: behaviorApi.record,
    query: behaviorApi.operation,
    saved: (saved, _intent, reconciled) => {
      if (reconciled || saved.classId !== classId || saved.occurredDate !== date) { void load().catch(() => undefined); return; }
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
  const record = (student: RosterStudent) => queue.enqueue({ operationId: '', studentId: student.id, classId, kind: project.key, note, occurredDate: date }, student.name);
  const pending=queue.jobs.filter(job=>job.intent?.classId===classId&&job.intent.occurredDate===date&&job.intent.kind===project.key);
  const visibleEvents=events.filter(event=>event.kind===project.key);
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
  const retract=(event:BehaviorEvent)=>queue.enqueue({operationId:'',studentId:event.studentId,classId:event.classId,kind:event.kind,note:'教师撤销误记',occurredDate:event.occurredDate,targetId:event.id},'撤销'+event.studentName);
  const counts=behaviorProjection(visibleEvents,pending);
  const count=[...counts.values()].reduce((sum,n)=>sum+Math.max(0,n),0);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="font-semibold text-emerald-700 dark:text-emerald-300">{project.label} {count}次</span><span className="text-slate-500">涉及 {Array.from(counts.values()).filter(n=>n>0).length}人</span>
      <span className="ml-auto"><RecordingStatus jobs={queue.jobs} syncing={loading}/></span>
    </div>
    <RecordingFeedback {...queue} discard={id => queue.queue.discard(id)}/>
    {loadError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{loadError}<button className={action + ' ml-2'} onClick={() => void load().catch(() => undefined)}>重新读取</button></p>}
    <div className="flex flex-wrap items-center gap-2"><input className={control+' flex-1 basis-36 sm:max-w-xs'} aria-label="搜索表现记录学生" placeholder="搜索姓名或学号" value={query} onChange={e=>setQuery(e.target.value)}/>
      <button className={action} onClick={()=>setHistoryOpen(true)}>本次记录 ↗</button>
      <button className={action} disabled={!latestPending&&!latestEvent} onClick={undoLatest}>撤销</button>
      <details className="relative max-w-full"><summary className="min-h-11 cursor-pointer px-3 py-3 text-xs text-slate-500">补充说明</summary><input className={control.replace('w-full','')+' mt-2 w-64 max-w-full bg-white dark:bg-zinc-900'} aria-label="表现说明" placeholder="具体发生了什么（可选）" maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></details>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(144px,1fr))]">
      {roster.filter(student => !query || (student.name + ' ' + student.studentNo).includes(query)).map(student => {
        const n=Math.max(0,counts.get(student.id)??0);
        return <button key={student.id} aria-label={'记录' + student.name + project.label}
          className={'min-h-16 min-w-0 rounded-xl border px-2 py-2 text-left sm:min-h-14 transition-colors active:scale-[0.98] motion-reduce:transform-none ' + (n ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40' : 'border-slate-200 bg-white hover:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900')}
          onClick={() => record(student)}>
          <span className="flex items-center gap-1.5"><span className="shrink-0 text-xs text-slate-400">{student.studentNo}</span><span className="break-words text-base font-bold">{student.name}</span>{n > 0 && <span className="ml-auto text-sm font-bold text-emerald-700">{n}</span>}</span>
        </button>;
      })}
    </div>
    <p className="text-xs text-slate-500">每点一次记一次，同一学生可连续记录。{notice}</p>
    {historyOpen&&<ResponsiveDialog title={date+' · '+project.label+'记录'} onClose={()=>setHistoryOpen(false)}>
      {pending.map(job=><p key={job.id} className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{job.label} · 本机已记，{job.status==='unknown'?'待核对':'等待同步'}</p>)}
      {total > events.length && <p className="text-sm text-amber-800">当天共{total}笔，已载入最近{events.length}笔；完整统计请查看画像。</p>}
      {visibleEvents.slice(0, 100).map(event => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3 text-sm dark:bg-zinc-900"><div><strong>{event.studentName} · {event.projectLabel ?? behaviorKinds.find(kind => kind.key === event.kind)?.label ?? '表现记录'}</strong><p className="mt-1 break-words text-slate-500">{event.note || '未填写说明'} · {new Date(event.recordedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}{event.retracted || pendingRetractions.has(event.id)||pendingRetractions.has(event.operationId) ? ' · 已撤销' : ''}</p></div>{!event.retracted&&!event.targetId&&!pendingRetractions.has(event.id)&&!pendingRetractions.has(event.operationId) && <button className={action} onClick={()=>retract(event)}>撤销</button>}</div>)}
      {!visibleEvents.length&&!pending.length&&!loading&&<p className="text-sm text-slate-500">本次还没有记录。</p>}
    </ResponsiveDialog>}
  </div>;
}
