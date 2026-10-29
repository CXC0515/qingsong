import { WorkspaceDataReadError } from '../repositories/workspaceFileStore';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { AnalysisEvidenceRef, FirstSectionAnalysis, GradingMode, TrialGradingResult, VisionValidationResult } from '../../src/domain/types';
import { getModelConfig, isModelConfigured } from '../config/modelConfig';
import { getDocumentParserConfig } from '../config/documentParserConfig';
import { assertPathInsideWorkspace, uploadFilePath } from '../context/workspaceContext';
import { uploadRateLimit } from '../middleware/security';
import { runtimeConfig } from '../config/runtimeConfig';
import { deleteFirstSectionAnalysis, getFirstSectionAnalysis, saveFirstSectionAnalysis } from '../repositories/analysisRepository';
import { appendMaterials, getMaterials, removeMaterialsById, replaceMaterialsForKind, StoredMaterial, updateMaterial } from '../repositories/materialRepository';
import { deleteTaskRubrics, getTaskRubrics, saveTaskRubric } from '../repositories/gradingRubricRepository';
import { listGradingTasks } from '../repositories/gradingTaskRepository';
import { deleteGradingBatch, getGradingBatch, saveGradingBatch } from '../repositories/gradingBatchRepository';
import { deleteParserArtifact, getParserArtifact } from '../repositories/parserArtifactRepository';
import { recordGradingError } from '../repositories/gradingErrorRepository';
import { deleteTrialGradingForAssets, deleteTrialGradingResult, getTrialGradingResult, invalidateAiGradingForAsset, saveTrialGradingResult } from '../repositories/trialGradingRepository';
import { deleteVisionValidationForAssets, deleteVisionValidationForTask, getVisionValidationResult, NON_CHOICE_RECOGNITION_VERSION, saveVisionValidationResult } from '../repositories/visionValidationRepository';
import { paddleParserArtifactSchema, visionValidationRequestSchema } from '../schemas/paddleParserArtifact';
import { trialGradingRequestSchema } from '../schemas/trialGrading';
import { gradingRubricInputSchema } from '../schemas/gradingRubric';
import { OpenAICompatibleQuestionAnalyzer } from '../services/analysis/OpenAICompatibleQuestionAnalyzer';
import { resolveSourceEvidence } from '../services/evidence/sourceEvidenceResolver';
import { OpenAICompatibleVisionRegionLocator } from '../services/grading/OpenAICompatibleVisionRegionLocator';
import { FocusedPaddleRecognizer } from '../services/grading/FocusedPaddleRecognizer';
import { createVisionLocatedRegions } from '../services/grading/questionRegionCropper';
import { inferAnswerCardOption } from '../services/grading/trialScore';
import { authenticatedUploadPath, resumeAuthenticatedWorkspace } from '../middleware/authenticated';
import { buildTeacherAnswerOverrides, findSubmissionsNeedingTrialGrading, mergeCurrentTrialSamples, mergeRegradedQuestionSamples } from '../services/grading/trialResultReconciler';
import { gradeTrialSubmissions } from '../services/grading/trialGradingService';
import { buildGradingDiagnosis } from '../services/grading/gradingDiagnosis';
import { applyTeacherReviewDecision } from '../services/grading/teacherReviewDecision';
import { MaterialParserError } from '../services/materials/MaterialParser';
import { parseMaterial } from '../services/materials/materialParserRegistry';
import { sourcePageImagePath } from '../services/materials/sourcePageImage';

const router = Router();
const supportedExtensions = new Set(['.docx', '.pdf', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.heic', '.tif', '.tiff']);
const decodeUploadFileName = (fileName: string) => {
  const decoded = Buffer.from(fileName, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? fileName : decoded;
};
const upload = multer({
  storage: multer.diskStorage({
    destination: (request, _file, callback) => {
      try {
        const directory = authenticatedUploadPath(request);
        mkdirSync(directory, { recursive: true });
        callback(null, directory);
      } catch (error) {
        callback(error instanceof Error ? error : new Error('WORKSPACE_CONTEXT_REQUIRED'), '');
      }
    },
  }),
  limits: {
    fileSize: runtimeConfig.uploadLimits.gradingFileBytes,
    files: runtimeConfig.uploadLimits.gradingFileCount,
  },
  fileFilter: (_request, file, callback) => callback(null,
    file.mimetype === 'application/pdf'
    || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || file.mimetype.startsWith('image/')
    || file.mimetype.startsWith('text/')
    || supportedExtensions.has(path.extname(file.originalname).toLowerCase()))
});

const knowledgeCatalogSchema = z.array(z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string()
})).max(2000);

const ocrCorrectionSchema = z.object({
  correctedText: z.string().max(10_000),
  question: trialGradingRequestSchema.shape.questions.element,
  submission: trialGradingRequestSchema.shape.submissions.element
});

const teacherReviewSchema = z.object({
  finalScore: z.number().nonnegative(),
  reason: z.string().trim().min(1).max(2_000),
  resultSource: z.enum(['ai-confirmed', 'teacher-adjusted', 'teacher-manual']),
  correctedText: z.string().max(10_000).optional(),
  reviewDecision: z.enum(['confirmed-score', 'corrected-recognition', 'adjusted-score', 'deferred']).optional(),
  feedbackReasons: z.array(z.enum(['answer-region-incomplete', 'recognition-error', 'crossed-out-error', 'rubric-missing', 'rubric-judgment-error', 'score-too-high', 'score-too-low', 'other'])).max(8).optional()
});

const batchConfirmationSchema = z.object({ studentIds: z.array(z.string().min(1)).min(1).max(50) });

const batchRequestSchema = trialGradingRequestSchema.extend({
  mode: z.enum(['per-submission', 'batch-checkpoint', 'auto-continue'])
});

const removeSubmissionSchema = z.object({ assetIds: z.array(z.string().uuid()).min(1).max(100) });
const retrySubmissionSchema = z.object({ assetIds: z.array(z.string().uuid()).min(1).max(20) });
const materialSelectionSchema = z.object({ assetIds: z.array(z.string().uuid()).min(1).max(40) });
const materialRegionSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).refine(box => box.x + box.width <= 1.001 && box.y + box.height <= 1.001);
const materialRegionQuerySchema = z.object({ x: z.coerce.number().min(0).max(1), y: z.coerce.number().min(0).max(1), width: z.coerce.number().positive().max(1), height: z.coerce.number().positive().max(1) }).refine(box => box.x + box.width <= 1.001 && box.y + box.height <= 1.001);
const knowledgeLinkSelectionSchema = z.object({ confirmed: z.boolean() });

const analysisQuestionCorrectionSchema = z.object({
  title: z.string().trim().min(1).max(500),
  stem: z.string().trim().min(1).max(10_000),
  answerRequirement: z.string().trim().max(2_000),
  standardAnswer: z.string().trim().max(20_000).optional()
});

const evidenceCropQuerySchema = z.object({
  page: z.coerce.number().int().positive(),
  x: z.coerce.number().min(0).max(1),
  y: z.coerce.number().min(0).max(1),
  width: z.coerce.number().positive().max(1),
  height: z.coerce.number().positive().max(1)
});

const evidenceRegionSchema = z.object({
  assetKind: z.enum(['assignment', 'reference-answer']),
  pageNumber: z.number().int().positive(),
  boundingBox: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1)
  }).refine(box => box.x + box.width <= 1.001 && box.y + box.height <= 1.001),
  runOcr: z.boolean().optional()
});
const submissionRegionCompareSchema = z.object({
  boundingBox: evidenceRegionSchema.shape.boundingBox,
  runOcr: z.boolean().optional()
});
const recognitionSourceSchema = z.object({ source: z.enum(['paddle', 'focused-paddle', 'luna']) });

const normalizedComparableText = (value: string) => value.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();

const boxesOverlap = (
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number }
) => first.x < second.x + second.width && first.x + first.width > second.x
  && first.y < second.y + second.height && first.y + first.height > second.y;

const extractEvidenceCrop = async (material: StoredMaterial, pageNumber: number, box: { x: number; y: number; width: number; height: number }) => {
  const sourcePage = material.normalizedDocument?.resources.find(resource => resource.role === 'source-page' && (resource.pageNumber ?? 1) === pageNumber);
  if (!sourcePage) throw new Error('SOURCE_PAGE_NOT_FOUND');
  const sourcePath = sourcePageImagePath(material.id, pageNumber, sourcePage.fileName);
  const image = sharp(sourcePath);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error('SOURCE_PAGE_DIMENSIONS_MISSING');
  const left = Math.max(0, Math.floor(box.x * metadata.width));
  const top = Math.max(0, Math.floor(box.y * metadata.height));
  const width = Math.max(1, Math.min(metadata.width - left, Math.ceil(box.width * metadata.width)));
  const height = Math.max(1, Math.min(metadata.height - top, Math.ceil(box.height * metadata.height)));
  return image.extract({ left, top, width, height }).jpeg({ quality: 94 }).toBuffer();
};

const classifyQuestionAnalysisError = (message: string) => {
  const status = Number(message.match(/^MODEL_REQUEST_FAILED:(\d{3})$/)?.[1]);
  if (status === 401 || status === 403) return { statusCode: 503, code: 'MODEL_AUTH_FAILED' };
  if (status === 429) return { statusCode: 429, code: 'MODEL_RATE_LIMITED' };
  if (status === 502 || status === 503 || status === 504) return { statusCode: 503, code: 'MODEL_SERVICE_UNAVAILABLE' };
  if (Number.isInteger(status)) return { statusCode: 502, code: 'MODEL_REQUEST_REJECTED' };
  return { statusCode: 502, code: 'MODEL_OUTPUT_INVALID' };
};

const toPublicAsset = ({ diskPath: _diskPath, normalizedDocument: _normalizedDocument, ...asset }: StoredMaterial) => {
  if (!asset.preParseRegion || !asset.mimeType.startsWith('image/') || asset.kind === 'student-submission') return asset;
  const query = new URLSearchParams(Object.entries(asset.preParseRegion).map(([key, value]) => [key, String(value)])).toString();
  return { ...asset, sourcePageUrl: asset.publicUrl, publicUrl: `/api/grading-tasks/${encodeURIComponent(asset.taskId)}/materials/${encodeURIComponent(asset.id)}/preparse-crop?${query}` };
};

const parseUploadedMaterial = async (material: StoredMaterial) => {
  updateMaterial(material.taskId, material.id, { status: 'processing', parseErrorCode: undefined });
  let parsePath = material.diskPath;
  let temporaryCrop: string | undefined;
  try {
    if (material.preParseRegion && material.mimeType.startsWith('image/')) {
      const metadata = await sharp(material.diskPath).metadata();
      if (metadata.width && metadata.height) {
        const box = material.preParseRegion;
        temporaryCrop = uploadFilePath('parsed-input', `${material.id}.jpg`);
        mkdirSync(path.dirname(temporaryCrop), { recursive: true });
        await sharp(material.diskPath).extract({ left: Math.floor(box.x * metadata.width), top: Math.floor(box.y * metadata.height), width: Math.max(1, Math.min(metadata.width - Math.floor(box.x * metadata.width), Math.ceil(box.width * metadata.width))), height: Math.max(1, Math.min(metadata.height - Math.floor(box.y * metadata.height), Math.ceil(box.height * metadata.height))) }).jpeg({ quality: 96 }).toFile(temporaryCrop);
        parsePath = temporaryCrop;
      }
    }
    const normalizedDocument = await parseMaterial({
      assetId: material.id,
      fileName: material.fileName,
      mimeType: material.mimeType,
      filePath: parsePath,
      publicAssetBaseUrl: `/api/grading-tasks/${encodeURIComponent(material.taskId)}/materials/${encodeURIComponent(material.id)}`,
    });
    updateMaterial(material.taskId, material.id, {
      status: normalizedDocument.warnings.length ? 'needs-review' : 'ready',
      pageCount: normalizedDocument.pageCount,
      normalizedDocument
    });
  } catch (error) {
    const code = error instanceof MaterialParserError ? error.code : 'MATERIAL_PARSE_FAILED';
    console.error(JSON.stringify({ event: 'material_parse_failed', taskId: material.taskId, materialId: material.id, code }));
    updateMaterial(material.taskId, material.id, { status: 'failed', parseErrorCode: code });
  } finally {
    if (temporaryCrop) rmSync(temporaryCrop, { force: true });
  }
};

router.get('/:taskId/materials', (request, response) => {
  const materials = getMaterials(request.params.taskId);
  response.json({
    assets: materials.map(toPublicAsset),
    documents: materials.flatMap(material => material.normalizedDocument ? [material.normalizedDocument] : [])
  });
});

router.delete('/:taskId/student-submissions', (request, response) => {
  const parsed = removeSubmissionSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ code: 'INVALID_SUBMISSION_SELECTION' });
  const materials = getMaterials(request.params.taskId);
  const selected = materials.filter(material => parsed.data.assetIds.includes(material.id));
  if (selected.some(material => material.kind !== 'student-submission') || selected.length !== parsed.data.assetIds.length) {
    return response.status(404).json({ code: 'SUBMISSION_NOT_FOUND' });
  }
  if (selected.some(material => material.status === 'processing' || material.status === 'uploaded')) {
    return response.status(409).json({ code: 'SUBMISSION_PROCESSING' });
  }
  const removed = removeMaterialsById(request.params.taskId, 'student-submission', parsed.data.assetIds);
  for (const material of removed) {
    rmSync(assertPathInsideWorkspace(material.diskPath), { force: true });
    rmSync(assertPathInsideWorkspace(uploadFilePath('parsed', material.id)), { recursive: true, force: true });
    rmSync(assertPathInsideWorkspace(uploadFilePath('validation', request.params.taskId, material.id)), { recursive: true, force: true });
    deleteParserArtifact(material.id);
  }
  deleteVisionValidationForAssets(request.params.taskId, parsed.data.assetIds);
  deleteTrialGradingForAssets(request.params.taskId, parsed.data.assetIds);
  deleteGradingBatch(request.params.taskId);
  response.json({ removed: removed.map(toPublicAsset) });
});

router.post('/:taskId/student-submissions/retry', (request, response) => {
  const parsed = retrySubmissionSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ code: 'INVALID_SUBMISSION_SELECTION' });
  const materials = getMaterials(request.params.taskId);
  const selected = materials.filter(material => parsed.data.assetIds.includes(material.id));
  if (selected.some(material => material.kind !== 'student-submission') || selected.length !== parsed.data.assetIds.length) {
    return response.status(404).json({ code: 'SUBMISSION_NOT_FOUND' });
  }
  if (selected.some(material => material.status !== 'failed')) {
    return response.status(409).json({ code: 'SUBMISSION_NOT_RETRYABLE' });
  }
  selected.forEach(material => { void parseUploadedMaterial(material); });
  response.status(202).json({ assets: selected.map(material => toPublicAsset({ ...material, status: 'processing', parseErrorCode: undefined })) });
});

router.get('/:taskId/rubrics', (request, response) => {
  response.json({ rubrics: getTaskRubrics(request.params.taskId) });
});

router.put('/:taskId/rubrics/:questionId', (request, response) => {
  const parsed = gradingRubricInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: 'INVALID_GRADING_RUBRIC' });
    return;
  }
  const rubric = saveTaskRubric({
    taskId: request.params.taskId,
    questionId: request.params.questionId,
    ...parsed.data,
    updatedAt: new Date().toISOString()
  });
  response.json({ rubric });
});

router.get('/:taskId/materials/:assetId/content', (request, response) => {
  const material = getMaterials(request.params.taskId).find(item => item.id === request.params.assetId);
  if (!material) {
    response.status(404).json({ code: 'MATERIAL_NOT_FOUND' });
    return;
  }
  response.type(material.mimeType);
  try {
    response.setHeader('Cache-Control', 'private, no-store');
    response.sendFile(assertPathInsideWorkspace(material.diskPath));
  } catch {
    response.status(404).json({ code: 'MATERIAL_FILE_NOT_FOUND' });
  }
});

router.get('/:taskId/materials/:assetId/derived/*segments', (request, response) => {
  const material = getMaterials(request.params.taskId).find(item => item.id === request.params.assetId);
  if (!material) return response.status(404).json({ code: 'MATERIAL_NOT_FOUND' });
  const segments = Array.isArray(request.params.segments) ? request.params.segments : [request.params.segments];
  const target = uploadFilePath('parsed', material.id, ...segments);
  if (!existsSync(target)) return response.status(404).json({ code: 'DERIVED_FILE_NOT_FOUND' });
  response.setHeader('Cache-Control', 'private, no-store');
  response.sendFile(assertPathInsideWorkspace(target));
});

router.get('/:taskId/materials/:assetId/validation/:fileName', (request, response) => {
  const material = getMaterials(request.params.taskId).find(item => item.id === request.params.assetId);
  if (!material) return response.status(404).json({ code: 'MATERIAL_NOT_FOUND' });
  const target = uploadFilePath('validation', request.params.taskId, material.id, path.basename(request.params.fileName));
  if (!existsSync(target)) return response.status(404).json({ code: 'VALIDATION_FILE_NOT_FOUND' });
  response.setHeader('Cache-Control', 'private, no-store');
  response.sendFile(assertPathInsideWorkspace(target));
});

router.get('/:taskId/materials/:assetId/pages/:pageNumber/image', (request, response) => {
  const pageNumber = Number(request.params.pageNumber);
  const material = getMaterials(request.params.taskId).find(item => item.id === request.params.assetId);
  const sourcePage = material?.normalizedDocument?.resources.find(resource => resource.role === 'source-page' && (resource.pageNumber ?? 1) === pageNumber);
  if (!material || !sourcePage || !Number.isInteger(pageNumber) || pageNumber < 1) return response.status(404).json({ code: 'SOURCE_PAGE_NOT_FOUND' });
  const target = sourcePageImagePath(material.id, pageNumber, sourcePage.fileName);
  if (!existsSync(target)) return response.status(404).json({ code: 'SOURCE_PAGE_FILE_NOT_FOUND' });
  response.setHeader('Cache-Control', 'private, no-store');
  response.sendFile(assertPathInsideWorkspace(target));
});

router.get('/:taskId/materials/:assetId/evidence-crop', async (request, response) => {
  const parsed = evidenceCropQuerySchema.safeParse(request.query);
  const material = getMaterials(request.params.taskId).find(item => item.id === request.params.assetId);
  const document = material?.normalizedDocument;
  if (!parsed.success || !material || !document) {
    response.status(parsed.success ? 404 : 400).json({ code: parsed.success ? 'MATERIAL_NOT_FOUND' : 'INVALID_EVIDENCE_REGION' });
    return;
  }
  const sourcePage = document.resources.find(resource => resource.role === 'source-page' && (resource.pageNumber ?? 1) === parsed.data.page);
  if (!sourcePage) {
    response.status(404).json({ code: 'SOURCE_PAGE_NOT_FOUND' });
    return;
  }
  try {
    const buffer = await extractEvidenceCrop(material, parsed.data.page, parsed.data);
    response.type('image/jpeg').send(buffer);
  } catch {
    response.status(500).json({ code: 'EVIDENCE_CROP_FAILED' });
  }
});

router.post('/:taskId/materials/:assetId/reparse', async (request, response) => {
  const material = getMaterials(request.params.taskId).find(item => item.id === request.params.assetId);
  if (!material) {
    response.status(404).json({ code: 'MATERIAL_NOT_FOUND' });
    return;
  }
  await parseUploadedMaterial(material);
  const updated = getMaterials(request.params.taskId).find(item => item.id === request.params.assetId);
  response.json({ asset: updated ? toPublicAsset(updated) : toPublicAsset(material) });
});

router.post('/:taskId/materials/parse', async (request, response) => {
  const parsed = materialSelectionSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ code: 'INVALID_MATERIAL_SELECTION' });
  const selected = getMaterials(request.params.taskId).filter(item => parsed.data.assetIds.includes(item.id) && item.kind !== 'student-submission');
  if (selected.length !== parsed.data.assetIds.length) return response.status(404).json({ code: 'MATERIAL_NOT_FOUND' });
  await Promise.all(selected.map(parseUploadedMaterial));
  response.json({ assets: selected.map(item => toPublicAsset(getMaterials(request.params.taskId).find(next => next.id === item.id) ?? item)) });
});

router.get('/:taskId/materials/:assetId/preparse-crop', async (request, response) => {
  const parsed = materialRegionQuerySchema.safeParse(request.query);
  const material = getMaterials(request.params.taskId).find(item => item.id === request.params.assetId && item.kind !== 'student-submission');
  if (!parsed.success) return response.status(400).json({ code: 'INVALID_EVIDENCE_REGION' });
  if (!material?.mimeType.startsWith('image/')) return response.status(404).json({ code: 'MATERIAL_NOT_FOUND' });
  try {
    const metadata = await sharp(material.diskPath).metadata();
    if (!metadata.width || !metadata.height) throw new Error('SOURCE_PAGE_DIMENSIONS_MISSING');
    const left = Math.floor(parsed.data.x * metadata.width); const top = Math.floor(parsed.data.y * metadata.height);
    const width = Math.max(1, Math.min(metadata.width - left, Math.ceil(parsed.data.width * metadata.width))); const height = Math.max(1, Math.min(metadata.height - top, Math.ceil(parsed.data.height * metadata.height)));
    response.type('image/jpeg').send(await sharp(material.diskPath).extract({ left, top, width, height }).jpeg({ quality: 94 }).toBuffer());
  } catch { response.status(500).json({ code: 'EVIDENCE_CROP_FAILED' }); }
});

router.put('/:taskId/materials/:assetId/region', (request, response) => {
  const parsed = materialRegionSchema.safeParse(request.body?.boundingBox);
  const task = listGradingTasks().find(item => item.id === request.params.taskId);
  const material = getMaterials(request.params.taskId).find(item => item.id === request.params.assetId && item.kind !== 'student-submission');
  if (!parsed.success) return response.status(400).json({ code: 'INVALID_EVIDENCE_REGION' });
  if (task?.questionScopeConfirmedAt) return response.status(409).json({ code: 'MATERIALS_LOCKED_AFTER_ASSIGNMENT' });
  if (!material) return response.status(404).json({ code: 'MATERIAL_NOT_FOUND' });
  if (!material.mimeType.startsWith('image/')) return response.status(409).json({ code: 'MATERIAL_CROP_REQUIRES_IMAGE' });
  const updated = updateMaterial(request.params.taskId, material.id, { preParseRegion: parsed.data });
  response.json({ asset: updated ? toPublicAsset(updated) : toPublicAsset(material) });
});

router.delete('/:taskId/materials', (request, response) => {
  const parsed = materialSelectionSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ code: 'INVALID_MATERIAL_SELECTION' });
  const task = listGradingTasks().find(item => item.id === request.params.taskId);
  if (task?.questionScopeConfirmedAt) return response.status(409).json({ code: 'MATERIALS_LOCKED_AFTER_ASSIGNMENT' });
  const selected = getMaterials(request.params.taskId).filter(item => parsed.data.assetIds.includes(item.id) && item.kind !== 'student-submission');
  if (selected.length !== parsed.data.assetIds.length) return response.status(404).json({ code: 'MATERIAL_NOT_FOUND' });
  for (const kind of ['assignment', 'reference-answer'] as const) {
    const ids = selected.filter(item => item.kind === kind).map(item => item.id);
    if (!ids.length) continue;
    for (const material of removeMaterialsById(request.params.taskId, kind, ids)) {
      rmSync(assertPathInsideWorkspace(material.diskPath), { force: true });
      rmSync(assertPathInsideWorkspace(uploadFilePath('parsed', material.id)), { recursive: true, force: true });
      deleteParserArtifact(material.id);
    }
  }
  deleteFirstSectionAnalysis(request.params.taskId); deleteTaskRubrics(request.params.taskId); deleteVisionValidationForTask(request.params.taskId); deleteTrialGradingResult(request.params.taskId); deleteGradingBatch(request.params.taskId);
  response.json({ removed: selected.map(toPublicAsset) });
});

router.get('/:taskId/vision-validation/:assetId', (request, response) => {
  const result = getVisionValidationResult(request.params.taskId, request.params.assetId);
  if (!result) {
    response.status(404).json({ code: 'VISION_VALIDATION_NOT_FOUND' });
    return;
  }
  response.json({ result });
});

router.post('/:taskId/vision-validation/:assetId/questions/:displayNo/region/compare', async (request, response) => {
  const parsed = submissionRegionCompareSchema.safeParse(request.body);
  const material = getMaterials(request.params.taskId).find(item => item.id === request.params.assetId && item.kind === 'student-submission');
  const current = getVisionValidationResult(request.params.taskId, request.params.assetId);
  const displayNo = decodeURIComponent(request.params.displayNo);
  const existing = current?.items.find(item => item.displayNo === displayNo);
  if (!parsed.success) return response.status(400).json({ code: 'INVALID_EVIDENCE_REGION' });
  if (!material?.normalizedDocument || !existing) return response.status(404).json({ code: 'VISION_VALIDATION_NOT_FOUND' });
  const pageNumber = existing.region.pageNumber;
  const intersectingText = material.normalizedDocument.blocks
    .filter(block => block.pageNumber === pageNumber && block.boundingBox && boxesOverlap(block.boundingBox, parsed.data.boundingBox))
    .sort((first, second) => first.order - second.order)
    .map(block => block.text.trim())
    .filter(Boolean)
    .join('\n');
  const expected = normalizedComparableText(existing.paddleText);
  const actual = normalizedComparableText(intersectingText);
  const geometricStatus = !actual ? 'empty' : actual.includes(expected) || expected.includes(actual) ? 'covered' : 'different';
  let focusedOcrText: string | undefined;
  let ocrStatus: 'not-run' | 'completed' | 'failed' = 'not-run';
  if (parsed.data.runOcr) {
    const temporaryPath = uploadFilePath('validation', request.params.taskId, material.id, `submission-region-${randomUUID()}.jpg`);
    try {
      mkdirSync(path.dirname(temporaryPath), { recursive: true });
      const buffer = await extractEvidenceCrop(material, pageNumber, parsed.data.boundingBox);
      await sharp(buffer).toFile(temporaryPath);
      focusedOcrText = await new FocusedPaddleRecognizer(getDocumentParserConfig()).recognize(temporaryPath);
      ocrStatus = 'completed';
    } catch {
      ocrStatus = 'failed';
    } finally {
      if (existsSync(temporaryPath)) rmSync(temporaryPath);
    }
  }
  response.json({ originalQuote: existing.paddleText, intersectingText, geometricStatus, focusedOcrText, ocrStatus });
});

router.put('/:taskId/vision-validation/:assetId/questions/:displayNo/source', (request, response) => {
  const parsed = recognitionSourceSchema.safeParse(request.body);
  const current = getVisionValidationResult(request.params.taskId, request.params.assetId);
  const displayNo = decodeURIComponent(request.params.displayNo);
  if (!parsed.success) return response.status(400).json({ code: 'INVALID_RECOGNITION_SOURCE' });
  const existing = current?.items.find(item => item.displayNo === displayNo);
  if (!current || !existing) return response.status(404).json({ code: 'VISION_VALIDATION_NOT_FOUND' });
  const selectedText = parsed.data.source === 'luna' ? existing.lunaText : parsed.data.source === 'focused-paddle' ? existing.focusedPaddleText : existing.paddleText;
  if (!selectedText?.trim()) return response.status(409).json({ code: 'RECOGNITION_SOURCE_EMPTY' });
  const result: VisionValidationResult = { ...current, items: current.items.map(item => item.displayNo === displayNo ? { ...item, preferredRecognitionSource: parsed.data.source } : item), createdAt: new Date().toISOString() };
  saveVisionValidationResult(result);
  invalidateAiGradingForAsset(request.params.taskId, request.params.assetId);
  response.json({ result });
});

router.put('/:taskId/vision-validation/:assetId/questions/:displayNo/region', async (request, response) => {
  const parsed = evidenceRegionSchema.shape.boundingBox.safeParse(request.body?.boundingBox);
  const material = getMaterials(request.params.taskId).find(item => item.id === request.params.assetId && item.kind === 'student-submission');
  const current = getVisionValidationResult(request.params.taskId, request.params.assetId);
  const displayNo = decodeURIComponent(request.params.displayNo);
  if (!parsed.success) return response.status(400).json({ code: 'INVALID_EVIDENCE_REGION' });
  if (!material?.normalizedDocument || !current) return response.status(404).json({ code: 'VISION_VALIDATION_NOT_FOUND' });
  const existing = current.items.find(item => item.displayNo === displayNo);
  if (!existing) return response.status(404).json({ code: 'QUESTION_NOT_FOUND' });
  try {
    const pageNumber = existing.region.pageNumber;
    const source = material.normalizedDocument.resources.find(resource => resource.role === 'source-page' && (resource.pageNumber ?? 1) === pageNumber);
    if (!source) return response.status(404).json({ code: 'SOURCE_PAGE_NOT_FOUND' });
    const sourcePath = sourcePageImagePath(material.id, pageNumber, source.fileName);
    const metadata = await sharp(sourcePath).metadata();
    if (!metadata.width || !metadata.height) throw new Error('SOURCE_PAGE_DIMENSIONS_MISSING');
    const region = { x: Math.floor(parsed.data.x * metadata.width), y: Math.floor(parsed.data.y * metadata.height), width: Math.max(1, Math.ceil(parsed.data.width * metadata.width)), height: Math.max(1, Math.ceil(parsed.data.height * metadata.height)), pageNumber };
    const fileName = `question-${displayNo.replace(/[^\p{L}\p{N}._-]/gu, '_')}-teacher.jpg`;
    const target = uploadFilePath('validation', request.params.taskId, material.id, fileName);
    mkdirSync(path.dirname(target), { recursive: true });
    await sharp(sourcePath).extract({ left: region.x, top: region.y, width: Math.min(region.width, metadata.width - region.x), height: Math.min(region.height, metadata.height - region.y) }).jpeg({ quality: 95 }).toFile(target);
    const cropUrl = `/api/grading-tasks/${encodeURIComponent(request.params.taskId)}/materials/${encodeURIComponent(material.id)}/validation/${encodeURIComponent(fileName)}?v=${Date.now()}`;
    let focusedPaddleText = '';
    let focusedOcrStatus: 'completed' | 'failed' = 'completed';
    try {
      focusedPaddleText = await new FocusedPaddleRecognizer(getDocumentParserConfig()).recognize(target);
    } catch {
      focusedOcrStatus = 'failed';
    }
    const focusedSelectedOption = focusedOcrStatus === 'completed' ? inferAnswerCardOption(focusedPaddleText) : null;
    const result: VisionValidationResult = { ...current, items: current.items.map(item => item.displayNo === displayNo ? { ...item, region, pageWidth: metadata.width, pageHeight: metadata.height, cropUrl, screenshotStatus: 'available', focusedPaddleText, focusedOcrStatus, preferredRecognitionSource: 'focused-paddle', selectedOption: focusedSelectedOption, answerFields: [], locatorSource: 'teacher-manual', locationStatus: focusedOcrStatus === 'completed' ? 'located' : 'needs-teacher', locationReasons: focusedOcrStatus === 'completed' ? ['教师手动确认范围并完成局部 OCR'] : ['截图已保存，但局部 OCR 失败'], needsReview: focusedOcrStatus === 'failed' || !focusedPaddleText.trim(), evidenceUnits: [] } : item), createdAt: new Date().toISOString() };
    saveVisionValidationResult(result); invalidateAiGradingForAsset(request.params.taskId, material.id);
    response.json({ result, focusedOcrStatus });
  } catch { response.status(500).json({ code: 'EVIDENCE_CROP_FAILED' }); }
});

router.post('/:taskId/vision-validation', async (request, response) => {
  const parsedRequest = visionValidationRequestSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({ code: 'INVALID_VISION_VALIDATION_REQUEST' });
    return;
  }
  const config = getModelConfig();
  if (!isModelConfigured(config)) {
    response.status(503).json({ code: 'MODEL_NOT_CONFIGURED' });
    return;
  }
  let material = getMaterials(request.params.taskId).find(item => item.id === parsedRequest.data.assetId && item.kind === 'student-submission');
  const analysis = getFirstSectionAnalysis(request.params.taskId);
  let parsedArtifact = paddleParserArtifactSchema.safeParse(getParserArtifact(parsedRequest.data.assetId));
  if (material && !parsedArtifact.success) {
    await parseUploadedMaterial(material);
    material = getMaterials(request.params.taskId).find(item => item.id === parsedRequest.data.assetId && item.kind === 'student-submission');
    parsedArtifact = paddleParserArtifactSchema.safeParse(getParserArtifact(parsedRequest.data.assetId));
  }
  const sourceResources = material?.normalizedDocument?.resources
    .filter(resource => resource.role === 'source-page')
    .map((resource, index) => ({ ...resource, pageNumber: resource.pageNumber ?? index + 1 }))
    .sort((first, second) => (first.pageNumber ?? 0) - (second.pageNumber ?? 0)) ?? [];
  if (!material || !analysis || !sourceResources.length || !parsedArtifact.success) {
    response.status(409).json({ code: 'VISION_VALIDATION_INPUT_NOT_READY' });
    return;
  }
  try {
    const pageSources = sourceResources.map(resource => ({
      pageNumber: resource.pageNumber!,
      sourceImagePath: sourcePageImagePath(material!.id, resource.pageNumber!, resource.fileName)
    }));
    const expectedEvidenceIds = new Map(analysis.questions
      .filter(question => parsedRequest.data.questionNos.includes(question.displayNo))
      .map(question => [question.displayNo, [`${question.displayNo}-answer`]]));
    const expectedQuestionKinds = new Map(analysis.questions
      .filter(question => parsedRequest.data.questionNos.includes(question.displayNo))
      .map(question => [question.displayNo, /选择题/.test(question.questionType) ? 'choice' as const : 'text' as const]));
    const locator = new OpenAICompatibleVisionRegionLocator(config);
    const extraction = await locator.locatePages(pageSources.map(page => ({
      ...page,
      blocks: material.normalizedDocument!.blocks
        .filter(block => block.pageNumber === page.pageNumber && block.boundingBox)
        .map(block => ({ blockId: block.id, order: block.order, text: block.text, boundingBox: block.boundingBox! }))
    })), parsedRequest.data.questionNos, analysis);
    const extractionByNo = new Map(extraction.items.map(item => [item.displayNo, item]));
    const regions = await createVisionLocatedRegions(
      request.params.taskId,
      material.id,
      pageSources,
      parsedRequest.data.questionNos,
      expectedEvidenceIds,
      extraction.items,
      parsedArtifact.data,
      expectedQuestionKinds,
      true
    );
    const previousResult = getVisionValidationResult(request.params.taskId, material.id);
    const requestedNumbers = new Set(parsedRequest.data.questionNos);
    const result: VisionValidationResult = {
      taskId: request.params.taskId,
      assetId: material.id,
      model: config.visionModel,
      items: [...(previousResult?.items.filter(item => !requestedNumbers.has(item.displayNo)) ?? []), ...regions.map(region => {
        const item = extractionByNo.get(region.displayNo);
        const previousItem = previousResult?.items.find(candidate => candidate.displayNo === region.displayNo);
        const paddleSelectedOption = inferAnswerCardOption(region.paddleText);
        const selectedOption = paddleSelectedOption ?? item?.selectedOption ?? null;
        const structuredText = selectedOption || item?.recognizedAnswer || '';
        const evidenceUnits = region.evidenceUnits.map(unit => {
          return {
          evidenceId: unit.evidenceId,
          kind: unit.kind,
          region: unit.region,
          cropUrl: unit.cropUrl,
          provisionalText: unit.paddleText,
          literalText: selectedOption || structuredText,
          confidence: Math.min(unit.confidence, item?.confidence ?? 0),
          needsReview: unit.needsReview || (item?.needsReview ?? true),
          reviewReasons: unit.reviewReasons
          };
        });
        return {
          pipelineVersion: NON_CHOICE_RECOGNITION_VERSION,
          preferredRecognitionSource: previousItem?.preferredRecognitionSource,
          focusedPaddleText: undefined,
          focusedOcrStatus: undefined,
          screenshotStatus: item?.screenshotAvailable === false && region.locatorSource !== 'paddle-layout' ? 'unavailable' as const : 'available' as const,
          displayNo: region.displayNo,
          region: region.region,
          pageWidth: parsedArtifact.data.pages.find(page => page.pageNumber === region.region.pageNumber)?.prunedResult.width,
          pageHeight: parsedArtifact.data.pages.find(page => page.pageNumber === region.region.pageNumber)?.prunedResult.height,
          locatorSource: region.locatorSource,
          locationStatus: region.locationStatus,
          locationReasons: [...region.locationReasons, ...(item?.screenshotAvailable === false && region.locatorSource === 'paddle-layout' ? ['Luna 截图不可用，已回退到 Paddle 坐标'] : [])],
          cropUrl: region.cropUrl,
          evidenceUnits,
          paddleText: region.paddleText,
          lunaText: structuredText,
          answerFields: [],
          crossedOutText: item?.crossedOutText ?? [],
          selectedOption,
          visualEvidence: item?.visualEvidence ?? '',
          existingMarkings: item?.existingMarkings ?? [],
          confidence: item?.confidence ?? 0,
          needsReview: region.locationStatus !== 'located' || (!selectedOption && !region.paddleText && !structuredText) || evidenceUnits.some(unit => unit.needsReview) || (item?.needsReview ?? true)
        };
      })].sort((first, second) => parsedRequest.data.questionNos.indexOf(first.displayNo) - parsedRequest.data.questionNos.indexOf(second.displayNo)),
      createdAt: new Date().toISOString()
    };
    saveVisionValidationResult(result);
    invalidateAiGradingForAsset(request.params.taskId, material.id);
    response.json({ result });
  } catch (error) {
    recordGradingError('vision_validation_failed', request.params.taskId, error, { assetId: parsedRequest.data.assetId, questionNos: parsedRequest.data.questionNos });
    console.error(JSON.stringify({ event: 'vision_validation_failed', taskId: request.params.taskId, assetId: parsedRequest.data.assetId, error: error instanceof Error ? error.message : String(error) }));
    const message = error instanceof Error ? error.message : 'VISION_VALIDATION_FAILED';
    response.status(message.startsWith('Input file is missing:') ? 409 : 502).json({
      code: message.startsWith('Input file is missing:')
        ? 'SOURCE_PAGE_FILE_NOT_FOUND'
        : message.startsWith('MODEL_REQUEST_FAILED:') ? message : 'VISION_VALIDATION_OUTPUT_INVALID'
    });
  }
});

router.post('/:taskId/materials', uploadRateLimit, upload.array('files'), resumeAuthenticatedWorkspace, (request, response) => {
  const kind = request.body.kind;
  const files = (request.files as Express.Multer.File[] | undefined) ?? [];
  if (kind !== 'assignment' && kind !== 'reference-answer' && kind !== 'student-submission') {
    files.forEach(file => rmSync(file.path, { force: true }));
    response.status(400).json({ code: 'INVALID_MATERIAL_KIND' });
    return;
  }
  if (!files.length) {
    response.status(400).json({ code: 'NO_FILES' });
    return;
  }
  const taskId = String(request.params.taskId);
  const assets: StoredMaterial[] = files.map(file => {
    const id = randomUUID();
    return ({
    id,
    taskId,
    kind,
    fileName: decodeUploadFileName(file.originalname),
    mimeType: file.mimetype,
    status: 'uploaded',
    diskPath: file.path,
    publicUrl: `/api/grading-tasks/${encodeURIComponent(taskId)}/materials/${id}/content`
  });
  });
  if (kind === 'student-submission') appendMaterials(taskId, assets);
  else {
    const replaced = getMaterials(taskId).filter(material => material.kind === kind);
    replaceMaterialsForKind(taskId, kind, assets);
    for (const material of replaced) {
      rmSync(assertPathInsideWorkspace(material.diskPath), { force: true });
      rmSync(assertPathInsideWorkspace(uploadFilePath('parsed', material.id)), { recursive: true, force: true });
      deleteParserArtifact(material.id);
    }
  }
  if (kind !== 'student-submission') {
    deleteTrialGradingResult(taskId);
    deleteFirstSectionAnalysis(taskId);
  }
  if (kind === 'student-submission') assets.forEach(material => { void parseUploadedMaterial(material); });
  response.status(201).json({ assets: assets.map(toPublicAsset) });
});

router.get('/:taskId/analysis', (request, response) => {
  const analysis = getFirstSectionAnalysis(request.params.taskId);
  if (!analysis) {
    response.status(404).json({ code: 'ANALYSIS_NOT_FOUND' });
    return;
  }
  const analysisMaterials = getMaterials(request.params.taskId).filter(item => item.kind === 'assignment' || item.kind === 'reference-answer');
  response.json({
    analysis: {
      ...analysis,
      questions: analysis.questions.map(question => ({
        ...question,
        questionSource: resolveSourceEvidence(request.params.taskId, question.questionSource, analysisMaterials, true),
        answerSource: question.answerSource ? resolveSourceEvidence(request.params.taskId, question.answerSource, analysisMaterials, true) : null,
        subquestions: question.subquestions.map(subquestion => ({
          ...subquestion,
          questionSource: resolveSourceEvidence(request.params.taskId, subquestion.questionSource, analysisMaterials),
          answerSource: subquestion.answerSource ? resolveSourceEvidence(request.params.taskId, subquestion.answerSource, analysisMaterials) : null
        }))
      }))
    }
  });
});

router.post('/:taskId/analysis/questions/:displayNo/evidence/compare', async (request, response) => {
  const parsed = evidenceRegionSchema.safeParse(request.body);
  const analysis = getFirstSectionAnalysis(request.params.taskId);
  const displayNo = decodeURIComponent(request.params.displayNo);
  const question = analysis?.questions.find(item => item.displayNo === displayNo);
  if (!parsed.success) return response.status(400).json({ code: 'INVALID_EVIDENCE_REGION' });
  if (!analysis || !question) return response.status(404).json({ code: analysis ? 'QUESTION_NOT_FOUND' : 'ANALYSIS_NOT_FOUND' });
  const source = parsed.data.assetKind === 'assignment' ? question.questionSource : question.answerSource;
  const material = source ? getMaterials(request.params.taskId).find(item => item.id === source.assetId && item.kind === parsed.data.assetKind) : undefined;
  if (!source || !material?.normalizedDocument) return response.status(404).json({ code: 'EVIDENCE_SOURCE_NOT_FOUND' });

  const intersectingText = material.normalizedDocument.blocks
    .filter(block => block.pageNumber === parsed.data.pageNumber && block.boundingBox && boxesOverlap(block.boundingBox, parsed.data.boundingBox))
    .sort((first, second) => first.order - second.order)
    .map(block => block.text.trim())
    .filter(Boolean)
    .join('\n');
  const expected = normalizedComparableText(source.quote);
  const actual = normalizedComparableText(intersectingText);
  const geometricStatus = !actual ? 'empty' : actual.includes(expected) || expected.includes(actual) ? 'covered' : 'different';
  let focusedOcrText: string | undefined;
  let ocrStatus: 'not-run' | 'completed' | 'failed' = 'not-run';
  if (parsed.data.runOcr) {
    const temporaryPath = uploadFilePath('validation', request.params.taskId, material.id, `teacher-region-${randomUUID()}.jpg`);
    try {
      mkdirSync(path.dirname(temporaryPath), { recursive: true });
      const buffer = await extractEvidenceCrop(material, parsed.data.pageNumber, parsed.data.boundingBox);
      await sharp(buffer).toFile(temporaryPath);
      focusedOcrText = await new FocusedPaddleRecognizer(getDocumentParserConfig()).recognize(temporaryPath);
      ocrStatus = 'completed';
    } catch {
      ocrStatus = 'failed';
    } finally {
      if (existsSync(temporaryPath)) rmSync(temporaryPath);
    }
  }
  response.json({ originalQuote: source.quote, intersectingText, geometricStatus, focusedOcrText, ocrStatus });
});

router.put('/:taskId/analysis/questions/:displayNo/evidence', (request, response) => {
  const parsed = evidenceRegionSchema.omit({ runOcr: true }).safeParse(request.body);
  const analysis = getFirstSectionAnalysis(request.params.taskId);
  const displayNo = decodeURIComponent(request.params.displayNo);
  const question = analysis?.questions.find(item => item.displayNo === displayNo);
  if (!parsed.success) return response.status(400).json({ code: 'INVALID_EVIDENCE_REGION' });
  if (!analysis || !question) return response.status(404).json({ code: analysis ? 'QUESTION_NOT_FOUND' : 'ANALYSIS_NOT_FOUND' });
  const selectedSource = parsed.data.assetKind === 'assignment' ? question.questionSource : question.answerSource;
  if (!selectedSource || selectedSource.assetId !== getMaterials(request.params.taskId).find(item => item.id === selectedSource.assetId)?.id) {
    return response.status(404).json({ code: 'EVIDENCE_SOURCE_NOT_FOUND' });
  }
  const manualRegion = { pageNumber: parsed.data.pageNumber, boundingBox: parsed.data.boundingBox, selectedAt: new Date().toISOString() };
  const updated = saveFirstSectionAnalysis({
    ...analysis,
    questions: analysis.questions.map(item => item.displayNo !== displayNo ? item : {
      ...item,
      questionSource: parsed.data.assetKind === 'assignment' ? { ...item.questionSource, manualRegion } : item.questionSource,
      answerSource: parsed.data.assetKind === 'reference-answer' && item.answerSource ? { ...item.answerSource, manualRegion } : item.answerSource
    })
  });
  response.json({ analysis: updated });
});

router.put('/:taskId/analysis/questions/:displayNo', (request, response) => {
  const parsed = analysisQuestionCorrectionSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: 'INVALID_QUESTION_CORRECTION' });
    return;
  }
  const analysis = getFirstSectionAnalysis(request.params.taskId);
  if (!analysis) {
    response.status(404).json({ code: 'ANALYSIS_NOT_FOUND' });
    return;
  }
  const displayNo = decodeURIComponent(request.params.displayNo);
  if (!analysis.questions.some(question => question.displayNo === displayNo)) {
    response.status(404).json({ code: 'QUESTION_NOT_FOUND' });
    return;
  }
  const updated = saveFirstSectionAnalysis({
    ...analysis,
    questions: analysis.questions.map(question => question.displayNo === displayNo ? { ...question, ...parsed.data, teacherCorrectedStem: true } : question)
  });
  deleteTrialGradingResult(request.params.taskId);
  deleteGradingBatch(request.params.taskId);
  deleteVisionValidationForTask(request.params.taskId);
  response.json({ analysis: updated });
});

router.put('/:taskId/analysis/questions/:displayNo/knowledge/:nodeId', (request, response) => {
  const parsed = knowledgeLinkSelectionSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: 'INVALID_KNOWLEDGE_LINK_SELECTION' });
    return;
  }
  const analysis = getFirstSectionAnalysis(request.params.taskId);
  if (!analysis) {
    response.status(404).json({ code: 'ANALYSIS_NOT_FOUND' });
    return;
  }
  const displayNo = decodeURIComponent(request.params.displayNo);
  const nodeId = decodeURIComponent(request.params.nodeId);
  const question = analysis.questions.find(item => item.displayNo === displayNo);
  if (!question) {
    response.status(404).json({ code: 'QUESTION_NOT_FOUND' });
    return;
  }
  if (!question.knowledgeCandidates.some(candidate => candidate.nodeId === nodeId)) {
    response.status(404).json({ code: 'KNOWLEDGE_LINK_NOT_FOUND' });
    return;
  }
  const selectedIds = new Set(question.confirmedKnowledgeNodeIds ?? []);
  if (parsed.data.confirmed) selectedIds.add(nodeId);
  else selectedIds.delete(nodeId);
  const updated = saveFirstSectionAnalysis({
    ...analysis,
    questions: analysis.questions.map(item => item.displayNo === displayNo
      ? { ...item, confirmedKnowledgeNodeIds: [...selectedIds] }
      : item)
  });
  response.json({ analysis: updated });
});

router.get('/:taskId/trial-grading', (request, response) => {
  const result = getTrialGradingResult(request.params.taskId);
  if (!result) {
    response.status(404).json({ code: 'TRIAL_GRADING_NOT_FOUND' });
    return;
  }
  response.json({ result });
});

router.put('/:taskId/trial-grading/:sampleId/ocr-correction', async (request, response) => {
  const parsed = ocrCorrectionSchema.safeParse(request.body);
  const existing = getTrialGradingResult(request.params.taskId);
  const current = existing?.samples.find(sample => sample.id === request.params.sampleId);
  const config = getModelConfig();
  if (!parsed.success) { response.status(400).json({ code: 'INVALID_OCR_CORRECTION' }); return; }
  if (!existing || !current || !current.sourceAssetId) { response.status(404).json({ code: 'TRIAL_SAMPLE_NOT_FOUND' }); return; }
  if (!isModelConfigured(config)) { response.status(503).json({ code: 'MODEL_NOT_CONFIGURED' }); return; }
  if (current.resultSource === 'teacher-manual') { response.status(409).json({ code: 'TEACHER_FINAL_RESULT_LOCKED' }); return; }
  try {
    const correctionRequest = { questions: [parsed.data.question], submissions: [parsed.data.submission] };
    const rawText = current.rawOcrText ?? current.ocrText;
    const overrides = parsed.data.correctedText === rawText
      ? new Map<string, string>()
      : new Map([[`${parsed.data.submission.assetId}:${parsed.data.question.displayNo}`, parsed.data.correctedText]]);
    const [rescored] = await gradeTrialSubmissions(request.params.taskId, correctionRequest, getMaterials(request.params.taskId), config, overrides);
    const updated = { ...rescored, status: current.status, resultSource: current.resultSource, teacherScore: current.teacherScore, teacherReason: current.teacherReason, isFinal: current.isFinal, reviewStatus: current.reviewStatus, reviewDecision: current.reviewDecision, feedbackReasons: current.feedbackReasons };
    const latest = getTrialGradingResult(request.params.taskId);
    if (!latest?.samples.some(sample => sample.id === current.id)) { response.status(409).json({ code: 'TRIAL_RESULT_CHANGED' }); return; }
    const result = saveTrialGradingResult({ ...latest, samples: latest.samples.map(sample => sample.id === current.id ? updated : sample), createdAt: new Date().toISOString() });
    response.json({ sample: updated, result });
  } catch (error) {
    console.error(JSON.stringify({ event: 'ocr_correction_rescore_failed', taskId: request.params.taskId, sampleId: request.params.sampleId, error: error instanceof Error ? error.message : String(error) }));
    response.status(502).json({ code: 'OCR_CORRECTION_RESCORE_FAILED' });
  }
});

router.put('/:taskId/trial-grading/:sampleId/teacher-review', (request, response) => {
  const parsed = teacherReviewSchema.safeParse(request.body);
  const existing = getTrialGradingResult(request.params.taskId);
  const current = existing?.samples.find(sample => sample.id === request.params.sampleId);
  if (!parsed.success) { response.status(400).json({ code: 'INVALID_TEACHER_REVIEW' }); return; }
  if (!existing || !current) { response.status(404).json({ code: 'TRIAL_SAMPLE_NOT_FOUND' }); return; }
  let updated;
  try { updated = applyTeacherReviewDecision(current, parsed.data); }
  catch (error) {
    const code = error instanceof Error ? error.message : 'INVALID_TEACHER_REVIEW';
    response.status(code === 'AI_SCORE_CONFIRMATION_MISMATCH' ? 409 : 400).json({ code });
    return;
  }
  const result = saveTrialGradingResult({ ...existing, samples: existing.samples.map(sample => sample.id === current.id ? updated : sample), createdAt: new Date().toISOString() });
  response.json({ sample: updated, result });
});

router.post('/:taskId/trial-grading/regrade-question', async (request, response) => {
  const parsed = trialGradingRequestSchema.safeParse(request.body);
  const existing = getTrialGradingResult(request.params.taskId);
  const config = getModelConfig();
  if (!parsed.success || parsed.data.questions.length !== 1) { response.status(400).json({ code: 'INVALID_QUESTION_REGRADING_REQUEST' }); return; }
  if (!existing) { response.status(404).json({ code: 'TRIAL_GRADING_NOT_FOUND' }); return; }
  if (!isModelConfigured(config)) { response.status(503).json({ code: 'MODEL_NOT_CONFIGURED' }); return; }
  const [question] = parsed.data.questions;
  const submissions = parsed.data.submissions.filter(submission => {
    const sample = existing.samples.find(item => item.questionId === question.questionId && item.sourceAssetId === submission.assetId);
    return sample?.status !== 'confirmed';
  });
  try {
    const overrides = buildTeacherAnswerOverrides(existing, question.questionId, question.displayNo);
    const settled = await Promise.allSettled(submissions.map(submission => gradeTrialSubmissions(
      request.params.taskId,
      { questions: [question], submissions: [submission] },
      getMaterials(request.params.taskId),
      config,
      overrides
    )));
    const failed = settled.find((item): item is PromiseRejectedResult => item.status === 'rejected');
    if (failed) throw failed.reason;
    const refreshed = settled.flatMap(item => item.status === 'fulfilled' ? item.value : []);
    const samples = mergeRegradedQuestionSamples(existing, question.questionId, question.rubricVersion, refreshed);
    const result = saveTrialGradingResult({ ...existing, model: config.visionModel, samples, createdAt: new Date().toISOString() });
    response.json({ result });
  } catch (error) {
    console.error(JSON.stringify({ event: 'question_regrading_failed', taskId: request.params.taskId, questionId: question.questionId, error: error instanceof Error ? error.message : String(error) }));
    response.status(502).json({ code: 'QUESTION_REGRADING_FAILED' });
  }
});

router.get('/:taskId/batch-grading', (request, response) => {
  const stored = getGradingBatch(request.params.taskId);
  response.json({ batch: stored ? { ...stored, studentIds: stored.studentIds ?? [], confirmedStudentIds: stored.confirmedStudentIds ?? [] } : { taskId: request.params.taskId, status: 'idle', mode: 'batch-checkpoint', totalStudents: 0, processedStudents: 0, failedStudentIds: [], studentIds: [], confirmedStudentIds: [], updatedAt: new Date().toISOString() } });
});

router.post('/:taskId/batch-grading/start', async (request, response) => {
  const parsed = batchRequestSchema.safeParse(request.body);
  const config = getModelConfig();
  if (!parsed.success) { response.status(400).json({ code: 'INVALID_BATCH_GRADING_REQUEST' }); return; }
  if (!isModelConfigured(config)) { response.status(503).json({ code: 'MODEL_NOT_CONFIGURED' }); return; }
  const startedAt = new Date().toISOString();
  const studentIds = parsed.data.submissions.map(item => item.studentId);
  const previousConfirmed = getGradingBatch(request.params.taskId)?.confirmedStudentIds ?? [];
  saveGradingBatch({ taskId: request.params.taskId, status: 'running', mode: parsed.data.mode as GradingMode, totalStudents: parsed.data.submissions.length, processedStudents: 0, failedStudentIds: [], studentIds, confirmedStudentIds: previousConfirmed.filter(id => studentIds.includes(id)), startedAt, updatedAt: startedAt });
  try {
    const existing = getTrialGradingResult(request.params.taskId);
    const missing = findSubmissionsNeedingTrialGrading(existing, parsed.data);
    const refreshed = [];
    const failedStudentIds: string[] = [];
    for (const submission of missing) {
      const currentBatch = getGradingBatch(request.params.taskId);
      if (currentBatch?.status === 'paused') { response.json({ batch: currentBatch, result: existing }); return; }
      try {
        refreshed.push(...await gradeTrialSubmissions(request.params.taskId, { questions: parsed.data.questions, submissions: [submission] }, getMaterials(request.params.taskId), config));
      } catch { failedStudentIds.push(submission.studentId); }
      saveGradingBatch({ ...currentBatch!, processedStudents: parsed.data.submissions.length - missing.length + refreshed.length / parsed.data.questions.length + failedStudentIds.length, failedStudentIds, updatedAt: new Date().toISOString() });
    }
    const result = saveTrialGradingResult({ taskId: request.params.taskId, model: config.visionModel, samples: mergeCurrentTrialSamples(existing, parsed.data, refreshed), createdAt: new Date().toISOString() });
    const completedAt = new Date().toISOString();
    const currentBatch = getGradingBatch(request.params.taskId)!;
    const autoConfirmed = parsed.data.mode === 'auto-continue'
      ? studentIds.filter(studentId => !result.samples.some(sample => sample.studentId === studentId && sample.reviewTriggers?.length))
      : currentBatch.confirmedStudentIds;
    const batch = saveGradingBatch({ ...currentBatch, status: failedStudentIds.length ? 'failed' : 'completed', mode: parsed.data.mode as GradingMode, totalStudents: parsed.data.submissions.length, processedStudents: parsed.data.submissions.length, failedStudentIds, studentIds, confirmedStudentIds: [...new Set(autoConfirmed)], startedAt, completedAt, updatedAt: completedAt });
    response.json({ batch, result });
  } catch (error) {
    const batch = saveGradingBatch({ taskId: request.params.taskId, status: 'failed', mode: parsed.data.mode as GradingMode, totalStudents: parsed.data.submissions.length, processedStudents: 0, failedStudentIds: parsed.data.submissions.map(item => item.studentId), studentIds, confirmedStudentIds: previousConfirmed.filter(id => studentIds.includes(id)), startedAt, updatedAt: new Date().toISOString() });
    response.status(502).json({ code: 'BATCH_GRADING_FAILED', batch });
  }
});

router.post('/:taskId/batch-grading/confirm', (request, response) => {
  const parsed = batchConfirmationSchema.safeParse(request.body);
  const current = getGradingBatch(request.params.taskId);
  if (!parsed.success || !current) { response.status(400).json({ code: 'INVALID_BATCH_CONFIRMATION' }); return; }
  const confirmedStudentIds = [...new Set([...(current.confirmedStudentIds ?? []), ...parsed.data.studentIds.filter(id => (current.studentIds ?? []).includes(id))])];
  response.json({ batch: saveGradingBatch({ ...current, confirmedStudentIds, updatedAt: new Date().toISOString() }) });
});

router.post('/:taskId/batch-grading/:action', (request, response) => {
  const current = getGradingBatch(request.params.taskId);
  if (!current || (request.params.action !== 'pause' && request.params.action !== 'resume')) { response.status(404).json({ code: 'BATCH_ACTION_NOT_AVAILABLE' }); return; }
  const batch = saveGradingBatch({ ...current, status: request.params.action === 'pause' ? 'paused' : 'running', updatedAt: new Date().toISOString() });
  response.json({ batch });
});

router.post('/:taskId/diagnosis', (request, response) => {
  const questions = z.array(z.object({ id: z.string(), displayNo: z.string(), score: z.number() })).safeParse(request.body.questions);
  const result = getTrialGradingResult(request.params.taskId);
  if (!questions.success || !result) { response.status(409).json({ code: 'DIAGNOSIS_INPUT_NOT_READY' }); return; }
  const normalized = questions.data.map(item => ({ ...item, title: '', knowledgePoint: '', knowledgeLinks: [], desc: '', parseConfidence: 1, sourceEvidenceIds: [] }));
  response.json({ diagnosis: buildGradingDiagnosis(request.params.taskId, normalized, result.samples) });
});

router.post('/:taskId/trial-grading', async (request, response) => {
  const parsed = trialGradingRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: 'INVALID_TRIAL_GRADING_REQUEST' });
    return;
  }
  const config = getModelConfig();
  if (!isModelConfigured(config)) {
    response.status(503).json({ code: 'MODEL_NOT_CONFIGURED' });
    return;
  }
  const materials = getMaterials(request.params.taskId);
  const materialsById = new Map(materials.map(material => [material.id, material]));
  const invalidSubmission = parsed.data.submissions.find(submission => {
    const material = materialsById.get(submission.assetId);
    return !material || material.kind !== 'student-submission' || !material.normalizedDocument;
  });
  if (invalidSubmission) {
    response.status(409).json({ code: 'SUBMISSION_MATERIAL_NOT_READY' });
    return;
  }
  const expectedQuestionNos = parsed.data.questions.map(question => question.displayNo);
  const incompleteVision = parsed.data.submissions.find(submission => {
    const result = getVisionValidationResult(request.params.taskId, submission.assetId);
    return !result || expectedQuestionNos.some(displayNo => !result.items.some(item => item.displayNo === displayNo));
  });
  if (incompleteVision) {
    response.status(409).json({ code: 'VISION_RESULTS_NOT_READY' });
    return;
  }
  try {
    const existingResult = getTrialGradingResult(request.params.taskId);
    const submissionsToGrade = findSubmissionsNeedingTrialGrading(existingResult, parsed.data);
    if (!submissionsToGrade.length) {
      const result: TrialGradingResult = {
        taskId: request.params.taskId,
        model: existingResult?.model ?? config.visionModel,
        samples: mergeCurrentTrialSamples(existingResult, parsed.data, []),
        createdAt: new Date().toISOString()
      };
      saveTrialGradingResult(result);
      response.json({ result });
      return;
    }
    const settled = await Promise.allSettled(submissionsToGrade.map(async submission => {
      const incrementalRequest = { ...parsed.data, submissions: [submission] };
      return gradeTrialSubmissions(request.params.taskId, incrementalRequest, materials, config);
    }));
    const failed = settled.find((item): item is PromiseRejectedResult => item.status === 'rejected');
    if (failed) {
      const reason = failed.reason instanceof Error ? failed.reason.message : String(failed.reason);
      throw new Error(reason);
    }
    const refreshedSamples = settled.flatMap(item => item.status === 'fulfilled' ? item.value : []);
    const result: TrialGradingResult = {
      taskId: request.params.taskId,
      model: config.visionModel,
      samples: mergeCurrentTrialSamples(existingResult, parsed.data, refreshedSamples),
      createdAt: new Date().toISOString()
    };
    saveTrialGradingResult(result);
    response.json({ result });
  } catch (error) {
    recordGradingError('trial_grading_failed', request.params.taskId, error, { submissionCount: parsed.data.submissions.length, questionCount: parsed.data.questions.length });
    console.error(JSON.stringify({ event: 'trial_grading_failed', taskId: request.params.taskId, error: error instanceof Error ? error.message : String(error) }));
    const message = error instanceof Error ? error.message : 'TRIAL_GRADING_FAILED';
    response.status(502).json({ code: message.startsWith('MODEL_REQUEST_FAILED:') ? message : 'TRIAL_GRADING_OUTPUT_INVALID' });
  }
});

router.post('/:taskId/analysis', async (request, response) => {
  const analysisStartedAt = new Date();
  const config = getModelConfig();
  if (!isModelConfigured(config)) {
    response.status(503).json({ code: 'MODEL_NOT_CONFIGURED' });
    return;
  }
  const parsedCatalog = knowledgeCatalogSchema.safeParse(request.body.knowledgeCatalog ?? []);
  if (!parsedCatalog.success) {
    response.status(400).json({ code: 'INVALID_KNOWLEDGE_CATALOG' });
    return;
  }
  const materials = getMaterials(request.params.taskId);
  const analysisMaterials = materials.filter(item => item.kind === 'assignment' || item.kind === 'reference-answer');
  if (!analysisMaterials.some(item => item.kind === 'assignment' && item.normalizedDocument)) {
    response.status(409).json({ code: 'ASSIGNMENT_MATERIAL_REQUIRED' });
    return;
  }
  if (!analysisMaterials.some(item => item.kind === 'reference-answer' && item.normalizedDocument)) {
    response.status(409).json({ code: 'REFERENCE_ANSWER_REQUIRED' });
    return;
  }
  if (analysisMaterials.some(item => item.status === 'uploaded' || item.status === 'processing' || item.status === 'failed')) {
    response.status(409).json({ code: 'MATERIALS_NOT_READY' });
    return;
  }
  try {
    const previousAnalysis = getFirstSectionAnalysis(request.params.taskId);
    const analyzer = new OpenAICompatibleQuestionAnalyzer(config);
    const rawAnalysis = await analyzer.analyzeAssignment(analysisMaterials, parsedCatalog.data);
    const catalogById = new Map(parsedCatalog.data.map(node => [node.id, node]));
    const normalizeKnowledgeCandidates = (candidates: { nodeId: string; nodeName: string; confidence: number }[]) =>
      candidates.flatMap(candidate => {
        const node = catalogById.get(candidate.nodeId);
        return node ? [{ ...candidate, nodeName: node.name }] : [];
      });
    const normalizeRubricPoints = (points: { point?: string; score?: number | null; description?: string }[]) =>
      points
        .filter(point => point.point?.trim() || point.description?.trim())
        .map(point => ({ point: point.point?.trim() || point.description?.trim() || '', score: point.score ?? null, description: point.description ?? '' }));
    const questions = rawAnalysis.questions.map(rawQuestion => {
      const question = rawQuestion;
      const previousQuestion = previousAnalysis?.questions.find(item => item.displayNo === question.displayNo);
      const preserveManualRegion = <T extends AnalysisEvidenceRef>(source: T, previousSource: AnalysisEvidenceRef | null | undefined): T =>
        previousSource?.assetId === source.assetId && previousSource.manualRegion
          ? { ...source, manualRegion: previousSource.manualRegion } as T
          : source;
      const questionSource = preserveManualRegion(question.questionSource, previousQuestion?.questionSource);
      const answerSource = question.answerSource
        ? preserveManualRegion(question.answerSource, previousQuestion?.answerSource)
        : null;
      return {
        ...question,
        questionSource: resolveSourceEvidence(request.params.taskId, questionSource, analysisMaterials, true),
        answerSource: answerSource ? resolveSourceEvidence(request.params.taskId, answerSource, analysisMaterials, true) : null,
        rubricPoints: normalizeRubricPoints(question.rubricPoints),
        knowledgeCandidates: normalizeKnowledgeCandidates(question.knowledgeCandidates),
        subquestions: question.subquestions.map(subquestion => ({
          ...subquestion,
          questionSource: resolveSourceEvidence(request.params.taskId, subquestion.questionSource, analysisMaterials),
          answerSource: subquestion.answerSource ? resolveSourceEvidence(request.params.taskId, subquestion.answerSource, analysisMaterials) : null,
          rubricPoints: normalizeRubricPoints(subquestion.rubricPoints),
          knowledgeCandidates: normalizeKnowledgeCandidates(subquestion.knowledgeCandidates)
        }))
      };
    }) as FirstSectionAnalysis['questions'];
    const analysisCompletedAt = new Date();
    const analysis = saveFirstSectionAnalysis({
      taskId: request.params.taskId,
      scope: rawAnalysis.scope,
      status: 'needs-review',
      model: config.visionModel,
      materialAssetIds: analysisMaterials.map(material => material.id),
      questions,
      createdAt: analysisCompletedAt.toISOString(),
      processingMetrics: {
        startedAt: analysisStartedAt.toISOString(),
        completedAt: analysisCompletedAt.toISOString(),
        durationMs: analysisCompletedAt.getTime() - analysisStartedAt.getTime()
      }
    });
    deleteTrialGradingResult(request.params.taskId);
    deleteGradingBatch(request.params.taskId);
    deleteVisionValidationForTask(request.params.taskId);
    response.json({ analysis });
  } catch (error) {
    console.error(JSON.stringify({ event: 'first_section_analysis_failed', taskId: request.params.taskId, error: error instanceof Error ? error.message : String(error) }));
    const message = error instanceof Error ? error.message : 'ANALYSIS_FAILED';
    const failure = classifyQuestionAnalysisError(message);
    response.status(failure.statusCode).json({ code: failure.code });
  }
});

router.use((error: unknown, _request: import('express').Request, response: import('express').Response, next: import('express').NextFunction) => {
  if (error instanceof WorkspaceDataReadError) {response.status(503).json({code:error.code,message:error.message,saved:false});return;}
  next(error);
});

export default router;
