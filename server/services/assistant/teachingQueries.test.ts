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
  assert.deepEqual(result.data.queries!.map(q=>q.kind),['classes','roster','schedule','classroom']);
  assert.match(result.data.interpretation!,/不代表没有记录/);
  assert.ok(result.data.unavailable!.includes('学生联系人与家庭信息'));
  for(const kind of ['seating','materials','grading','delete']) assert.throws(()=>teachingQuery({kind}),/QUERY_UNSUPPORTED/);
  assert.throws(()=>teachingQuery({kind:'capabilities',workspaceId:b.workspaceId}));
 });
});
