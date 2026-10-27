/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'demo-classroom-sqlite-'));
process.env.ROSTER_DB_PATH = path.join(temporaryDirectory, 'roster.sqlite');

const roster = await import('./rosterRepository');
const classroom = await import('./classroomRepository');
const { closeRosterDatabase } = await import('../database/rosterDatabase');
const primaryClass = roster.createClass({
  name: '座位测试一班',
  grade: '七年级',
  term: '2026 秋季学期',
  headTeacher: '测试教师',
  status: 'active'
});

after(() => {
  closeRosterDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('saves a real classroom layout and enforces class membership', () => {
  const first = roster.createStudent({ studentId: 'seat-student-1', classId: primaryClass.id, studentNo: '5001', name: '座位学生甲' });
  const second = roster.createStudent({ studentId: 'seat-student-2', classId: primaryClass.id, studentNo: '5002', name: '座位学生乙' });
  const otherClass = roster.createClass({
    name: '座位测试二班',
    grade: '七年级',
    term: '2026 秋季学期',
    headTeacher: '测试教师',
    status: 'active'
  });
  const outsider = roster.createStudent({ studentId: 'seat-outsider', classId: otherClass.id, studentNo: '6001', name: '外班学生' });

  assert.deepEqual(classroom.getClassroomLayout(primaryClass.id), {
    classId: primaryClass.id,
    rowCount: 8,
    columnCount: 7,
    seats: []
  });

  const saved = classroom.saveClassroomLayout(primaryClass.id, {
    rowCount: 5,
    columnCount: 6,
    seats: [
      { seatIndex: 0, studentId: first.studentId },
      { seatIndex: 7, studentId: second.studentId }
    ]
  });
  assert.equal(saved?.rowCount, 5);
  assert.deepEqual(saved?.seats, [
    { seatIndex: 0, studentId: first.studentId },
    { seatIndex: 7, studentId: second.studentId }
  ]);

  assert.throws(() => classroom.saveClassroomLayout(primaryClass.id, {
    rowCount: 5,
    columnCount: 6,
    seats: [{ seatIndex: 0, studentId: outsider.studentId }]
  }), /CLASSROOM_STUDENT_NOT_IN_CLASS/);
  assert.throws(() => classroom.saveClassroomLayout(primaryClass.id, {
    rowCount: 5,
    columnCount: 6,
    seats: [
      { seatIndex: 0, studentId: first.studentId },
      { seatIndex: 0, studentId: second.studentId }
    ]
  }), /DUPLICATE_CLASSROOM_SEAT/);
});

test('podium seats persist without changing grid assignments',()=>{
  const students=['左一','左二','右一','右二'].map((name,index)=>roster.createStudent({classId:primaryClass.id,studentNo:'podium-'+index,name}));
  const saved=classroom.saveClassroomLayout(primaryClass.id,{rowCount:2,columnCount:2,seats:students.map((student,index)=>({seatIndex:120+index,studentId:student.studentId}))});
  assert.deepEqual(saved?.seats.map(seat=>seat.seatIndex),[120,121,122,123]);
  assert.equal(classroom.getClassroomLayout(primaryClass.id)?.seats.length,4);
  assert.throws(()=>classroom.saveClassroomLayout(primaryClass.id,{rowCount:2,columnCount:2,seats:[{seatIndex:124,studentId:students[0].studentId}]}),/OUT_OF_RANGE/);
});

test('removes the seat when a student leaves the class', () => {
  const student = roster.findStudentByNo(primaryClass.id, '5001');
  assert.ok(student);
  roster.updateStudent(student.studentId, {
    ...student,
    classId: roster.listClasses().find(item => item.id !== primaryClass.id)!.id,
    studentNo: '6002'
  });
  assert.equal(classroom.getClassroomLayout(primaryClass.id)?.seats.some(seat => seat.studentId === student.studentId), false);
});
