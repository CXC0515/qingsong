import {listClasses,listStudentSummaries,findStoredStudent,listCommitteeRoles} from '../../../repositories/rosterRepository';
import {listScheduleItems,listReminders,listSchedulePeriods} from '../../../repositories/scheduleRepository';
import {getClassroomLayout} from '../../../repositories/classroomRepository';
import {listClassroomTasks,requireTask,studentClassroomTasks,listRecordProjects,classroomTaskSummary} from '../../classroom/classroomTaskService';
import {listBehavior} from '../../classroom/classroomBehaviorService';
import {matchesClass} from './classMatching';
import {CapabilityError,missing,ref,matches,paged,envelope,type SearchArgs,type ReadArgs} from './contract';
const pageUrl='/?page=classroom-tasks';
function dates(f:{from?:string;to?:string}) {if(!f.from||!f.to)throw new CapabilityError('DATE_RANGE_REQUIRED','请提供起止日期，跨度最多31天。数据未修改，请补全后查询。');return {from:f.from,to:f.to};}
function validClass(classId?:string) {if(classId&&!listClasses().some(c=>c.id===classId))missing();}
export function teachingBusinessContext(){
 const classes=listClasses().filter(c=>c.status==='active');
 return {classes:classes.slice(0,50).map(c=>({ref:ref('class',c.id),name:c.name,grade:c.grade,term:c.term})),total:classes.length,complete:classes.length<=50,
  guidance:'当前工作区可访问的在用班级候选；不是本轮目标的自动选择。结合教师原话、前文和课表等工具结果确定对象；多候选无法排除时才澄清。目录截断时继续search分页。'};
}
export function searchTeaching(a:SearchArgs) {
 const f=a.filters;validClass(f.classId);
 switch(a.type){
 case 'class':return paged(listClasses().filter(c=>(!f.status||c.status===f.status)&&matchesClass(a.query,c)).map(c=>({ref:ref('class',c.id),name:c.name,grade:c.grade,term:c.term,status:c.status,studentCount:c.studentCount})),a,'/?page=class-mgmt',false,{guidance:'这是名称/简称候选，不是自然语言关系查询。零命中时去掉query列举当前班级核对；今天有课、刚记录过等描述先查课表或课堂记录取得classId，不能把整句描述当班名。多候选结合上下文核实，不自动选第一个。'});
 case 'student':return paged(listStudentSummaries(f.classId).filter(s=>(!f.enrollmentStatus||s.enrollmentStatus===f.enrollmentStatus)&&matches(a.query,s.name,s.studentNo)).map(s=>({ref:ref('student',s.id,s.classId),name:s.name,studentNo:s.studentNo,classId:s.classId,className:s.className,enrollmentStatus:s.enrollmentStatus,committeeRoles:listCommitteeRoles().filter(r=>s.committeeRoleIds.includes(r.id))})),a,'/?page=student-mgmt');
 case 'classroomTask':{const result=listClassroomTasks({classId:f.classId,from:f.from,to:f.to,search:a.query,lifecycle:f.lifecycle as any,negativeOnly:f.negativeOnly,offset:a.offset,limit:a.limit});return envelope({items:result.tasks.map(t=>({...t,ref:ref('classroomTask',t.id,t.classId)}))},pageUrl,{total:result.total,offset:a.offset,limit:a.limit});}
 case 'behavior':{const result=listBehavior({...dates(f),classId:f.classId,studentId:f.studentId,kind:f.kind,offset:a.offset,limit:a.limit});return envelope({items:result.events.map(e=>({...e,ref:ref('behavior',e.id)})),queryApplied:false},pageUrl,{total:result.total,offset:a.offset,limit:a.limit});}
 case 'project':return paged(listRecordProjects().filter(p=>matches(a.query,p.label,p.key)).map(p=>({...p,ref:ref('project',p.key)})),a,pageUrl);
 case 'schedule':{const day=f.onDate?(new Date(f.onDate+'T00:00:00Z').getUTCDay()||7):f.weekday;return paged(listScheduleItems().filter(s=>(!f.classId||s.classId===f.classId)&&(!day||s.day===day)&&(!f.scope||(s.scope??'teacher')===f.scope)&&matches(a.query,JSON.stringify(s))).map(s=>({...s,ref:ref('schedule',s.id)})),a,'/?page=schedule',false,{onDate:f.onDate,weekday:day,scope:f.scope,interpretation:'常规每周课表；日期仅映射星期，未核实临时调课、停课、节假日或实际出勤。用classId关联班级，不按相似度猜测。'});}
 case 'reminder':return paged(listReminders().filter(r=>(!f.classId||r.classId===f.classId)&&(!f.status||r.status===f.status)&&matches(a.query,r.name)&&(!f.from||Boolean((r.startAt||r.dueAt)&&((r.startAt||r.dueAt)!.slice(0,10)<=f.to!)&&((r.endAt||r.dueAt||r.startAt)!.slice(0,10)>=f.from)))).map(r=>({...r,ref:ref('reminder',r.id)})),a,'/?page=schedule');
 }
}
export function readTeaching(a:ReadArgs) {
 const {type,id,parentId}=a.ref;const f=a.filters;
 if(type==='class'){
  const c=listClasses().find(c=>c.id===id);if(!c)missing();
  if(a.section==='students')return searchTeaching({...a,type:'student',query:'',filters:{classId:id}});
  if(a.section==='committee'){const roles=listCommitteeRoles();const items=listStudentSummaries(id).filter(s=>['active','suspended'].includes(s.enrollmentStatus)&&s.committeeRoleIds.length).map(s=>({ref:ref('student',s.id,s.classId),name:s.name,studentNo:s.studentNo,enrollmentStatus:s.enrollmentStatus,committeeRoles:roles.filter(r=>s.committeeRoleIds.includes(r.id))}));return paged(items,a,'/?page=student-mgmt',false,{class:{id:c.id,name:c.name},interpretation:'当前在班及休学学生的实际班委任职；岗位名为班长与副班长必须区分。无记录不猜测任职人，完整结论须读完分页。'});}
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
