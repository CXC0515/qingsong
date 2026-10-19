/** @license SPDX-License-Identifier: Apache-2.0 */
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test,{after} from 'node:test';
const root=mkdtempSync(path.join(os.tmpdir(),'qingsong-task-repository-'));process.env.APP_DATA_ROOT=root;
const {createWorkspaceContext,runWithWorkspace}=await import('../context/workspaceContext');
const {getRosterDatabase,closeRosterDatabase}=await import('../database/rosterDatabase');
const repository=await import('./classroomTaskRepository');
after(()=>{closeRosterDatabase();rmSync(root,{recursive:true,force:true});});
test('repository transactions rollback all inserts and forbid participant from another task',()=>runWithWorkspace(createWorkspaceContext('teacher-test','workspace-repo','teacher'),()=>{
 const db=getRosterDatabase();
 db.exec("INSERT INTO classes(id,name,grade,term,head_teacher,textbook_version,default_submit_time,status,created_at,updated_at) VALUES('class','班级','','','','','','active','now','now'); INSERT INTO students VALUES('student','学生','male','good','{}','now','now');");
 const task={id:'task',classId:'class',className:'班级',name:'背诵',mode:'pass' as const,checkDate:'2026-10-20',dueDate:null,description:'',lifecycle:'active' as const,metadataVersion:0,rosterVersion:0,activityRevision:0,createdAt:'now',updatedAt:'now'};
 assert.throws(()=>repository.taskTransaction(()=>{repository.saveTask(task);throw new Error('rollback');}));
 assert.equal(repository.findTask('task'),null);
 repository.saveTask(task);repository.saveTask({...task,id:'other'});
 repository.saveParticipant('task',{id:'participant',studentId:'student',membershipId:'membership',name:'学生',studentNo:'1',enrollmentStatus:'active',included:true,exempt:false,version:0,result:'positive',currentEventId:'fake',firstResult:'positive'});
 assert.equal(repository.getTaskDetail('task')!.participants[0].result,null);
 assert.throws(()=>db.prepare('INSERT INTO classroom_task_events(id,task_id,participant_id,operation_id,data_json) VALUES(?,?,?,?,?)').run('event','other','participant','operation','{}'),/TASK_PARTICIPANT_MISMATCH/);
 assert.equal((db.pragma('foreign_key_check') as unknown[]).length,0);
}));
