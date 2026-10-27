/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import { z } from 'zod';
import { getClassroomLayout, saveClassroomLayout } from '../repositories/classroomRepository';
import { listClasses, listStudents } from '../repositories/rosterRepository';
import { buildClassroomWorkbook } from '../services/classroom/classroomWorkbook';

const router = Router();
const layoutSchema = z.object({
  rowCount: z.number().int().min(1).max(10),
  columnCount: z.number().int().min(1).max(12),
  seats: z.array(z.object({
    seatIndex: z.number().int().min(0),
    studentId: z.string().trim().min(1)
  })).max(124)
});

router.get('/classes/:classId/classroom-layout', (request, response) => {
  const layout = getClassroomLayout(request.params.classId);
  if (!layout) {
    response.status(404).json({ code: 'CLASS_NOT_FOUND' });
    return;
  }
  response.json({ layout });
});

router.get('/classes/:classId/classroom-layout/export', async (request, response) => {
  const layout = getClassroomLayout(request.params.classId);
  const schoolClass = listClasses().find(item => item.id === request.params.classId);
  if (!layout || !schoolClass) {
    response.status(404).json({ code: 'CLASS_NOT_FOUND' });
    return;
  }
  try {
    const includeStudentNo = request.query.includeStudentNo !== 'false';
    const workbook = await buildClassroomWorkbook(schoolClass.name, layout, listStudents(request.params.classId), includeStudentNo);
    const filename = `${schoolClass.name.replace(/[\\/:*?"<>|]/g, '-')}-座位表.xlsx`;
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    response.send(workbook);
  } catch {
    response.status(500).json({ code: 'CLASSROOM_EXPORT_FAILED' });
  }
});

router.put('/classes/:classId/classroom-layout', (request, response) => {
  const parsed = layoutSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: 'INVALID_CLASSROOM_LAYOUT', issues: parsed.error.issues });
    return;
  }
  try {
    const layout = saveClassroomLayout(request.params.classId, parsed.data);
    if (!layout) {
      response.status(404).json({ code: 'CLASS_NOT_FOUND' });
      return;
    }
    response.json({ layout });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'CLASSROOM_SAVE_FAILED';
    const status = code.startsWith('DUPLICATE_') || code.startsWith('CLASSROOM_') ? 409 : 500;
    response.status(status).json({ code });
  }
});

export default router;
