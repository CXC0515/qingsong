/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import { z } from 'zod';
import { SchoolClass } from '../../src/domain/types';
import { applyRosterImport, previewRosterImport, RosterImportField } from '../services/roster/rosterImportService';
import {
  StudentWriteInput,
  createCommitteeRole,
  createClass,
  createStudent,
  deleteCommitteeRole,
  findStudentByNo,
  getRosterSnapshot,
  listClasses,
  listCommitteeRoles,
  listStudents,
  matchSubmissions,
  replaceClassCommitteeAssignments,
  toggleClassArchive,
  updateClass,
  updateCommitteeRole,
  updateStudent,
  withdrawStudent
} from '../repositories/rosterRepository';

const router = Router();

const classWriteSchema = z.object({
  name: z.string().trim().min(1),
  grade: z.string().trim().min(1),
  term: z.string().trim().min(1),
  headTeacher: z.string().trim().min(1),
  status: z.enum(['active', 'archived'])
});

const classPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  grade: z.string().trim().min(1).optional(),
  term: z.string().trim().min(1).optional(),
  headTeacher: z.string().trim().min(1).optional(),
  status: z.enum(['active', 'archived']).optional()
});

const parentInfoSchema = z.object({name:z.string().max(100),phone:z.string().max(100),relation:z.string().max(100),remark:z.string().max(4000)});
const studentWriteSchema = z.object({
  parent: parentInfoSchema.optional(),
  secondaryParent: parentInfoSchema.optional(),
  studentId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  studentNo: z.string().trim().min(1).max(40),
  classId: z.string().trim().min(1),
  gender: z.enum(['male', 'female']).optional(),
  enrollmentStatus: z.enum(['active', 'transferred', 'withdrawn', 'suspended']).optional(),
  committeeRoleIds: z.array(z.string().trim().min(1)).max(30).optional()
}).passthrough();

const committeeRoleSchema = z.object({ name: z.string().trim().min(1).max(30) });
const committeeAssignmentsSchema = z.object({
  assignments: z.array(z.object({
    studentId: z.string().trim().min(1),
    roleId: z.string().trim().min(1)
  })).max(1000)
});

const importFields = ['studentNo', 'name', 'gender', 'parentName', 'parentPhone', 'parentRelation', 'parentRemark'] as const satisfies readonly RosterImportField[];
const importGridSchema = z.object({
  headers: z.array(z.string().max(100)).min(1).max(50),
  rows: z.array(z.array(z.string().max(1000)).max(50)).min(1).max(500),
  mapping: z.record(z.string(), z.enum(importFields).nullable()).optional()
});

const submissionMatchSchema = z.object({
  studentNos: z.array(z.string()).max(1000)
});

const sendRepositoryError = (response: Parameters<Parameters<typeof router.post>[1]>[1], error: unknown) => {
  const code = error instanceof Error ? error.message : 'ROSTER_WRITE_FAILED';
  const status = ['CLASS_NOT_FOUND', 'STUDENT_NOT_FOUND', 'COMMITTEE_ROLE_NOT_FOUND'].includes(code)
    ? 404
    : code.startsWith('DUPLICATE_') || ['COMMITTEE_ROLE_IN_USE', 'DEFAULT_COMMITTEE_ROLE', 'COMMITTEE_STUDENT_NOT_IN_CLASS'].includes(code)
      ? 409
      : 500;
  response.status(status).json({ code });
};

router.get('/roster', (_request, response) => response.json(getRosterSnapshot()));
router.get('/classes', (_request, response) => response.json({ classes: listClasses() }));
router.get('/committee-roles', (_request, response) => response.json({ roles: listCommitteeRoles() }));

router.post('/committee-roles', (request, response) => {
  const parsed = committeeRoleSchema.safeParse(request.body);
  if (!parsed.success) return void response.status(400).json({ code: 'INVALID_COMMITTEE_ROLE', issues: parsed.error.issues });
  try {
    response.status(201).json({ role: createCommitteeRole(parsed.data.name) });
  } catch (error) {
    sendRepositoryError(response, error);
  }
});

router.patch('/committee-roles/:roleId', (request, response) => {
  const parsed = committeeRoleSchema.safeParse(request.body);
  if (!parsed.success) return void response.status(400).json({ code: 'INVALID_COMMITTEE_ROLE', issues: parsed.error.issues });
  try {
    const role = updateCommitteeRole(request.params.roleId, parsed.data.name);
    if (!role) return void response.status(404).json({ code: 'COMMITTEE_ROLE_NOT_FOUND' });
    response.json({ role });
  } catch (error) {
    sendRepositoryError(response, error);
  }
});

router.delete('/committee-roles/:roleId', (request, response) => {
  try {
    if (!deleteCommitteeRole(request.params.roleId)) return void response.status(404).json({ code: 'COMMITTEE_ROLE_NOT_FOUND' });
    response.status(204).end();
  } catch (error) {
    sendRepositoryError(response, error);
  }
});

router.post('/classes', (request, response) => {
  const parsed = classWriteSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: 'INVALID_CLASS', issues: parsed.error.issues });
    return;
  }
  try {
    response.status(201).json({ schoolClass: createClass(parsed.data) });
  } catch (error) {
    sendRepositoryError(response, error);
  }
});

router.patch('/classes/:classId', (request, response) => {
  const parsed = classPatchSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: 'INVALID_CLASS', issues: parsed.error.issues });
    return;
  }
  const schoolClass = updateClass(request.params.classId, parsed.data as Partial<SchoolClass>);
  if (!schoolClass) {
    response.status(404).json({ code: 'CLASS_NOT_FOUND' });
    return;
  }
  response.json({ schoolClass });
});

router.post('/classes/:classId/archive', (request, response) => {
  const schoolClass = toggleClassArchive(request.params.classId);
  if (!schoolClass) {
    response.status(404).json({ code: 'CLASS_NOT_FOUND' });
    return;
  }
  response.json({ schoolClass });
});

router.put('/classes/:classId/committee-assignments', (request, response) => {
  const parsed = committeeAssignmentsSchema.safeParse(request.body);
  if (!parsed.success) return void response.status(400).json({ code: 'INVALID_COMMITTEE_ASSIGNMENTS', issues: parsed.error.issues });
  try {
    response.json({ students: replaceClassCommitteeAssignments(request.params.classId, parsed.data.assignments) });
  } catch (error) {
    sendRepositoryError(response, error);
  }
});

router.get('/classes/:classId/students', (request, response) => {
  if (!listClasses().some(item => item.id === request.params.classId)) {
    response.status(404).json({ code: 'CLASS_NOT_FOUND' });
    return;
  }
  response.json({ students: listStudents(request.params.classId) });
});

router.get('/classes/:classId/student-by-no/:studentNo', (request, response) => {
  const student = findStudentByNo(request.params.classId, request.params.studentNo.trim());
  if (!student) {
    response.status(404).json({ code: 'STUDENT_NOT_FOUND' });
    return;
  }
  response.json({ student });
});

router.post('/classes/:classId/students/import/preview', (request, response) => {
  const parsed = importGridSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: 'INVALID_IMPORT', issues: parsed.error.issues });
    return;
  }
  if (!listClasses().some(item => item.id === request.params.classId)) {
    response.status(404).json({ code: 'CLASS_NOT_FOUND' });
    return;
  }
  response.json(previewRosterImport(request.params.classId, parsed.data));
});

router.post('/classes/:classId/students/import', (request, response) => {
  const parsed = importGridSchema.safeParse(request.body);
  if (!parsed.success) return void response.status(400).json({ code: 'INVALID_IMPORT', issues: parsed.error.issues });
  if (!listClasses().some(item => item.id === request.params.classId)) return void response.status(404).json({ code: 'CLASS_NOT_FOUND' });
  const result = applyRosterImport(request.params.classId, parsed.data);
  response.status(result.created.length || result.updated.length ? 200 : 422).json(result);
});

router.post('/classes/:classId/submission-match', (request, response) => {
  const parsed = submissionMatchSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: 'INVALID_STUDENT_NOS', issues: parsed.error.issues });
    return;
  }
  if (!listClasses().some(item => item.id === request.params.classId)) {
    response.status(404).json({ code: 'CLASS_NOT_FOUND' });
    return;
  }
  response.json(matchSubmissions(request.params.classId, parsed.data.studentNos));
});

router.get('/students', (request, response) => {
  const classId = typeof request.query.classId === 'string' ? request.query.classId : undefined;
  response.json({ students: listStudents(classId) });
});

router.post('/students', (request, response) => {
  const parsed = studentWriteSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: 'INVALID_STUDENT', issues: parsed.error.issues });
    return;
  }
  try {
    response.status(201).json({ student: createStudent(parsed.data as StudentWriteInput) });
  } catch (error) {
    sendRepositoryError(response, error);
  }
});

router.patch('/students/:studentId', (request, response) => {
  const parsed = studentWriteSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: 'INVALID_STUDENT', issues: parsed.error.issues });
    return;
  }
  try {
    const student = updateStudent(request.params.studentId, parsed.data as StudentWriteInput);
    if (!student) {
      response.status(404).json({ code: 'STUDENT_NOT_FOUND' });
      return;
    }
    response.json({ student });
  } catch (error) {
    sendRepositoryError(response, error);
  }
});

router.delete('/students/:studentId', (request, response) => {
  if (!withdrawStudent(request.params.studentId)) {
    response.status(404).json({ code: 'STUDENT_NOT_FOUND' });
    return;
  }
  response.status(204).end();
});

export default router;
