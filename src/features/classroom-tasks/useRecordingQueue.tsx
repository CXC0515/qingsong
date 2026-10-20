import { useEffect, useRef, useState } from 'react';
import { ClassroomTaskError } from '../../services/classroomTaskApi';
import { RecordingQueue, type RecordingJob } from './recordingQueue';
import { action } from './ClassroomTaskDialogs';

export function useRecordingQueue<I, P, R>(options: {
  storageKey: string; legacyKey: string;
  prepare: (intent: I, id: string) => Promise<P>;
  execute: (request: P) => Promise<R>;
  query: (id: string) => Promise<R>;
  saved: (result: R, intent: I | null, reconciled: boolean) => void;
  rejected?: () => Promise<unknown>;
}) {
  const callbacks = useRef(options); callbacks.current = options;
  const [error, setError] = useState('');
  const [, render] = useState(0);
  const [checking, setChecking] = useState(false);
  const [queue] = useState(() => new RecordingQueue<I, P, R>({
    read: () => {
      try {
        const stored = JSON.parse(sessionStorage.getItem(options.storageKey) ?? '[]');
        if (Array.isArray(stored) && stored.length) return stored;
        const legacy = sessionStorage.getItem(options.legacyKey);
        return legacy ? [{ id: legacy, label: '上次记录', intent: null, status: 'unknown' }] : [];
      } catch { return []; }
    },
    write: jobs => {
      sessionStorage.setItem(options.storageKey, JSON.stringify(jobs));
      sessionStorage.removeItem(options.legacyKey);
    },
    prepare: (intent, id) => callbacks.current.prepare(intent, id),
    execute: request => callbacks.current.execute(request),
    query: id => callbacks.current.query(id),
    saved: (result, intent, reconciled) => { callbacks.current.saved(result, intent, reconciled); },
    rejected: async (e, label, unknown) => {
      const message = label + '：' + (unknown ? '尚未确认是否保存，请核对后重试原操作。' : (e instanceof Error ? e.message : '保存失败。') + ' 本次未保存。');
      setError(previous => previous ? previous + '\n' + message : message);
      if (!unknown) await callbacks.current.rejected?.().catch(() => undefined);
    },
    definitive: e => e instanceof ClassroomTaskError && [400,404,409,422].includes(e.status),
  }));
  useEffect(() => {
    const unsubscribe = queue.subscribe(() => render(value => value + 1));
    queue.start();
    const leave = (event: Event) => {
      if (queue.jobs.length) { event.preventDefault(); setError('还有点名正在保存或等待核对，请处理完成后再切换。'); }
    };
    const unload = (event: BeforeUnloadEvent) => { if (queue.jobs.length) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('classroom-task-before-leave', leave);
    window.addEventListener('beforeunload', unload);
    return () => { queue.stop(); unsubscribe(); window.removeEventListener('classroom-task-before-leave', leave); window.removeEventListener('beforeunload', unload); };
  }, [queue]);
  const enqueue = (intent: I, label: string) => {
    try { queue.enqueue(intent, label, crypto.randomUUID()); return true; }
    catch (e) { setError(e instanceof Error ? e.message : '浏览器不能保留记录，本次尚未发送。'); return false; }
  };
  const reconcile = async (id: string) => {
    if (checking) return; setChecking(true); setError('');
    try { await queue.reconcile(id); }
    catch (e) { setError(e instanceof ClassroomTaskError && e.status === 404 ? '查询时尚未找到这笔，请稍后再查或重试原操作；不要重新点名。' : e instanceof Error ? e.message : '暂时无法核对，请重试。'); }
    finally { setChecking(false); }
  };
  const retry = (id: string) => { try { setError(''); queue.retry(id); } catch (e) { setError((e as Error).message); } };
  return { jobs: queue.jobs, enqueue, reconcile, retry, checking, error, setError, queue, unresolved: queue.jobs.some(job => job.status === 'unknown') };
}

export function RecordingFeedback<I, P>({ jobs, error, checking, reconcile, retry, discard, syncing }: {
  jobs: RecordingJob<I, P>[]; error: string; checking: boolean;
  reconcile: (id: string) => Promise<void>; retry: (id: string) => void; discard: (id: string) => void; syncing?: boolean;
}) {
  const unknown = jobs.filter(job => job.status === 'unknown');
  return <>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {unknown.map(job => <div key={job.id} role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
      {job.label}：保存结果待核对。
      <button className={action + ' ml-2'} disabled={checking} onClick={() => void reconcile(job.id)}>核对保存状态</button>
      {(job.intent || job.request) && <button className={action + ' ml-2'} disabled={checking} onClick={() => retry(job.id)}>重试原操作</button>}
      <button className={action + ' ml-2'} disabled={checking} onClick={() => { if (window.confirm('请先核对保存状态及历史。尚在处理的原请求可能随后保存；仅确认无须重试后清除此项，其他排队点名将继续。确定吗？')) discard(job.id); }}>核对后清除</button>
    </div>)}
    <p role="status" className="min-h-5 text-sm text-slate-500">{jobs.length > 0 && !unknown.length ? '正在保存 '+jobs.length+' 笔，可继续点其他学生。' : syncing ? '正在同步记录，可先点名。' : ''}</p>
  </>;
}
