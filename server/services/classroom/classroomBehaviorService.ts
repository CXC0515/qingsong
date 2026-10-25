import { createHash, randomUUID } from 'node:crypto';
import { getRosterDatabase } from '../../database/rosterDatabase';
import { getWorkspaceContext } from '../../context/workspaceContext';
import { behaviorEvents, findBehaviorOperation, insertBehaviorEvent } from '../../repositories/classroomBehaviorRepository';
import type { BehaviorEvent, BehaviorInput, BehaviorRoundContext, BehaviorRounds } from '../../../src/domain/classroomBehavior';
import { resolveRecordProject, resolveLesson, ClassroomTaskError } from './classroomTaskService';
export const recordBehavior = (input:BehaviorInput):BehaviorEvent => getRosterDatabase().transaction(()=>{
  const actorUserId=getWorkspaceContext().userId;
  const hash=createHash('sha256').update(JSON.stringify([actorUserId,input.studentId,input.classId,input.kind,input.note,input.occurredDate,input.targetId??null,...(input.scheduleItemId?[input.scheduleItemId]:[]),...((input.round??1)>1?[input.round]:[])])).digest('hex');
  const old=findBehaviorOperation(input.operationId);
  if(old){if(old.fingerprint!==hash)throw new ClassroomTaskError('OPERATION_ID_CONFLICT',409,'这笔编号已用于其他记录，本次未保存，请核对。');return JSON.parse(old.data_json);}
  const db=getRosterDatabase();
  let name:string; let projectLabel:string;
  if(input.targetId){
    const row=db.prepare('SELECT data_json FROM classroom_behavior_events WHERE id=? AND target_id IS NULL').get(input.targetId) as {data_json:string}|undefined;
    const target=row?JSON.parse(row.data_json) as BehaviorEvent:null;
    if(!target||target.studentId!==input.studentId||target.classId!==input.classId||target.kind!==input.kind||target.occurredDate!==input.occurredDate||target.scheduleItemId!==input.scheduleItemId||(target.round??1)!==(input.round??1))throw new ClassroomTaskError('EVENT_NOT_FOUND',404,'找不到这笔表现，本次未撤销，请刷新。');
    if(db.prepare('SELECT id FROM classroom_behavior_events WHERE target_id=?').get(input.targetId))throw new ClassroomTaskError('ALREADY_RETRACTED',409,'这笔已撤销，请刷新核对。');
    name=target.studentName;projectLabel=target.projectLabel??resolveRecordProject(target.kind).label;
  }else{
    const project=resolveRecordProject(input.kind);
    if(project.category!=='behavior')throw new ClassroomTaskError('INVALID_PROJECT',400,'该项目不是表现项目，本次未保存。');
    projectLabel=project.label;
    const student=db.prepare("SELECT s.name FROM class_memberships m JOIN students s ON s.id=m.student_id JOIN classes c ON c.id=m.class_id WHERE m.class_id=? AND m.student_id=? AND m.status='active' AND c.status='active'").get(input.classId,input.studentId) as {name:string}|undefined;
    if(!student)throw new ClassroomTaskError('STUDENT_NOT_IN_CLASS',404,'学生当前不在本班有效名单内，本次未保存，请刷新名册。');
    name=student.name;
  }
  if((input.round??1)>1&&!behaviorRounds(input).availableRounds.includes(input.round!))
    throw new ClassroomTaskError('ROUND_NOT_FOUND',409,'这轮尚未建立，本笔未保存，请重新读取轮次。');
  const lessonSnapshot=input.targetId?undefined:resolveLesson({scheduleItemId:input.scheduleItemId,classId:input.classId,checkDate:input.occurredDate});
  const event:BehaviorEvent={round:input.round??1,...(input.scheduleItemId?{scheduleItemId:input.scheduleItemId,lessonSnapshot}:{}),id:randomUUID(),operationId:input.operationId,studentId:input.studentId,studentName:name,classId:input.classId,kind:input.kind,projectLabel,note:input.note,occurredDate:input.occurredDate,recordedAt:new Date().toISOString(),actorUserId,targetId:input.targetId??null,retracted:false};
  insertBehaviorEvent(event,hash); return event;
})();
export const queryBehaviorOperation = (id:string):BehaviorEvent => {
  const found=findBehaviorOperation(id);if(!found)throw new ClassroomTaskError('OPERATION_NOT_FOUND',404,'暂未查到这笔，请保留原操作并稍后核对。');return JSON.parse(found.data_json);
};
export const listBehavior = (filter:Parameters<typeof behaviorEvents>[0]) => behaviorEvents(filter);

/** Round 1 includes legacy events. Empty explicit rounds persist independently of events. */
export const behaviorRounds = (input:BehaviorRoundContext):BehaviorRounds => {
  const rows=getRosterDatabase().prepare(`SELECT round FROM classroom_behavior_rounds
    WHERE class_id=? AND project_key=? AND occurred_date=? AND lesson_key=? ORDER BY round`)
    .all(input.classId,input.kind,input.occurredDate,input.scheduleItemId??'') as {round:number}[];
  const availableRounds=[1,...rows.map(row=>row.round)];
  return {round:availableRounds.at(-1)!,availableRounds};
};
export const newBehaviorRound = (input:BehaviorRoundContext & {operationId:string;basedOn:number}):BehaviorRounds => getRosterDatabase().transaction(()=>{
  const db=getRosterDatabase();
  const hash=createHash('sha256').update(JSON.stringify([getWorkspaceContext().userId,input.classId,input.kind,input.occurredDate,input.scheduleItemId??'',input.basedOn])).digest('hex');
  const old=db.prepare('SELECT round,fingerprint FROM classroom_behavior_rounds WHERE operation_id=?').get(input.operationId) as {round:number;fingerprint:string}|undefined;
  if(old){
    if(old.fingerprint!==hash)throw new ClassroomTaskError('OPERATION_ID_CONFLICT',409,'轮次编号已用于其他操作，本次未新建，请重新读取。');
    return {...behaviorRounds(input),round:old.round};
  }
  if(resolveRecordProject(input.kind).category!=='behavior')throw new ClassroomTaskError('INVALID_PROJECT',400,'这不是表现项目，未新建轮次。');
  if(!db.prepare("SELECT id FROM classes WHERE id=? AND status='active'").get(input.classId))throw new ClassroomTaskError('CLASS_NOT_FOUND',404,'班级当前不可记录，未新建轮次，请检查班级。');
  resolveLesson({scheduleItemId:input.scheduleItemId,classId:input.classId,checkDate:input.occurredDate});
  const current=behaviorRounds(input);
  if(current.round!==input.basedOn)throw new ClassroomTaskError('ROUND_CHANGED',409,'轮次已被其他窗口更新，本次未新建，请重新读取后核对。');
  const round=current.round+1;
  db.prepare('INSERT INTO classroom_behavior_rounds VALUES(?,?,?,?,?,?,?)').run(input.classId,input.kind,input.occurredDate,input.scheduleItemId??'',round,input.operationId,hash);
  return {round,availableRounds:[...current.availableRounds,round]};
})();
