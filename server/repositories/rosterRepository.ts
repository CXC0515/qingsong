/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { CommitteeAssignment, CommitteeRole, EnrollmentStatus, RosterSnapshot, RosterStudent, SchoolClass, Student } from '../../src/domain/types';
import { getRosterDatabase } from '../database/rosterDatabase';

type StudentDetails = Omit<Student, 'id' | 'name' | 'studentNo' | 'classId' | 'className' | 'gender' | 'committeeRoleIds' | 'status'>;

interface ClassRow {
  id: string;
  name: string;
  grade: string;
  term: string;
  head_teacher: string;
  textbook_version: string;
  default_submit_time: string;
  status: SchoolClass['status'];
  student_count: number | null;
}

interface StudentRow {
  student_id: string;
  name: string;
  gender: Student['gender'];
  student_status: Student['status'];
  profile_json: string;
  membership_id: string;
  class_id: string;
  class_name: string;
  student_no: string;
  enrollment_status: EnrollmentStatus;
  joined_at: string;
  left_at: string | null;
}

interface MembershipRow {
  id: string;
  class_id: string;
  student_id: string;
  student_no: string;
  status: EnrollmentStatus;
  joined_at: string;
  left_at: string | null;
}

export interface StudentWriteInput {
  studentId?: string;
  name: string;
  studentNo: string;
  classId: string;
  gender?: 'male' | 'female';
  enrollmentStatus?: EnrollmentStatus;
  committeeRoleIds?: string[];
  status?: Student['status'];
  behaviorTags?: string[];
  parent?: Student['parent'];
  secondaryParent?: Student['secondaryParent'];
  familyStatus?: Student['familyStatus'];
  familyStatusTag?: string;
  observationHistory?: Student['observationHistory'];
  strongKnowledge?: string[];
  weakKnowledge?: string[];
  recentHomeworkTrend?: number[];
  homeworkHistory?: Student['homeworkHistory'];
  weaknessEvidence?: Student['weaknessEvidence'];
}

const database = getRosterDatabase();

const isVisibleStatus = (status: EnrollmentStatus) => status === 'active' || status === 'suspended';

const getClassRow = (classId: string) => database.prepare('SELECT * FROM classes WHERE id = ?').get(classId) as ClassRow | undefined;

const toClassView = (row: ClassRow): SchoolClass => ({
    id: row.id,
    name: row.name,
    grade: row.grade,
    term: row.term,
    headTeacher: row.head_teacher,
    studentCount: row.student_count ?? 0,
    status: row.status
});

const defaultDetails = (): StudentDetails => ({
  behaviorTags: [],
  parent: { name: '', phone: '', relation: '', remark: '' },
  familyStatus: 'normal',
  observationHistory: [],
  strongKnowledge: [],
  weakKnowledge: [],
  recentHomeworkTrend: [],
  homeworkHistory: []
});

const parseDetails = (json: string): StudentDetails => {
  try {
    return { ...defaultDetails(), ...(JSON.parse(json) as Partial<StudentDetails>) };
  } catch {
    return defaultDetails();
  }
};

const toRosterStudent = (row: StudentRow, committeeRoleIds: string[] = []): RosterStudent => ({
  ...parseDetails(row.profile_json),
  id: row.student_id,
  studentId: row.student_id,
  name: row.name,
  gender: row.gender,
  status: row.student_status,
  studentNo: row.student_no,
  classId: row.class_id,
  className: row.class_name,
  committeeRoleIds,
  enrollmentStatus: row.enrollment_status
});

const studentSelect = `
  SELECT
    s.id AS student_id,
    s.name,
    s.gender,
    s.status AS student_status,
    s.profile_json,
    m.id AS membership_id,
    m.class_id,
    c.name AS class_name,
    m.student_no,
    m.status AS enrollment_status,
    m.joined_at,
    m.left_at
  FROM class_memberships m
  JOIN students s ON s.id = m.student_id
  JOIN classes c ON c.id = m.class_id
`;

const listJoinedStudents = (classId?: string, includeInactive = false) => {
  const conditions: string[] = [];
  const parameters: string[] = [];
  if (classId) {
    conditions.push('m.class_id = ?');
    parameters.push(classId);
  }
  if (!includeInactive) conditions.push("m.status IN ('active', 'suspended')");
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = database.prepare(`${studentSelect} ${where} ORDER BY m.joined_at DESC, m.rowid DESC`).all(...parameters) as StudentRow[];
  const assignments = database.prepare(`
    SELECT class_id AS classId, student_id AS studentId, role_id AS roleId FROM committee_assignments
    ${classId ? 'WHERE class_id = ?' : ''}
    ORDER BY created_at, rowid
  `).all(...(classId ? [classId] : [])) as CommitteeAssignment[];
  const rolesByMembership = new Map<string, string[]>();
  assignments.forEach(item => {
    const key = `${item.classId}:${item.studentId}`;
    rolesByMembership.set(key, [...(rolesByMembership.get(key) ?? []), item.roleId]);
  });
  return rows.map(row => toRosterStudent(row, rolesByMembership.get(`${row.class_id}:${row.student_id}`) ?? []));
};

const createDetails = (input: StudentWriteInput): StudentDetails => ({
  behaviorTags: input.behaviorTags ?? [],
  parent: input.parent ?? { name: '', phone: '', relation: '', remark: '' },
  secondaryParent: input.secondaryParent,
  familyStatus: input.familyStatus ?? 'normal',
  familyStatusTag: input.familyStatusTag,
  observationHistory: input.observationHistory ?? [],
  strongKnowledge: input.strongKnowledge ?? [],
  weakKnowledge: input.weakKnowledge ?? [],
  recentHomeworkTrend: input.recentHomeworkTrend ?? [],
  homeworkHistory: input.homeworkHistory ?? [],
  weaknessEvidence: input.weaknessEvidence
});

const assertClassExists = (classId: string) => {
  if (!getClassRow(classId)) throw new Error('CLASS_NOT_FOUND');
};

const assertUniqueStudentNo = (classId: string, studentNo: string, ignoredMembershipId?: string) => {
  const duplicate = database.prepare(`
    SELECT id FROM class_memberships WHERE class_id = ? AND student_no = ? AND id != COALESCE(?, '')
  `).get(classId, studentNo, ignoredMembershipId ?? null);
  if (duplicate) throw new Error('DUPLICATE_STUDENT_NO');
};

const refreshClassCount = (classId: string) => {
  database.prepare(`
    UPDATE classes
    SET student_count = (
      SELECT COUNT(*) FROM class_memberships WHERE class_id = ? AND status = 'active'
    ), updated_at = ?
    WHERE id = ?
  `).run(classId, new Date().toISOString(), classId);
};

export const getRosterSnapshot = (): RosterSnapshot => ({
  classes: listClasses(),
  students: listJoinedStudents(),
  committeeRoles: listCommitteeRoles()
});

export const listCommitteeRoles = (): CommitteeRole[] => database.prepare(`
  SELECT id, name, sort_order AS sortOrder, is_default AS isDefault
  FROM committee_roles ORDER BY sort_order, created_at, rowid
`).all().map(row => {
  const typed = row as Omit<CommitteeRole, 'isDefault'> & { isDefault: number };
  return { ...typed, isDefault: Boolean(typed.isDefault) };
});

export const createCommitteeRole = (name: string) => {
  const now = new Date().toISOString();
  const role: CommitteeRole = {
    id: randomUUID(),
    name: name.trim(),
    sortOrder: (database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM committee_roles').get() as { next: number }).next,
    isDefault: false
  };
  try {
    database.prepare(`
      INSERT INTO committee_roles (id, name, sort_order, is_default, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?)
    `).run(role.id, role.name, role.sortOrder, now, now);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) throw new Error('DUPLICATE_COMMITTEE_ROLE');
    throw error;
  }
  return role;
};

export const updateCommitteeRole = (roleId: string, name: string) => {
  let result: Database.RunResult;
  try {
    result = database.prepare('UPDATE committee_roles SET name = ?, updated_at = ? WHERE id = ?')
      .run(name.trim(), new Date().toISOString(), roleId);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) throw new Error('DUPLICATE_COMMITTEE_ROLE');
    throw error;
  }
  if (!result.changes) return null;
  return listCommitteeRoles().find(item => item.id === roleId) ?? null;
};

export const deleteCommitteeRole = (roleId: string) => {
  if (database.prepare('SELECT 1 FROM committee_assignments WHERE role_id = ? LIMIT 1').get(roleId)) {
    throw new Error('COMMITTEE_ROLE_IN_USE');
  }
  const role = database.prepare('SELECT is_default FROM committee_roles WHERE id = ?').get(roleId) as { is_default: number } | undefined;
  if (!role) return false;
  if (role.is_default) throw new Error('DEFAULT_COMMITTEE_ROLE');
  database.prepare('DELETE FROM committee_roles WHERE id = ?').run(roleId);
  return true;
};

const assertCommitteeRoles = (roleIds: string[]) => {
  if (!roleIds.length) return;
  const placeholders = roleIds.map(() => '?').join(', ');
  const count = (database.prepare(`SELECT COUNT(*) AS count FROM committee_roles WHERE id IN (${placeholders})`).get(...roleIds) as { count: number }).count;
  if (count !== new Set(roleIds).size) throw new Error('COMMITTEE_ROLE_NOT_FOUND');
};

const replaceStudentCommitteeRoles = (classId: string, studentId: string, roleIds: string[]) => {
  assertCommitteeRoles(roleIds);
  database.prepare('DELETE FROM committee_assignments WHERE class_id = ? AND student_id = ?').run(classId, studentId);
  const insert = database.prepare(`
    INSERT INTO committee_assignments (class_id, student_id, role_id, created_at) VALUES (?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  [...new Set(roleIds)].forEach(roleId => insert.run(classId, studentId, roleId, now));
};

export const replaceClassCommitteeAssignments = (classId: string, assignments: Omit<CommitteeAssignment, 'classId'>[]) => {
  assertClassExists(classId);
  const students = new Set(listJoinedStudents(classId).map(item => item.studentId));
  if (assignments.some(item => !students.has(item.studentId))) throw new Error('COMMITTEE_STUDENT_NOT_IN_CLASS');
  assertCommitteeRoles(assignments.map(item => item.roleId));
  database.transaction(() => {
    database.prepare('DELETE FROM committee_assignments WHERE class_id = ?').run(classId);
    const insert = database.prepare(`
      INSERT INTO committee_assignments (class_id, student_id, role_id, created_at) VALUES (?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    const seen = new Set<string>();
    assignments.forEach(item => {
      const key = `${item.studentId}:${item.roleId}`;
      if (seen.has(key)) return;
      seen.add(key);
      insert.run(classId, item.studentId, item.roleId, now);
    });
  })();
  return listJoinedStudents(classId);
};

export const listClasses = () => {
  const rows = database.prepare('SELECT * FROM classes ORDER BY created_at, rowid').all() as ClassRow[];
  return rows.map(toClassView);
};

export const createClass = (input: Omit<SchoolClass, 'id' | 'studentCount'>) => {
  const schoolClass: SchoolClass = {
    ...input,
    id: randomUUID(),
    name: input.name.trim(),
    term: input.term.trim(),
    studentCount: 0
  };
  const now = new Date().toISOString();
  try {
    database.prepare(`
      INSERT INTO classes (
        id, name, grade, term, head_teacher, textbook_version,
        default_submit_time, status, student_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      schoolClass.id,
      schoolClass.name,
      schoolClass.grade,
      schoolClass.term,
      schoolClass.headTeacher,
      '',
      '08:00',
      schoolClass.status,
      0,
      now,
      now
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) throw new Error('DUPLICATE_CLASS');
    throw error;
  }
  return schoolClass;
};

export const updateClass = (classId: string, patch: Partial<SchoolClass>) => {
  if (!getClassRow(classId)) return null;
  const fieldMap: [keyof SchoolClass, string][] = [
    ['name', 'name'],
    ['grade', 'grade'],
    ['term', 'term'],
    ['headTeacher', 'head_teacher'],
    ['status', 'status']
  ];

  try {
    database.transaction(() => {
      const updates = fieldMap.filter(([key]) => patch[key] !== undefined);
      if (updates.length) {
        const values = updates.map(([key]) => patch[key] as string);
        database.prepare(`
          UPDATE classes SET ${updates.map(([, column]) => `${column} = ?`).join(', ')}, updated_at = ? WHERE id = ?
        `).run(...values, new Date().toISOString(), classId);
      }
    })();
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) throw new Error('DUPLICATE_CLASS');
    throw error;
  }
  return toClassView(getClassRow(classId)!);
};

export const toggleClassArchive = (classId: string) => {
  const row = getClassRow(classId);
  if (!row) return null;
  database.prepare('UPDATE classes SET status = ?, updated_at = ? WHERE id = ?')
    .run(row.status === 'active' ? 'archived' : 'active', new Date().toISOString(), classId);
  return toClassView(getClassRow(classId)!);
};

export const listStudents = (classId?: string) => listJoinedStudents(classId);

export const createStudent = (input: StudentWriteInput) => {
  assertClassExists(input.classId);
  const studentNo = input.studentNo.trim();
  assertUniqueStudentNo(input.classId, studentNo);
  const studentId = input.studentId ?? randomUUID();
  if (database.prepare('SELECT id FROM students WHERE id = ?').get(studentId)) throw new Error('DUPLICATE_STUDENT_ID');
  const membershipId = randomUUID();
  const now = new Date().toISOString();
  assertCommitteeRoles(input.committeeRoleIds ?? []);

  database.transaction(() => {
    database.prepare(`
      INSERT INTO students (id, name, gender, status, profile_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      studentId,
      input.name.trim(),
      input.gender ?? 'male',
      input.status ?? 'good',
      JSON.stringify(createDetails(input)),
      now,
      now
    );
    database.prepare(`
      INSERT INTO class_memberships (
        id, class_id, student_id, student_no, status, joined_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      membershipId,
      input.classId,
      studentId,
      studentNo,
      input.enrollmentStatus ?? 'active',
      now
    );
    replaceStudentCommitteeRoles(input.classId, studentId, input.committeeRoleIds ?? []);
    refreshClassCount(input.classId);
  })();
  return listJoinedStudents(input.classId).find(item => item.studentId === studentId)!;
};

export const updateStudent = (studentId: string, input: StudentWriteInput) => {
  const currentMembership = database.prepare(`
    SELECT * FROM class_memberships
    WHERE student_id = ? AND status IN ('active', 'suspended')
    ORDER BY joined_at DESC, rowid DESC LIMIT 1
  `).get(studentId) as MembershipRow | undefined;
  if (!currentMembership || !database.prepare('SELECT id FROM students WHERE id = ?').get(studentId)) return null;
  assertClassExists(input.classId);
  const studentNo = input.studentNo.trim();
  assertUniqueStudentNo(input.classId, studentNo, currentMembership.class_id === input.classId ? currentMembership.id : undefined);
  assertCommitteeRoles(input.committeeRoleIds ?? []);
  const now = new Date().toISOString();
  const previous = database.prepare('SELECT profile_json FROM students WHERE id = ?').get(studentId) as {profile_json:string};
  const details = createDetails({...input, secondaryParent: input.secondaryParent ?? parseDetails(previous.profile_json).secondaryParent});

  database.transaction(() => {
    database.prepare(`
      UPDATE students SET name = ?, gender = ?, status = ?, profile_json = ?, updated_at = ? WHERE id = ?
    `).run(
      input.name.trim(),
      input.gender ?? 'male',
      input.status ?? 'good',
      JSON.stringify(details),
      now,
      studentId
    );
    if (currentMembership.class_id === input.classId) {
      const nextEnrollmentStatus = input.enrollmentStatus ?? currentMembership.status;
      database.prepare(`
        UPDATE class_memberships SET student_no = ?, status = ?, left_at = ? WHERE id = ?
      `).run(
        studentNo,
        nextEnrollmentStatus,
        isVisibleStatus(nextEnrollmentStatus) ? null : now,
        currentMembership.id
      );
      replaceStudentCommitteeRoles(input.classId, studentId, isVisibleStatus(nextEnrollmentStatus) ? input.committeeRoleIds ?? [] : []);
    } else {
      database.prepare(`
        UPDATE class_memberships SET status = 'transferred', left_at = ? WHERE id = ?
      `).run(now, currentMembership.id);
      database.prepare(`
        INSERT INTO class_memberships (
          id, class_id, student_id, student_no, status, joined_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), input.classId, studentId, studentNo, input.enrollmentStatus ?? 'active', now);
      replaceStudentCommitteeRoles(input.classId, studentId, []);
    }
    refreshClassCount(currentMembership.class_id);
    refreshClassCount(input.classId);
  })();
  return listJoinedStudents(input.classId).find(item => item.studentId === studentId) ?? null;
};

export const withdrawStudent = (studentId: string) => {
  const membership = database.prepare(`
    SELECT id, class_id FROM class_memberships
    WHERE student_id = ? AND status IN ('active', 'suspended')
    ORDER BY joined_at DESC, rowid DESC LIMIT 1
  `).get(studentId) as { id: string; class_id: string } | undefined;
  if (!membership) return false;
  database.transaction(() => {
    database.prepare(`
      UPDATE class_memberships SET status = 'withdrawn', left_at = ? WHERE id = ?
    `).run(new Date().toISOString(), membership.id);
    refreshClassCount(membership.class_id);
  })();
  return true;
};

export const findStudentByNo = (classId: string, studentNo: string) => {
  return listJoinedStudents(classId).find(student => student.studentNo === studentNo) ?? null;
};

export const matchSubmissions = (classId: string, submittedStudentNos: string[]) => {
  const roster = listJoinedStudents(classId).filter(item => item.enrollmentStatus === 'active');
  const counts = new Map<string, number>();
  submittedStudentNos.map(item => item.trim()).filter(Boolean).forEach(studentNo => {
    counts.set(studentNo, (counts.get(studentNo) ?? 0) + 1);
  });
  const rosterByNo = new Map(roster.map(student => [student.studentNo, student]));
  return {
    matched: [...counts.keys()].flatMap(studentNo => rosterByNo.get(studentNo) ?? []),
    missing: roster.filter(student => !counts.has(student.studentNo)),
    unknownStudentNos: [...counts.keys()].filter(studentNo => !rosterByNo.has(studentNo)),
    duplicateStudentNos: [...counts.entries()].filter(([, count]) => count > 1).map(([studentNo]) => studentNo)
  };
};
