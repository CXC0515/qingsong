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
  assert.equal(database.pragma('user_version', { simple: true }), 15);
  database.close();
});

test('migration 12 adds classroom task tables without changing roster and reopening is idempotent',()=>{
 const database=new Database(':memory:');database.pragma('foreign_keys=ON');runRosterMigrations(database);
 database.exec("INSERT INTO classes(id,name,grade,term,head_teacher,textbook_version,default_submit_time,status,created_at,updated_at) VALUES('class','班级','','','','','','active','now','now')");
 runRosterMigrations(database);
 assert.equal((database.prepare('SELECT COUNT(*) AS count FROM classes').get() as {count:number}).count,1);
 for(const name of ['classroom_tasks','classroom_task_participants','classroom_task_operations','classroom_task_events']) assert.equal((database.prepare('SELECT COUNT(*) AS count FROM '+name).get() as {count:number}).count,0);
 assert.equal(database.pragma('user_version',{simple:true}),15);assert.deepEqual(database.pragma('foreign_key_check'),[]);database.close();
});


test('migration 15 upgrades v14 without rewriting existing projects, rounds or event JSON',()=>{
 const db=new Database(':memory:');db.pragma('foreign_keys=ON');runRosterMigrations(db);
 db.exec('DROP TABLE classroom_lesson_rounds; DROP TABLE classroom_project_renames; DROP TABLE classroom_project_names; PRAGMA user_version=14');
 db.exec("INSERT INTO classes(id,name,grade,term,head_teacher,textbook_version,default_submit_time,status,created_at,updated_at) VALUES('legacy-class','原班级','','','','','','active','now','now'); INSERT INTO students VALUES('legacy-student','原学生','male','good','{}','now','now'); INSERT INTO classroom_record_projects VALUES('legacy-project','study','原项目','completion','legacy-create','hash','now'); INSERT INTO classroom_tasks VALUES('legacy-task','legacy-class','{\"name\":\"原检查\"}'); INSERT INTO classroom_quick_rounds VALUES('legacy-class','legacy-project','2026-10-20',1,'legacy-task'); INSERT INTO classroom_behavior_events VALUES('legacy-event','legacy-op','hash','legacy-student','legacy-class',NULL,'2026-10-20','{\"projectLabel\":\"原表现\"}')");
 const tables=['classes','students','classroom_record_projects','classroom_tasks','classroom_quick_rounds','classroom_behavior_events'];
 const before=tables.map(table=>db.prepare('SELECT * FROM '+table).all());runRosterMigrations(db);runRosterMigrations(db);
 assert.deepEqual(tables.map(table=>db.prepare('SELECT * FROM '+table).all()),before);
 assert.equal(db.pragma('user_version',{simple:true}),15);assert.deepEqual(db.pragma('foreign_key_check'),[]);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');db.close();
});
