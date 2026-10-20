import { getRosterDatabase } from '../database/rosterDatabase';
import type { BehaviorEvent } from '../../src/domain/classroomBehavior';
export const findBehaviorOperation = (id:string) => getRosterDatabase().prepare('SELECT fingerprint,data_json FROM classroom_behavior_events WHERE operation_id=?').get(id) as {fingerprint:string;data_json:string}|undefined;
export const behaviorEvents = (filter:{classId?:string;studentId?:string;from:string;to:string;offset?:number;limit?:number}) => {
  const db=getRosterDatabase();
  const args=[filter.from,filter.to,...(filter.classId?[filter.classId]:[]),...(filter.studentId?[filter.studentId]:[])];
  const where=`e.target_id IS NULL AND e.occurred_date>=? AND e.occurred_date<=?${filter.classId?' AND e.class_id=?':''}${filter.studentId?' AND e.student_id=?':''}`;
  const total=(db.prepare(`SELECT COUNT(*) AS n FROM classroom_behavior_events e WHERE ${where}`).get(...args) as {n:number}).n;
  const events=db.prepare(`SELECT e.data_json, EXISTS(SELECT 1 FROM classroom_behavior_events r WHERE r.target_id=e.id) AS retracted FROM classroom_behavior_events e WHERE ${where} ORDER BY e.occurred_date DESC,e.rowid DESC LIMIT ? OFFSET ?`).all(...args,filter.limit??200,filter.offset??0) as {data_json:string;retracted:number}[];
  const grouped=db.prepare(`SELECT json_extract(e.data_json,'$.kind') AS kind,MAX(json_extract(e.data_json,'$.projectLabel')) AS label,COUNT(*) AS n FROM classroom_behavior_events e WHERE ${where} AND NOT EXISTS(SELECT 1 FROM classroom_behavior_events r WHERE r.target_id=e.id) GROUP BY kind`).all(...args) as {kind:string;label:string|null;n:number}[];
  const counts=Object.fromEntries(grouped.map(row=>[row.kind,row.n]));
  const labels=Object.fromEntries(grouped.filter(row=>row.label).map(row=>[row.kind,row.label!]));
  return {total,counts,labels,events:events.map(row=>({...JSON.parse(row.data_json),retracted:Boolean(row.retracted)}) as BehaviorEvent)};
};
export const insertBehaviorEvent = (event:BehaviorEvent,hash:string) => getRosterDatabase().prepare('INSERT INTO classroom_behavior_events(id,operation_id,fingerprint,student_id,class_id,target_id,occurred_date,data_json) VALUES(?,?,?,?,?,?,?,?)').run(event.id,event.operationId,hash,event.studentId,event.classId,event.targetId,event.occurredDate,JSON.stringify(event));
