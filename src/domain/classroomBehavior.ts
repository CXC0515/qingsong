export const behaviorKinds = [
  {key:'participation',label:'主动发言'}, {key:'cooperation',label:'合作互助'},
  {key:'focus',label:'专注投入'}, {key:'reminder',label:'需要提醒'},
] as const;
export type BehaviorKind = string;
export interface BehaviorEvent {
  id:string; operationId:string; studentId:string; studentName:string; classId:string;
  kind:BehaviorKind; projectLabel?:string; currentProjectLabel?:string; scheduleItemId?:string; lessonSnapshot?:import('./classroomTasks').LessonSnapshot; note:string; occurredDate:string; recordedAt:string; actorUserId:string;
  targetId:string|null; retracted:boolean;
}
export interface BehaviorInput { operationId:string; studentId:string; classId:string; kind:BehaviorKind; note:string; occurredDate:string; targetId?:string; scheduleItemId?:string; }
export interface BehaviorList { events:BehaviorEvent[]; total:number; counts:Record<string,number>; labels:Record<string,string>; }
