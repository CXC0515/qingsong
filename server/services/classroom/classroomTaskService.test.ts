/** @license SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
const root = mkdtempSync(path.join(os.tmpdir(),'qingsong-tasks-service-')); process.env.APP_DATA_ROOT=root;
const {createWorkspaceContext,runWithWorkspace}=await import('../../context/workspaceContext');
const {getRosterDatabase,closeRosterDatabase}=await import('../../database/rosterDatabase');
const service=await import('./classroomTaskService');
const context=createWorkspaceContext('teacher-test','workspace-tasks','teacher');
after(()=>{closeRosterDatabase();rmSync(root,{recursive:true,force:true});});
const seed = () => {
  const db=getRosterDatabase();const classId=randomUUID();
  db.prepare("INSERT INTO classes (id,name,grade,term,head_teacher,textbook_version,default_submit_time,status,created_at,updated_at) VALUES (?,?, '七年级','2026','','','','active','now','now')").run(classId,classId);
  for(let i=0;i<3;i++){const studentId=randomUUID();db.prepare("INSERT INTO students(id,name,gender,status,profile_json,created_at,updated_at) VALUES (?,?,'male','good','{}','now','now')").run(studentId,'学生'+i);db.prepare("INSERT INTO class_memberships(id,class_id,student_id,student_no,status,joined_at) VALUES (?,?,?,?,'active','now')").run(randomUUID(),classId,studentId,String(i));}
  return {classId,name:'订正完成',mode:'completion' as const,checkDate:'2026-10-20'};
};
const create = () => {const input=seed();const preview=service.previewTaskCreation(input);return service.createClassroomTask({...input,operationId:randomUUID(),previewToken:preview.previewToken});};
const operation = (detail:ReturnType<typeof create>,index:number,result:'positive'|'negative'='negative') => ({operationId:randomUUID(),kind:'initial' as const,participantId:detail.participants[index].id,expectedVersion:detail.participants[index].version,result});
test('creation preview rejects changed roster, tamper and expired token; identical create replays',()=>runWithWorkspace(context,()=>{
 const input=seed();const preview=service.previewTaskCreation(input);const request={...input,operationId:randomUUID(),previewToken:preview.previewToken};
 assert.throws(()=>service.createClassroomTask({...request,previewToken:preview.previewToken+'x'}),/记录未保存/);
 const originalNow=Date.now;Date.now=()=>originalNow()+360000;try{assert.throws(()=>service.createClassroomTask(request),(error:unknown)=>(error as {code:string}).code==='PREVIEW_EXPIRED');}finally{Date.now=originalNow;}
 getRosterDatabase().prepare('UPDATE students SET name=? WHERE id=?').run('名册变化',preview.participants[0].studentId);
 assert.throws(()=>service.createClassroomTask(request),(error:unknown)=>(error as {code:string}).code==='PREVIEW_CHANGED');
 const next={...request,previewToken:service.previewTaskCreation(input).previewToken};const detail=service.createClassroomTask(next);
 assert.equal(service.createClassroomTask({...next,previewToken:'expired'}).task.id,detail.task.id);
 assert.throws(()=>service.createClassroomTask({...next,name:'其他'}),(error:unknown)=>(error as {code:string}).code==='OPERATION_ID_CONFLICT');
}));
test('independent students can write; same student conflicts; idempotent retries precede version check',()=>runWithWorkspace(context,()=>{
 const detail=create();const a=operation(detail,0);const saved=service.applyClassroomOperation(detail.task.id,a);service.applyClassroomOperation(detail.task.id,operation(detail,1,'positive'));
 assert.equal(service.applyClassroomOperation(detail.task.id,a).committedAt,saved.committedAt);
 assert.throws(()=>service.applyClassroomOperation(detail.task.id,{...a,operationId:randomUUID()}),(error:unknown)=>(error as {code:string}).code==='PARTICIPANT_VERSION_CONFLICT');
 assert.throws(()=>service.applyClassroomOperation(detail.task.id,{...a,result:'positive'}),(error:unknown)=>(error as {code:string}).code==='OPERATION_ID_CONFLICT');
 assert.equal(service.requireTask(detail.task.id).counts.negative,1);
}));
test('batch commits atomically and preview binds exact members; changed participant prevents all writes',()=>runWithWorkspace(context,()=>{
 const detail=create();const preview=service.previewClassroomOperation(detail.task.id,{kind:'initial',result:'positive'});
 service.applyClassroomOperation(detail.task.id,operation(detail,1));
 const request={operationId:randomUUID(),kind:'initial' as const,members:preview.members,previewToken:preview.previewToken!};
 assert.throws(()=>service.applyClassroomOperation(detail.task.id,request));
 const current=service.requireTask(detail.task.id);assert.equal(current.counts.positive,0);assert.equal(current.counts.unrecorded,2);
 const next=service.previewClassroomOperation(detail.task.id,{kind:'initial',result:'positive'});
 assert.throws(()=>service.applyClassroomOperation(detail.task.id,{...request,members:next.members.slice(0,1),previewToken:next.previewToken!}));
 assert.equal(service.applyClassroomOperation(detail.task.id,{...request,members:next.members,previewToken:next.previewToken!}).detail.counts.positive,2);
}));
test('retest undo restores prior fact; historical target with dependents cannot be corrected',()=>runWithWorkspace(context,()=>{
 const detail=create();let current=service.applyClassroomOperation(detail.task.id,operation(detail,0)).detail;const first=current.participants[0].currentEventId!;
 current=service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'retest',participantId:current.participants[0].id,expectedVersion:1,result:'positive'}).detail;
 assert.equal(current.participants[0].firstResult,'negative');
 assert.throws(()=>service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'correct',participantId:current.participants[0].id,expectedVersion:2,result:'positive',targetEventId:first,reason:'旧事实'}),(error:unknown)=>(error as {code:string}).code==='EVENT_HAS_DEPENDENTS');
 current=service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'retract',participantId:current.participants[0].id,expectedVersion:2,targetEventId:current.participants[0].currentEventId!,reason:'误点'}).detail;
 assert.equal(current.participants[0].result,'negative');assert.equal(current.participants[0].currentEventId,first);
}));
test('roster snapshots survive transfers, exemption excludes denominator and lifecycle prevents writes',()=>runWithWorkspace(context,()=>{
 const detail=create();const student=detail.participants[0];getRosterDatabase().prepare('UPDATE students SET name=? WHERE id=?').run('新姓名',student.studentId);getRosterDatabase().prepare("UPDATE class_memberships SET status='transferred' WHERE id=?").run(student.membershipId);
 assert.equal(service.requireTask(detail.task.id).participants[0].name,student.name);
 let current=service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'exemption',participantId:student.id,expectedVersion:0,exempt:true,expectedRosterVersion:0}).detail;
 assert.equal(current.counts.required,2);assert.equal(current.counts.exempt,1);
 current=service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'lifecycle',lifecycle:'ended',expectedMetadataVersion:0}).detail;
 assert.throws(()=>service.applyClassroomOperation(detail.task.id,operation(detail,1)),(error:unknown)=>(error as {code:string}).code==='TASK_NOT_WRITABLE');
 current=service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'lifecycle',lifecycle:'archived',expectedMetadataVersion:1}).detail;
 assert.equal(current.task.previousLifecycle,'ended');
 assert.throws(()=>service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'lifecycle',lifecycle:'active',expectedMetadataVersion:2}));
}));
test('cross-workspace task, participant, event and operation identifiers cannot read or write',()=>runWithWorkspace(context,()=>{
 const detail=create();const saved=service.applyClassroomOperation(detail.task.id,operation(detail,0));
 runWithWorkspace(createWorkspaceContext('other-user','workspace-other','teacher'),()=>{
  assert.throws(()=>service.requireTask(detail.task.id),(error:unknown)=>(error as {status:number}).status===404);
  assert.throws(()=>service.queryClassroomOperation(saved.operationId),(error:unknown)=>(error as {status:number}).status===404);
 });
 const other=create();assert.throws(()=>service.applyClassroomOperation(other.task.id,{operationId:randomUUID(),kind:'initial',participantId:detail.participants[1].id,expectedVersion:0,result:'positive'}),(error:unknown)=>(error as {code:string}).code==='PARTICIPANT_NOT_FOUND');
 assert.throws(()=>service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'correct',participantId:detail.participants[0].id,expectedVersion:1,result:'positive',targetEventId:'forged',reason:'纠错'}),(error:unknown)=>(error as {code:string}).code==='EVENT_NOT_FOUND');
}));

test('committed creation and record can be queried after response is lost without a second event',()=>runWithWorkspace(context,()=>{
 const input=seed();const preview=service.previewTaskCreation(input);const operationId=randomUUID();
 const detail=service.createClassroomTask({...input,previewToken:preview.previewToken,operationId});
 const restored=service.queryClassroomOperation(operationId);assert.equal(restored.kind,'create');assert.deepEqual(restored.detail,detail);
 const record=operation(detail,0);service.applyClassroomOperation(detail.task.id,record);
 assert.equal(service.queryClassroomOperation(record.operationId).detail.counts.negative,1);
 assert.equal(service.requireTask(detail.task.id).events.length,2);
}));

test('phase version prevents stale writes after end and reopen while other students remain independent',()=>runWithWorkspace(context,()=>{
 const detail=create();const first={...operation(detail,0),expectedMetadataVersion:0};const second={...operation(detail,1),expectedMetadataVersion:0};
 service.applyClassroomOperation(detail.task.id,first);service.applyClassroomOperation(detail.task.id,second);
 service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'lifecycle',lifecycle:'ended',expectedMetadataVersion:0});
 service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'lifecycle',lifecycle:'active',expectedMetadataVersion:1});
 assert.throws(()=>service.applyClassroomOperation(detail.task.id,{...operation(detail,2),expectedMetadataVersion:0}),(error:unknown)=>(error as {code:string}).code==='TASK_VERSION_CONFLICT');
 assert.equal(service.applyClassroomOperation(detail.task.id,{...operation(detail,2),expectedMetadataVersion:2}).detail.counts.negative,3);
 assert.equal(service.applyClassroomOperation(detail.task.id,first).committedAt,service.queryClassroomOperation(first.operationId).committedAt);
}));
test('batch retract refuses entire conflicting selection and succeeds only after explicit re-preview',()=>runWithWorkspace(context,()=>{
 const detail=create();const batch=service.previewClassroomOperation(detail.task.id,{kind:'initial',result:'positive'});
 let current=service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'initial',members:batch.members,previewToken:batch.previewToken!,expectedMetadataVersion:0}).detail;
 const members=current.participants.map(item=>({participantId:item.id,expectedVersion:item.version,targetEventId:item.currentEventId!}));
 const undo=service.previewClassroomOperation(detail.task.id,{kind:'retract',members,reason:'误操作'});
 current=service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'retest',participantId:current.participants[0].id,expectedVersion:1,result:'negative'}).detail;
 assert.throws(()=>service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'retract',members,reason:'误操作',previewToken:undo.previewToken!}));
 assert.equal(service.requireTask(detail.task.id).counts.positive,2);
 const selection=members.slice(1);const safe=service.previewClassroomOperation(detail.task.id,{kind:'retract',members:selection,reason:'误操作'});
 current=service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'retract',members:selection,reason:'误操作',previewToken:safe.previewToken!}).detail;
 assert.equal(current.counts.unrecorded,2);assert.equal(current.counts.negative,1);
}));
test('new in-class student joins explicitly with immutable snapshot and restoring excluded participant retains facts',()=>runWithWorkspace(context,()=>{
 const detail=create();service.applyClassroomOperation(detail.task.id,operation(detail,0,'positive'));
 let current=service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'participation',participantId:detail.participants[0].id,expectedVersion:1,included:false,expectedRosterVersion:0}).detail;
 assert.equal(current.counts.total,2);
 current=service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'participation',participantId:detail.participants[0].id,expectedVersion:2,included:true,expectedRosterVersion:1}).detail;
 assert.equal(current.participants[0].result,'positive');
 const db=getRosterDatabase();const studentId=randomUUID();db.prepare("INSERT INTO students VALUES(?,?,'male','good','{}','now','now')").run(studentId,'新转入学生');db.prepare("INSERT INTO class_memberships(id,class_id,student_id,student_no,status,joined_at) VALUES(?,?,?,'4','active','now')").run(randomUUID(),detail.task.classId,studentId);
 current=service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'participation',studentId,included:true,expectedRosterVersion:2,expectedMetadataVersion:0}).detail;
 assert.equal(current.counts.total,4);assert.equal(current.participants[3].result,null);assert.equal(current.participants[3].name,'新转入学生');
 assert.throws(()=>service.applyClassroomOperation(detail.task.id,{operationId:randomUUID(),kind:'participation',studentId,included:true,expectedRosterVersion:3,expectedMetadataVersion:0}),(error:unknown)=>(error as {code:string}).code==='PARTICIPANT_ALREADY_EXISTS');
 const lengths=(db.prepare('SELECT length(result_json) AS length FROM classroom_task_operations WHERE task_id=?').all(detail.task.id) as {length:number}[]).map(row=>row.length);assert.ok(lengths.every(length=>length<300));
}));
test('same day and name can create distinct tasks and never share results',()=>runWithWorkspace(context,()=>{
 const input=seed();const firstPreview=service.previewTaskCreation(input);const first=service.createClassroomTask({...input,operationId:randomUUID(),previewToken:firstPreview.previewToken});
 const again=service.previewTaskCreation(input);assert.equal(again.duplicates.length,1);const second=service.createClassroomTask({...input,operationId:randomUUID(),previewToken:again.previewToken});
 assert.notEqual(first.task.id,second.task.id);service.applyClassroomOperation(first.task.id,operation(first,0));assert.equal(service.requireTask(second.task.id).counts.negative,0);
}));

test('quick browsing creates no task; first records share a round, replay resolves original and another round stays separate',()=>runWithWorkspace(context,()=>{
 const input=seed();const quick={classId:input.classId,projectKey:'collection',checkDate:input.checkDate};
 const a=service.readQuickContext(quick);const b=service.readQuickContext(quick);
 assert.equal(a.detail,null);assert.equal(service.listClassroomTasks({classId:input.classId}).total,0);
 const first={...quick,round:1,contextToken:a.contextToken,operationId:randomUUID(),expectedMetadataVersion:0,members:[{studentId:a.participants[0].studentId,expectedVersion:0,result:'negative' as const}]};
 const saved=service.recordQuick(first);
 const second=service.recordQuick({...first,contextToken:b.contextToken,operationId:randomUUID(),members:[{studentId:b.participants[1].studentId,expectedVersion:0,result:'positive'}]});
 assert.equal(saved.taskId,second.taskId);assert.equal(second.detail.counts.negative,1);assert.equal(second.detail.counts.positive,1);
 assert.equal(service.recordQuick({...first,contextToken:'expired'}).taskId,saved.taskId);
 assert.equal(service.listClassroomTasks({classId:input.classId,negativeOnly:true}).total,1);
 const next=service.readQuickContext({...quick,round:2});assert.equal(next.detail,null);
 const other=service.recordQuick({...first,round:2,operationId:randomUUID(),contextToken:next.contextToken});assert.notEqual(other.taskId,saved.taskId);
 const tomorrow=service.readQuickContext({...quick,checkDate:'2026-10-21'});assert.equal(tomorrow.detail,null);
 assert.equal(service.queryClassroomOperation(first.operationId).detail.task.checkDate,'2026-10-20');
}));
test('quick batch snapshot rejects roster changes and invalid members roll back first task',()=>runWithWorkspace(context,()=>{
 const input=seed();const quick={classId:input.classId,projectKey:'recitation',checkDate:input.checkDate};const c=service.readQuickContext(quick);
 const request={...quick,round:1,contextToken:c.contextToken,operationId:randomUUID(),expectedMetadataVersion:0,members:[{studentId:'foreign',expectedVersion:0,result:'positive' as const}]};
 assert.throws(()=>service.recordQuick(request));assert.equal(service.listClassroomTasks({classId:input.classId}).total,0);
 getRosterDatabase().prepare('UPDATE students SET name=? WHERE id=?').run('姓名变化',c.participants[0].studentId);
 assert.throws(()=>service.recordQuick({...request,members:[{studentId:c.participants[0].studentId,expectedVersion:0,result:'positive'}]}),(e:unknown)=>(e as {code:string}).code==='PREVIEW_CHANGED');
 assert.equal(service.listClassroomTasks({classId:input.classId}).total,0);
 const fresh=service.readQuickContext(quick);const saved=service.recordQuick({...request,contextToken:fresh.contextToken,members:fresh.participants.map((p,i)=>({studentId:p.studentId,expectedVersion:0,result:i?'positive':'negative'}))});
 assert.equal(saved.detail.counts.positive,2);assert.equal(saved.detail.counts.negative,1);
 runWithWorkspace(createWorkspaceContext('other','other-quick','teacher'),()=>assert.throws(()=>service.queryClassroomOperation(request.operationId),(e:unknown)=>(e as {status:number}).status===404));
}));

test('custom projects persist, replay safely, isolate workspaces and record independent classes',()=>runWithWorkspace(context,()=>{
 const a=seed(),b=seed();const operationId=randomUUID();
 const input={operationId,name:'  陋室铭背诵  ',category:'study' as const,mode:'pass' as const};
 const project=service.createRecordProject(input);assert.equal(project.label,'陋室铭背诵');
 assert.equal(service.createRecordProject(input).key,project.key);assert.equal(service.queryRecordProject(operationId).key,project.key);
 assert.throws(()=>service.createRecordProject({...input,operationId:randomUUID()}));
 assert.throws(()=>service.createRecordProject({...input,name:'其他内容'}));
 assert.ok(service.listRecordProjects().some(p=>p.key===project.key));
 const save=(classId:string)=>{const q={classId,projectKey:project.key,checkDate:'2026-10-20'};const c=service.readQuickContext(q);return service.recordQuick({...q,round:1,operationId:randomUUID(),contextToken:c.contextToken,expectedMetadataVersion:0,members:[{studentId:c.participants[0].studentId,expectedVersion:0,result:'positive'}]});};
 const first=save(a.classId),second=save(b.classId);assert.notEqual(first.taskId,second.taskId);assert.equal(first.detail.task.name,'陋室铭背诵');assert.equal(first.detail.task.mode,'pass');
 runWithWorkspace(createWorkspaceContext('project-other','workspace-project-other','teacher'),()=>{
  assert.equal(service.listRecordProjects().some(p=>p.key===project.key),false);
  assert.throws(()=>service.queryRecordProject(operationId));
  assert.throws(()=>service.readQuickContext({classId:a.classId,projectKey:project.key,checkDate:'2026-10-20'}));
 });
}));
