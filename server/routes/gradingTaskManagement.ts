import { WorkspaceDataReadError } from '../repositories/workspaceFileStore';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import { z } from 'zod';
import { rmSync } from 'node:fs';
import { assertPathInsideWorkspace, uploadFilePath } from '../context/workspaceContext';
import { deleteFirstSectionAnalysis } from '../repositories/analysisRepository';
import { deleteGradingBatch } from '../repositories/gradingBatchRepository';
import { deleteTaskRubrics } from '../repositories/gradingRubricRepository';
import { deleteGradingTask, listGradingTasks, saveGradingTask } from '../repositories/gradingTaskRepository';
import { deleteMaterialsForTask } from '../repositories/materialRepository';
import { deleteParserArtifact } from '../repositories/parserArtifactRepository';
import { deleteTrialGradingResult } from '../repositories/trialGradingRepository';
import { deleteVisionValidationForTask } from '../repositories/visionValidationRepository';

const router = Router();
const taskSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), classId: z.string().min(1), className: z.string().min(1),
  node: z.enum(['setup', 'collection', 'upload', 'ocr', 'grading', 'verify', 'report', 'sync']),
  nodeName: z.string(), deadline: z.string(), createdAt: z.string(), collectionDeadlineAt: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'error']), progress: z.number().optional(),
  selectedQuestionIds: z.array(z.string().min(1)).optional(), questionScopeConfirmedAt: z.string().datetime().optional(), archivedAt: z.string().datetime().optional()
});
router.delete('/grading-task-list/:taskId', (request, response) => {
  const task = listGradingTasks().find(item => item.id === request.params.taskId);
  if (!task) return response.status(404).json({ code: 'GRADING_TASK_NOT_FOUND' });
  if (!task.archivedAt) return response.status(409).json({ code: 'GRADING_TASK_MUST_BE_ARCHIVED' });
  const materials = deleteMaterialsForTask(task.id);
  for (const material of materials) {
    rmSync(assertPathInsideWorkspace(material.diskPath), { force: true });
    rmSync(assertPathInsideWorkspace(uploadFilePath('parsed', material.id)), { recursive: true, force: true });
    rmSync(assertPathInsideWorkspace(uploadFilePath('validation', task.id, material.id)), { recursive: true, force: true });
    deleteParserArtifact(material.id);
  }
  deleteFirstSectionAnalysis(task.id); deleteTaskRubrics(task.id); deleteVisionValidationForTask(task.id); deleteTrialGradingResult(task.id); deleteGradingBatch(task.id);
  deleteGradingTask(task.id);
  response.json({ deleted: true });
});

router.get('/grading-task-list', (_request, response) => response.json({ tasks: listGradingTasks() }));
router.put('/grading-task-list/:taskId', (request, response) => {
  const parsed = taskSchema.safeParse({ ...request.body, id: request.params.taskId });
  if (!parsed.success) { response.status(400).json({ code: 'INVALID_GRADING_TASK' }); return; }
  response.json({ task: saveGradingTask(parsed.data) });
});

router.use((error: unknown, _request: import('express').Request, response: import('express').Response, next: import('express').NextFunction) => {
  if (error instanceof WorkspaceDataReadError) {response.status(503).json({code:error.code,message:error.message,saved:false});return;}
  next(error);
});

export default router;
