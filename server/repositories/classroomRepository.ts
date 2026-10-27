/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClassroomLayout, ClassroomSeatAssignment } from '../../src/domain/types';
import { getRosterDatabase } from '../database/rosterDatabase';

interface LayoutRow {
  class_id: string;
  row_count: number;
  column_count: number;
  updated_at: string;
}

interface SeatRow {
  seat_index: number;
  student_id: string;
}

export interface ClassroomLayoutWriteInput {
  rowCount: number;
  columnCount: number;
  seats: ClassroomSeatAssignment[];
}

const database = getRosterDatabase();
const defaultLayout = (classId: string): ClassroomLayout => ({
  classId,
  rowCount: 8,
  columnCount: 7,
  seats: []
});

const classExists = (classId: string) => Boolean(database.prepare('SELECT id FROM classes WHERE id = ?').get(classId));

export const getClassroomLayout = (classId: string): ClassroomLayout | null => {
  if (!classExists(classId)) return null;
  const layout = database.prepare('SELECT * FROM classroom_layouts WHERE class_id = ?').get(classId) as LayoutRow | undefined;
  if (!layout) return defaultLayout(classId);
  const seats = database.prepare(`
    SELECT seat_index, student_id FROM classroom_seats WHERE class_id = ? ORDER BY seat_index
  `).all(classId) as SeatRow[];
  return {
    classId: layout.class_id,
    rowCount: layout.row_count,
    columnCount: layout.column_count,
    seats: seats.map(seat => ({ seatIndex: seat.seat_index, studentId: seat.student_id })),
    updatedAt: layout.updated_at
  };
};

const assertValidAssignments = (classId: string, input: ClassroomLayoutWriteInput) => {
  const capacity = input.rowCount * input.columnCount;
  const seatIndexes = new Set<number>();
  const studentIds = new Set<string>();
  for (const seat of input.seats) {
    if (!Number.isInteger(seat.seatIndex) || seat.seatIndex < 0 || (seat.seatIndex >= capacity && (seat.seatIndex < 120 || seat.seatIndex > 123))) throw new Error('CLASSROOM_SEAT_OUT_OF_RANGE');
    if (seatIndexes.has(seat.seatIndex)) throw new Error('DUPLICATE_CLASSROOM_SEAT');
    if (studentIds.has(seat.studentId)) throw new Error('DUPLICATE_CLASSROOM_STUDENT');
    seatIndexes.add(seat.seatIndex);
    studentIds.add(seat.studentId);
  }

  if (!studentIds.size) return;
  const visibleStudents = database.prepare(`
    SELECT student_id FROM class_memberships
    WHERE class_id = ? AND status IN ('active', 'suspended')
  `).all(classId) as { student_id: string }[];
  const allowed = new Set(visibleStudents.map(item => item.student_id));
  if ([...studentIds].some(studentId => !allowed.has(studentId))) throw new Error('CLASSROOM_STUDENT_NOT_IN_CLASS');
};

export const saveClassroomLayout = (classId: string, input: ClassroomLayoutWriteInput): ClassroomLayout | null => {
  if (!classExists(classId)) return null;
  assertValidAssignments(classId, input);
  const now = new Date().toISOString();
  const saveLayout = database.prepare(`
    INSERT INTO classroom_layouts (class_id, row_count, column_count, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(class_id) DO UPDATE SET
      row_count = excluded.row_count,
      column_count = excluded.column_count,
      updated_at = excluded.updated_at
  `);
  const insertSeat = database.prepare(`
    INSERT INTO classroom_seats (class_id, seat_index, student_id) VALUES (?, ?, ?)
  `);

  database.transaction(() => {
    database.prepare('DELETE FROM classroom_seats WHERE class_id = ?').run(classId);
    saveLayout.run(classId, input.rowCount, input.columnCount, now);
    input.seats.forEach(seat => insertSeat.run(classId, seat.seatIndex, seat.studentId));
  })();
  return getClassroomLayout(classId);
};
