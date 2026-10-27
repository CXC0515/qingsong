import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=mkdtempSync(path.join(os.tmpdir(),'qs-query-contract-'));
process.env.APP_DATA_ROOT=root;
const {createWorkspaceContext,runWithWorkspace}=await import('../../context/workspaceContext');
const {createClass,createStudent,listCommitteeRoles,createCommitteeRole,replaceClassCommitteeAssignments}=await import('../../repositories/rosterRepository');
const {closeRosterDatabase}=await import('../../database/rosterDatabase');
const {teachingQuery}=await import('./teachingQueries');
const {saveClassroomLayout}=await import('../../repositories/classroomRepository');
const {saveReminder}=await import('../../repositories/scheduleRepository');
const taskService=await import('../classroom/classroomTaskService');
const a=createWorkspaceContext('teacher-a','workspace-a','teacher'),b=createWorkspaceContext('teacher-b','workspace-b','teacher');
after(()=>{closeRosterDatabase();rmSync(root,{recursive:true,force:true});});
test('two named classes resolve to real IDs and return number-one student gender without private contacts',()=>{
 runWithWorkspace(a,()=>{
  for(const [name,gender] of [['初一十班','male'],['初二十班','female']] as const){
   const c=createClass({name,grade:name.startsWith('初一')?'七年级':'八年级',term:'2026秋',headTeacher:'样本',status:'active'});
   createStudent({classId:c.id,name:'样本'+gender,studentNo:'1',gender});
  }
  const classes=teachingQuery({kind:'classes'}).data.classes!;assert.equal(classes.length,2);
  assert.throws(()=>teachingQuery({kind:'roster',classId:'初一十班'}),/CLASS_NOT_FOUND/);
  assert.throws(()=>teachingQuery({kind:'roster'}),/CLASS_REQUIRED/);
  for(const [i,c] of classes.entries()){
   const result=teachingQuery({kind:'roster',classId:c.id});const student=result.data.students![0];
   assert.equal(student.studentNo,'1');assert.equal(student.gender,c.name==='初一十班'?'male':'female');
   assert.equal('parent' in student,false);assert.ok(result.sources.length);
   assert.throws(()=>runWithWorkspace(b,()=>teachingQuery({kind:'roster',classId:c.id})),/CLASS_NOT_FOUND/);
  }
  assert.throws(()=>teachingQuery({kind:'classroom',classId:classes[0].id}),/DATE_RANGE_REQUIRED/);
  for(const from of ['2026-02-30','2026-13-01'])assert.throws(()=>teachingQuery({kind:'classroom',classId:classes[0].id,from,to:'2026-03-01'}));
  assert.throws(()=>teachingQuery({kind:'classes',workspaceId:b.workspaceId}));
 });
 assert.equal(runWithWorkspace(b,()=>teachingQuery({kind:'classes'})).data.classes!.length,0);
});
test('roster distinguishes actual committee appointments, unassigned roles, empty classes and other workspaces',()=>{
 runWithWorkspace(a,()=>{
  const c=createClass({name:'班委核对班',grade:'七年级',term:'2026秋',headTeacher:'样本',status:'active'});
  const leader=listCommitteeRoles().find(role=>role.name==='班长')!;
  assert.ok(leader);
  const custom=createCommitteeRole('阅读联络员');
  const student=createStudent({classId:c.id,name:'任职样本',studentNo:'10',gender:'female',committeeRoleIds:[leader.id,custom.id],parent:{name:'不应输出',phone:'13900000000',relation:'其他',remark:'私密'}});
  const second=createStudent({classId:c.id,name:'未任职样本',studentNo:'11',gender:'male'});
  let result=teachingQuery({kind:'roster',classId:c.id});
  assert.equal(result.completeness,'complete');
  assert.deepEqual(result.data.students!.find(s=>s.id===student.id)!.committeeRoles.map(r=>r.name).sort(),['班长','阅读联络员'].sort());
  assert.equal(result.data.students!.find(s=>s.id===student.id)!.enrollmentStatus,'active');
  assert.deepEqual(result.data.students!.find(s=>s.id===second.id)!.committeeRoles,[]);
  assert.doesNotMatch(JSON.stringify(result),/13900000000|不应输出|私密/);
  assert.throws(()=>runWithWorkspace(b,()=>teachingQuery({kind:'roster',classId:c.id})),/CLASS_NOT_FOUND/);
  replaceClassCommitteeAssignments(c.id,[]);
  result=teachingQuery({kind:'roster',classId:c.id});
  assert.ok(result.data.committeeRoles!.some(r=>r.name==='班长'));
  assert.ok(result.data.students!.every(s=>s.committeeRoles.length===0));
  const empty=createClass({name:'空名单班',grade:'七年级',term:'2026秋',headTeacher:'样本',status:'active'});
  assert.deepEqual(teachingQuery({kind:'roster',classId:empty.id}).data.students,[]);
 });
});
test('capabilities declare coverage, unsupported queries cannot masquerade as empty results',()=>{
 runWithWorkspace(a,()=>{
  const result=teachingQuery({kind:'capabilities'});
  assert.equal(result.completeness,'complete');
  assert.deepEqual(result.data.queries!.map(q=>q.kind),['classes','roster','schedule','classroom','seating','reminders','task','student']);
  assert.match(result.data.interpretation!,/不代表没有记录/);
  assert.ok(result.data.unavailable!.includes('学生联系人与家庭信息'));
  for(const kind of ['materials','grading','delete']) assert.throws(()=>teachingQuery({kind}),/QUERY_UNSUPPORTED/);
  assert.throws(()=>teachingQuery({kind:'capabilities',workspaceId:b.workspaceId}));
 });
});
test('seating, reminders, task participants/history and student evidence retain scope and pagination',()=>{
 runWithWorkspace(a,()=>{
  const c=createClass({name:'查询闭环班',grade:'七年级',term:'2026秋',headTeacher:'样本',status:'active'});
  const student=createStudent({classId:c.id,name:'证据学生',studentNo:'1',gender:'female',parent:{name:'私密联系人',phone:'13999999999',relation:'其他',remark:''},observationHistory:[{date:'2026-10-27',type:'positive',content:'主动讨论',author:'样本教师'}]});
  createStudent({classId:c.id,name:'未记录学生',studentNo:'2',gender:'male'});
  assert.equal(teachingQuery({kind:'seating',classId:c.id}).data.saved,false);
  saveClassroomLayout(c.id,{rowCount:2,columnCount:2,seats:[{seatIndex:120,studentId:student.id}]});
  const seats=teachingQuery({kind:'seating',classId:c.id}).data;
  assert.equal(seats.saved,true);assert.equal(seats.layout!.seats[0].position,'讲台左1座');assert.equal(seats.layout!.seats[0].name,student.name);
  saveReminder({id:crypto.randomUUID(),name:'跟进样本',classId:c.id,className:c.name,time:'时间待定',repeatRule:'一次性',status:'active',timeKind:'none'});
  assert.equal(teachingQuery({kind:'reminders',classId:c.id}).data.total,1);
  const dated=teachingQuery({kind:'reminders',classId:c.id,from:'2026-10-01',to:'2026-10-31'});
  assert.equal(dated.data.total,0);assert.equal(dated.data.excludedUndated,1);
  const input={classId:c.id,name:'作业收交',mode:'completion' as const,checkDate:'2026-10-27'};
  const task=taskService.createClassroomTask({...input,operationId:crypto.randomUUID(),previewToken:taskService.previewTaskCreation(input).previewToken});
  taskService.applyClassroomOperation(task.task.id,{operationId:crypto.randomUUID(),kind:'initial',participantId:task.participants[0].id,expectedVersion:0,result:'negative'});
  const detail=teachingQuery({kind:'task',classId:c.id,taskId:task.task.id,limit:1});
  assert.equal(detail.completeness,'partial');assert.equal(detail.data.participantTotal,2);assert.equal(detail.data.participants!.length,1);
  assert.ok(detail.data.eventTotal!>0);
  const second=teachingQuery({kind:'task',classId:c.id,taskId:task.task.id,limit:1,offset:1});
  assert.notEqual(second.data.participants![0].id,detail.data.participants![0].id);
  const evidence=teachingQuery({kind:'student',classId:c.id,studentId:student.id,from:'2026-10-01',to:'2026-10-31'});
  assert.equal(evidence.data.observations![0].content,'主动讨论');assert.equal(evidence.data.taskTotal,1);
  assert.doesNotMatch(JSON.stringify(evidence),/13999999999|私密联系人/);
  assert.throws(()=>runWithWorkspace(b,()=>teachingQuery({kind:'task',classId:c.id,taskId:task.task.id})),/CLASS_NOT_FOUND/);
  assert.throws(()=>teachingQuery({kind:'student',classId:c.id,studentId:'bad',from:'2026-10-01',to:'2026-10-31'}),/STUDENT_NOT_FOUND/);
  assert.throws(()=>teachingQuery({kind:'task',classId:c.id}),/TASK_REQUIRED/);
  assert.throws(()=>teachingQuery({kind:'student',classId:c.id,studentId:student.id}),/DATE_RANGE_REQUIRED/);
  assert.throws(()=>teachingQuery({kind:'reminders',limit:0}));
 });
});
