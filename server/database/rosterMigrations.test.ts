/** @license SPDX-License-Identifier: Apache-2.0 */

import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runRosterMigrations } from './rosterMigrations';

test('migration 11 removes the obsolete class teacher column without losing classes', () => {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      grade TEXT NOT NULL,
      term TEXT NOT NULL,
      head_teacher TEXT NOT NULL,
      chinese_teacher TEXT NOT NULL,
      status TEXT NOT NULL
    );
    INSERT INTO classes VALUES ('class-1', '七年级 1 班', '七年级', '2026 秋季学期', '李老师', '旧任课教师', 'active');
    PRAGMA user_version = 10;
  `);

  runRosterMigrations(database);

  const columns = database.prepare('PRAGMA table_info(classes)').all() as Array<{ name: string }>;
  assert.equal(columns.some(column => column.name === 'chinese_teacher'), false);
  assert.deepEqual(database.prepare('SELECT id, name, head_teacher FROM classes').get(), {
    id: 'class-1', name: '七年级 1 班', head_teacher: '李老师'
  });
  assert.equal(database.pragma('user_version', { simple: true }), 14);
  database.close();
});

test('migration 12 adds classroom task tables without changing roster and reopening is idempotent',()=>{
 const database=new Database(':memory:');database.pragma('foreign_keys=ON');runRosterMigrations(database);
 database.exec("INSERT INTO classes(id,name,grade,term,head_teacher,textbook_version,default_submit_time,status,created_at,updated_at) VALUES('class','班级','','','','','','active','now','now')");
 runRosterMigrations(database);
 assert.equal((database.prepare('SELECT COUNT(*) AS count FROM classes').get() as {count:number}).count,1);
 for(const name of ['classroom_tasks','classroom_task_participants','classroom_task_operations','classroom_task_events']) assert.equal((database.prepare('SELECT COUNT(*) AS count FROM '+name).get() as {count:number}).count,0);
 assert.equal(database.pragma('user_version',{simple:true}),14);assert.deepEqual(database.pragma('foreign_key_check'),[]);database.close();
});
