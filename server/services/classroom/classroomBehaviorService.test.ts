import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test,{after} from 'node:test';
const root=mkdtempSync(path.join(os.tmpdir(),'qingsong-behavior-'));process.env.APP_DATA_ROOT=root;
const {createWorkspaceContext,runWithWorkspace}=await import('../../context/workspaceContext');
const {getRosterDatabase,closeRosterDatabase}=await import('../../database/rosterDatabase');
const service=await import('./classroomBehaviorService');
const serviceForProjects=await import('./classroomTaskService');
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

test('custom behavior projects preserve labels in profile counts and source history',()=>runWithWorkspace(context,()=>{
 const db=getRosterDatabase();db.prepare("UPDATE class_memberships SET status='active' WHERE student_id='student'").run();
 const {createRecordProject}=serviceForProjects;
 const project=createRecordProject({operationId:'custom-project',name:'认真倾听',category:'behavior',mode:'event'});
 const event=service.recordBehavior({operationId:'custom-event',studentId:'student',classId:'class',kind:project.key,note:'小组讨论',occurredDate:'2026-10-20'});
 assert.equal(event.projectLabel,'认真倾听');
 const result=service.listBehavior({studentId:'student',from:'2026-10-20',to:'2026-10-20'});
 assert.equal(result.counts[project.key],1);assert.equal(result.labels[project.key],'认真倾听');
 service.recordBehavior({operationId:'custom-undo',studentId:'student',classId:'class',kind:project.key,note:'误点',occurredDate:'2026-10-20',targetId:event.id});
 assert.equal(service.listBehavior({studentId:'student',from:'2026-10-20',to:'2026-10-20'}).counts[project.key]??0,0);
}));

test('lesson behavior is scoped while profile totals span lessons; rename changes projection but never snapshots',()=>runWithWorkspace(context,()=>{
 const db=getRosterDatabase();
 db.exec("INSERT INTO classes(id,name,grade,term,head_teacher,textbook_version,default_submit_time,status,created_at,updated_at) VALUES('lesson-class','课程班','','','','','','active','now','now'); INSERT INTO students VALUES('lesson-student','课程学生','male','good','{}','now','now'); INSERT INTO class_memberships(id,class_id,student_id,student_no,status,joined_at) VALUES('lesson-member','lesson-class','lesson-student','1','active','now');");
 for(const [id,period]of [['lesson-a',1],['lesson-b',2]] as const)db.prepare("INSERT INTO schedule_items(id,day,period,title,class_id,class_name,item_type,time_text,scope,teacher_name,created_at,updated_at) VALUES(?,2,?,'语文','lesson-class','课程班','class','08:00 - 08:40','teacher','','now','now')").run(id,period);
 const input={operationId:'lesson-event-a',studentId:'lesson-student',classId:'lesson-class',kind:'cooperation',note:'帮助同学',occurredDate:'2026-10-20',scheduleItemId:'lesson-a'};
 const first=service.recordBehavior(input);service.recordBehavior({...input,operationId:'lesson-event-b',scheduleItemId:'lesson-b'});service.recordBehavior({...input,operationId:'free-event',scheduleItemId:undefined});
 const filter={studentId:input.studentId,from:input.occurredDate,to:input.occurredDate};
 assert.equal(service.listBehavior(filter).counts.cooperation,3);
 assert.equal(service.listBehavior({...filter,scheduleItemId:'lesson-a'}).total,1);assert.equal(service.listBehavior({...filter,freeOnly:true}).total,1);
 const project=serviceForProjects.resolveRecordProject('cooperation');serviceForProjects.renameRecordProject({operationId:'rename-cooperation',projectKey:project.key,name:'互助协作',expectedVersion:project.version??0});
 const listed=service.listBehavior({...filter,scheduleItemId:'lesson-a'});assert.equal(listed.labels.cooperation,'互助协作');assert.equal(listed.events[0].currentProjectLabel,'互助协作');assert.equal(listed.events[0].projectLabel,first.projectLabel);assert.deepEqual(service.queryBehaviorOperation(input.operationId),first);
 assert.throws(()=>service.recordBehavior({...input,operationId:'wrong-lesson-undo',targetId:first.id,scheduleItemId:'lesson-b'}));
 db.prepare("DELETE FROM schedule_items WHERE id='lesson-a'").run();
 assert.equal(service.recordBehavior(input).id,first.id);
 service.recordBehavior({...input,operationId:'lesson-retract',targetId:first.id});assert.equal(service.listBehavior(filter).counts.cooperation,2);
}));

test('durable behavior rounds isolate lesson/project/date, replay once and preserve profile totals',()=>runWithWorkspace(context,()=>{
 const scope={classId:'lesson-class',kind:'focus',occurredDate:'2026-10-20',scheduleItemId:'lesson-b'};
 const event={...scope,studentId:'lesson-student',note:'专注',operationId:'round-one'};
 service.recordBehavior(event);
 assert.deepEqual(service.behaviorRounds(scope),{round:1,availableRounds:[1]});
 const request={...scope,operationId:'round-create',basedOn:1};
 assert.deepEqual(service.newBehaviorRound(request),{round:2,availableRounds:[1,2]});
 assert.equal(service.newBehaviorRound(request).round,2);
 assert.equal(service.behaviorRounds(scope).round,2); // An empty round survives rereading.
 assert.throws(()=>service.newBehaviorRound({...request,operationId:'concurrent'}));
 assert.throws(()=>service.newBehaviorRound({...request,kind:'participation'}));
 const second=service.recordBehavior({...event,operationId:'round-two',round:2});
 const filter={classId:scope.classId,kind:scope.kind,from:scope.occurredDate,to:scope.occurredDate,scheduleItemId:scope.scheduleItemId};
 assert.equal(service.listBehavior({...filter,round:1}).counts.focus,1);
 assert.equal(service.listBehavior({...filter,round:2}).counts.focus,1);
 assert.equal(service.listBehavior(filter).counts.focus,2);
 assert.throws(()=>service.recordBehavior({...event,operationId:'not-created',round:9}));
 assert.throws(()=>service.recordBehavior({...event,operationId:'wrong-round-retract',targetId:second.id,round:1}));
 service.recordBehavior({...event,operationId:'round-two-undo',targetId:second.id,round:2});
 assert.equal(service.listBehavior({...filter,round:2}).counts.focus??0,0);
 assert.equal(service.listBehavior({...filter,round:1}).counts.focus,1);
 assert.equal(service.behaviorRounds({...scope,scheduleItemId:undefined}).round,1);
 assert.equal(service.behaviorRounds({...scope,kind:'participation'}).round,1);
 assert.equal(service.behaviorRounds({...scope,occurredDate:'2026-10-27'}).round,1);
 runWithWorkspace(createWorkspaceContext('round-other','round-other','teacher'),()=>{
  assert.equal(service.behaviorRounds(scope).round,1);
  assert.throws(()=>service.newBehaviorRound({...scope,operationId:'foreign-round',basedOn:1}));
 });
 // Retraction and exact replay still work after the schedule entry has been removed.
 getRosterDatabase().prepare("DELETE FROM schedule_items WHERE id='lesson-b'").run();
 assert.equal(service.newBehaviorRound(request).round,2);
 assert.equal(service.recordBehavior({...event,operationId:'round-two',round:2}).id,second.id);
}));
