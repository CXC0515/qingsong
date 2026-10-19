/** @license SPDX-License-Identifier: Apache-2.0 */

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach } from 'node:test';
import Database from 'better-sqlite3';
import { createManagedProductSnapshot, createProductSnapshot, restoreProductSnapshot } from './productSnapshot';

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

const createFixture = async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'demo-product-snapshot-'));
  temporaryRoots.push(parent);
  const source = path.join(parent, 'source');
  const automatic = path.join(source, 'backups', 'automatic');
  await mkdir(path.join(source, 'system'), { recursive: true });
  await mkdir(path.join(source, 'workspaces', 'workspace-test', 'uploads'), { recursive: true });
  const auth = new Database(path.join(source, 'system', 'auth.sqlite'));
  auth.exec("CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('user-1')");
  auth.close();
  await writeFile(path.join(source, 'workspaces', 'workspace-test', 'uploads', 'resource.pdf'), 'first');
  return { source, automatic };
};

test('skips unchanged data and retains only the latest two successful snapshots', async () => {
  const { source, automatic } = await createFixture();
  const first = await createManagedProductSnapshot(source, automatic, 2, new Date('2026-09-08T01:00:00Z'));
  assert.equal(first.status, 'created');
  const duplicate = await createManagedProductSnapshot(source, automatic, 2, new Date('2026-09-08T02:00:00Z'));
  assert.equal(duplicate.status, 'skipped');

  const resource = path.join(source, 'workspaces', 'workspace-test', 'uploads', 'resource.pdf');
  await writeFile(resource, 'second');
  await createManagedProductSnapshot(source, automatic, 2, new Date('2026-09-08T03:00:00Z'));
  await writeFile(resource, 'third');
  const latest = await createManagedProductSnapshot(source, automatic, 2, new Date('2026-09-08T04:00:00Z'));
  assert.equal(latest.status, 'created');
  assert.equal(latest.pruned.length, 1);
  const entries = (await readdir(automatic)).filter(name => name.startsWith('product-'));
  assert.equal(entries.length, 2);
  assert.equal((await readdir(automatic)).some(name => name.startsWith('.pending-')), false);
});

test('keeps a failed snapshot under an incomplete name', async () => {
  const { source, automatic } = await createFixture();
  await symlink('/tmp', path.join(source, 'workspaces', 'workspace-test', 'unsafe-link'));
  await assert.rejects(
    () => createManagedProductSnapshot(source, automatic, 2, new Date('2026-09-08T05:00:00Z')),
    /SYMLINK_NOT_ALLOWED/,
  );
  assert.equal((await readdir(automatic)).some(name => name.startsWith('incomplete-')), true);
});

test('creates a new recovery point when an older snapshot is damaged', async () => {
  const { source, automatic } = await createFixture();
  const first = await createManagedProductSnapshot(source, automatic, 2, new Date('2026-09-08T01:00:00Z'));
  assert.equal(first.status, 'created');
  await writeFile(path.join(first.snapshotPath!, 'workspaces', 'workspace-test', 'uploads', 'resource.pdf'), 'damaged');

  const replacement = await createManagedProductSnapshot(source, automatic, 2, new Date('2026-09-08T02:00:00Z'));
  assert.equal(replacement.status, 'created');
  assert.equal((await readdir(automatic)).filter(name => name.startsWith('product-')).length, 2);
});

test('restores a snapshot when the workspaces root contains metadata files', async () => {
  const { source } = await createFixture();
  const workspace = path.join(source, 'workspaces', 'workspace-test');
  await mkdir(path.join(workspace, 'data'), { recursive: true });
  const resourceDb = new Database(path.join(workspace, 'data', 'resources.sqlite'));
  resourceDb.exec('CREATE TABLE resources (id TEXT PRIMARY KEY, disk_path TEXT); CREATE TABLE pool_items (id TEXT PRIMARY KEY, disk_path TEXT);');
  resourceDb.prepare('INSERT INTO pool_items VALUES (?, ?)').run('pool-1', path.join(workspace, 'uploads', 'resource.pdf'));
  resourceDb.close();
  await writeFile(path.join(source, 'workspaces', '.DS_Store'), 'metadata');
  const snapshot = path.join(path.dirname(source), 'snapshot');
  const restored = path.join(path.dirname(source), 'restored');

  await createProductSnapshot(source, snapshot);
  await restoreProductSnapshot(snapshot, restored);

  assert.deepEqual((await readdir(path.join(restored, 'workspaces'))).sort(), ['.DS_Store', 'workspace-test']);
  const restoredDb = new Database(path.join(restored, 'workspaces', 'workspace-test', 'data', 'resources.sqlite'), { readonly: true });
  assert.equal((restoredDb.prepare('SELECT disk_path FROM pool_items WHERE id = ?').get('pool-1') as { disk_path: string }).disk_path, path.join(restored, 'workspaces', 'workspace-test', 'uploads', 'resource.pdf'));
  restoredDb.close();
});

test('online product snapshot restores classroom task operations and event-derived retest results',async()=>{
 const {source}=await createFixture();
 const dataDirectory=path.join(source,'workspaces','workspace-test','data');await mkdir(dataDirectory,{recursive:true});
 const {runWithWorkspace}=await import('../../context/workspaceContext');
 const {getRosterDatabase,closeRosterDatabase}=await import('../../database/rosterDatabase');
 const service=await import('../classroom/classroomTaskService');
 const context={userId:'teacher-snapshot',workspaceId:'workspace-test',role:'teacher' as const,root:path.join(source,'workspaces','workspace-test'),dataDirectory,uploadDirectory:path.join(source,'workspaces','workspace-test','uploads')};
 let taskId='';
 runWithWorkspace(context,()=>{
  const db=getRosterDatabase();db.exec("INSERT INTO classes(id,name,grade,term,head_teacher,textbook_version,default_submit_time,status,created_at,updated_at) VALUES('class','班级','','','','','','active','now','now'); INSERT INTO students VALUES('student','学生','male','good','{}','now','now'); INSERT INTO class_memberships(id,class_id,student_id,student_no,status,joined_at) VALUES('membership','class','student','1','active','now');");
  const input={classId:'class',name:'背诵过关',mode:'pass' as const,checkDate:'2026-10-20'};const preview=service.previewTaskCreation(input);
  const detail=service.createClassroomTask({...input,previewToken:preview.previewToken,operationId:'snapshot-create'});taskId=detail.task.id;
  service.applyClassroomOperation(taskId,{operationId:'snapshot-first',kind:'initial',participantId:detail.participants[0].id,expectedVersion:0,result:'negative'});
  service.applyClassroomOperation(taskId,{operationId:'snapshot-retest',kind:'retest',participantId:detail.participants[0].id,expectedVersion:1,result:'positive'});
 });
 const before=runWithWorkspace(context,()=>service.requireTask(taskId));
 const counts=runWithWorkspace(context,()=>['classroom_tasks','classroom_task_participants','classroom_task_operations','classroom_task_events'].map(table=>(getRosterDatabase().prepare('SELECT COUNT(*) AS count FROM '+table).get() as {count:number}).count));
 const snapshot=path.join(path.dirname(source),'task-snapshot');const restored=path.join(path.dirname(source),'task-restored');
 await createProductSnapshot(source,snapshot);await restoreProductSnapshot(snapshot,restored);
 const restoredContext={...context,root:path.join(restored,'workspaces','workspace-test'),dataDirectory:path.join(restored,'workspaces','workspace-test','data'),uploadDirectory:path.join(restored,'workspaces','workspace-test','uploads')};
 runWithWorkspace(restoredContext,()=>{
  const after=service.requireTask(taskId);assert.deepEqual(after,before);assert.equal(after.participants[0].firstResult,'negative');assert.equal(after.participants[0].result,'positive');
  assert.deepEqual(['classroom_tasks','classroom_task_participants','classroom_task_operations','classroom_task_events'].map(table=>(getRosterDatabase().prepare('SELECT COUNT(*) AS count FROM '+table).get() as {count:number}).count),counts);
  assert.deepEqual(getRosterDatabase().pragma('foreign_key_check'),[]);
 });
 closeRosterDatabase();
});
