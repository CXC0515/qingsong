import { useCallback, useEffect, useRef, useState } from 'react';
import type { OperationInput, OperationResult, QuickContext, QuickContextInput, QuickRecordInput, TaskResult } from '../../domain/classroomTasks';
import { taskApi } from '../../services/classroomTaskApi';
import { useRecordingQueue } from './useRecordingQueue';

export interface QuickIntent {
  scope: QuickContextInput;
  content: string;
  before?: Array<{studentId:string;result:TaskResult|null}>;
  type: 'record' | 'retest' | 'undo';
  members?: Array<{ studentId: string; result: TaskResult }>;
  studentId?: string;
  original?: { taskId: string; operationId: string };
}
type QuickRequest = { type: 'record'; input: QuickRecordInput } | { type: 'operate'; taskId: string; input: OperationInput };

export function useQuickRecording(classId: string, projectKey: string, date: string, identityKey: string) {
  const [round, setRound] = useState<number>();
  const [context, setContext] = useState<QuickContext | null>(null);
  const contextRef = useRef<QuickContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [content, setContent] = useState('');
  const [last, setLast] = useState<{ taskId: string; operationId: string; before?: QuickIntent['before'] } | null>(null);
  const [notice, setNotice] = useState('');
  const input = { classId, projectKey, checkDate: date, ...(round ? { round } : {}) };
  const pendingRead = useRef<Promise<QuickContext> | null>(null);
  const generation = useRef(0);
  const load = useCallback(() => {
    const n = ++generation.current;
    setLoading(true); setLoadError('');
    const promise = taskApi.quickContext({ classId, projectKey, checkDate: date, ...(round ? { round } : {}) });
    pendingRead.current = promise;
    void promise.then(value => { if (n === generation.current) { contextRef.current = value; setContext(value); } })
      .catch(e => { if (n === generation.current) setLoadError(e.message); })
      .finally(() => { if (n === generation.current) { setLoading(false); pendingRead.current = null; } });
    return promise;
  }, [classId, projectKey, date, round]);
  useEffect(() => {
    contextRef.current = null; setContext(null); setLast(null); setContent(''); setNotice('');
    void load().catch(() => undefined);
    return () => { generation.current++; };
  }, [load]);
  const queue = useRecordingQueue<QuickIntent, QuickRequest, OperationResult>({
    storageKey: 'qingsong:quick-queue:' + identityKey,
    legacyKey: 'qingsong:quick-pending:' + identityKey,
    prepare: async (intent, id) => {
      const sameScope = intent.scope.classId === classId && intent.scope.projectKey === projectKey && intent.scope.checkDate === date && intent.scope.round === round;
      // Finish any read already in flight before writing, so a late read cannot
      // replace a newer save response with an older participant snapshot.
      const current = sameScope ? pendingRead.current ? await pendingRead.current : contextRef.current ?? await load() : await taskApi.quickContext(intent.scope);
      if (intent.type === 'record') return { type: 'record', input: {
        ...intent.scope, round: current.round, operationId: id, contextToken: current.contextToken,
        expectedMetadataVersion: current.detail?.task.metadataVersion ?? 0,
        ...(!current.detail ? { content: intent.content } : {}),
        members: intent.members!.map(member => ({ ...member, expectedVersion: current.detail?.participants.find(p => p.studentId === member.studentId)?.version ?? 0 })),
      } };
      const detail = current.detail;
      if (!detail) throw new Error('找不到原检查，请重新读取。');
      if (intent.type === 'retest') {
        const participant = detail.participants.find(p => p.studentId === intent.studentId);
        if (!participant) throw new Error('名单已变化，请重新读取。');
        return { type: 'operate', taskId: detail.task.id, input: { operationId: id, kind: 'retest', participantId: participant.id, expectedVersion: participant.version, expectedMetadataVersion: detail.task.metadataVersion, result: 'positive', source: 'quick-record' } };
      }
      const original = intent.original!;
      const taskId = original.taskId || detail.task.id;
      const fresh = await taskApi.detail(taskId);
      const events = fresh.events.filter(event => event.operationId === original.operationId && event.participantId);
      const members = events.map(event => {
        const participant = fresh.participants.find(p => p.id === event.participantId);
        if (!participant || participant.currentEventId !== event.id) throw new Error('这笔已有后续变化，请进入历史核对。');
        return { participantId: participant.id, expectedVersion: participant.version, targetEventId: event.id };
      });
      if (!members.length) throw new Error('找不到可撤销结果，请进入历史核对。');
      const operation = { kind: 'retract' as const, members, reason: '教师撤销刚才操作', expectedMetadataVersion: fresh.task.metadataVersion };
      const preview = await taskApi.preview(taskId, operation);
      if (preview.conflicts.length) throw new Error('记录已有变化，请进入历史核对。');
      return { type: 'operate', taskId, input: { ...operation, operationId: id, previewToken: preview.previewToken! } };
    },
    execute: request => request.type === 'record' ? taskApi.quickRecord(request.input) : taskApi.operate(request.taskId, request.input),
    query: id => taskApi.operation(id),
    saved: (result, intent) => {
      if (!intent || intent.scope.classId !== classId || intent.scope.projectKey !== projectKey || intent.scope.checkDate !== date || intent.scope.round !== round) { void load().catch(() => undefined); return; }
      const previous = contextRef.current;
      if (previous) {
        const next = { ...previous, detail: result.detail, latestRound: Math.max(previous.latestRound, previous.round) };
        contextRef.current = next; setContext(next);
      }
      setNotice('已保存，可撤销上一操作。');
      setLast(intent.type === 'undo' ? null : { taskId: result.taskId, operationId: result.operationId, before: intent.before });
    },
    rejected: () => load(),
  });
  useEffect(() => {
    const refresh = () => { if (!queue.queue.jobs.length) void load().catch(() => undefined); };
    window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh);
  }, [load, queue.queue]);
  const matches = (intent: QuickIntent | null) => intent?.scope.classId === classId && intent.scope.projectKey === projectKey && intent.scope.checkDate === date && intent.scope.round === round;
  const pending = queue.jobs.filter(job => matches(job.intent));
  const projected = new Map<string, TaskResult | null>();
  context?.detail?.participants.forEach(p => projected.set(p.studentId, p.result));
  for (const job of pending) {
    const intent = job.intent!;
    if (intent.type === 'undo') intent.before?.forEach(p => projected.set(p.studentId,p.result));
    else if (intent.type === 'retest') projected.set(intent.studentId!, 'positive');
    else intent.members?.forEach(p => projected.set(p.studentId,p.result));
  }
  const before = (ids:string[]) => ids.map(studentId => ({studentId,result:projected.get(studentId)??null}));
  const record = (members: Array<{ studentId: string; result: TaskResult }>) => queue.enqueue({ type: 'record', scope: input, content, members, before:before(members.map(m=>m.studentId)) }, members.length === 1 ? '学生记录' : '批量记录');
  const quickRetest = (studentId: string) => queue.enqueue({ type: 'retest', scope: input, content: '', studentId, before:before([studentId]) }, '补做记录');
  const undo = () => {
    const latest=pending.at(-1);
    if(latest?.intent?.type==='undo')return;
    if(latest){
      if(queue.queue.cancelQueued(latest.id))return;
      queue.enqueue({type:'undo',scope:input,content:'',original:{taskId:contextRef.current?.detail?.task.id??'',operationId:latest.id},before:latest.intent?.before},'撤销上一操作');
    }else if(last)queue.enqueue({type:'undo',scope:input,content:'',original:last,before:last.before},'撤销上一操作');
  };
  const canUndo = pending.length ? pending.at(-1)?.intent?.type!=='undo' : Boolean(last);
  return { round, setRound, context, content, setContent, last, notice, loading, loadError, load, record, quickRetest, undo, queue, projected, canUndo };
}
