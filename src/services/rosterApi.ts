/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommitteeAssignment, CommitteeRole, RosterSnapshot, RosterStudent, SchoolClass, Student } from '../domain/types';
import { apiFetch } from './apiClient';

export type RosterImportField = 'studentNo' | 'name' | 'gender' | 'parentName' | 'parentPhone' | 'parentRelation' | 'parentRemark';
export type RosterImportMapping = Record<number, RosterImportField | null>;
export interface RosterImportGrid { headers: string[]; rows: string[][]; mapping?: RosterImportMapping; }
export interface RosterImportPreviewRow {
  row: number;
  action: 'create' | 'update' | 'conflict' | 'invalid';
  studentNo: string;
  name: string;
  targetStudentId?: string;
  changes: string[];
  message?: string;
  values: Partial<Record<RosterImportField, string>>;
}
export interface RosterImportPreview { mapping: RosterImportMapping; rows: RosterImportPreviewRow[]; }

export interface RosterImportResult {
  created: RosterStudent[];
  updated: RosterStudent[];
  rejected: { row: number; studentNo: string; code: string }[];
}

class RosterRequestError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = 'RosterRequestError';
  }
}

const readErrorCode = async (response: Response) => {
  const body = await response.json().catch(() => ({})) as { code?: string };
  return body.code ?? `HTTP_${response.status}`;
};

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await apiFetch(url, init);
  if (!response.ok) throw new RosterRequestError(response.status, await readErrorCode(response));
  return response.json() as Promise<T>;
};

const isRetryablePreviewError = (error: unknown) => error instanceof TypeError
  || (error instanceof RosterRequestError && [502, 503, 504].includes(error.status));

const wait = (durationMs: number) => new Promise(resolve => setTimeout(resolve, durationMs));

export const describeRosterImportError = (error: unknown, phase: 'preview' | 'import') => {
  if (isRetryablePreviewError(error)) {
    return phase === 'preview'
      ? '连接暂时中断，本次内容尚未保存，请重新预览。'
      : '连接暂时中断，导入结果暂时无法确认。请先刷新名册并核对结果，再决定是否重试。';
  }
  if (error instanceof RosterRequestError) {
    if (error.status === 401) return '登录状态已失效，请重新登录后再试。';
    if (error.status === 413) return '导入内容超过大小限制，请拆分后重试。';
    if (error.code === 'INVALID_IMPORT') return '表格内容或列匹配无效，请检查后重新预览。';
    if (error.status >= 500) return '服务暂时不可用，请稍后重新预览。';
  }
  if (error instanceof Error && !/^HTTP_\d+$/.test(error.message)) return error.message;
  return phase === 'preview' ? '无法解析导入内容，请检查表格后重试。' : '导入失败，请核对名册后重试。';
};

const jsonRequest = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body)
});

export const getRoster = () => requestJson<RosterSnapshot>('/api/roster');

export const listRosterClasses = async () => {
  const body = await requestJson<{ classes: SchoolClass[] }>('/api/classes');
  return body.classes;
};

export const listRosterStudents = async (classId: string) => {
  const body = await requestJson<{ students: RosterStudent[] }>(
    `/api/classes/${encodeURIComponent(classId)}/students`
  );
  return body.students;
};

export const createRosterClass = async (schoolClass: Omit<SchoolClass, 'id' | 'studentCount'>) => {
  const body = await requestJson<{ schoolClass: SchoolClass }>('/api/classes', jsonRequest('POST', schoolClass));
  return body.schoolClass;
};

export const updateRosterClass = async (schoolClass: SchoolClass) => {
  const body = await requestJson<{ schoolClass: SchoolClass }>(
    `/api/classes/${encodeURIComponent(schoolClass.id)}`,
    jsonRequest('PATCH', schoolClass)
  );
  return body.schoolClass;
};

export const toggleRosterClassArchive = async (classId: string) => {
  const body = await requestJson<{ schoolClass: SchoolClass }>(
    `/api/classes/${encodeURIComponent(classId)}/archive`,
    jsonRequest('POST')
  );
  return body.schoolClass;
};

export const createRosterCommitteeRole = async (name: string) => {
  const body = await requestJson<{ role: CommitteeRole }>('/api/committee-roles', jsonRequest('POST', { name }));
  return body.role;
};

export const updateRosterCommitteeRole = async (roleId: string, name: string) => {
  const body = await requestJson<{ role: CommitteeRole }>(
    `/api/committee-roles/${encodeURIComponent(roleId)}`,
    jsonRequest('PATCH', { name })
  );
  return body.role;
};

export const deleteRosterCommitteeRole = async (roleId: string) => {
  const response = await apiFetch(`/api/committee-roles/${encodeURIComponent(roleId)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(await readErrorCode(response));
};

export const saveClassCommitteeAssignments = async (
  classId: string,
  assignments: Omit<CommitteeAssignment, 'classId'>[]
) => {
  const body = await requestJson<{ students: RosterStudent[] }>(
    `/api/classes/${encodeURIComponent(classId)}/committee-assignments`,
    jsonRequest('PUT', { assignments })
  );
  return body.students;
};

export const createRosterStudent = async (student: Student) => {
  const body = await requestJson<{ student: RosterStudent }>('/api/students', jsonRequest('POST', student));
  return body.student;
};

export const updateRosterStudent = async (student: Student) => {
  const body = await requestJson<{ student: RosterStudent }>(
    `/api/students/${encodeURIComponent(student.id)}`,
    jsonRequest('PATCH', student)
  );
  return body.student;
};

export const deleteRosterStudent = async (studentId: string) => {
  const response = await apiFetch(`/api/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(await readErrorCode(response));
};

export const previewRosterStudentsImport = async (classId: string, grid: RosterImportGrid) => {
  const request = () => requestJson<RosterImportPreview>(
    `/api/classes/${encodeURIComponent(classId)}/students/import/preview`,
    jsonRequest('POST', grid)
  );
  try {
    return await request();
  } catch (error) {
    if (!isRetryablePreviewError(error)) throw error;
    await wait(500);
    return request();
  }
};

export const importRosterStudents = (classId: string, grid: RosterImportGrid) =>
  requestJson<RosterImportResult>(
    `/api/classes/${encodeURIComponent(classId)}/students/import`,
    jsonRequest('POST', grid)
  );
