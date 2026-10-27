import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=mkdtempSync(path.join(os.tmpdir(),'qs-query-contract-'));
process.env.APP_DATA_ROOT=root;
const {createWorkspaceContext,runWithWorkspace}=await import('../../context/workspaceContext');
const {createClass,createStudent}=await import('../../repositories/rosterRepository');
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
