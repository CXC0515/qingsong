import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type {
  DocumentNode,
  DocumentRecord,
  DocumentRevision,
  RichDocument,
} from "../../../src/domain/document";
import { emptyDocument } from "../../../src/domain/document";
import {
  documentNodeAttributes,
  documentMarkAttributes,
  documentStableNodeTypes,
  documentAttributeIssue,
} from "../../../src/domain/documentContract";
import type {
  Preparation,
  PreparationDetail,
  PreparationSource,
  DocumentProposal,
  PreparationTask,
  PreparationSessionBinding,
} from "../../../src/domain/preparation";
import { getWorkspaceContext } from "../../context/workspaceContext";
import { materialPoolRepository } from "../../repositories/materialPoolRepository";
import { resourceRepository } from "../../repositories/resourceRepository";
import { preparationRepository as repo } from "../../repositories/preparationRepository";
import { RESOURCE_UPLOAD_LIMIT_BYTES } from "../../../src/domain/uploadPolicy";

export class PreparationError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const fail = (code: string, message: string, status = 400): never => {
  throw new PreparationError(code, message, status);
};
const uuid = z.uuid();
const opaqueId = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[a-zA-Z0-9_-]+$/);
const operationId = z
  .string()
  .min(8)
  .max(160)
  .regex(/^[a-zA-Z0-9_-]+$/);
const title = z.string().trim().min(1).max(200);
const now = () => new Date().toISOString();
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ":" + canonical(item))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
};
function once<T>(id: string, input: unknown, action: () => T): T {
  operationId.parse(id);
  return repo.transaction(() => {
    const fingerprint = createHash("sha256")
      .update(canonical(input))
      .digest("hex");
    const previous = repo.operation(id);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        fail(
          "OPERATION_CONFLICT",
          "这次操作编号已用于其他内容，本次未保存，请重新操作。",
          409,
        );
      return JSON.parse(previous.result) as T;
    }
    const result = action();
    repo.saveOperation(id, fingerprint, result);
    return result;
  });
}
function requirePreparation(id: string): Preparation {
  uuid.parse(id);
  return (
    repo.get<Preparation>("preparations", id) ??
    fail(
      "PREPARATION_NOT_FOUND",
      "找不到当前账号可访问的备课，内容未修改，请返回备课列表核对。",
      404,
    )
  );
}
function editable(id: string) {
  const preparation = requirePreparation(id);
  if (preparation.status === "archived")
    fail(
      "PREPARATION_ARCHIVED",
      "这份备课已归档，未保存修改，请先取消归档。",
      409,
    );
  return preparation;
}
function touch(preparation: Preparation) {
  repo.put("preparations", { ...preparation, updatedAt: now() });
}
const nodeTypes = new Set(Object.keys(documentNodeAttributes));
const markTypes = new Set(Object.keys(documentMarkAttributes));
/** One document schema is used by the teacher editor, imports, proposals and historical exports. */
export function normalizeRichDocument(
  input: unknown,
  preparationId?: string,
): RichDocument {
  if (
    !input ||
    typeof input !== "object" ||
    JSON.stringify(input).length > 2_000_000
  )
    fail(
      "INVALID_DOCUMENT",
      "文档为空、格式不正确或内容过大，尚未保存。请缩小内容后重试。",
    );
  const seen = new Set<string>();
  let count = 0;
  function node(value: unknown, depth: number): DocumentNode {
    if (
      ++count > 20000 ||
      depth > 24 ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
      fail("INVALID_DOCUMENT", "文档结构过深或过大，尚未保存。请检查内容。");
    const v = value as Record<string, unknown>;
    if (
      typeof v.type !== "string" ||
      !nodeTypes.has(v.type) ||
      Object.keys(v).some(
        (key) => !["type", "attrs", "content", "text", "marks"].includes(key),
      )
    )
      fail(
        "INVALID_DOCUMENT",
        "文档包含尚不支持的内容，原稿未修改，请检查后重试。",
      );
    const type = v.type as string;
    const out: DocumentNode = { type };
    if (v.text !== undefined) {
      if (
        v.type !== "text" ||
        typeof v.text !== "string" ||
        v.text.length > 200000
      )
        fail("INVALID_DOCUMENT", "文档文字格式不正确，尚未保存。");
      out.text = v.text as string;
    }
    if (v.attrs !== undefined) {
      if (!v.attrs || typeof v.attrs !== "object" || Array.isArray(v.attrs))
        fail("INVALID_DOCUMENT", "文档属性格式不正确，尚未保存。");
      const attrs = v.attrs as Record<string, unknown>;
      const issue = documentAttributeIssue(type, attrs);
      if (issue) fail("INVALID_DOCUMENT", `文档${issue}，尚未保存。`);
      if (
        typeof attrs.omml === "string" &&
        /<!DOCTYPE|<!ENTITY|<script|<[^>]*altChunk|r:embed|r:link/i.test(
          attrs.omml,
        )
      )
        fail("INVALID_DOCUMENT", "公式包含不支持的外部内容，尚未保存。");
      out.attrs = { ...attrs };
    }
    if ((documentStableNodeTypes as readonly string[]).includes(type)) {
      const candidate =
        typeof out.attrs?.id === "string" &&
        /^[a-zA-Z0-9_-]{8,100}$/.test(out.attrs.id)
          ? out.attrs.id
          : randomUUID();
      const stableId = seen.has(candidate) ? randomUUID() : candidate;
      seen.add(stableId);
      out.attrs = { ...out.attrs, id: stableId };
    }
    if (
      v.type === "heading" &&
      (!Number.isInteger(out.attrs?.level) ||
        Number(out.attrs?.level) < 1 ||
        Number(out.attrs?.level) > 6)
    )
      fail("INVALID_DOCUMENT", "标题级别不正确，尚未保存。");
    if (v.type === "image") {
      const assetId = uuid.parse(out.attrs?.assetId);
      if (preparationId) {
        const asset = repo.get<DocumentAsset>("preparation_assets", assetId);
        if (!asset || asset.preparationId !== preparationId)
          fail("ASSET_NOT_FOUND", "文档图片不属于这份备课，原稿未修改。", 404);
        out.attrs = {
          ...out.attrs,
          src: `/api/preparations/${preparationId}/assets/${assetId}`,
        };
      } else if (
        out.attrs?.src &&
        !/^\/api\/preparations\/[a-f0-9-]+\/assets\/[a-f0-9-]+$/.test(
          String(out.attrs.src),
        )
      )
        fail("INVALID_DOCUMENT", "图片地址无效，尚未保存。");
    }
    if (v.content !== undefined) {
      if (!Array.isArray(v.content))
        fail("INVALID_DOCUMENT", "文档内容格式不正确，尚未保存。");
      out.content = (v.content as unknown[]).map((child) =>
        node(child, depth + 1),
      );
    }
    if (v.marks !== undefined) {
      if (!Array.isArray(v.marks))
        fail("INVALID_DOCUMENT", "文档文字样式不正确，尚未保存。");
      out.marks = (v.marks as unknown[]).map((mark) => {
        const parsed = z
          .object({
            type: z.string(),
            attrs: z.record(z.string(), z.unknown()).optional(),
          })
          .strict()
          .parse(mark);
        if (!markTypes.has(parsed.type))
          fail("INVALID_DOCUMENT", "文档含不支持的文字样式，尚未保存。");
        const issue = documentAttributeIssue(
          parsed.type,
          parsed.attrs ?? {},
          true,
        );
        if (issue) fail("INVALID_DOCUMENT", `文档${issue}，尚未保存。`);
        return parsed;
      });
    }
    return out;
  }
  const document = node(input, 0);
  const blockTypes = new Set([
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "table",
    "image",
    "blockMath",
    "blockquote",
    "codeBlock",
    "horizontalRule",
  ]);
  const inlineTypes = new Set(["text", "hardBreak", "inlineMath"]);
  function checkTable(table: DocumentNode) {
    const rows = table.content ?? [];
    const width = (rows[0]?.content ?? []).reduce(
      (sum, cell) => sum + (Number(cell.attrs?.colspan) || 1),
      0,
    );
    const occupiedUntil: number[] = [];
    const invalid = () =>
      fail("INVALID_DOCUMENT", "表格合并范围或行列不完整，尚未保存。请检查表格后重试。");
    if (!width)
      fail("INVALID_DOCUMENT", "表格缺少必要段落或单元格，尚未保存。请检查表格后重试。");
    rows.forEach((row, rowIndex) => {
      let column = 0;
      for (const cell of row.content ?? []) {
        while ((occupiedUntil[column] ?? 0) > rowIndex) column++;
        const colspan = Number(cell.attrs?.colspan) || 1;
        const rowspan = Number(cell.attrs?.rowspan) || 1;
        if (column + colspan > width || rowIndex + rowspan > rows.length)
          invalid();
        for (let offset = 0; offset < colspan; offset++) {
          if ((occupiedUntil[column + offset] ?? 0) > rowIndex) invalid();
          occupiedUntil[column + offset] = rowIndex + rowspan;
        }
        column += colspan;
      }
      while (column < width && (occupiedUntil[column] ?? 0) > rowIndex) column++;
      if (column !== width) invalid();
    });
  }
  function checkChildren(parent: DocumentNode) {
    const allowed = [
      "doc",
      "blockquote",
      "tableCell",
      "tableHeader",
      "listItem",
    ].includes(parent.type)
      ? blockTypes
      : ["paragraph", "heading"].includes(parent.type)
        ? inlineTypes
        : ["bulletList", "orderedList"].includes(parent.type)
          ? new Set(["listItem"])
          : parent.type === "table"
            ? new Set(["tableRow"])
            : parent.type === "tableRow"
              ? new Set(["tableCell", "tableHeader"])
              : parent.type === "codeBlock"
                ? new Set(["text"])
                : new Set<string>();
    if ((parent.content ?? []).some((child) => !allowed.has(child.type)))
      fail("INVALID_DOCUMENT", "文档段落、列表或表格结构不正确，尚未保存。");
    if (
      [
        "doc",
        "table",
        "tableCell",
        "tableHeader",
        "listItem",
        "bulletList",
        "orderedList",
        "blockquote",
      ].includes(parent.type) &&
      !parent.content?.length
    )
      fail(
        "INVALID_DOCUMENT",
        "文档、表格或列表缺少必要段落，尚未保存。请检查内容后重试。",
      );
    // A row can be empty only when earlier cells cover every column via rowspan.
    if (parent.type === "table") checkTable(parent);
    if (parent.type === "listItem" && parent.content?.[0]?.type !== "paragraph")
      fail("INVALID_DOCUMENT", "列表项目须以正文段落开始，尚未保存。");
    if (
      parent.type === "text" &&
      (typeof parent.text !== "string" || !parent.text)
    )
      fail("INVALID_DOCUMENT", "文档文字缺少内容，尚未保存。");
    for (const child of parent.content ?? []) checkChildren(child);
  }
  checkChildren(document);
  if (
    document.type !== "doc" ||
    !document.content ||
    document.content.some((child) => child.type === "doc")
  )
    fail("INVALID_DOCUMENT", "文档根结构不正确，尚未保存。");
  return document as RichDocument;
}
const metadata = z.object({
  title,
  subject: z.string().trim().max(60).default(""),
  grade: z.string().trim().max(60).default(""),
  edition: z.string().trim().max(120).default(""),
  classIds: z.array(z.string().min(1).max(160)).max(20).default([]),
  requirements: z.string().max(12000).default(""),
  knowledgeIds: z.array(z.string().min(1).max(160)).max(50).default([]),
});
function validateKnowledge(subject: string, knowledgeIds: string[]) {
  for (const id of knowledgeIds) {
    const node = resourceRepository.getNode(id);
    if (
      !node ||
      node.status !== "active" ||
      (subject && node.subject !== subject)
    )
      fail(
        "KNOWLEDGE_NOT_AVAILABLE",
        "所选知识内容不存在、已归档或学科不符，备课尚未保存。请重新选择。",
      );
  }
}
export function preparationInputFingerprint(preparationId: string): string {
  const preparation = requirePreparation(preparationId);
  const sources = repo
    .list<PreparationSource>("preparation_sources", preparationId)
    .map((source) => ({
      id: source.id,
      sha256: source.sha256,
      role: source.role,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return createHash("sha256")
    .update(
      canonical({
        title: preparation.title,
        subject: preparation.subject,
        grade: preparation.grade,
        edition: preparation.edition,
        requirements: preparation.requirements,
        knowledgeIds: preparation.knowledgeIds ?? [],
        classIds: preparation.classIds,
        sources,
      }),
    )
    .digest("hex");
}
export function listPreparations(): Preparation[] {
  return repo
    .list<Preparation>("preparations")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function getPreparation(id: string): PreparationDetail {
  return {
    preparation: requirePreparation(id),
    documents: repo.list<DocumentRecord>("preparation_documents", id),
    sources: repo.list<PreparationSource>("preparation_sources", id),
    proposals: listProposals(id),
    tasks: listTasks(id),
  };
}
export function createPreparation(input: unknown): PreparationDetail {
  const parsed = metadata.extend({ operationId }).strict().parse(input);
  const { operationId: op, ...fields } = parsed;
  return once(op, ["create", fields], () => {
    validateKnowledge(fields.subject, fields.knowledgeIds);
    const date = now(),
      preparation: Preparation = {
        ...fields,
        id: randomUUID(),
        status: "draft",
        createdAt: date,
        updatedAt: date,
      };
    repo.put("preparations", preparation);
    const document: DocumentRecord = {
      id: randomUUID(),
      preparationId: preparation.id,
      title: preparation.title,
      revision: 1,
      content: normalizeRichDocument(emptyDocument()),
      createdAt: date,
      updatedAt: date,
    };
    repo.put("preparation_documents", document, preparation.id);
    repo.addRevision({ ...document, actor: "teacher", reason: "新建教案" });
    return getPreparation(preparation.id);
  });
}
export function updatePreparation(
  id: string,
  input: unknown,
): PreparationDetail {
  const parsed = metadata
    .partial()
    .extend({
      operationId,
      expectedUpdatedAt: z.string().optional(),
      status: z.enum(["draft", "ready", "archived"]).optional(),
    })
    .strict()
    .parse(input);
  const { operationId: op, expectedUpdatedAt, ...fields } = parsed;
  return once(op, ["update", id, fields, expectedUpdatedAt], () => {
    const current = requirePreparation(id);
    if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt)
      fail(
        "VERSION_CONFLICT",
        "备课要求已在其他窗口修改，本次未覆盖，请刷新核对。",
        409,
      );
    validateKnowledge(
      fields.subject ?? current.subject,
      fields.knowledgeIds ?? current.knowledgeIds ?? [],
    );
    repo.put("preparations", { ...current, ...fields, updatedAt: now() });
    return getPreparation(id);
  });
}
export function getDocument(
  preparationId: string,
  documentId: string,
  revision?: number,
): DocumentRecord {
  requirePreparation(preparationId);
  uuid.parse(documentId);
  const current = repo.get<DocumentRecord>("preparation_documents", documentId);
  if (!current || current.preparationId !== preparationId)
    fail("DOCUMENT_NOT_FOUND", "找不到这份教案，原稿未修改，请重新打开。", 404);
  if (revision === undefined) return current!;
  z.number().int().positive().parse(revision);
  return (
    repo.getRevision<DocumentRevision>(documentId, revision) ??
    fail("REVISION_NOT_FOUND", "找不到这个历史版本，当前稿未修改。", 404)
  );
}
export function listRevisions(
  preparationId: string,
  documentId: string,
): DocumentRevision[] {
  getDocument(preparationId, documentId);
  return repo.revisions<DocumentRevision>(documentId);
}
export interface SaveDocumentInput {
  expectedRevision: number;
  operationId: string;
  content: RichDocument;
  title?: string;
}
export function saveDocument(
  preparationId: string,
  documentId: string,
  input: SaveDocumentInput,
  actor: DocumentRevision["actor"] = "teacher",
  reason = "保存修改",
): DocumentRecord {
  const parsed = z
    .object({
      expectedRevision: z.number().int().positive(),
      operationId,
      content: z.unknown(),
      title: title.optional(),
    })
    .strict()
    .parse(input);
  return once(
    parsed.operationId,
    ["save", preparationId, documentId, parsed, actor, reason],
    () => {
      const preparation = editable(preparationId),
        current = getDocument(preparationId, documentId);
      if (current.revision !== parsed.expectedRevision)
        fail(
          "VERSION_CONFLICT",
          "这份教案已经有新修改，本次未覆盖。请保留当前输入，刷新后比较两份内容。",
          409,
        );
      const content = normalizeRichDocument(parsed.content, preparationId);
      const document: DocumentRecord = {
        ...current,
        content,
        title: parsed.title ?? current.title,
        revision: current.revision + 1,
        updatedAt: now(),
      };
      repo.put("preparation_documents", document, preparationId);
      repo.addRevision({ ...document, actor, reason });
      touch(preparation);
      return document;
    },
  );
}
export function forkDocument(
  preparationId: string,
  input: unknown,
): DocumentRecord {
  const parsed = z
    .object({
      sourceDocumentId: uuid,
      title,
      revision: z.number().int().positive().optional(),
      operationId,
    })
    .strict()
    .parse(input);
  return once(parsed.operationId, ["fork", preparationId, parsed], () => {
    const preparation = editable(preparationId),
      source = getDocument(
        preparationId,
        parsed.sourceDocumentId,
        parsed.revision,
      ),
      date = now();
    const document: DocumentRecord = {
      id: randomUUID(),
      preparationId,
      sourceDocumentId: source.id,
      title: parsed.title,
      revision: 1,
      content: source.content,
      createdAt: date,
      updatedAt: date,
    };
    repo.put("preparation_documents", document, preparationId);
    repo.addRevision({ ...document, actor: "teacher", reason: "另存教学版本" });
    touch(preparation);
    return document;
  });
}
export function restoreRevision(
  preparationId: string,
  documentId: string,
  input: unknown,
): DocumentRecord {
  const parsed = z
    .object({
      revision: z.number().int().positive(),
      expectedRevision: z.number().int().positive(),
      operationId,
    })
    .strict()
    .parse(input);
  const source = getDocument(preparationId, documentId, parsed.revision);
  return saveDocument(
    preparationId,
    documentId,
    {
      expectedRevision: parsed.expectedRevision,
      operationId: parsed.operationId,
      content: source.content,
      title: source.title,
    },
    "teacher",
    `恢复历史版本 ${parsed.revision}`,
  );
}
async function checkedFile(filePath: string, expectedDigest?: string) {
  const context = getWorkspaceContext();
  const [root, file, info] = await Promise.all([
    realpath(context.uploadDirectory),
    realpath(filePath),
    lstat(filePath),
  ]);
  if (
    !file.startsWith(root + path.sep) ||
    info.isSymbolicLink() ||
    !info.isFile() ||
    info.size > RESOURCE_UPLOAD_LIMIT_BYTES
  )
    fail(
      "SOURCE_UNAVAILABLE",
      "资料文件不可读取，原件和教案未修改，请重新选择资料。",
      404,
    );
  const sha256 = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
  if (expectedDigest && sha256 !== expectedDigest)
    fail(
      "SOURCE_CHANGED",
      "资料内容已变化，未继续读取旧版本。教案保留，请重新选择资料。",
      409,
    );
  return { filePath: file, sha256, sizeBytes: info.size };
}
async function boundedFile(filePath: string, expectedDigest?: string) {
  try {
    return await checkedFile(filePath, expectedDigest);
  } catch (error) {
    if (error instanceof PreparationError) throw error;
    throw new PreparationError(
      "SOURCE_UNAVAILABLE",
      "资料原件暂时无法读取，教案和已保存内容保留。请检查原件是否仍在或重新选择资料。",
      404,
    );
  }
}
async function sourceFile(kind: PreparationSource["kind"], id: string) {
  const pool = kind === "pool" ? materialPoolRepository.getItem(id) : undefined;
  if (kind === "pool") {
    if (!pool || pool.state !== "saved")
      fail(
        "SOURCE_NOT_FOUND",
        "所选材料已回收或当前账号不可访问，未加入备课。",
        404,
      );
    return {
      ...(await boundedFile(pool!.diskPath, pool!.sha256)),
      fileName: pool!.originalName,
      mimeType: pool!.detectedMime,
      sourceUrl: pool!.contentUrl,
    };
  }
  const resource = resourceRepository.getStoredResource(id);
  if (!resource)
    fail("SOURCE_NOT_FOUND", "找不到当前账号可访问的资料，未加入备课。", 404);
  if (resource!.poolItemId) {
    const backing = materialPoolRepository.getItem(resource!.poolItemId);
    if (!backing || backing.state !== "saved")
      fail("SOURCE_NOT_FOUND", "资料原件已回收，未读取文件。", 404);
  }
  return {
    ...(await boundedFile(resource!.diskPath)),
    fileName: resource!.fileName,
    mimeType: resource!.mimeType,
    sourceUrl: resource!.publicUrl,
  };
}
export async function addSource(
  preparationId: string,
  input: unknown,
): Promise<PreparationSource> {
  editable(preparationId);
  const parsed = z
    .object({
      kind: z.enum(["pool", "resource"]),
      id: uuid,
      role: z.enum(["base", "textbook", "reference"]),
      operationId,
    })
    .strict()
    .parse(input);
  const resolved = await sourceFile(parsed.kind, parsed.id);
  return once(parsed.operationId, ["source", preparationId, parsed], () => {
    const preparation = editable(preparationId);
    const existing = repo
      .list<PreparationSource>("preparation_sources", preparationId)
      .find(
        (source) =>
          source.kind === parsed.kind &&
          source.objectId === parsed.id &&
          source.role === parsed.role &&
          source.sha256 === resolved.sha256,
      );
    if (existing) return existing;
    const source: PreparationSource = {
      id: randomUUID(),
      preparationId,
      kind: parsed.kind,
      objectId: parsed.id,
      role: parsed.role,
      title: resolved.fileName,
      mimeType: resolved.mimeType,
      sha256: resolved.sha256,
      sourceUrl: resolved.sourceUrl,
      createdAt: now(),
    };
    repo.put("preparation_sources", source, preparationId);
    touch(preparation);
    return source;
  });
}
export function removeSource(preparationId: string, sourceId: string) {
  const preparation = editable(preparationId),
    source = repo.get<PreparationSource>(
      "preparation_sources",
      uuid.parse(sourceId),
    );
  if (!source || source.preparationId !== preparationId)
    fail("SOURCE_NOT_FOUND", "找不到这份备课资料，原件未删除。", 404);
  repo.remove("preparation_sources", sourceId);
  touch(preparation);
  return { removed: true, originalPreserved: true };
}
export async function resolveSourceFile(
  preparationId: string,
  sourceId: string,
) {
  requirePreparation(preparationId);
  const source = repo.get<PreparationSource>(
    "preparation_sources",
    uuid.parse(sourceId),
  );
  if (!source || source.preparationId !== preparationId)
    fail("SOURCE_NOT_FOUND", "此资料未选入当前备课，尚未读取。", 404);
  const resolved = await sourceFile(source!.kind, source!.objectId);
  if (resolved.sha256 !== source!.sha256)
    fail(
      "SOURCE_CHANGED",
      "所选资料内容已变化，尚未读取。请重新选用并核对教案引用。",
      409,
    );
  return resolved;
}
export interface DocumentAsset {
  id: string;
  preparationId: string;
  fileName: string;
  mimeType: string;
  sha256: string;
  relativePath: string;
  sizeBytes: number;
}
export function registerDocumentAsset(
  preparationId: string,
  input: Omit<DocumentAsset, "preparationId" | "id"> & { id?: string },
): DocumentAsset {
  editable(preparationId);
  const parsed = z
    .object({
      id: uuid.optional(),
      fileName: z.string().min(1).max(255),
      mimeType: z.enum([
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/svg+xml",
      ]),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      relativePath: z.string().min(1).max(500),
      sizeBytes: z
        .number()
        .int()
        .positive()
        .max(20 * 1024 * 1024),
    })
    .strict()
    .parse(input);
  if (
    path.isAbsolute(parsed.relativePath) ||
    parsed.relativePath.split(/[\\/]/).includes("..") ||
    !parsed.relativePath.startsWith(`preparations/${preparationId}/assets/`)
  )
    fail("INVALID_ASSET", "图片存储位置不正确，未加入教案。");
  const asset: DocumentAsset = {
    ...parsed,
    id: parsed.id ?? randomUUID(),
    preparationId,
  };
  const previous = repo.get<DocumentAsset>("preparation_assets", asset.id);
  if (
    previous &&
    previous.preparationId === preparationId &&
    previous.sha256 === asset.sha256 &&
    previous.relativePath === asset.relativePath &&
    previous.mimeType === asset.mimeType &&
    previous.sizeBytes === asset.sizeBytes
  )
    return previous;
  if (previous && canonical(previous) !== canonical(asset))
    fail("ASSET_CONFLICT", "图片编号已用于其他内容，未覆盖原件。", 409);
  repo.put("preparation_assets", asset, preparationId);
  return asset;
}
export async function resolveDocumentAsset(
  preparationId: string,
  assetId: string,
) {
  requirePreparation(preparationId);
  const asset = repo.get<DocumentAsset>(
    "preparation_assets",
    uuid.parse(assetId),
  );
  if (!asset || asset.preparationId !== preparationId)
    fail("ASSET_NOT_FOUND", "找不到当前教案的图片，原稿未修改。", 404);
  return {
    ...asset!,
    ...(await boundedFile(
      path.join(getWorkspaceContext().uploadDirectory, asset!.relativePath),
      asset!.sha256,
    )),
  };
}
export function listProposals(preparationId: string): DocumentProposal[] {
  requirePreparation(preparationId);
  return repo.list<DocumentProposal>("preparation_proposals", preparationId);
}
export function createProposal(
  preparationId: string,
  input: {
    documentId: string;
    baseRevision: number;
    content: RichDocument;
    summary: string;
    operationId: string;
  },
): DocumentProposal {
  const parsed = z
    .object({
      documentId: uuid,
      baseRevision: z.number().int().positive(),
      content: z.unknown(),
      summary: z.string().trim().min(1).max(4000),
      operationId,
    })
    .strict()
    .parse(input);
  return once(parsed.operationId, ["proposal", preparationId, parsed], () => {
    editable(preparationId);
    getDocument(preparationId, parsed.documentId, parsed.baseRevision);
    const proposal: DocumentProposal = {
      id: randomUUID(),
      preparationId,
      documentId: parsed.documentId,
      baseRevision: parsed.baseRevision,
      content: normalizeRichDocument(parsed.content, preparationId),
      summary: parsed.summary,
      status: "pending",
      createdAt: now(),
      inputFingerprint: preparationInputFingerprint(preparationId),
    };
    repo.put("preparation_proposals", proposal, preparationId);
    return proposal;
  });
}
export function applyProposal(
  preparationId: string,
  proposalId: string,
  input: { operationId: string },
): DocumentRecord {
  const op = operationId.parse(input.operationId);
  return once(op, ["apply-proposal", preparationId, proposalId], () => {
    editable(preparationId);
    const proposal = repo.get<DocumentProposal>(
      "preparation_proposals",
      uuid.parse(proposalId),
    );
    if (!proposal || proposal.preparationId !== preparationId)
      fail("PROPOSAL_NOT_FOUND", "找不到这份修改建议，正文未修改。", 404);
    if (
      proposal!.inputFingerprint &&
      proposal!.inputFingerprint !== preparationInputFingerprint(preparationId)
    )
      fail(
        "INPUT_CHANGED",
        "备课要求或所选资料已变化，尚未应用旧建议。请按当前要求重新生成或核对。",
        409,
      );
    if (proposal!.status !== "pending")
      fail("PROPOSAL_ALREADY_HANDLED", "这份建议已处理，未重复应用。", 409);
    const document = saveDocument(
      preparationId,
      proposal!.documentId,
      {
        expectedRevision: proposal!.baseRevision,
        operationId: `${op}-save`,
        content: proposal!.content,
      },
      "assistant",
      proposal!.summary,
    );
    repo.put(
      "preparation_proposals",
      {
        ...proposal!,
        status: "applied" as const,
        appliedRevision: document.revision,
      },
      preparationId,
    );
    const persisted=getDocument(preparationId,document.id);
    const applied=repo.get<DocumentProposal>('preparation_proposals',proposalId);
    if(applied?.status!=='applied'||applied.appliedRevision!==persisted.revision||canonical(persisted.content)!==canonical(document.content))
      fail('PREPARATION_VERIFY_FAILED','应用结果核验失败，本次事务已撤回。请核对教案后重试。',409);
    return persisted;
  });
}
export function discardProposal(
  preparationId: string,
  proposalId: string,
  input: { operationId: string },
): DocumentProposal {
  return once(
    input.operationId,
    ["discard-proposal", preparationId, proposalId],
    () => {
      editable(preparationId);
      const proposal = repo.get<DocumentProposal>(
        "preparation_proposals",
        uuid.parse(proposalId),
      );
      if (!proposal || proposal.preparationId !== preparationId)
        fail("PROPOSAL_NOT_FOUND", "找不到这份修改建议，正文未修改。", 404);
      if (proposal!.status === "applied")
        fail(
          "PROPOSAL_ALREADY_HANDLED",
          "建议已应用，不能当作未应用建议忽略。可从历史版本恢复。",
          409,
        );
      return repo.put(
        "preparation_proposals",
        { ...proposal!, status: "discarded" as const },
        preparationId,
      );
    },
  );
}
export function listTasks(preparationId: string): PreparationTask[] {
  requirePreparation(preparationId);
  return repo.list<PreparationTask>("preparation_tasks", preparationId);
}
export function getTask(
  preparationId: string,
  taskId: string,
): PreparationTask {
  requirePreparation(preparationId);
  const task = repo.get<PreparationTask>(
    "preparation_tasks",
    uuid.parse(taskId),
  );
  return task?.preparationId === preparationId
    ? task
    : fail("TASK_NOT_FOUND", "找不到这次备课任务，已有内容保留。", 404);
}
export function createTask(
  preparationId: string,
  input: {
    documentId?: string;
    sessionId?: string;
    instruction: string;
    stage?: string;
    operationId: string;
    result?: unknown;
  },
): PreparationTask {
  const parsed = z
    .object({
      documentId: uuid.optional(),
      sessionId: opaqueId.optional(),
      instruction: z.string().trim().min(1).max(12000),
      stage: z.string().max(100).optional(),
      operationId,
      result: z.unknown().optional(),
    })
    .strict()
    .parse(input);
  return once(parsed.operationId, ["task", preparationId, parsed], () => {
    editable(preparationId);
    if (parsed.documentId) getDocument(preparationId, parsed.documentId);
    const date = now(),
      task: PreparationTask = {
        id: randomUUID(),
        preparationId,
        documentId: parsed.documentId,
        sessionId: parsed.sessionId,
        instruction: parsed.instruction,
        stage: parsed.stage ?? "queued",
        status: "queued",
        result: parsed.result,
        createdAt: date,
        updatedAt: date,
      };
    repo.put("preparation_tasks", task, preparationId);
    return task;
  });
}
export function updateTask(
  preparationId: string,
  taskId: string,
  input: Partial<
    Pick<
      PreparationTask,
      "status" | "stage" | "message" | "result" | "sessionId"
    >
  >,
): PreparationTask {
  const parsed = z
    .object({
      status: z
        .enum([
          "queued",
          "running",
          "needs-input",
          "completed",
          "cancelled",
          "failed",
          "interrupted",
        ])
        .optional(),
      stage: z.string().max(100).optional(),
      message: z.string().max(4000).optional(),
      result: z.unknown().optional(),
      sessionId: opaqueId.optional(),
    })
    .strict()
    .parse(input);
  return repo.transaction(() => {
    const current = getTask(preparationId, taskId);
    if (
      ["completed", "cancelled", "failed", "interrupted"].includes(
        current.status,
      ) &&
      parsed.status &&
      parsed.status !== current.status
    )
      fail(
        "TASK_ALREADY_FINISHED",
        "任务已结束，未改变其状态。已有结果保留，请重新开始任务。",
        409,
      );
    const result = { ...current, ...parsed, updatedAt: now() };
    if ((JSON.stringify(result.result) ?? "").length > 2_500_000)
      fail("TASK_RESULT_LIMIT", "任务结果过大，未保存；已有教案保留。");
    repo.put("preparation_tasks", result, preparationId);
    return result;
  });
}
/** Persist the cancellation first, so a late model result can never create a new proposal. */
export function cancelTask(
  preparationId: string,
  taskId: string,
  input: unknown,
): PreparationTask {
  const parsed = z.object({ operationId }).strict().parse(input);
  return once(
    parsed.operationId,
    ["cancel-task", preparationId, taskId],
    () => {
      const task = getTask(preparationId, taskId);
      if (
        ["completed", "cancelled", "failed", "interrupted"].includes(
          task.status,
        )
      )
        return task;
      return updateTask(preparationId, taskId, {
        status: "cancelled",
        stage: "已停止",
        message: "任务已停止，已有教案和修改候选保留。可以重新开始。",
      });
    },
  );
}
export function interruptPreparationTasks(): number {
  let interrupted = 0;
  for (const preparation of listPreparations()) {
    for (const task of listTasks(preparation.id)) {
      if (!["queued", "running"].includes(task.status)) continue;
      updateTask(preparation.id, task.id, {
        status: "interrupted",
        message: "服务重新启动，上次任务已中断。已有教案保留，请核对后重试。",
      });
      interrupted++;
    }
  }
  return interrupted;
}
export function getNativeWorkspace(
  kind: "default" | "preparation",
): string | undefined {
  return repo.setting<string>("native-workspace-" + kind);
}
export function setNativeWorkspace(
  kind: "default" | "preparation",
  nativeWorkspaceId: string,
): string {
  opaqueId.parse(nativeWorkspaceId);
  repo.setSetting("native-workspace-" + kind, nativeWorkspaceId);
  return nativeWorkspaceId;
}
export function getSessionBinding(
  sessionId: string,
): PreparationSessionBinding | undefined {
  return repo.session<PreparationSessionBinding>(opaqueId.parse(sessionId));
}
export function findPreparationSession(
  preparationId: string,
  documentId?: string,
): PreparationSessionBinding | undefined {
  requirePreparation(preparationId);
  return repo
    .sessions<PreparationSessionBinding>(preparationId)
    .find((binding) => !documentId || binding.documentId === documentId);
}
export function listPreparationSessions(
  preparationId: string,
): PreparationSessionBinding[] {
  requirePreparation(preparationId);
  return repo.sessions<PreparationSessionBinding>(preparationId);
}
export function bindSession(
  preparationId: string,
  documentId: string | undefined,
  sessionId: string,
  nativeWorkspaceId: string,
): PreparationSessionBinding {
  requirePreparation(preparationId);
  if (documentId) getDocument(preparationId, documentId);
  opaqueId.parse(sessionId);
  opaqueId.parse(nativeWorkspaceId);
  const old = getSessionBinding(sessionId);
  if (
    old &&
    (old.preparationId !== preparationId || old.documentId !== documentId)
  )
    fail(
      "SESSION_ALREADY_BOUND",
      "这个会话已关联另一份教案，未更改。请为当前教案使用独立会话。",
      409,
    );
  const binding: PreparationSessionBinding = {
    preparationId,
    documentId,
    sessionId,
    nativeWorkspaceId,
    updatedAt: now(),
  };
  repo.setSession(sessionId, preparationId, binding);
  return binding;
}
