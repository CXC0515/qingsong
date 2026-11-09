/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const classroomStudentNoKey = (userId: string) => `classroom-export-student-no:${userId}`;
export const workbenchShortcutDestinations = ['classroom-tasks','grading-workspace','lesson-plan','diagnosis-workspace','class-mgmt','student-mgmt','classroom','schedule','schedule:reminders','tag-mgmt','career-open-class','career-competition','career-paper','career-title','material-pool','knowledge-graph','library-editor'] as const;
export type WorkbenchShortcutDestination = typeof workbenchShortcutDestinations[number];

export const readClassroomExportStudentNo = (userId: string) => {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(classroomStudentNoKey(userId)) !== 'false';
};

export const writeClassroomExportStudentNo = (userId: string, includeStudentNo: boolean) => {
  localStorage.setItem(classroomStudentNoKey(userId), String(includeStudentNo));
};
