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

export default function ClassroomBehaviorRecord({ classId, identityKey, project, date, students, scheduleItemId }: {
  scheduleItemId?:string; classId: string; identityKey: string; project: RecordProject; date: string; students: RosterStudent[];
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
    const promise = behaviorApi.list({ classId, from: date, to: date, limit: 500, ...(scheduleItemId?{scheduleItemId}:{freeOnly:true}) });
    pendingRead.current = promise;
    void promise.then(history => { if (n === sequence.current) { setEvents(history.events); setTotal(history.total); } })
      .catch(e => { if (n === sequence.current) setLoadError(e.message); })
      .finally(() => { if (n === sequence.current) { setLoading(false); pendingRead.current = null; } });
    return promise;
  }, [classId, date, scheduleItemId]);
  useEffect(() => { void load().catch(() => undefined); return () => { sequence.current++; }; }, [load]);
  const queue = useRecordingQueue<BehaviorIntent, BehaviorInput, BehaviorEvent>({
    storageKey: 'qingsong:behavior-queue:' + identityKey,
    legacyKey: 'qingsong:behavior-pending:' + identityKey,
    prepare: async (intent, id) => { if (pendingRead.current) await pendingRead.current; const {targetOperationId,...input}=intent; const target=targetOperationId?await behaviorApi.operation(targetOperationId):null; return { ...input, ...(target?{targetId:target.id}:{}), operationId: id }; },
    execute: behaviorApi.record,
    query: behaviorApi.operation,
    saved: (saved, _intent, reconciled) => {
      if (reconciled || saved.classId !== classId || saved.occurredDate !== date || saved.scheduleItemId !== scheduleItemId) { void load().catch(() => undefined); return; }
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
  const record = (student: RosterStudent) => queue.enqueue({ operationId: '', studentId: student.id, classId, kind: project.key, note, occurredDate: date, ...(scheduleItemId?{scheduleItemId}:{}) }, student.name);
  const pending=queue.jobs.filter(job=>job.intent?.classId===classId&&job.intent.occurredDate===date&&job.intent.kind===project.key&&job.intent.scheduleItemId===scheduleItemId);
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
  const retract=(event:BehaviorEvent)=>queue.enqueue({operationId:'',studentId:event.studentId,classId:event.classId,kind:event.kind,note:'教师撤销误记',occurredDate:event.occurredDate,targetId:event.id,...(event.scheduleItemId?{scheduleItemId:event.scheduleItemId}:{})},'撤销'+event.studentName);
  const counts=behaviorProjection(visibleEvents,pending);
  const count=[...counts.values()].reduce((sum,n)=>sum+Math.max(0,n),0);
  return <div className="space-y-3">
    <RecordingFeedback {...queue} discard={id => queue.queue.discard(id)}/>
    {loadError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{loadError}<button className={action + ' ml-2'} onClick={() => void load().catch(() => undefined)}>重新读取</button></p>}
    <div className="qs-record-meta"><StudentSearch aria-label="搜索表现记录学生" value={query} onChange={e=>setQuery(e.target.value)}/><span className="text-sm text-emerald-700">已记 {count}次</span><span className="text-sm text-slate-500">涉及 {Array.from(counts.values()).filter(n=>n>0).length}人</span><RecordingStatus jobs={queue.jobs} syncing={loading}/>
      <RecordingNote label="补充说明" aria-label="表现说明" placeholder="补充说明（可选）" maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/><GlassButton onClick={()=>setHistoryOpen(true)}>本次记录</GlassButton><GlassButton disabled={!latestPending&&!latestEvent} onClick={undoLatest}>撤销</GlassButton>
    </div>
    <div className="qs-student-grid">
      {roster.filter(student => !query || (student.name + ' ' + student.studentNo).includes(query)).map(student => {
        const n=Math.max(0,counts.get(student.id)??0);
        return <button key={student.id} aria-label={'记录' + student.name + project.label}
          className="qs-student-card qs-student-main transition-colors" data-result={n>0?'positive':''}
          onClick={() => record(student)}>
          <span className="qs-student-no">{student.studentNo}</span><span className="qs-student-name">{student.name}</span><span className="qs-student-state">{n>0?'＋'+n:''}</span>
        </button>;
      })}
    </div>
    <p className="text-xs text-slate-500">每点一次记一次，同一学生可连续记录。{notice}</p>
    {historyOpen&&<ResponsiveDialog title={date+' · '+project.label+'记录'} onClose={()=>setHistoryOpen(false)}>
      {pending.map(job=><p key={job.id} className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{job.label} · 本机已记，{job.status==='unknown'?'待核对':'等待同步'}</p>)}
      {total > events.length && <p className="text-sm text-amber-800">当天共{total}笔，已载入最近{events.length}笔；完整统计请查看画像。</p>}
      {visibleEvents.slice(0, 100).map(event => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3 text-sm dark:bg-zinc-900"><div><strong>{event.studentName} · {event.currentProjectLabel ?? event.projectLabel ?? behaviorKinds.find(kind => kind.key === event.kind)?.label ?? '表现记录'}</strong><p className="mt-1 break-words text-slate-500">{event.note || '未填写说明'} · {new Date(event.recordedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}{event.retracted || pendingRetractions.has(event.id)||pendingRetractions.has(event.operationId) ? ' · 已撤销' : ''}</p></div>{!event.retracted&&!event.targetId&&!pendingRetractions.has(event.id)&&!pendingRetractions.has(event.operationId) && <button className={action} onClick={()=>retract(event)}>撤销</button>}</div>)}
      {!visibleEvents.length&&!pending.length&&!loading&&<p className="text-sm text-slate-500">本次还没有记录。</p>}
    </ResponsiveDialog>}
  </div>;
}
