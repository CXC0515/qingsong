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

test('project HTTP creation validates modes and resolves retries by operation id',async()=>{
 assert.equal((await request('/classroom-tasks/projects',undefined,false)).status,401);
 const input={operationId:'project-http',name:'每日阅读',category:'study',mode:'completion'};
 const response=await request('/classroom-tasks/projects',input);assert.equal(response.status,200);const project=await response.json();
 assert.equal((await (await request('/classroom-tasks/projects/operations/project-http')).json()).key,project.key);
 assert.equal((await request('/classroom-tasks/projects',{...input,operationId:'bad-project',category:'behavior'})).status,400);
 assert.equal((await request('/classroom-tasks/projects',{...input,operationId:'duplicate-project'})).status,409);
});

test('HTTP rename and lesson contracts enforce versions, date validity and response-loss query',async()=>{
 const rename={operationId:'rename-http',projectKey:'collection',name:'每日收交',expectedVersion:0};
 assert.equal((await request('/classroom-tasks/projects/rename',rename,false)).status,401);
 const saved=await request('/classroom-tasks/projects/rename',rename);assert.equal(saved.status,200);assert.equal((await saved.json()).label,rename.name);
 assert.equal((await request('/classroom-tasks/projects/renames/rename-http')).status,200);
 assert.equal((await request('/classroom-tasks/projects/rename',{...rename,operationId:'stale-rename-http',name:'另一名称'})).status,409);
 assert.equal((await request('/classroom-tasks/projects/rename',{...rename,expectedVersion:'1'})).status,400);
 runWithWorkspace(context,()=>getRosterDatabase().exec("INSERT INTO schedule_items(id,day,period,title,class_id,class_name,item_type,time_text,scope,teacher_name,created_at,updated_at) VALUES('http-lesson',2,1,'语文','class','班级','class','08:00 - 08:40','teacher','','now','now')"));
 const url='/classroom-tasks/quick-context?classId=class&projectKey=collection&checkDate=2026-10-20&scheduleItemId=http-lesson';
 const response=await request(url);assert.equal(response.status,200);const current=await response.json();assert.equal(current.lessonSnapshot.period,1);assert.equal(current.detail,null);
 const record={classId:'class',projectKey:'collection',checkDate:'2026-10-20',scheduleItemId:'http-lesson',round:current.round,contextToken:current.contextToken,operationId:'lesson-http-record',expectedMetadataVersion:0,members:[{studentId:'student',expectedVersion:0,result:'positive'}]};
 const result=await request('/classroom-tasks/quick-record',record);assert.equal(result.status,200);const detail=await result.json();assert.equal((await (await request(url)).json()).detail.task.id,detail.taskId);
 assert.equal((await request(url.replace('2026-10-20','2026-10-21'))).status,409);
 assert.equal((await request(url.replace('2026-10-20','2026-02-30'))).status,400);
 const behavior={operationId:'lesson-behavior-http',studentId:'student',classId:'class',kind:'participation',note:'举手',occurredDate:'2026-10-20',scheduleItemId:'http-lesson'};
 assert.equal((await request('/classroom-behavior',behavior)).status,200);
 const filter='/classroom-behavior?studentId=student&from=2026-10-20&to=2026-10-20';
 assert.equal((await (await request(filter+'&scheduleItemId=http-lesson')).json()).counts.participation,1);
 assert.equal((await (await request(filter+'&freeOnly=true')).json()).counts.participation,1);
 assert.equal((await request(filter+'&freeOnly=garbage')).status,400);
});

test('behavior round HTTP contract persists empty rounds and rejects stale or invalid writes',async()=>{
 const contextUrl='/classroom-behavior/rounds?classId=class&kind=focus&occurredDate=2026-10-20';
 assert.equal((await request(contextUrl,undefined,false)).status,401);
 assert.equal((await (await request(contextUrl)).json()).round,1);
 const input={classId:'class',kind:'focus',occurredDate:'2026-10-20',operationId:'http-round',basedOn:1};
 assert.equal((await request('/classroom-behavior/rounds',input,false)).status,401);
 assert.equal((await request('/classroom-behavior/rounds',{...input,basedOn:'1'})).status,400);
 assert.equal((await request('/classroom-behavior/rounds',input)).status,200);
 assert.equal((await (await request('/classroom-behavior/rounds',input)).json()).round,2);
 assert.equal((await (await request(contextUrl)).json()).round,2);
 assert.equal((await request('/classroom-behavior/rounds',{...input,operationId:'http-stale-round'})).status,409);
 const event={operationId:'http-round-event',studentId:'student',classId:'class',kind:'focus',note:'本轮',occurredDate:'2026-10-20',round:2};
 assert.equal((await request('/classroom-behavior',{...event,round:0})).status,400);
 assert.equal((await request('/classroom-behavior',{...event,round:99})).status,409);
 assert.equal((await request('/classroom-behavior',event)).status,200);
 const result=await (await request('/classroom-behavior?classId=class&kind=focus&round=2&freeOnly=true&from=2026-10-20&to=2026-10-20')).json();
 assert.equal(result.counts.focus,1);assert.equal(result.studentCounts.student,1);assert.equal(result.events[0].round,2);
});
