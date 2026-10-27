/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import Database from 'better-sqlite3';

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'demo-roster-sqlite-'));
const databasePath = path.join(temporaryDirectory, 'roster.sqlite');
process.env.ROSTER_DB_PATH = databasePath;

const repository = await import('./rosterRepository');
const { closeRosterDatabase } = await import('../database/rosterDatabase');
const primaryClass = repository.createClass({
  name: '七年级 5 班',
  grade: '七年级',
  term: '2026 秋季学期',
  headTeacher: '测试教师',
  status: 'active'
});

after(() => {
  closeRosterDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('persists authoritative roster relationships and constraints', () => {
  assert.deepEqual(repository.listClasses().map(item => item.id), [primaryClass.id]);
  const targetClass = repository.createClass({
    name: '测试转入班',
    grade: '七年级',
    term: '2026 秋季学期',
    headTeacher: '测试教师',
    status: 'active'
  });
  const monitorRole = repository.listCommitteeRoles().find(role => role.name === '班长');
  assert.ok(monitorRole);
  const sportsRole = repository.createCommitteeRole('体育委员');
  const first = repository.createStudent({
    studentId: 'sqlite-test-student-1',
    classId: primaryClass.id,
    studentNo: '5001',
    name: '测试学生甲',
    gender: 'female',
    committeeRoleIds: [monitorRole.id, sportsRole.id]
  });
  assert.deepEqual(first.committeeRoleIds, [monitorRole.id, sportsRole.id]);

  const fiveClass = repository.listClasses().find(item => item.id === primaryClass.id);
  assert.equal(fiveClass?.studentCount, 1);

  assert.throws(() => repository.createStudent({
    classId: primaryClass.id,
    studentNo: '5001',
    name: '重复学号'
  }), /DUPLICATE_STUDENT_NO/);

  const second = repository.createStudent({
    studentId: 'sqlite-test-student-2',
    classId: primaryClass.id,
    studentNo: '5002',
    name: '测试学生乙'
  });
  const match = repository.matchSubmissions(primaryClass.id, ['5001', '5001', '9999']);
  assert.deepEqual(match.matched.map(item => item.studentId), [first.studentId]);
  assert.deepEqual(match.missing.map(item => item.studentId), [second.studentId]);
  assert.deepEqual(match.unknownStudentNos, ['9999']);
  assert.deepEqual(match.duplicateStudentNos, ['5001']);

  repository.replaceClassCommitteeAssignments(primaryClass.id, [
    { studentId: first.studentId, roleId: sportsRole.id },
    { studentId: second.studentId, roleId: sportsRole.id }
  ]);
  assert.deepEqual(repository.findStudentByNo(primaryClass.id, '5001')?.committeeRoleIds, [sportsRole.id]);
  assert.deepEqual(repository.findStudentByNo(primaryClass.id, '5002')?.committeeRoleIds, [sportsRole.id]);
  assert.throws(() => repository.deleteCommitteeRole(sportsRole.id), /COMMITTEE_ROLE_IN_USE/);
  assert.throws(() => repository.deleteCommitteeRole(monitorRole.id), /DEFAULT_COMMITTEE_ROLE/);

  const moved = repository.updateStudent(second.studentId, {
    classId: targetClass.id,
    studentNo: '3999',
    name: second.name,
    gender: second.gender,
    committeeRoleIds: second.committeeRoleIds,
    status: second.status,
    behaviorTags: second.behaviorTags,
    parent: second.parent,
    familyStatus: second.familyStatus,
    observationHistory: second.observationHistory,
    strongKnowledge: second.strongKnowledge,
    weakKnowledge: second.weakKnowledge,
    recentHomeworkTrend: second.recentHomeworkTrend,
    homeworkHistory: second.homeworkHistory
  });
  assert.equal(moved?.classId, targetClass.id);
  assert.deepEqual(moved?.committeeRoleIds, []);
});

test('database remains readable after the repository connection closes', () => {
  closeRosterDatabase();
  const reopened = new Database(databasePath, { readonly: true });
  const student = reopened.prepare('SELECT name FROM students WHERE id = ?').get('sqlite-test-student-1') as { name: string };
  assert.equal(student.name, '测试学生甲');
  reopened.close();
});

test('two parent contacts persist and legacy writes retain the second contact',()=>{
 const parent={name:'第一家长',phone:'10001',relation:'母亲',remark:'先联系'};
 const secondaryParent={name:'第二家长',phone:'10002',relation:'父亲',remark:'备用'};
 const created=repository.createStudent({classId:primaryClass.id,studentNo:'contact-test',name:'联系人测试',parent,secondaryParent});
 assert.deepEqual(created.parent,parent);assert.deepEqual(created.secondaryParent,secondaryParent);
 const {secondaryParent:_,...legacy}=created;
 repository.updateStudent(created.studentId,{...legacy,name:'修改姓名'});
 assert.deepEqual(repository.listStudents(primaryClass.id).find(s=>s.studentId===created.studentId)?.secondaryParent,secondaryParent);
 const empty={name:'',phone:'',relation:'',remark:''};
 assert.deepEqual(repository.updateStudent(created.studentId,{...created,secondaryParent:empty})?.secondaryParent,empty);
});
