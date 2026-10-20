import { useCallback, useEffect, useRef, useState } from 'react';
import { behaviorKinds, type BehaviorEvent, type BehaviorInput } from '../../domain/classroomBehavior';
import type { RecordProject } from '../../domain/classroomTasks';
import type { RosterStudent } from '../../domain/types';
import { behaviorApi } from '../../services/classroomBehaviorApi';
import { action, control } from './ClassroomTaskDialogs';
import { RecordingFeedback, useRecordingQueue } from './useRecordingQueue';

export default function ClassroomBehaviorRecord({ classId, identityKey, project, date, students }: {
  classId: string; identityKey: string; project: RecordProject; date: string; students: RosterStudent[];
}) {
  const [events, setEvents] = useState<BehaviorEvent[]>([]);
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
  const queue = useRecordingQueue<BehaviorInput, BehaviorInput, BehaviorEvent>({
    storageKey: 'qingsong:behavior-queue:' + identityKey,
    legacyKey: 'qingsong:behavior-pending:' + identityKey,
    prepare: async (intent, id) => { if (pendingRead.current) await pendingRead.current; return { ...intent, operationId: id }; },
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
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100/80 px-3 py-2 dark:bg-zinc-800/70">
      <div><h3 className="text-base font-bold">正在记录：{project.label}</h3><p className="mt-1 text-xs text-slate-500">{date} · 点击姓名记录</p></div>
      <details className="relative"><summary className="flex min-h-11 cursor-pointer items-center px-2 text-sm font-semibold text-slate-500">补充说明 ▾</summary><div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border bg-white p-3 shadow-lg dark:bg-zinc-900"><input className={control} aria-label="表现说明" placeholder="可选：具体发生了什么" maxLength={1000} value={note} onChange={e => setNote(e.target.value)}/></div></details>
    </div>
    <RecordingFeedback syncing={loading} {...queue} discard={id => queue.queue.discard(id)}/>
    {loadError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{loadError}<button className={action + ' ml-2'} onClick={() => void load().catch(() => undefined)}>重新读取</button></p>}
    <input className={control + ' sm:max-w-xs'} aria-label="搜索表现记录学生" placeholder="搜索姓名或学号" value={query} onChange={e => setQuery(e.target.value)}/>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {roster.filter(student => !query || (student.name + ' ' + student.studentNo).includes(query)).map(student => {
        const job = queue.jobs.find(item => item.intent?.studentId === student.id && item.intent.classId === classId && item.intent.kind === project.key && item.intent.occurredDate === date && !item.intent.targetId);
        const n = events.filter(event => event.studentId === student.id && event.kind === project.key && !event.retracted).length;
        return <button key={student.id} aria-label={'记录' + student.name + project.label} aria-busy={Boolean(job)} disabled={Boolean(job) || queue.unresolved}
          className={'min-h-16 min-w-0 rounded-xl border px-3 py-2 text-left transition-colors ' + (n || job ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40' : 'border-slate-200 bg-white hover:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900')}
          onClick={() => record(student)}>
          <span className="flex items-center gap-2"><span className="shrink-0 text-xs text-slate-400">{student.studentNo}</span><span className="break-words text-base font-bold">{student.name}</span>{n > 0 && <span className="ml-auto text-sm text-emerald-700">{n}次</span>}</span>
          {job && <span className="mt-1 block text-xs text-slate-500">{job.status === 'unknown' ? '待核对' : '保存中'}</span>}
        </button>;
      })}
    </div>
    <p role="status" className="min-h-6 text-sm text-slate-500">{notice}</p>
    <details className="space-y-2 rounded-xl border p-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">{date} 的表现来源记录 · 共{total}笔</summary>
      {total > events.length && <p className="text-sm text-amber-800">共{total}笔，已载入最近{events.length}笔；完整统计请查看画像。</p>}
      {events.slice(0, 30).map(event => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3 text-sm dark:bg-zinc-900"><div><strong>{event.studentName} · {event.projectLabel ?? behaviorKinds.find(kind => kind.key === event.kind)?.label ?? '表现记录'}</strong><p className="mt-1 break-words text-slate-500">{event.note || '未填写说明'} · {new Date(event.recordedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}{event.retracted ? ' · 已撤销' : ''}</p></div>{!event.retracted && <button className={action} disabled={queue.unresolved || queue.jobs.some(job => job.intent?.targetId === event.id)} onClick={() => queue.enqueue({ operationId: '', studentId: event.studentId, classId: event.classId, kind: event.kind, note: '教师撤销误记', occurredDate: event.occurredDate, targetId: event.id }, '撤销' + event.studentName)}>撤销</button>}</div>)}
      {!events.length && !loading && <p className="text-sm text-slate-500">当天还没有已记录的表现。</p>}
    </details>
  </div>;
}
