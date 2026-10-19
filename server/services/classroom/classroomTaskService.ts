/** @license SPDX-License-Identifier: Apache-2.0 */
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { CreateTaskInput, CreationPreview, OperationInput, OperationMember, OperationPreview, OperationResult, PreviewStudent, TaskDetail, TaskEvent, TaskListItem, TaskOperation, TaskParticipant } from '../../../src/domain/classroomTasks';
import { getWorkspaceContext } from '../../context/workspaceContext';
import { getRosterDatabase } from '../../database/rosterDatabase';
import { findTaskOperation, getTaskDetail, listTaskDetails, saveParticipant, saveTask, saveTaskEvent, saveTaskOperation, taskTransaction } from '../../repositories/classroomTaskRepository';

export class ClassroomTaskError extends Error {
  constructor(public code: string, public status = 409, message = '记录未保存，请刷新任务后重试。') { super(message); }
}
const fail = (code: string, status = 409, message?: string): never => { throw new ClassroomTaskError(code,status,message); };
const secret = randomBytes(32);
const ttl = 5 * 60 * 1000;
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.entries(value as Record<string,unknown>).filter(([,item]) => item !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
};
const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const signedPreview = (scope: string, value: unknown) => {
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  const payload = Buffer.from(JSON.stringify({scope,workspaceId:getWorkspaceContext().workspaceId,actorUserId:getWorkspaceContext().userId,hash:fingerprint(value),expiresAt})).toString('base64url');
  const signature = createHmac('sha256',secret).update(payload).digest('base64url');
  return {previewToken:payload + '.' + signature,expiresAt};
};
const verifyPreview = (token: string | undefined, scope: string, value: unknown) => {
  if (!token) fail('PREVIEW_REQUIRED',409,'记录未保存，请先预览本次操作。');
  try {
    const [payload,signature,...extra] = token!.split('.');
    const expected = createHmac('sha256',secret).update(payload).digest();
    const actual = Buffer.from(signature ?? '', 'base64url');
    if (extra.length || expected.length !== actual.length || !timingSafeEqual(expected,actual)) fail('PREVIEW_INVALID');
    const data = JSON.parse(Buffer.from(payload,'base64url').toString()) as {scope:string;workspaceId:string;actorUserId:string;hash:string;expiresAt:string};
    if (data.scope !== scope || data.workspaceId !== getWorkspaceContext().workspaceId || data.actorUserId !== getWorkspaceContext().userId || data.hash !== fingerprint(value)) fail('PREVIEW_CHANGED');
    if (Date.parse(data.expiresAt) <= Date.now()) fail('PREVIEW_EXPIRED',409,'预览已过期，记录未保存，请重新预览。');
  } catch (error) { if (error instanceof ClassroomTaskError) throw error; fail('PREVIEW_INVALID',409,'预览凭据无效，记录未保存，请重新预览。'); }
};
export const requireTask = (taskId: string): TaskDetail => getTaskDetail(taskId) ?? fail('TASK_NOT_FOUND',404,'找不到这项课堂任务，请返回列表重新选择。');
const asListItem = (detail: TaskDetail): TaskListItem => ({...detail.task,counts:detail.counts});
const roster = (input: CreateTaskInput) => {
  const db = getRosterDatabase();
  const schoolClass = db.prepare('SELECT id,name FROM classes WHERE id=?').get(input.classId) as {id:string;name:string} | undefined;
  if (!schoolClass) fail('CLASS_NOT_FOUND',404,'找不到班级，任务未创建，请重新选择班级。');
  const rows = db.prepare("SELECT m.id AS membershipId,m.student_id AS studentId,s.name,m.student_no AS studentNo,m.status AS enrollmentStatus FROM class_memberships m JOIN students s ON s.id=m.student_id WHERE m.class_id=? AND m.status IN ('active','suspended') ORDER BY m.student_no,m.id").all(input.classId) as Omit<PreviewStudent,'included'>[];
  const excluded = new Set(input.excludedStudentIds ?? []);
  if ([...excluded].some(id => !rows.some(row => row.studentId === id))) fail('STUDENT_NOT_IN_CLASS',400);
  const participants = rows.map(row => ({...row,included:!excluded.has(row.studentId)}));
  if (!participants.some(item => item.included)) fail('EMPTY_TASK_ROSTER',400,'任务未创建，请至少选择一名参与学生。');
  return {schoolClass:schoolClass!,participants};
};
const normalizedCreate = (input: CreateTaskInput) => ({classId:input.classId,name:input.name,mode:input.mode,checkDate:input.checkDate,dueDate:input.dueDate ?? null,description:input.description ?? '',excludedStudentIds:[...(input.excludedStudentIds ?? [])].sort()});
export const previewTaskCreation = (input: CreateTaskInput): CreationPreview => taskTransaction(() => {
  const snapshot = roster(input);
  const duplicates = listTaskDetails().filter(({task}) => task.classId === input.classId && task.name === input.name && task.checkDate === input.checkDate).map(asListItem);
  return {participants:snapshot.participants,duplicates,...signedPreview('create',{input:normalizedCreate(input),snapshot})};
});
const replay = (id: string, hash: string, taskId?: string) => {
  const stored = findTaskOperation(id);
  if (!stored) return null;
  if ((taskId && stored.operation.taskId !== taskId) || stored.fingerprint !== hash) fail('OPERATION_ID_CONFLICT',409,'操作编号已用于其他内容，本次未保存，请核对历史后重新操作。');
  return stored.operation.kind === 'create' ? requireTask(stored.operation.taskId) : {...stored.result as Record<string,unknown>,detail:requireTask(stored.operation.taskId)};
};
export const createClassroomTask = (input: CreateTaskInput & {operationId:string;previewToken:string}): TaskDetail => taskTransaction(() => {
  const context = getWorkspaceContext();
  const hash = fingerprint({kind:'create',input:normalizedCreate(input),actorUserId:context.userId});
  const previous = replay(input.operationId,hash); if (previous) return previous as TaskDetail;
  const snapshot = roster(input);
  verifyPreview(input.previewToken,'create',{input:normalizedCreate(input),snapshot});
  const now = new Date().toISOString(); const taskId = randomUUID();
  saveTask({id:taskId,classId:input.classId,className:snapshot.schoolClass.name,name:input.name,mode:input.mode,checkDate:input.checkDate,dueDate:input.dueDate ?? null,description:input.description ?? '',lifecycle:'active',metadataVersion:0,rosterVersion:0,activityRevision:1,createdAt:now,updatedAt:now});
  for (const student of snapshot.participants) saveParticipant(taskId,{...student,id:randomUUID(),exempt:false,version:0,result:null,currentEventId:null,firstResult:null});
  const operation: TaskOperation = {operationId:input.operationId,taskId,kind:'create',actorUserId:context.userId,source:'creation',committedAt:now,participantIds:[]};
  saveTaskEvent({id:randomUUID(),taskId,participantId:null,operationId:input.operationId,kind:'create',result:null,previousEventId:null,targetEventId:null,occurredAt:now,recordedAt:now,actorUserId:context.userId,source:'creation',reason:''});
  const detail = requireTask(taskId); detail.operations.push(operation);
  saveTaskOperation(operation,hash,detail);
  return detail;
});
export interface TaskListFilter { classId?:string; lifecycle?:string; search?:string; from?:string; to?:string; offset?:number; limit?:number; }
export const listClassroomTasks = (filter: TaskListFilter = {}) => {
  const matches = listTaskDetails().filter(({task}) => (!filter.classId || task.classId === filter.classId) && (!filter.lifecycle || task.lifecycle === filter.lifecycle) && (!filter.search || (task.name + task.description + task.className).toLowerCase().includes(filter.search.toLowerCase())) && (!filter.from || task.checkDate >= filter.from) && (!filter.to || task.checkDate <= filter.to)).sort((a,b) => b.task.checkDate.localeCompare(a.task.checkDate) || b.task.createdAt.localeCompare(a.task.createdAt) || a.task.id.localeCompare(b.task.id));
  return {tasks:matches.slice(filter.offset ?? 0,(filter.offset ?? 0)+(filter.limit ?? 100)).map(asListItem),total:matches.length};
};
export const classroomTaskSummary = (classId?:string) => {
  const tasks = listTaskDetails().filter(({task}) => task.lifecycle === 'active' && (!classId || task.classId === classId)).map(asListItem);
  return {tasks,negative:tasks.reduce((total,task) => total+task.counts.negative,0),unrecorded:tasks.reduce((total,task) => total+task.counts.unrecorded,0)};
};
export const studentClassroomTasks = (studentId:string) => {
  if (!getRosterDatabase().prepare('SELECT id FROM students WHERE id=?').get(studentId)) fail('STUDENT_NOT_FOUND',404,'找不到学生，请返回名单重新选择。');
  return {tasks:listTaskDetails().flatMap(detail => { const participant = detail.participants.find(item => item.studentId === studentId); return participant ? [{...asListItem(detail),participant}] : []; })};
};
const memberFrom = (input: OperationInput): OperationMember => ({participantId:input.participantId ?? '',expectedVersion:input.expectedVersion ?? -1,...(input.result ? {result:input.result}:{}),...(input.targetEventId ? {targetEventId:input.targetEventId}:{}),...(input.included !== undefined ? {included:input.included}:{}),...(input.exempt !== undefined ? {exempt:input.exempt}:{})});
const membersFor = (detail:TaskDetail,input:OperationInput,preview=false):OperationMember[] => input.members ?? (input.participantId ? [memberFrom(input)] : preview && input.kind === 'initial' ? detail.participants.filter(item => item.included && !item.exempt && item.result === null).map(item => ({participantId:item.id,expectedVersion:item.version,result:input.result ?? 'positive'})) : []);
const validateMember = (detail:TaskDetail,input:OperationInput,member:OperationMember) => {
  const participant = detail.participants.find(item => item.id === member.participantId) ?? fail('PARTICIPANT_NOT_FOUND',404);
  if (participant.version !== member.expectedVersion) fail('PARTICIPANT_VERSION_CONFLICT');
  if (input.kind === 'initial' || input.kind === 'retest' || input.kind === 'correct' || input.kind === 'retract') {
    if (!participant.included || participant.exempt) fail('PARTICIPANT_NOT_REQUIRED');
    if (input.kind !== 'retract' && !member.result) fail('RESULT_REQUIRED',400);
    if (input.kind === 'initial' && participant.result !== null) fail('ALREADY_RECORDED');
    if (input.kind === 'retest' && participant.result === null) fail('FIRST_RESULT_REQUIRED');
    if (input.kind === 'correct' || input.kind === 'retract') {
      const target = detail.events.find(event => event.id === member.targetEventId && event.participantId === participant.id && ['initial','retest','correct'].includes(event.kind));
      if (!target) fail('EVENT_NOT_FOUND',404);
      if (participant.currentEventId !== target!.id) fail('EVENT_HAS_DEPENDENTS',409,'该记录已有后续变化，本次未保存，请查看历史并修订最新记录。');
      if (!input.reason?.trim()) fail('REASON_REQUIRED',400,'记录未保存，请填写纠错或撤销原因。');
    }
  }
  if (input.kind === 'participation' && member.included === undefined) fail('INCLUDED_REQUIRED',400);
  if (input.kind === 'exemption' && member.exempt === undefined) fail('EXEMPT_REQUIRED',400);
  return participant;
};
const previewBinding = (detail:TaskDetail,input:OperationInput,members:OperationMember[]) => ({taskId:detail.task.id,metadataVersion:detail.task.metadataVersion,rosterVersion:detail.task.rosterVersion,kind:input.kind,reason:input.reason ?? '',occurredAt:input.occurredAt ?? null,members});
export const previewClassroomOperation = (taskId:string,input:Omit<OperationInput,'operationId'>):OperationPreview => taskTransaction(() => {
  const detail = requireTask(taskId); const full = {...input,operationId:''};
  if (detail.task.lifecycle !== 'active') fail('TASK_NOT_WRITABLE');
  const members = membersFor(detail,full,true); const conflicts:OperationPreview['conflicts'] = [];
  if (!members.length) fail('EMPTY_OPERATION',400);
  const seen = new Set<string>();
  for (const member of members) {
    try { if (seen.has(member.participantId)) fail('DUPLICATE_PARTICIPANT'); seen.add(member.participantId); validateMember(detail,full,member); }
    catch (error) { if (error instanceof ClassroomTaskError) conflicts.push({participantId:member.participantId,code:error.code}); else throw error; }
  }
  return {members,conflicts,...(conflicts.length ? {previewToken:null,expiresAt:new Date(Date.now()+ttl).toISOString()} : signedPreview('operation',previewBinding(detail,full,members)))};
});
export const applyClassroomOperation = (taskId:string,input:OperationInput):OperationResult => taskTransaction(() => {
  const context = getWorkspaceContext();
  const {previewToken:_token,...request} = input;
  const hash = fingerprint({taskId,input:request,actorUserId:context.userId});
  const previous = replay(input.operationId,hash,taskId); if (previous) return previous as OperationResult;
  const detail = requireTask(taskId); const task = {...detail.task}; const now = new Date().toISOString();
  const taskLevel = input.kind === 'metadata' || input.kind === 'lifecycle';
  if (taskLevel && (input.members || input.participantId || input.studentId)) fail('INVALID_TASK_OPERATION',400);
  if (task.lifecycle !== 'active' && input.kind !== 'lifecycle') fail('TASK_NOT_WRITABLE',409,'任务已结束或归档，本次未保存，请先恢复任务。');
  const members = membersFor(detail,input);
  const addingStudent = input.kind === 'participation' && input.studentId !== undefined;
  if (addingStudent) {
    if (input.included !== true || input.members || input.participantId) fail('INVALID_PARTICIPANT_ADDITION',400);
    if (detail.participants.some(item => item.studentId === input.studentId)) fail('PARTICIPANT_ALREADY_EXISTS');
    if (input.expectedRosterVersion !== task.rosterVersion) fail('ROSTER_VERSION_CONFLICT');
    const db=getRosterDatabase();
    const student=db.prepare("SELECT m.id AS membershipId,m.student_id AS studentId,s.name,m.student_no AS studentNo,m.status AS enrollmentStatus FROM class_memberships m JOIN students s ON s.id=m.student_id WHERE m.class_id=? AND m.student_id=? AND m.status IN ('active','suspended')").get(task.classId,input.studentId) as PreviewStudent | undefined;
    if(!student) fail('STUDENT_NOT_IN_CLASS',404);
    const participant:TaskParticipant={...student!,id:randomUUID(),included:true,exempt:false,version:0,result:null,currentEventId:null,firstResult:null};
    saveParticipant(taskId,participant);detail.participants.push(participant);
    members.push({participantId:participant.id,expectedVersion:0,included:true});
  }
  if (!taskLevel && !members.length) fail('EMPTY_OPERATION',400);
  if (new Set(members.map(item => item.participantId)).size !== members.length) fail('DUPLICATE_PARTICIPANT',400);
  if (input.members) verifyPreview(input.previewToken,'operation',previewBinding(detail,input,members));
  if (input.expectedMetadataVersion !== undefined && input.expectedMetadataVersion !== task.metadataVersion) fail('TASK_VERSION_CONFLICT');
  if (input.kind === 'participation' || input.kind === 'exemption') { if (input.expectedRosterVersion !== task.rosterVersion) fail('ROSTER_VERSION_CONFLICT'); }
  const participants = members.map(member => validateMember(detail,input,member));
  if (input.kind === 'metadata') {
    for (const key of ['name','checkDate','dueDate','description'] as const) if (input[key] !== undefined) Object.assign(task,{[key]:input[key]});
    task.metadataVersion++;
  }
  if (input.kind === 'lifecycle') {
    if (!input.lifecycle || task.lifecycle === input.lifecycle) fail('INVALID_LIFECYCLE',400);
    if (task.lifecycle === 'archived' && input.lifecycle !== task.previousLifecycle) fail('INVALID_LIFECYCLE',400,'任务未修改，请先恢复归档前状态。');
    if (input.lifecycle === 'archived') task.previousLifecycle = task.lifecycle;
    task.lifecycle = input.lifecycle; task.metadataVersion++;
  }
  const operation:TaskOperation = {operationId:input.operationId,taskId,kind:input.kind,actorUserId:context.userId,source:input.source ?? 'task-detail',committedAt:now,participantIds:members.map(item => item.participantId)};
  for (let i=0;i<members.length;i++) {
    const member = members[i]; const participant = {...participants[i]};
    const event:TaskEvent = {id:randomUUID(),taskId,participantId:participant.id,operationId:input.operationId,kind:input.kind,result:member.result ?? null,previousEventId:participant.currentEventId,targetEventId:member.targetEventId ?? null,occurredAt:input.occurredAt ?? now,recordedAt:now,actorUserId:context.userId,source:operation.source,reason:input.reason ?? '',data:{before:{included:participant.included,exempt:participant.exempt},after:{included:member.included ?? participant.included,exempt:member.exempt ?? participant.exempt}}};
    if (input.kind === 'participation') participant.included = member.included!;
    if (input.kind === 'exemption') participant.exempt = member.exempt!;
    participant.version++;
    saveParticipant(taskId,participant); saveTaskEvent(event);
  }
  if (taskLevel) saveTaskEvent({id:randomUUID(),taskId,participantId:null,operationId:input.operationId,kind:input.kind,result:null,previousEventId:null,targetEventId:null,occurredAt:now,recordedAt:now,actorUserId:context.userId,source:operation.source,reason:input.reason ?? '',data:{before:detail.task,after:task}});
  if (input.kind === 'participation' || input.kind === 'exemption') task.rosterVersion++;
  task.activityRevision++; task.updatedAt=now; saveTask(task);
  const updated = requireTask(taskId); updated.operations.push(operation);
  const result:OperationResult = {operationId:input.operationId,taskId,kind:input.kind,committedAt:now,detail:updated};
  saveTaskOperation(operation,hash,result); return result;
});
export const queryClassroomOperation = (operationId:string):OperationResult => {
  const stored=findTaskOperation(operationId); if (!stored) return fail('OPERATION_NOT_FOUND',404,'暂未查到提交结果，请保留原操作编号后再次核对。');
  return {operationId,taskId:stored.operation.taskId,kind:stored.operation.kind,committedAt:stored.operation.committedAt,detail:requireTask(stored.operation.taskId)};
};
