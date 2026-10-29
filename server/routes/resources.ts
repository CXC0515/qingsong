import {retrieveTeachingContext} from '../services/resources/resourceRetrievalService';
import { WorkspaceDataReadError } from '../repositories/workspaceFileStore';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { resourceRepository } from "../repositories/resourceRepository";
import { materialPoolRepository } from "../repositories/materialPoolRepository";
import {
  getResourcePagePdfPath,
  processLibraryResource,
  readPdfPageCount,
} from "../services/resources/resourceProcessingService";
import { getResourcePageImagePath } from "../services/resources/resourcePageRenderService";
import { assertPathInsideWorkspace, uploadFilePath } from "../context/workspaceContext";
import { uploadRateLimit } from '../middleware/security';
import { authenticatedUploadPath, resumeAuthenticatedWorkspace } from '../middleware/authenticated';
import { runtimeConfig } from '../config/runtimeConfig';

const router = Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: (request, _file, callback) => {
      try {
        const directory = authenticatedUploadPath(request, "resources");
        mkdirSync(directory, { recursive: true });
        callback(null, directory);
      } catch (error) {
        callback(error instanceof Error ? error : new Error("WORKSPACE_CONTEXT_REQUIRED"), "");
      }
    },
  }),
  limits: { fileSize: runtimeConfig.uploadLimits.resourceFileBytes, files: 1 },
  fileFilter: (_request, file, callback) =>
    callback(
      null,
      file.mimetype === "application/pdf" ||
        path.extname(file.originalname).toLowerCase() === ".pdf",
    ),
});

const resourceKindSchema = z.enum([
  "textbook",
  "supplement",
  "worksheet",
  "lesson-plan",
  "ppt-template",
  "notice",
  "other",
]);
const metadataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: resourceKindSchema,
  subject: z.string().trim().max(60).default(""),
  grade: z.string().trim().max(60).default(""),
  stageIds: z.array(z.string().trim().min(1).max(80)).max(8).default(["stage_general"]),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  publisher: z.string().trim().max(100).default(""),
  edition: z.string().trim().max(100).default(""),
  isPrimary: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((value) => value === true || value === "true")
    .default(false),
});
const analyzeSchema = z.object({
  pageStart: z.number().int().positive(),
  pageEnd: z.number().int().positive(),
});
const pageStateSchema = z.object({ included: z.boolean() });
const entityTypeSchema = z.enum([
  "domain",
  "topic",
  "knowledge",
  "question-type",
  "method",
  "example",
  "ability",
  "error",
]);
const relationTypeSchema = z.enum([
  "prerequisite",
  "related",
  "confusable",
  "examines",
  "applies-to",
  "demonstrates",
  "explains",
]);
const nodeInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: entityTypeSchema,
  description: z.string().trim().max(2000).default(""),
  aliases: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  subject: z.string().trim().max(60).default(""),
  grade: z.string().trim().max(60).default(""),
  primaryMotherId: z.string().min(1).nullable().optional(),
  trainable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
const structureInputSchema = z.object({
  primaryMotherId: z.string().min(1).nullable().optional(),
  trainable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "EMPTY_STRUCTURE_UPDATE",
});
const relationInputSchema = z
  .object({
    sourceNodeId: z.string().min(1),
    targetNodeId: z.string().min(1),
    type: relationTypeSchema,
    description: z.string().trim().max(1000).default(""),
  })
  .refine((value) => value.sourceNodeId !== value.targetNodeId, {
    message: "SELF_RELATION_NOT_ALLOWED",
  });
const reviewSchema = z
  .object({
    decision: z.enum(["accepted", "ignored", "merged"]),
    mergeTargetId: z.string().min(1).optional(),
    primaryMotherId: z.string().min(1).nullable().optional(),
  })
  .refine((value) => value.decision !== "merged" || value.mergeTargetId, {
    message: "MERGE_TARGET_REQUIRED",
  });

const decodeUploadFileName = (fileName: string) => {
  const decoded = Buffer.from(fileName, "latin1").toString("utf8");
  return decoded.includes("\uFFFD") ? fileName : decoded;
};

router.get("/resources", (_request, response) =>
  response.json({ resources: resourceRepository.listResources() }),
);

router.post("/resources", uploadRateLimit, upload.single("file"), resumeAuthenticatedWorkspace, async (request, response) => {
  const parsed = metadataSchema.safeParse(request.body);
  const file = request.file;
  if (!parsed.success || !file) {
    if (file) rmSync(file.path, { force: true });
    response
      .status(400)
      .json({
        code: !file ? "RESOURCE_FILE_REQUIRED" : "INVALID_RESOURCE_METADATA",
      });
    return;
  }
  let createdPoolItemId: string | undefined;
  try {
    const id = randomUUID();
    const fileName = decodeUploadFileName(file.originalname);
    const pageCount = await readPdfPageCount(file.path);
    const poolItem = materialPoolRepository.createItem({
      id: randomUUID(), originalName: fileName, detectedMime: "application/pdf",
      sizeBytes: file.size, sha256: createHash("sha256").update(readFileSync(file.path)).digest("hex"),
      diskPath: file.path, source: "resource-upload",
    });
    createdPoolItemId = poolItem.id;
    const resource = resourceRepository.createResource({
      id,
      ...parsed.data,
      fileName,
      mimeType: "application/pdf",
      pageCount,
      diskPath: file.path,
      publicUrl: `/api/resources/${id}/content`,
    }, poolItem.id);
    response
      .status(201)
      .json({ resource: { ...resource, diskPath: undefined } });
  } catch (error) {
    if (createdPoolItemId) materialPoolRepository.removeItemRecord(createdPoolItemId);
    rmSync(file.path, { force: true });
    response
      .status(400)
      .json({
        code: "INVALID_PDF",
        detail: error instanceof Error ? error.message : undefined,
      });
  }
});

router.post("/resources/from-pool", async (request, response) => {
  const parsed = metadataSchema.extend({ poolItemId: z.string().uuid() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ code: "INVALID_RESOURCE_METADATA" });
  const item = materialPoolRepository.getItem(parsed.data.poolItemId);
  if (!item || item.state !== 'saved') return response.status(404).json({ code: 'ITEM_NOT_FOUND' });
  if (item.detectedMime !== 'application/pdf') return response.status(400).json({ code: 'PDF_REQUIRED' });
  const existing = resourceRepository.listResources().find(resource => resource.poolItemId === item.id);
  if (existing) return response.json({ resource: existing, reused: true });
  const id = randomUUID();
  try {
    const pageCount = await readPdfPageCount(assertPathInsideWorkspace(item.diskPath));
    const { poolItemId: _poolItemId, ...metadata } = parsed.data;
    const resource = resourceRepository.createResource({
      id, ...metadata, fileName: item.originalName, mimeType: 'application/pdf', pageCount,
      diskPath: item.diskPath, publicUrl: `/api/resources/${id}/content`,
    }, item.id);
    return response.status(201).json({ resource: { ...resource, diskPath: undefined }, reused: false });
  } catch {
    const nowExisting = resourceRepository.listResources().find(resource => resource.poolItemId === item.id);
    if (nowExisting) return response.json({ resource: nowExisting, reused: true });
    return response.status(400).json({ code: 'INVALID_PDF' });
  }
});

router.get("/resources/search", (request, response) => {
  const query =
    typeof request.query.q === "string" ? request.query.q.trim() : "";
  if (!query) {
    response.status(400).json({ code: "SEARCH_QUERY_REQUIRED" });
    return;
  }
  response.json({ chunks: resourceRepository.searchChunks(query) });
});

router.get("/resources/:resourceId", (request, response) => {
  const resource = resourceRepository.getStoredResource(
    request.params.resourceId,
  );
  if (!resource) {
    response.status(404).json({ code: "RESOURCE_NOT_FOUND" });
    return;
  }
  const { diskPath: _diskPath, ...publicResource } = resource;
  response.json({
    resource: {
      ...publicResource,
      chunks: resourceRepository.listChunks(resource.id),
      suggestions: resourceRepository.listSuggestions(resource.id),
      pages: resourceRepository.listResourcePages(resource.id),
      processingJobs: resourceRepository.listProcessingJobs(resource.id),
    },
  });
});

router.get("/resources/:resourceId/retrieve", (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
  if (!query) {
    response.status(400).json({ code: "SEARCH_QUERY_REQUIRED" });
    return;
  }
  response.json({ results: resourceRepository.retrieveResourceChunks(request.params.resourceId, query, 10) });
});

router.patch("/resources/:resourceId", (request, response) => {
  const parsed = metadataSchema.partial().safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "INVALID_RESOURCE_METADATA" });
    return;
  }
  const resource = resourceRepository.updateResource(
    request.params.resourceId,
    parsed.data,
  );
  if (!resource) {
    response.status(404).json({ code: "RESOURCE_NOT_FOUND" });
    return;
  }
  const { diskPath: _diskPath, ...publicResource } = resource;
  response.json({ resource: publicResource });
});

router.delete("/resources/:resourceId", (request, response) => {
  const resource = resourceRepository.getStoredResource(
    request.params.resourceId,
  );
  if (!resource) {
    response.status(404).json({ code: "RESOURCE_NOT_FOUND" });
    return;
  }
  resourceRepository.deleteResource(resource.id);
  if (!resource.poolItemId) rmSync(resource.diskPath, { force: true });
  rmSync(uploadFilePath("parsed", resource.id), {
    recursive: true,
    force: true,
  });
  response.status(204).end();
});

router.get("/resources/:resourceId/content", (request, response) => {
  const resource = resourceRepository.getStoredResource(
    request.params.resourceId,
  );
  if (!resource) {
    response.status(404).json({ code: "RESOURCE_NOT_FOUND" });
    return;
  }
  response.type(resource.mimeType);
  response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  response.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(resource.fileName)}`,
  );
  if (resource.mimeType === "application/pdf") {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'self'",
    );
  }
  try {
    response.sendFile(assertPathInsideWorkspace(resource.diskPath));
  } catch {
    response.status(404).json({ code: "RESOURCE_FILE_NOT_FOUND" });
  }
});

router.get("/resources/:resourceId/derived/*segments", (request, response) => {
  const resource = resourceRepository.getStoredResource(request.params.resourceId);
  if (!resource) return response.status(404).json({ code: "RESOURCE_NOT_FOUND" });
  const segments = Array.isArray(request.params.segments) ? request.params.segments : [request.params.segments];
  const target = uploadFilePath("parsed", resource.id, ...segments);
  response.setHeader("Cache-Control", "private, no-store");
  response.sendFile(assertPathInsideWorkspace(target));
});

router.get("/resources/:resourceId/pages/:pageNumber/content", async (request, response) => {
  const pageNumber = Number(request.params.pageNumber);
  try {
    const previewPath = await getResourcePagePdfPath(request.params.resourceId, pageNumber);
    response.type("application/pdf");
    response.sendFile(previewPath);
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAGE_PREVIEW_FAILED";
    response.status(code === "RESOURCE_NOT_FOUND" ? 404 : 400).json({ code });
  }
});

router.get("/resources/:resourceId/pages/:pageNumber/image", async (request, response) => {
  const pageNumber = Number(request.params.pageNumber);
  try {
    const imagePath = await getResourcePageImagePath(request.params.resourceId, pageNumber);
    response.type("image/jpeg");
    response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    response.sendFile(imagePath);
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAGE_RENDER_FAILED";
    response.status(code === "RESOURCE_NOT_FOUND" || code === "RESOURCE_PAGE_IMAGE_NOT_FOUND" ? 404 : 400).json({ code });
  }
});

router.patch("/resources/:resourceId/pages/:pageNumber", (request, response) => {
  const parsed = pageStateSchema.safeParse(request.body);
  const pageNumber = Number(request.params.pageNumber);
  if (!parsed.success || !Number.isInteger(pageNumber) || pageNumber < 1) {
    response.status(400).json({ code: "INVALID_RESOURCE_PAGE" });
    return;
  }
  const page = resourceRepository.setResourcePageIncluded(
    request.params.resourceId,
    pageNumber,
    parsed.data.included,
  );
  if (!page) {
    response.status(404).json({ code: "RESOURCE_PAGE_NOT_FOUND" });
    return;
  }
  response.json({ page });
});

router.post("/resources/:resourceId/analyze", (request, response) => {
  const parsed = analyzeSchema.safeParse(request.body);
  const resource = resourceRepository.getStoredResource(
    request.params.resourceId,
  );
  if (!parsed.success) {
    response.status(400).json({ code: "INVALID_PAGE_RANGE" });
    return;
  }
  if (!resource) {
    response.status(404).json({ code: "RESOURCE_NOT_FOUND" });
    return;
  }
  if (resource.status === "processing") {
    response.status(409).json({ code: "RESOURCE_ALREADY_PROCESSING" });
    return;
  }
  const { pageStart, pageEnd } = parsed.data;
  if (
    !resource.pageCount ||
    pageEnd > resource.pageCount ||
    pageEnd < pageStart ||
    pageEnd - pageStart > 39
  ) {
    response.status(400).json({ code: "INVALID_PAGE_RANGE" });
    return;
  }
  const job = resourceRepository.createProcessingJob(resource.id, pageStart, pageEnd);
  resourceRepository.markResourcePages(resource.id, pageStart, pageEnd, "processing");
  resourceRepository.markResourcePagesRag(resource.id, pageStart, pageEnd, "indexing");
  const queuedResource = resourceRepository.updateResource(resource.id, {
    status: "processing",
    parseErrorCode: undefined,
    parsedPageStart: pageStart,
    parsedPageEnd: pageEnd,
  });
  void processLibraryResource(resource.id, pageStart, pageEnd, job.id).catch(
    (error) => {
      console.error(
        JSON.stringify({
          event: "resource_processing_failed",
          resourceId: resource.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    },
  );
  response
    .status(202)
    .json({
      resource: queuedResource,
      job,
    });
});

router.get("/knowledge", (request, response) => {
  const query =
    typeof request.query.q === "string" ? request.query.q.trim() : "";
  const subject =
    typeof request.query.subject === "string"
      ? request.query.subject.trim()
      : undefined;
  const nodes = query
    ? resourceRepository.searchNodes(query, subject)
    : resourceRepository.listNodes();
  response.json({
    nodes,
    relations: resourceRepository.listRelations(),
    sourceLinks: resourceRepository.listSourceLinks(),
    resources: resourceRepository.listResources(),
    subjects: resourceRepository.listKnowledgeSubjects(),
    stages: resourceRepository.listKnowledgeStages(),
    tags: resourceRepository.listKnowledgeTags(),
  });
});

router.get("/knowledge/catalogs", (_request, response) => {
  response.json({
    subjects: resourceRepository.listKnowledgeSubjects(),
    stages: resourceRepository.listKnowledgeStages(),
    tags: resourceRepository.listKnowledgeTags(),
  });
});

router.post("/knowledge/subjects", (request, response) => {
  const parsed = z.object({
    name: z.string().trim().min(1).max(40),
    code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,7}$/),
  }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "INVALID_KNOWLEDGE_SUBJECT" });
    return;
  }
  try {
    response.status(201).json({ subject: resourceRepository.createKnowledgeSubject(parsed.data.name, parsed.data.code) });
  } catch {
    response.status(409).json({ code: "KNOWLEDGE_SUBJECT_ALREADY_EXISTS" });
  }
});

router.patch("/knowledge/subjects/:subjectId", (request, response) => {
  const parsed = z.object({
    name: z.string().trim().min(1).max(40).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  }).refine((value) => Object.keys(value).length > 0).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "INVALID_KNOWLEDGE_SUBJECT" });
    return;
  }
  try {
    const subject = resourceRepository.updateKnowledgeSubject(request.params.subjectId, parsed.data);
    if (!subject) {
      response.status(404).json({ code: "KNOWLEDGE_SUBJECT_NOT_FOUND" });
      return;
    }
    response.json({ subject });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    response.status(409).json({ code: code === "KNOWLEDGE_SUBJECT_IN_USE" ? code : "KNOWLEDGE_SUBJECT_ALREADY_EXISTS" });
  }
});

router.post("/knowledge/tags", (request, response) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(40) }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "INVALID_KNOWLEDGE_TAG" });
    return;
  }
  try {
    response.status(201).json({ tag: resourceRepository.createKnowledgeTag(parsed.data.name) });
  } catch {
    response.status(409).json({ code: "KNOWLEDGE_TAG_ALREADY_EXISTS" });
  }
});

router.get("/knowledge/tree", (request, response) => {
  const subject =
    typeof request.query.subject === "string"
      ? request.query.subject.trim()
      : "";
  if (!subject) {
    response.status(400).json({ code: "SUBJECT_REQUIRED" });
    return;
  }
  response.json(resourceRepository.listKnowledgeTree(subject));
});

router.get("/knowledge/nodes/:nodeId/focus", (request, response) => {
  const focus = resourceRepository.getKnowledgeFocus(request.params.nodeId);
  if (!focus) {
    response.status(404).json({ code: "KNOWLEDGE_NODE_NOT_FOUND" });
    return;
  }
  response.json(focus);
});

router.get("/resource-retrieval/knowledge-catalog", (request, response) => {
  const subject =
    typeof request.query.subject === "string"
      ? request.query.subject.trim()
      : undefined;
  const nodes = resourceRepository
    .listNodes()
    .filter(
      (node) =>
        node.trainable &&
        (node.type === "knowledge" || node.type === "ability") &&
        (!subject || node.subject === subject || node.subject === "通用"),
    );
  response.json({
    nodes: nodes.map((node) => ({
      id: node.id,
      code: node.code,
      name: node.name,
      type: node.type,
      aliases: node.aliases,
      description: node.description,
      stageIds: node.stageIds,
      tags: node.tags,
      path: resourceRepository
        .getKnowledgeFocus(node.id)
        ?.motherChain.map((item) => item.name) ?? [],
      version: node.version,
    })),
    relations: resourceRepository
      .listRelations()
      .filter(
        (relation) =>
          nodes.some((node) => node.id === relation.sourceNodeId) &&
          nodes.some((node) => node.id === relation.targetNodeId),
      ),
  });
});

router.post("/resource-retrieval/teaching-context", (request, response) => {
  const parsed = z
    .object({
      query: z.string().trim().min(1).max(500),
      subject: z.string().trim().max(60).optional(),
      resourceKinds: z.array(resourceKindSchema).max(8).optional(),
      preferredResourceIds: z.array(z.string().min(1)).max(20).optional(),
      limit: z.number().int().min(1).max(30).default(10),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "INVALID_RETRIEVAL_REQUEST" });
    return;
  }
  const {
    query,
    subject,
    resourceKinds,
    preferredResourceIds = [],
    limit,
  } = parsed.data;
  response.json(retrieveTeachingContext({query,subject,resourceKinds,preferredResourceIds,limit}));
});

router.post("/knowledge/nodes", (request, response) => {
  const parsed = nodeInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "INVALID_KNOWLEDGE_NODE" });
    return;
  }
  try {
    response
      .status(201)
      .json({ node: resourceRepository.createNode(parsed.data) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const invalidCodes = new Set(["INVALID_PRIMARY_MOTHER", "INVALID_KNOWLEDGE_SUBJECT", "INVALID_KNOWLEDGE_STAGE", "INVALID_KNOWLEDGE_TAG"]);
    response.status(invalidCodes.has(code) ? 400 : 409).json({
      code: invalidCodes.has(code) ? code : "KNOWLEDGE_NODE_ALREADY_EXISTS",
    });
  }
});

router.patch("/knowledge/nodes/:nodeId", (request, response) => {
  const parsed = nodeInputSchema.partial().safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "INVALID_KNOWLEDGE_NODE" });
    return;
  }
  try {
    const node = resourceRepository.updateNode(
      request.params.nodeId,
      parsed.data,
    );
    if (!node) {
      response.status(404).json({ code: "KNOWLEDGE_NODE_NOT_FOUND" });
      return;
    }
    response.json({ node });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const structureErrors = new Set([
      "INVALID_PRIMARY_MOTHER",
      "KNOWLEDGE_STRUCTURE_CYCLE",
      "KNOWLEDGE_STRUCTURE_HAS_CHILDREN",
      "INVALID_KNOWLEDGE_SUBJECT",
      "INVALID_KNOWLEDGE_STAGE",
      "INVALID_KNOWLEDGE_TAG",
    ]);
    response.status(409).json({
      code: structureErrors.has(code) ? code : "KNOWLEDGE_NODE_ALREADY_EXISTS",
    });
  }
});

router.patch("/knowledge/nodes/:nodeId/structure", (request, response) => {
  const parsed = structureInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "INVALID_STRUCTURE_UPDATE" });
    return;
  }
  try {
    const node = resourceRepository.updateNodeStructure(
      request.params.nodeId,
      parsed.data,
    );
    if (!node) {
      response.status(404).json({ code: "KNOWLEDGE_NODE_NOT_FOUND" });
      return;
    }
    response.json({ node });
  } catch (error) {
    response.status(409).json({
      code: error instanceof Error ? error.message : "INVALID_STRUCTURE_UPDATE",
    });
  }
});

router.delete("/knowledge/nodes/:nodeId", (request, response) => {
  const node = resourceRepository.updateNode(request.params.nodeId, {
    status: "archived",
  });
  if (!node) {
    response.status(404).json({ code: "KNOWLEDGE_NODE_NOT_FOUND" });
    return;
  }
  response.status(204).end();
});

router.post("/knowledge/nodes/:nodeId/merge", (request, response) => {
  const parsed = z
    .object({ targetNodeId: z.string().min(1) })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "INVALID_MERGE_TARGET" });
    return;
  }
  const node = resourceRepository.mergeNode(
    request.params.nodeId,
    parsed.data.targetNodeId,
  );
  if (!node) {
    response.status(404).json({ code: "KNOWLEDGE_NODE_NOT_FOUND" });
    return;
  }
  response.json({ node });
});

router.get("/knowledge/nodes/:nodeId/revisions", (request, response) => {
  response.json({
    revisions: resourceRepository
      .listRevisions("node", request.params.nodeId)
      .map((item) => ({ ...item, snapshot: JSON.parse(item.snapshot) })),
  });
});

router.post("/knowledge/relations", (request, response) => {
  const parsed = relationInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "INVALID_KNOWLEDGE_RELATION" });
    return;
  }
  try {
    response
      .status(201)
      .json({ relation: resourceRepository.createRelation(parsed.data) });
  } catch {
    response.status(409).json({ code: "KNOWLEDGE_RELATION_ALREADY_EXISTS" });
  }
});

router.post(
  "/knowledge/suggestions/:suggestionId/review",
  (request, response) => {
    const parsed = reviewSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ code: "INVALID_REVIEW_DECISION" });
      return;
    }
    const suggestion = resourceRepository.reviewSuggestion(
      request.params.suggestionId,
      parsed.data.decision,
      parsed.data.mergeTargetId,
      parsed.data.primaryMotherId,
    );
    if (!suggestion) {
      response.status(404).json({ code: "SUGGESTION_NOT_FOUND" });
      return;
    }
    response.json({ suggestion });
  },
);

router.post("/knowledge/suggestions/batch-review", (request, response) => {
  const parsed = z
    .object({
      suggestionIds: z.array(z.string().min(1)).min(1).max(100),
      decision: z.enum(["accepted", "ignored"]),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: "INVALID_BATCH_REVIEW" });
    return;
  }
  const suggestions = parsed.data.suggestionIds.flatMap((id) => {
    const result = resourceRepository.reviewSuggestion(
      id,
      parsed.data.decision,
    );
    return result ? [result] : [];
  });
  response.json({ suggestions });
});

router.use((error: unknown, _request: import('express').Request, response: import('express').Response, next: import('express').NextFunction) => {
  if (error instanceof WorkspaceDataReadError) {response.status(503).json({code:error.code,message:error.message,saved:false});return;}
  next(error);
});

export default router;
