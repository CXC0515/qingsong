import { apiFetch } from './apiClient';
import type { CreateTaskInput, CreationPreview, TaskDetail, TaskListItem, TaskParticipant, TaskEvent, TaskOperation, OperationInput, OperationPreview, OperationResult } from '../domain/classroomTasks';
export type TaskSummary = TaskListItem;
export class ClassroomTaskError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const request = async <T>(url: string, body?: unknown): Promise<T> => {
  let response: Response;
  try { response = await apiFetch(url, { ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) }); }
  catch { throw new ClassroomTaskError(0, 'RESULT_UNKNOWN', body === undefined ? '连接暂时中断，请重试读取。' : '尚未确认这笔是否保存，请先核对结果，再用原操作重试。'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ClassroomTaskError(response.status, data?.code ?? 'REQUEST_FAILED', response.status === 401 ? '登录状态已失效，已保存的记录不受影响。请重新登录后核对未确认操作。' : data?.message ?? '本次操作未完成，请刷新核对后再试。');
  if (!data) throw new ClassroomTaskError(0, 'RESULT_UNKNOWN', '未能读取保存确认，请先核对结果。');
  return data as T;
};
const base = '/api/classroom-tasks';
export const taskApi = {
  list: (params: URLSearchParams) => request<{ tasks: TaskListItem[]; total: number }>(`${base}?${params}`),
  detail: (id: string) => request<TaskDetail>(`${base}/${encodeURIComponent(id)}`),
  creationPreview: (input: CreateTaskInput) => request<CreationPreview>(`${base}/creation-preview`, input),
  create: (input: CreateTaskInput & { operationId: string; previewToken: string }) => request<TaskDetail>(base, input),
  operate: (id: string, input: OperationInput) => request<OperationResult>(`${base}/${encodeURIComponent(id)}/operations`, input),
  preview: (id: string, input: Omit<OperationInput, 'operationId'>) => request<OperationPreview>(`${base}/${encodeURIComponent(id)}/operations/preview`, input),
  operation: (id: string) => request<OperationResult>(`/api/classroom-task-operations/${encodeURIComponent(id)}`),
  history: (id: string, participantId?: string) => request<{ events: TaskEvent[]; operations: TaskOperation[]; total: number }>(`${base}/${encodeURIComponent(id)}/history?${new URLSearchParams({ ...(participantId ? { participantId } : {}), limit: '100' })}`),
  summary: async () => (await request<{ tasks: TaskListItem[] }>(`${base}/summary`)).tasks,
  studentTasks: async (studentId: string) => (await request<{ tasks: Array<TaskListItem & {participant:TaskParticipant}> }>(`/api/students/${encodeURIComponent(studentId)}/classroom-tasks`)).tasks,
};
