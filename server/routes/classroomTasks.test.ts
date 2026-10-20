/** @license SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test,{after} from 'node:test';
import express from 'express';
import type {AddressInfo} from 'node:net';
const root=mkdtempSync(path.join(os.tmpdir(),'qingsong-task-routes-'));process.env.APP_DATA_ROOT=root;
const {createWorkspaceContext,runWithWorkspace}=await import('../context/workspaceContext');
const {getRosterDatabase,closeRosterDatabase}=await import('../database/rosterDatabase');
const {default:router}=await import('./classroomTasks');
const {default:behaviorRouter}=await import('./classroomBehavior');
const context=createWorkspaceContext('teacher-http','workspace-http','teacher');
const app=express();app.use(express.json());app.use((req,res,next)=>req.headers['x-test-auth']==='yes'?runWithWorkspace(context,next):next());app.use('/api',router);app.use('/api',behaviorRouter);
const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
const base='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/api';
after(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));closeRosterDatabase();rmSync(root,{recursive:true,force:true});});
const request=(url:string,body?:unknown,authenticated=true)=>fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(authenticated?{'x-test-auth':'yes'}:{})},body:body?JSON.stringify(body):undefined});
test('unauthenticated requests rejected and dates validate actual calendar days over HTTP',async()=>{
 assert.equal((await request('/classroom-tasks',undefined,false)).status,401);
 for(const day of ['2026-02-30','2026-13-01','2026-2-01','invalid']){
 const response=await request('/classroom-tasks/creation-preview',{classId:'class',name:'任务',mode:'pass',checkDate:day});assert.equal(response.status,400);assert.equal((await response.json()).code,'INVALID_TASK_INPUT');
 }
 runWithWorkspace(context,()=>getRosterDatabase().exec("INSERT INTO classes(id,name,grade,term,head_teacher,textbook_version,default_submit_time,status,created_at,updated_at) VALUES('class','班级','','','','','','active','now','now'); INSERT INTO students VALUES('student','学生','male','good','{}','now','now'); INSERT INTO class_memberships(id,class_id,student_id,student_no,status,joined_at) VALUES('membership','class','student','1','active','now');"));
 const input={classId:'class',name:'任务',mode:'pass',checkDate:'2026-10-20'};
 const preview=await request('/classroom-tasks/creation-preview',input);assert.equal(preview.status,200);const data=await preview.json();
 const created=await request('/classroom-tasks',{...input,operationId:'create-http',previewToken:data.previewToken});assert.equal(created.status,200);const detail=await created.json();assert.equal(detail.task.name,'任务');
 const summary=await request('/classroom-tasks/summary');assert.equal(summary.status,200);assert.equal((await summary.json()).unrecorded,1);
 const saved=await request('/classroom-tasks/'+detail.task.id+'/operations',{operationId:'record-http',expectedMetadataVersion:0,kind:'initial',participantId:detail.participants[0].id,expectedVersion:0,result:'negative'});assert.equal(saved.status,200);
 const queried=await request('/classroom-task-operations/record-http');assert.equal((await queried.json()).detail.counts.negative,1);
 const history=await request('/classroom-tasks/'+detail.task.id+'/history');assert.equal((await history.json()).total,2);
});

test('quick and behavior HTTP contracts reject anonymous reads and preserve idempotent results',async()=>{
 assert.equal((await request('/classroom-tasks/quick-context?classId=class&projectKey=collection&checkDate=2026-10-20',undefined,false)).status,401);
 assert.equal((await request('/classroom-behavior?from=2026-10-20&to=2026-10-20',undefined,false)).status,401);
 const contextResponse=await request('/classroom-tasks/quick-context?classId=class&projectKey=collection&checkDate=2026-10-20');assert.equal(contextResponse.status,200);const context=await contextResponse.json();assert.equal(context.detail,null);
 const input={classId:'class',projectKey:'collection',checkDate:'2026-10-20',round:1,operationId:'quick-http',contextToken:context.contextToken,expectedMetadataVersion:0,members:[{studentId:'student',expectedVersion:0,result:'positive'}]};
 const first=await request('/classroom-tasks/quick-record',input);assert.equal(first.status,200);const saved=await first.json();
 const retry=await request('/classroom-tasks/quick-record',input);assert.equal((await retry.json()).taskId,saved.taskId);
 const event={operationId:'behavior-http',studentId:'student',classId:'class',kind:'participation',note:'测试',occurredDate:'2026-10-20'};
 assert.equal((await request('/classroom-behavior',event)).status,200);
 assert.equal((await request('/classroom-behavior',{...event,occurredDate:'2026-02-30'})).status,400);
 const history=await request('/classroom-behavior?studentId=student&from=2026-10-20&to=2026-10-20');assert.equal((await history.json()).counts.participation,1);
});
