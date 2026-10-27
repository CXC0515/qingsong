/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { Student } from '../../../src/domain/types';
import { buildClassroomWorkbook, getExcelRowLabel } from './classroomWorkbook';

const student = (id: string, name: string, studentNo: string): Student => ({
  id,
  name,
  studentNo,
  classId: 'c5',
  className: '五年级一班',
  gender: 'male',
  committeeRoleIds: [],
  status: 'good',
  behaviorTags: [],
  parent: { name: '', phone: '', relation: '', remark: '' },
  familyStatus: 'normal',
  observationHistory: [],
  strongKnowledge: [],
  weakKnowledge: [],
  recentHomeworkTrend: [],
  homeworkHistory: []
});

test('exports the teacher-view seat order and leaves empty seats blank', async () => {
  const buffer = await buildClassroomWorkbook('五年级一班', {
    classId: 'c5',
    rowCount: 8,
    columnCount: 7,
    seats: [
      { seatIndex: 49, studentId: 'back-left' },
      { seatIndex: 0, studentId: 'front-left' }
    ]
  }, [
    student('back-left', '后排同学', '5001'),
    student('front-left', '前排同学', '5002')
  ]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('座位表');
  assert.ok(sheet);
  assert.equal(sheet.getCell('A3').value, 'A');
  assert.equal(sheet.getCell('B3').value, '后排同学（5001）');
  assert.equal(sheet.getCell('C3').value, null);
  assert.equal(sheet.getCell('A10').value, 'H');
  assert.equal(sheet.getCell('B10').value, '前排同学（5002）');
  assert.deepEqual(Array.from({ length: 7 }, (_, index) => sheet.getCell(2, index + 2).value), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(getExcelRowLabel(25), 'Z');
  assert.equal(getExcelRowLabel(26), 'AA');
});

test('can export names without student numbers', async () => {
  const buffer = await buildClassroomWorkbook('五年级一班', {
    classId: 'c5', rowCount: 1, columnCount: 1, seats: [{ seatIndex: 0, studentId: 'student' }]
  }, [student('student', '只显示姓名', '5003')], false);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.equal(workbook.getWorksheet('座位表')?.getCell('B3').value, '只显示姓名');
});

test('exports all four podium seats',async()=>{
 const students=[0,1,2,3].map(i=>student('podium-'+i,'讲台学生'+i,'p'+i));
 const buffer=await buildClassroomWorkbook('一班',{classId:'c',rowCount:1,columnCount:1,seats:students.map((s,i)=>({seatIndex:120+i,studentId:s.id}))},students,false);
 const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);const sheet=book.getWorksheet('座位表')!;
 assert.deepEqual([2,3,5,6].map(col=>sheet.getCell(6,col).value),students.map(s=>s.name));
 assert.equal(sheet.getCell(5,4).value,'讲台');
});
