import { useCallback, useEffect, useRef, useState } from 'react';
import { ClassroomTaskError, taskApi } from '../../services/classroomTaskApi';
import type { OperationInput, TaskDetail } from '../../domain/classroomTasks';
interface Pending { id: string; taskId: string; kind: string; at: string; participantIds?: string[] }
export function useClassroomTasks(identityKey: string, taskId?: string) {
  const key = 'qingsong:classroom-pending:' + identityKey;
  const [pending, setPending] = useState<Pending[]>(() => { try { return JSON.parse(sessionStorage.getItem(key) ?? '[]'); } catch { return []; } });
  const pendingRef = useRef(pending);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const retries = useRef(new Map<string, { taskId: string; input: OperationInput }>());
  const commitPending = useCallback((next: Pending[]) => { sessionStorage.setItem(key, JSON.stringify(next)); pendingRef.current = next; setPending(next); }, [key]);
  const register = useCallback((id: string, target: string, kind: string, participantIds?: string[]) => { if (!pendingRef.current.some(p => p.id === id)) commitPending([...pendingRef.current, { id, taskId: target, kind, at: new Date().toISOString(), participantIds }]); }, [commitPending]);
  const clear = useCallback((id: string) => { commitPending(pendingRef.current.filter(p => p.id !== id)); retries.current.delete(id); }, [commitPending]);
  const requestSequence = useRef(0);
  const currentTaskId = useRef(taskId);
  currentTaskId.current = taskId;
  const reload = useCallback(async () => { if (!taskId || currentTaskId.current !== taskId) return; const sequence = ++requestSequence.current; const data = await taskApi.detail(taskId); if (sequence === requestSequence.current && currentTaskId.current === taskId) setDetail(data); }, [taskId]);
  useEffect(() => { setDetail(null); setError(''); void reload().catch(e => setError(e.message)); return () => { requestSequence.current++; }; }, [reload]);
  useEffect(() => {
    const leave = (event: Event) => { if (pendingRef.current.length && !window.confirm('还有记录尚未核对是否保存。确定离开并稍后核对吗？')) event.preventDefault(); };
    const unload = (event: BeforeUnloadEvent) => { if (pendingRef.current.length) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('classroom-task-before-leave', leave); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('classroom-task-before-leave', leave); window.removeEventListener('beforeunload', unload); };
  }, []);
  const perform = useCallback(async (target: string, input: OperationInput) => {
    const id = input.operationId; setError('');
    const participantIds = input.members?.map(m => m.participantId) ?? (input.participantId ? [input.participantId] : input.studentId ? ['student:' + input.studentId] : []);
    const unresolved = pendingRef.current.find(p => p.id !== id && p.taskId === target && (!p.participantIds?.length || !participantIds.length || p.participantIds.some(member => participantIds.includes(member))));
    if (unresolved) { setError('这项记录还有保存结果待核对，请先核对或使用原操作重试，避免重复记录。'); return null; }
    try { register(id, target, input.kind, participantIds); } catch { setError('浏览器不能保存核对标识，这笔尚未发送。请允许会话存储后重试。'); return null; }
    retries.current.set(id, { taskId: target, input }); setBusyIds(ids => [...ids, input.participantId ?? id]);
    try { const result = await taskApi.operate(target, input); clear(id); await reload().catch(() => setError('记录已保存，但列表刷新失败，请重新读取核对。')); setNotice('已保存，可在本轮记录中回看或撤销。'); return result; }
    catch (e) { if (e instanceof ClassroomTaskError && [400,409,422].includes(e.status)) { clear(id); setError(e.message + ' 本次变更未保存。'); } else setError(e instanceof Error ? e.message : '尚未确认是否保存，请核对。'); return null; }
    finally { setBusyIds(ids => ids.filter(v => v !== (input.participantId ?? id))); }
  }, [clear, register, reload]);
  const reconcile = useCallback(async (id: string) => { setError(''); try { const result = await taskApi.operation(id); clear(id); await reload(); setNotice('已核对：这笔已经保存。'); return result; } catch (e) { setError(e instanceof ClassroomTaskError && e.status === 404 ? '查询时未找到这笔。可用原操作重试；刷新丢失正文时，请先确认清除核对项再重新填写。' : e instanceof Error ? e.message : '暂时无法核对，请稍后重试。'); return null; } }, [clear, reload]);
  const retry = useCallback(async (id: string) => { const item = retries.current.get(id); if (item) return perform(item.taskId, item.input); setError('原填写内容未保留。请先核对保存状态，确认未保存后重新填写。'); return null; }, [perform]);
  return { detail, error, notice, setError, reload, perform, reconcile, retry, pending, busyIds, register, clear };
}
