import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test,{after} from 'node:test';
const root=mkdtempSync(path.join(os.tmpdir(),'qingsong-behavior-'));process.env.APP_DATA_ROOT=root;
const {createWorkspaceContext,runWithWorkspace}=await import('../../context/workspaceContext');
const {getRosterDatabase,closeRosterDatabase}=await import('../../database/rosterDatabase');
const service=await import('./classroomBehaviorService');
const context=createWorkspaceContext('teacher-behavior','workspace-behavior','teacher');
after(()=>{closeRosterDatabase();rmSync(root,{recursive:true,force:true});});
test('behavior events repeat intentionally, replay once, retract without erasing and count full period',()=>runWithWorkspace(context,()=>{
 const db=getRosterDatabase();db.exec("INSERT INTO classes(id,name,grade,term,head_teacher,textbook_version,default_submit_time,status,created_at,updated_at) VALUES('class','班级','','','','','','active','now','now'); INSERT INTO students VALUES('student','学生','male','good','{}','now','now'); INSERT INTO class_memberships(id,class_id,student_id,student_no,status,joined_at) VALUES('membership','class','student','1','active','now');");
 const input={operationId:'first',studentId:'student',classId:'class',kind:'cooperation' as const,note:'帮助同桌',occurredDate:'2026-10-20'};
 const first=service.recordBehavior(input);assert.equal(service.recordBehavior(input).id,first.id);
 assert.throws(()=>service.recordBehavior({...input,note:'另一笔'}));
 service.recordBehavior({...input,operationId:'second'});
 const filter={studentId:'student',from:'2026-10-20',to:'2026-10-20',limit:1};
 let result=service.listBehavior(filter);assert.equal(result.counts.cooperation,2);assert.equal(result.events.length,1);assert.equal(result.total,2);
 const retract={...input,operationId:'retract',targetId:first.id};service.recordBehavior(retract);service.recordBehavior(retract);
 result=service.listBehavior({...filter,limit:100});assert.equal(result.counts.cooperation,1);assert.equal(result.events.find(e=>e.id===first.id)?.retracted,true);assert.equal(result.total,2);
 assert.throws(()=>service.recordBehavior({...retract,operationId:'retract-again'}));
 assert.equal(service.listBehavior({...filter,from:'2026-10-21',to:'2026-10-21'}).total,0);
 db.prepare("UPDATE class_memberships SET status='transferred' WHERE student_id='student'").run();
 assert.throws(()=>service.recordBehavior({...input,operationId:'after-transfer'}));
 // Retraction remains possible after transfer, and history does not disappear.
 const second=result.events.find(e=>e.id!==first.id)!;service.recordBehavior({...input,operationId:'undo-second',targetId:second.id});
 assert.equal(service.listBehavior(filter).counts.cooperation??0,0);
 runWithWorkspace(createWorkspaceContext('foreign','foreign-behavior','teacher'),()=>{
  assert.throws(()=>service.queryBehaviorOperation('first'));
  assert.equal(service.listBehavior(filter).total,0);
  assert.throws(()=>service.recordBehavior({...input,operationId:'foreign'}));
 });
}));
