import { createHash, randomUUID } from 'node:crypto';
import { getRosterDatabase } from '../../database/rosterDatabase';
import { getWorkspaceContext } from '../../context/workspaceContext';
import { behaviorEvents, findBehaviorOperation, insertBehaviorEvent } from '../../repositories/classroomBehaviorRepository';
import type { BehaviorEvent, BehaviorInput } from '../../../src/domain/classroomBehavior';
import { ClassroomTaskError } from './classroomTaskService';
export const recordBehavior = (input:BehaviorInput):BehaviorEvent => getRosterDatabase().transaction(()=>{
  const actorUserId=getWorkspaceContext().userId;
  const hash=createHash('sha256').update(JSON.stringify([actorUserId,input.studentId,input.classId,input.kind,input.note,input.occurredDate,input.targetId??null])).digest('hex');
  const old=findBehaviorOperation(input.operationId);
  if(old){if(old.fingerprint!==hash)throw new ClassroomTaskError('OPERATION_ID_CONFLICT',409,'这笔编号已用于其他记录，本次未保存，请核对。');return JSON.parse(old.data_json);}
  const db=getRosterDatabase();
  let name:string;
  if(input.targetId){
    const row=db.prepare('SELECT data_json FROM classroom_behavior_events WHERE id=? AND target_id IS NULL').get(input.targetId) as {data_json:string}|undefined;
    const target=row?JSON.parse(row.data_json) as BehaviorEvent:null;
    if(!target||target.studentId!==input.studentId||target.classId!==input.classId)throw new ClassroomTaskError('EVENT_NOT_FOUND',404,'找不到这笔表现，本次未撤销，请刷新。');
    if(db.prepare('SELECT id FROM classroom_behavior_events WHERE target_id=?').get(input.targetId))throw new ClassroomTaskError('ALREADY_RETRACTED',409,'这笔已撤销，请刷新核对。');
    name=target.studentName;
  }else{
    const student=db.prepare("SELECT s.name FROM class_memberships m JOIN students s ON s.id=m.student_id JOIN classes c ON c.id=m.class_id WHERE m.class_id=? AND m.student_id=? AND m.status='active' AND c.status='active'").get(input.classId,input.studentId) as {name:string}|undefined;
    if(!student)throw new ClassroomTaskError('STUDENT_NOT_IN_CLASS',404,'学生当前不在本班有效名单内，本次未保存，请刷新名册。');
    name=student.name;
  }
  const event:BehaviorEvent={id:randomUUID(),operationId:input.operationId,studentId:input.studentId,studentName:name,classId:input.classId,kind:input.kind,note:input.note,occurredDate:input.occurredDate,recordedAt:new Date().toISOString(),actorUserId,targetId:input.targetId??null,retracted:false};
  insertBehaviorEvent(event,hash); return event;
})();
export const queryBehaviorOperation = (id:string):BehaviorEvent => {
  const found=findBehaviorOperation(id);if(!found)throw new ClassroomTaskError('OPERATION_NOT_FOUND',404,'暂未查到这笔，请保留原操作并稍后核对。');return JSON.parse(found.data_json);
};
export const listBehavior = (filter:Parameters<typeof behaviorEvents>[0]) => behaviorEvents(filter);
