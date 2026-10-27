/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import ExcelJS from 'exceljs';
import { ClassroomLayout, Student } from '../../../src/domain/types';

const excelRowLabel = (visualRow: number) => {
  let value = visualRow + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
};

export const buildClassroomWorkbook = async (
  className: string,
  layout: ClassroomLayout,
  students: Student[],
  includeStudentNo = true
) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AI 教师工作台';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('座位表', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
  });
  const studentById = new Map(students.map(student => [student.id, student]));
  const assignmentBySeat = new Map(layout.seats.map(seat => [seat.seatIndex, seat.studentId]));

  worksheet.mergeCells(1, 1, 1, layout.columnCount + 1);
  const title = worksheet.getCell(1, 1);
  title.value = `${className}座位表（讲台视角）`;
  title.font = { name: '微软雅黑', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
  worksheet.getRow(1).height = 28;

  worksheet.getCell(2, 1).value = '行 / 列';
  for (let column = 0; column < layout.columnCount; column += 1) {
    worksheet.getCell(2, column + 2).value = column + 1;
  }

  for (let visualRow = 0; visualRow < layout.rowCount; visualRow += 1) {
    const sheetRow = visualRow + 3;
    worksheet.getCell(sheetRow, 1).value = excelRowLabel(visualRow);
    for (let column = 0; column < layout.columnCount; column += 1) {
      const logicalRow = layout.rowCount - 1 - visualRow;
      const seatIndex = logicalRow * layout.columnCount + column;
      const student = studentById.get(assignmentBySeat.get(seatIndex) ?? '');
      worksheet.getCell(sheetRow, column + 2).value = student
        ? includeStudentNo ? `${student.name}（${student.studentNo}）` : student.name
        : null;
    }
    worksheet.getRow(sheetRow).height = 34;
  }

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } } as const;
  const border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  } as const;
  for (let row = 2; row <= layout.rowCount + 2; row += 1) {
    for (let column = 1; column <= layout.columnCount + 1; column += 1) {
      const cell = worksheet.getCell(row, column);
      cell.font = { name: '微软雅黑', size: 11, bold: row === 2 || column === 1 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = border;
      if (row === 2 || column === 1) cell.fill = headerFill;
    }
  }
  worksheet.getColumn(1).width = 10;
  for (let column = 2; column <= layout.columnCount + 1; column += 1) worksheet.getColumn(column).width = 18;
  const podiumRow=layout.rowCount+4;
  worksheet.getCell(podiumRow,1).value='讲台旁';
  ['左1座','左2座','讲台','右1座','右2座'].forEach((label,index)=>{
    const column=index+2;
    worksheet.getCell(podiumRow,column).value=label;
    const seatIndex=[120,121,-1,122,123][index];
    const student=studentById.get(assignmentBySeat.get(seatIndex) ?? '');
    worksheet.getCell(podiumRow+1,column).value=student ? includeStudentNo ? `${student.name}（${student.studentNo}）` : student.name : null;
    worksheet.getColumn(column).width=18;
    for(const row of [podiumRow,podiumRow+1]){
      const cell=worksheet.getCell(row,column);cell.border=border;cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
      cell.font={name:'微软雅黑',size:11,bold:row===podiumRow};if(row===podiumRow)cell.fill=headerFill;
    }
  });
  worksheet.getRow(podiumRow+1).height=34;

  return Buffer.from(await workbook.xlsx.writeBuffer());
};

export const getExcelRowLabel = excelRowLabel;
