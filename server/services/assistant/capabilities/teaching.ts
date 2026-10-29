import {listClasses,listStudentSummaries,findStoredStudent,listCommitteeRoles} from '../../../repositories/rosterRepository';
import {listScheduleItems,listReminders,listSchedulePeriods} from '../../../repositories/scheduleRepository';
import {getClassroomLayout} from '../../../repositories/classroomRepository';
import {listClassroomTasks,requireTask,studentClassroomTasks,listRecordProjects,classroomTaskSummary} from '../../classroom/classroomTaskService';
import {listBehavior} from '../../classroom/classroomBehaviorService';
import {CapabilityError,missing,ref,matches,paged,envelope,type SearchArgs,type ReadArgs} from './contract';
const pageUrl='/?page=classroom-tasks';
function dates(f:{from?:string;to?:string}) {if(!f.from||!f.to)throw new CapabilityError('DATE_RANGE_REQUIRED','请提供起止日期，跨度最多31天。数据未修改，请补全后查询。');return {from:f.from,to:f.to};}
function validClass(classId?:string) {if(classId&&!listClasses().some(c=>c.id===classId))missing();}
export function searchTeaching(a:SearchArgs) {
 const f=a.filters;validClass(f.classId);
 switch(a.type){
 case 'class':return paged(listClasses().filter(c=>(!f.status||c.status===f.status)&&matches(a.query,c.name,c.grade,c.term)).map(c=>({ref:ref('class',c.id),name:c.name,grade:c.grade,status:c.status,studentCount:c.studentCount})),a,'/?page=class-mgmt');
 case 'student':return paged(listStudentSummaries(f.classId).filter(s=>(!f.enrollmentStatus||s.enrollmentStatus===f.enrollmentStatus)&&matches(a.query,s.name,s.studentNo)).map(s=>({ref:ref('student',s.id,s.classId),name:s.name,studentNo:s.studentNo,classId:s.classId,className:s.className,enrollmentStatus:s.enrollmentStatus,committeeRoles:listCommitteeRoles().filter(r=>s.committeeRoleIds.includes(r.id))})),a,'/?page=student-mgmt');
 case 'classroomTask':{const result=listClassroomTasks({classId:f.classId,from:f.from,to:f.to,search:a.query,lifecycle:f.lifecycle as any,negativeOnly:f.negativeOnly,offset:a.offset,limit:a.limit});return envelope({items:result.tasks.map(t=>({...t,ref:ref('classroomTask',t.id,t.classId)}))},pageUrl,{total:result.total,offset:a.offset,limit:a.limit});}
 case 'behavior':{const result=listBehavior({...dates(f),classId:f.classId,studentId:f.studentId,kind:f.kind,offset:a.offset,limit:a.limit});return envelope({items:result.events.map(e=>({...e,ref:ref('behavior',e.id)})),queryApplied:false},pageUrl,{total:result.total,offset:a.offset,limit:a.limit});}
 case 'project':return paged(listRecordProjects().filter(p=>matches(a.query,p.label,p.key)).map(p=>({...p,ref:ref('project',p.key)})),a,pageUrl);
 case 'schedule':return paged(listScheduleItems().filter(s=>(!f.classId||s.classId===f.classId)&&matches(a.query,JSON.stringify(s))).map(s=>({...s,ref:ref('schedule',s.id)})),a,'/?page=schedule');
 case 'reminder':return paged(listReminders().filter(r=>(!f.classId||r.classId===f.classId)&&(!f.status||r.status===f.status)&&matches(a.query,r.name)&&(!f.from||Boolean((r.startAt||r.dueAt)&&((r.startAt||r.dueAt)!.slice(0,10)<=f.to!)&&((r.endAt||r.dueAt||r.startAt)!.slice(0,10)>=f.from)))).map(r=>({...r,ref:ref('reminder',r.id)})),a,'/?page=schedule');
 }
}
export function readTeaching(a:ReadArgs) {
 const {type,id,parentId}=a.ref;const f=a.filters;
 if(type==='class'){
  const c=listClasses().find(c=>c.id===id);if(!c)missing();
  if(a.section==='students')return searchTeaching({...a,type:'student',query:'',filters:{classId:id}});
  if(a.section==='seating'){const result=getClassroomLayout(id);const students=new Map(listStudentSummaries(id).map(s=>[s.id,s]));return envelope({saved:Boolean(result?.updatedAt),layout:result&&{...result,seats:result.seats.map(s=>({...s,name:students.get(s.studentId)?.name??null}))}},'/?page=classroom&classId='+id);}
  if(a.section==='summary')return envelope(classroomTaskSummary(id),pageUrl);
  return envelope(c,'/?page=class-mgmt');
 }
 if(type==='student'){
  const s=findStoredStudent(id,parentId);if(!s)missing();
  if(f.classId&&f.classId!==s.classId)missing();
  if(a.section==='observations')return paged(s.observationHistory.filter(o=>!f.from||(o.date.slice(0,10)>=f.from&&o.date.slice(0,10)<=f.to!)),a,'/?page=student-mgmt');
  if(a.section==='homework')return paged(s.homeworkHistory.filter(o=>!f.from||(o.date.slice(0,10)>=f.from&&o.date.slice(0,10)<=f.to!)),a,'/?page=student-mgmt');
  if(a.section==='weaknessEvidence')return paged(s.weaknessEvidence??[],a,'/?page=student-mgmt');
  if(a.section==='classroom')return paged(studentClassroomTasks(s.id).tasks.filter(t=>t.classId===s.classId&&(!f.from||(t.checkDate>=f.from&&t.checkDate<=f.to!))),a,pageUrl);
  if(a.section==='behavior')return searchTeaching({...a,type:'behavior',query:'',filters:{classId:s.classId,studentId:s.id,...dates(f)}});
  const {observationHistory,homeworkHistory,weaknessEvidence,...detail}=s;
  return envelope({...detail,committeeRoles:listCommitteeRoles().filter(r=>s.committeeRoleIds.includes(r.id)),recordCounts:{observations:observationHistory.length,homework:homeworkHistory.length,weaknessEvidence:weaknessEvidence?.length??0}},'/?page=student-mgmt');
 }
 if(type==='classroomTask'){
  const d=requireTask(id);if(parentId&&d.task.classId!==parentId)missing();
  if(a.section==='participants')return paged(d.participants,a,pageUrl);
  if(a.section==='events')return paged(d.events.slice().reverse(),a,pageUrl);
  return envelope({task:d.task,counts:d.counts,participantTotal:d.participants.length,eventTotal:d.events.length},pageUrl);
 }
 if(type==='behavior'){
  const rows=listBehavior({...dates(f),classId:f.classId,studentId:f.studentId,kind:f.kind,offset:0,limit:500});
  const e=rows.events.find(e=>e.id===id);if(!e){if(rows.total>500)throw new CapabilityError('REFINE_QUERY','查询范围超过500条，不能判断目标不存在。数据未修改，请缩小日期或指定学生。');missing();}
  return envelope(e,pageUrl);
 }
 if(type==='project'){const p=listRecordProjects().find(p=>p.key===id);if(!p)missing();return envelope(p,pageUrl);}
 if(type==='schedule'){const s=listScheduleItems().find(s=>s.id===id);if(!s)missing();return a.section==='periods'?paged(listSchedulePeriods(),a,'/?page=schedule'):envelope(s,'/?page=schedule');}
 if(type==='reminder'){const r=listReminders().find(r=>r.id===id);if(!r)missing();return envelope(r,'/?page=schedule');}
}
