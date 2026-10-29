/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  DiscoverySuggestion,
  KnowledgeEntity,
  KnowledgeRelation,
  KnowledgeRelationType,
  KnowledgeSourceLink,
  KnowledgeStage,
  KnowledgeSubject,
  KnowledgeTag,
  LibraryResource,
  ResourceChunk,
  ResourcePageState,
  ResourceProcessingJob,
} from "../../src/domain/types";
import {
  middleSchoolMathNodes,
  middleSchoolMathRelations,
  retiredMiddleSchoolMathNodeIds,
} from "../data/knowledge/mathMiddleSchool";
import { getResourceDatabase } from "../database/resourceDatabase";

type JsonObject = Record<string, unknown>;
const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const toResource = (row: JsonObject): LibraryResource => ({
  id: String(row.id),
  poolItemId: row.pool_item_id ? String(row.pool_item_id) : undefined,
  title: String(row.title),
  fileName: String(row.file_name),
  mimeType: String(row.mime_type),
  kind: row.kind as LibraryResource["kind"],
  subject: String(row.subject),
  grade: String(row.grade),
  publisher: String(row.publisher),
  edition: String(row.edition),
  isPrimary: Boolean(row.is_primary),
  status: row.status as LibraryResource["status"],
  pageCount: row.page_count === null ? null : Number(row.page_count),
  publicUrl: String(row.public_url),
  parseErrorCode: row.parse_error_code
    ? String(row.parse_error_code)
    : undefined,
  summary: String(row.summary),
  tags: parseJson(String(row.tags_json), []),
  parsedPageStart:
    row.parsed_page_start === null ? undefined : Number(row.parsed_page_start),
  parsedPageEnd:
    row.parsed_page_end === null ? undefined : Number(row.parsed_page_end),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const toChunk = (row: JsonObject): ResourceChunk => ({
  id: String(row.id),
  resourceId: String(row.resource_id),
  parentId: row.parent_id ? String(row.parent_id) : undefined,
  level: row.level as ResourceChunk["level"],
  sourceType: row.source_type ? String(row.source_type) : undefined,
  contentType: row.content_type as ResourceChunk["contentType"],
  title: String(row.title),
  summary: String(row.summary),
  text: String(row.text),
  markdown: row.markdown ? String(row.markdown) : undefined,
  resourceUrls: parseJson(String(row.resource_urls_json ?? "[]"), []),
  tags: parseJson(String(row.tags_json), []),
  pageStart: Number(row.page_start),
  pageEnd: Number(row.page_end),
  boundingBox: parseJson(
    row.bounding_box_json ? String(row.bounding_box_json) : null,
    undefined,
  ),
  order: Number(row.sort_order),
});

const toNode = (row: JsonObject): KnowledgeEntity => ({
  id: String(row.id),
  code: row.code ? String(row.code) : "",
  name: String(row.name),
  type: row.type as KnowledgeEntity["type"],
  description: String(row.description),
  aliases: parseJson(String(row.aliases_json), []),
  subject: String(row.subject),
  grade: String(row.grade),
  stageIds: parseJson(String(row.stage_ids_json ?? "[]"), []),
  tags: parseJson(String(row.tags_json ?? "[]"), []),
  primaryMotherId: row.primary_mother_id
    ? String(row.primary_mother_id)
    : undefined,
  trainable: Boolean(row.trainable),
  sortOrder: Number(row.sort_order ?? 0),
  source: row.source as KnowledgeEntity["source"],
  version: Number(row.version),
  status: row.status as KnowledgeEntity["status"],
  mergedIntoId: row.merged_into_id ? String(row.merged_into_id) : undefined,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const toRelation = (row: JsonObject): KnowledgeRelation => ({
  id: String(row.id),
  sourceNodeId: String(row.source_node_id),
  targetNodeId: String(row.target_node_id),
  type: row.type as KnowledgeRelation["type"],
  description: String(row.description),
  source: row.source as KnowledgeRelation["source"],
  version: Number(row.version),
  status: row.status as KnowledgeRelation["status"],
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const toSourceLink = (row: JsonObject): KnowledgeSourceLink => ({
  id: String(row.id),
  nodeId: String(row.node_id),
  resourceId: String(row.resource_id),
  chunkId: String(row.chunk_id),
  pageNumber: Number(row.page_number),
  isPrimary: Boolean(row.is_primary),
  quote: String(row.quote),
  boundingBox: parseJson(
    row.bounding_box_json ? String(row.bounding_box_json) : null,
    undefined,
  ),
  createdAt: String(row.created_at),
});

const toSuggestion = (row: JsonObject): DiscoverySuggestion => ({
  id: String(row.id),
  resourceId: String(row.resource_id),
  kind: row.kind as DiscoverySuggestion["kind"],
  status: row.status as DiscoverySuggestion["status"],
  proposedType: row.proposed_type as DiscoverySuggestion["proposedType"],
  proposedName: String(row.proposed_name),
  description: String(row.description),
  aliases: parseJson(String(row.aliases_json), []),
  confidence: Number(row.confidence),
  rationale: String(row.rationale),
  sourceChunkIds: parseJson(String(row.source_chunk_ids_json), []),
  existingNodeId: row.existing_node_id
    ? String(row.existing_node_id)
    : undefined,
  targetNodeId: row.target_node_id ? String(row.target_node_id) : undefined,
  primaryMotherId: row.primary_mother_id
    ? String(row.primary_mother_id)
    : undefined,
  createdNodeId: row.created_node_id ? String(row.created_node_id) : undefined,
  createdAt: String(row.created_at),
  reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
});

const toResourcePage = (row: JsonObject): ResourcePageState => ({
  resourceId: String(row.resource_id),
  pageNumber: Number(row.page_number),
  included: Boolean(row.included),
  parseStatus: row.parse_status as ResourcePageState["parseStatus"],
  parseErrorCode: row.parse_error_code ? String(row.parse_error_code) : undefined,
  ragStatus: row.rag_status as ResourcePageState["ragStatus"],
  ragChunkCount: Number(row.rag_chunk_count ?? 0),
  ragIndexedAt: row.rag_indexed_at ? String(row.rag_indexed_at) : undefined,
  updatedAt: String(row.updated_at),
});

const toProcessingJob = (row: JsonObject): ResourceProcessingJob => ({
  id: String(row.id),
  resourceId: String(row.resource_id),
  pageStart: Number(row.page_start),
  pageEnd: Number(row.page_end),
  status: row.status as ResourceProcessingJob["status"],
  stage: row.stage as ResourceProcessingJob["stage"],
  phase: row.phase ? row.phase as ResourceProcessingJob["phase"] : undefined,
  metrics: parseJson(String(row.metrics_json ?? "{}"), {}),
  errorCode: row.error_code ? String(row.error_code) : undefined,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  completedAt: row.completed_at ? String(row.completed_at) : undefined,
});

export interface StoredLibraryResource extends LibraryResource {
  diskPath: string;
}

export class ResourceRepository {
  constructor(private readonly database: Database.Database) {
    this.seedKnowledgeCatalogs();
  }

  private seedKnowledgeCatalogs() {
    const now = new Date().toISOString();
    const subjects = [
      ["subject_chinese", "CHN", "语文", 10],
      ["subject_math", "MATH", "数学", 20],
      ["subject_english", "ENG", "英语", 30],
      ["subject_physics", "PHY", "物理", 40],
      ["subject_chemistry", "CHEM", "化学", 50],
      ["subject_biology", "BIO", "生物", 60],
      ["subject_history", "HIS", "历史", 70],
      ["subject_geography", "GEO", "地理", 80],
      ["subject_politics", "POL", "道德与法治", 90],
    ] as const;
    const stages = [
      ["stage_general", "通用", 0],
      ["stage_grade7_1", "七年级上", 10],
      ["stage_grade7_2", "七年级下", 20],
      ["stage_grade8_1", "八年级上", 30],
      ["stage_grade8_2", "八年级下", 40],
      ["stage_grade9_1", "九年级上", 50],
      ["stage_grade9_2", "九年级下", 60],
    ] as const;
    const insertSubject = this.database.prepare(`
      INSERT OR IGNORE INTO knowledge_subjects
      (id, code, name, sort_order, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `);
    const insertStage = this.database.prepare(`
      INSERT OR IGNORE INTO knowledge_stages
      (id, name, sort_order, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
    `);
    subjects.forEach((subject) => insertSubject.run(...subject, now, now));
    stages.forEach((stage) => insertStage.run(...stage, now, now));
  }

  listKnowledgeSubjects(includeInactive = false): KnowledgeSubject[] {
    const rows = this.database.prepare(
      `SELECT * FROM knowledge_subjects ${includeInactive ? "" : "WHERE status = 'active'"} ORDER BY sort_order, name`,
    ).all() as JsonObject[];
    return rows.map((row) => ({
      id: String(row.id), code: String(row.code), name: String(row.name),
      sortOrder: Number(row.sort_order), status: row.status as KnowledgeSubject["status"],
    }));
  }

  listKnowledgeStages(): KnowledgeStage[] {
    return (this.database.prepare("SELECT * FROM knowledge_stages WHERE status = 'active' ORDER BY sort_order, name").all() as JsonObject[])
      .map((row) => ({ id: String(row.id), name: String(row.name), sortOrder: Number(row.sort_order), status: row.status as KnowledgeStage["status"] }));
  }

  listKnowledgeTags(): KnowledgeTag[] {
    return (this.database.prepare("SELECT * FROM knowledge_tags WHERE status = 'active' ORDER BY name").all() as JsonObject[])
      .map((row) => ({ id: String(row.id), name: String(row.name), status: row.status as KnowledgeTag["status"] }));
  }

  createKnowledgeSubject(name: string, code: string) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const max = this.database.prepare("SELECT COALESCE(MAX(sort_order), 0) AS value FROM knowledge_subjects").get() as { value: number };
    this.database.prepare(`INSERT INTO knowledge_subjects (id, code, name, sort_order, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)`)
      .run(id, code, name, max.value + 10, now, now);
    return this.listKnowledgeSubjects(true).find((subject) => subject.id === id)!;
  }

  updateKnowledgeSubject(id: string, update: { name?: string; status?: KnowledgeSubject["status"] }) {
    const current = this.listKnowledgeSubjects(true).find((subject) => subject.id === id);
    if (!current) return undefined;
    const name = update.name ?? current.name;
    const status = update.status ?? current.status;
    const usage = this.database.prepare("SELECT COUNT(*) AS value FROM knowledge_nodes WHERE status='active' AND subject=?").get(current.name) as { value: number };
    if (status === "inactive" && usage.value > 0) throw new Error("KNOWLEDGE_SUBJECT_IN_USE");
    this.database.transaction(() => {
      this.database.prepare("UPDATE knowledge_subjects SET name=?, status=?, updated_at=? WHERE id=?")
        .run(name, status, new Date().toISOString(), id);
      if (name !== current.name) {
        const affected = this.listNodes(true).filter((node) => node.subject === current.name);
        this.database.prepare("UPDATE knowledge_nodes SET subject=?, version=version+1, updated_at=? WHERE subject=?")
          .run(name, new Date().toISOString(), current.name);
        this.database.prepare("UPDATE resources SET subject=? WHERE subject=?").run(name, current.name);
        affected.forEach((node) => {
          const updated = this.getNode(node.id);
          if (updated) this.recordRevision("node", node.id, updated.version, "subject-rename", updated);
        });
      }
    })();
    return this.listKnowledgeSubjects(true).find((subject) => subject.id === id);
  }

  createKnowledgeTag(name: string) {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.prepare(`INSERT INTO knowledge_tags (id, name, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)`)
      .run(id, name, now, now);
    return this.listKnowledgeTags().find((tag) => tag.id === id)!;
  }

  private nextNodeCode(subject: string, type: KnowledgeEntity["type"]) {
    const subjectCode = this.listKnowledgeSubjects(true).find((item) => item.name === subject)?.code ?? "GEN";
    const typeCode: Record<KnowledgeEntity["type"], string> = {
      domain: "DOM", topic: "TOP", knowledge: "KN", "question-type": "QT",
      method: "MTH", example: "EX", ability: "ABL", error: "ERR",
    };
    const prefix = `${subjectCode}-${typeCode[type]}-`;
    const rows = this.database.prepare("SELECT code FROM knowledge_nodes WHERE code LIKE ?").all(`${prefix}%`) as { code: string }[];
    const next = rows.reduce((max, row) => Math.max(max, Number(row.code.slice(prefix.length)) || 0), 0) + 1;
    return `${prefix}${String(next).padStart(6, "0")}`;
  }

  private validateNodeCatalogs(subject: string, stageIds: string[], tags: string[]) {
    if (!this.listKnowledgeSubjects().some((item) => item.name === subject)) {
      throw new Error("INVALID_KNOWLEDGE_SUBJECT");
    }
    const validStageIds = new Set(this.listKnowledgeStages().map((item) => item.id));
    if (!stageIds.length || stageIds.some((id) => !validStageIds.has(id))) {
      throw new Error("INVALID_KNOWLEDGE_STAGE");
    }
    const validTags = new Set(this.listKnowledgeTags().map((item) => item.name));
    if (tags.some((name) => !validTags.has(name))) {
      throw new Error("INVALID_KNOWLEDGE_TAG");
    }
  }

  private ensureNodeCodes() {
    const rows = this.database.prepare("SELECT id, subject, type FROM knowledge_nodes WHERE code IS NULL OR code = '' ORDER BY created_at, id").all() as Array<{ id: string; subject: string; type: KnowledgeEntity["type"] }>;
    const update = this.database.prepare("UPDATE knowledge_nodes SET code=? WHERE id=?");
    rows.forEach((row) => update.run(this.nextNodeCode(row.subject, row.type), row.id));
    this.database.prepare("UPDATE knowledge_nodes SET stage_ids_json='[\"stage_general\"]' WHERE stage_ids_json='[]'").run();
  }

  seedBaseKnowledge() {
    const now = new Date().toISOString();
    const nodes: Array<[
      string,
      string,
      KnowledgeEntity["type"],
      string,
      string,
      string,
      string | null,
      number,
      number,
    ]> = [
      [
        "kd_zh_modern_reading",
        "现代文阅读",
        "domain",
        "围绕现代文本理解、分析和鉴赏形成的知识板块",
        "[]",
        "语文",
        null,
        0,
        10,
      ],
      [
        "kt_zh_expression_techniques",
        "表达技巧",
        "topic",
        "作者组织语言、塑造形象和表达情感的常用方式",
        '["表达手法"]',
        "语文",
        "kd_zh_modern_reading",
        0,
        10,
      ],
      [
        "kn_zh_reading_literary",
        "文学类文本阅读",
        "ability",
        "理解、分析和鉴赏文学类文本的综合能力",
        "[]",
        "语文",
        null,
        1,
        10,
      ],
      [
        "kn_zh_rhetoric",
        "修辞手法",
        "knowledge",
        "识别并分析常见修辞手法及其表达效果",
        '["修辞"]',
        "语文",
        "kt_zh_expression_techniques",
        1,
        10,
      ],
      [
        "kn_zh_metaphor",
        "比喻",
        "knowledge",
        "用有相似点的事物描写或说明另一事物",
        '["明喻","暗喻","借喻"]',
        "语文",
        "kn_zh_rhetoric",
        1,
        10,
      ],
      [
        "kn_zh_personification",
        "比拟",
        "knowledge",
        "把物当作人或把人当作物来描写",
        '["拟人","拟物"]',
        "语文",
        "kn_zh_rhetoric",
        1,
        20,
      ],
      [
        "kn_zh_parallelism",
        "排比",
        "knowledge",
        "三个或以上结构相似、语气一致的短语或句子",
        "[]",
        "语文",
        "kn_zh_rhetoric",
        1,
        30,
      ],
      [
        "kn_zh_scene_description",
        "景物描写",
        "knowledge",
        "通过景物特征、顺序和感官等组织描写",
        "[]",
        "语文",
        "kt_zh_expression_techniques",
        1,
        20,
      ],
      [
        "kn_zh_effect_analysis",
        "赏析句子表达效果",
        "question-type",
        "结合手法、内容和情感分析句子的表达效果",
        '["句子赏析"]',
        "语文",
        null,
        0,
        10,
      ],
      [
        "kn_zh_effect_method",
        "手法—内容—情感",
        "method",
        "先判断手法，再联系具体内容，最后说明表达效果或情感",
        '["三步赏析法"]',
        "语文",
        null,
        0,
        10,
      ],
    ];
    const insertNode = this.database.prepare(`
      INSERT OR IGNORE INTO knowledge_nodes
      (id, name, type, description, aliases_json, subject, grade, primary_mother_id, trainable, sort_order, source, version, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '通用', ?, ?, ?, 'base', 1, 'active', ?, ?)
    `);
    const updateStructure = this.database.prepare(`
      UPDATE knowledge_nodes
      SET primary_mother_id = ?, trainable = ?, sort_order = ?
      WHERE id = ? AND source = 'base'
    `);
    const relations: Array<[string, string, KnowledgeRelationType, string]> = [
      [
        "kn_zh_effect_analysis",
        "kn_zh_metaphor",
        "examines",
        "句子赏析可以考查比喻",
      ],
      [
        "kn_zh_effect_analysis",
        "kn_zh_personification",
        "examines",
        "句子赏析可以考查比拟",
      ],
      [
        "kn_zh_effect_method",
        "kn_zh_effect_analysis",
        "applies-to",
        "该方法适用于句子表达效果题",
      ],
      [
        "kn_zh_scene_description",
        "kn_zh_reading_literary",
        "prerequisite",
        "景物描写分析是文学阅读的基础能力之一",
      ],
    ];
    const insertRelation = this.database.prepare(`
      INSERT OR IGNORE INTO knowledge_relations
      (id, source_node_id, target_node_id, type, description, source, version, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'base', 1, 'active', ?, ?)
    `);
    const insertVersionedNode = this.database.prepare(`
      INSERT OR IGNORE INTO knowledge_nodes
      (id, name, type, description, aliases_json, subject, grade, primary_mother_id, trainable, sort_order, source, version, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'base', ?, 'active', ?, ?)
    `);
    const updateVersionedNode = this.database.prepare(`
      UPDATE knowledge_nodes
      SET name = ?, type = ?, description = ?, aliases_json = ?, subject = ?, grade = ?,
          primary_mother_id = ?, trainable = ?, sort_order = ?, version = ?, status = 'active', updated_at = ?
      WHERE id = ? AND source = 'base' AND version < ?
    `);
    this.database.transaction(() => {
      nodes.forEach((node) => {
        insertNode.run(...node, now, now);
        updateStructure.run(node[6], node[7], node[8], node[0]);
      });
      middleSchoolMathNodes.forEach((node) => {
        const inserted = insertVersionedNode.run(
          node.id,
          node.name,
          node.type,
          node.description,
          JSON.stringify(node.aliases),
          node.subject,
          node.grade,
          node.primaryMotherId ?? null,
          node.trainable ? 1 : 0,
          node.sortOrder,
          node.version,
          now,
          now,
        );
        if (inserted.changes) {
          this.recordRevision("node", node.id, node.version, "create", this.getNode(node.id)!);
          return;
        }
        const updated = updateVersionedNode.run(
          node.name,
          node.type,
          node.description,
          JSON.stringify(node.aliases),
          node.subject,
          node.grade,
          node.primaryMotherId ?? null,
          node.trainable ? 1 : 0,
          node.sortOrder,
          node.version,
          now,
          node.id,
          node.version,
        );
        if (updated.changes) {
          this.recordRevision("node", node.id, node.version, "base-sync", this.getNode(node.id)!);
        }
      });
      retiredMiddleSchoolMathNodeIds.forEach((nodeId) => {
        const node = this.getNode(nodeId);
        if (node?.status === "active" && node.source === "base") {
          this.updateNode(nodeId, { status: "archived" });
        }
      });
      relations.forEach(([source, target, type, description]) =>
        insertRelation.run(
          `kr_${source}_${type}_${target}`,
          source,
          target,
          type,
          description,
          now,
          now,
        ),
      );
      middleSchoolMathRelations.forEach((relation) =>
        insertRelation.run(
          `kr_${relation.sourceNodeId}_${relation.type}_${relation.targetNodeId}`,
          relation.sourceNodeId,
          relation.targetNodeId,
          relation.type,
          relation.description,
          now,
          now,
        ),
      );
      this.database
        .prepare("DELETE FROM knowledge_relations WHERE type = 'parent'")
        .run();
    })();
    this.ensureNodeCodes();
  }

  createResource(
    input: Omit<
      StoredLibraryResource,
      "createdAt" | "updatedAt" | "summary" | "tags" | "pageCount" | "status" | "poolItemId"
    > & { pageCount?: number | null },
    poolItemId?: string,
  ) {
    const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database.prepare(
        `
      INSERT INTO resources
      (id, title, file_name, mime_type, kind, subject, grade, publisher, edition, is_primary, status, page_count, disk_path, public_url, summary, tags_json, pool_item_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?, ?, '', '[]', ?, ?, ?)
    `,
      )
      .run(
        input.id,
        input.title,
        input.fileName,
        input.mimeType,
        input.kind,
        input.subject,
        input.grade,
        input.publisher,
        input.edition,
        input.isPrimary ? 1 : 0,
        input.pageCount ?? null,
        input.diskPath,
        input.publicUrl,
        poolItemId ?? null,
        now,
        now,
      );
      if (input.pageCount) this.initializeResourcePages(input.id, input.pageCount);
    })();
    return this.getStoredResource(input.id)!;
  }

  initializeResourcePages(resourceId: string, pageCount: number) {
    const insert = this.database.prepare(`
      INSERT OR IGNORE INTO resource_pages
      (resource_id, page_number, included, parse_status, updated_at)
      VALUES (?, ?, 1, 'unparsed', ?)
    `);
    const timestamp = new Date().toISOString();
    for (let page = 1; page <= pageCount; page += 1) insert.run(resourceId, page, timestamp);
  }

  listResourcePages(resourceId: string) {
    return (this.database.prepare(
      "SELECT * FROM resource_pages WHERE resource_id = ? ORDER BY page_number",
    ).all(resourceId) as JsonObject[]).map(toResourcePage);
  }

  setResourcePageIncluded(resourceId: string, pageNumber: number, included: boolean) {
    const result = this.database.prepare(
      `UPDATE resource_pages SET included = ?,
       rag_status = CASE WHEN ? = 0 THEN 'excluded' WHEN parse_status = 'ready' THEN 'indexed' ELSE 'unindexed' END,
       updated_at = ? WHERE resource_id = ? AND page_number = ?`,
    ).run(included ? 1 : 0, included ? 1 : 0, new Date().toISOString(), resourceId, pageNumber);
    if (!result.changes) return undefined;
    return toResourcePage(this.database.prepare(
      "SELECT * FROM resource_pages WHERE resource_id = ? AND page_number = ?",
    ).get(resourceId, pageNumber) as JsonObject);
  }

  markResourcePages(resourceId: string, pageStart: number, pageEnd: number, status: ResourcePageState["parseStatus"], errorCode?: string) {
    this.database.prepare(`
      UPDATE resource_pages SET parse_status = ?, parse_error_code = ?, updated_at = ?
      WHERE resource_id = ? AND page_number BETWEEN ? AND ?
    `).run(status, errorCode ?? null, new Date().toISOString(), resourceId, pageStart, pageEnd);
  }

  markResourcePagesRag(resourceId: string, pageStart: number, pageEnd: number, status: ResourcePageState["ragStatus"], errorCode?: string) {
    const timestamp = new Date().toISOString();
    this.database.prepare(`
      UPDATE resource_pages
      SET rag_status = CASE WHEN included = 0 THEN 'excluded' ELSE ? END,
          rag_chunk_count = CASE WHEN ? = 'indexed' THEN (
            SELECT COUNT(*) FROM resource_chunks chunk
            WHERE chunk.resource_id = resource_pages.resource_id AND chunk.level = 'content'
              AND resource_pages.page_number BETWEEN chunk.page_start AND chunk.page_end
          ) ELSE rag_chunk_count END,
          rag_indexed_at = CASE WHEN ? = 'indexed' THEN ? ELSE rag_indexed_at END,
          parse_error_code = CASE WHEN ? = 'failed' THEN ? ELSE parse_error_code END,
          updated_at = ?
      WHERE resource_id = ? AND page_number BETWEEN ? AND ?
    `).run(status, status, status, timestamp, status, errorCode ?? null, timestamp, resourceId, pageStart, pageEnd);
  }

  createProcessingJob(resourceId: string, pageStart: number, pageEnd: number) {
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO resource_processing_jobs
      (id, resource_id, page_start, page_end, status, stage, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'running', 'queued', ?, ?)
    `).run(id, resourceId, pageStart, pageEnd, timestamp, timestamp);
    return this.listProcessingJobs(resourceId).find((job) => job.id === id)!;
  }

  updateProcessingJob(id: string, update: Partial<Pick<ResourceProcessingJob, "status" | "stage" | "phase" | "metrics" | "errorCode" | "completedAt">>) {
    const current = this.database.prepare("SELECT * FROM resource_processing_jobs WHERE id = ?").get(id) as JsonObject | undefined;
    if (!current) return undefined;
    const previous = toProcessingJob(current);
    const next = { ...previous, ...update, metrics: { ...previous.metrics, ...update.metrics } };
    this.database.prepare(`
      UPDATE resource_processing_jobs SET status = ?, stage = ?, phase = ?, metrics_json = ?, error_code = ?, updated_at = ?, completed_at = ? WHERE id = ?
    `).run(next.status, next.stage, next.phase ?? null, JSON.stringify(next.metrics), next.errorCode ?? null, new Date().toISOString(), next.completedAt ?? null, id);
    return toProcessingJob(this.database.prepare("SELECT * FROM resource_processing_jobs WHERE id = ?").get(id) as JsonObject);
  }

  listProcessingJobs(resourceId: string, limit = 12) {
    return (this.database.prepare(
      "SELECT * FROM resource_processing_jobs WHERE resource_id = ? ORDER BY created_at DESC LIMIT ?",
    ).all(resourceId, limit) as JsonObject[]).map(toProcessingJob);
  }

  markRunningJobsInterrupted() {
    const timestamp = new Date().toISOString();
    return this.database.transaction(() => {
      const jobs = this.database.prepare(`
        UPDATE resource_processing_jobs SET status='interrupted', stage='interrupted', error_code='PROCESSING_INTERRUPTED', updated_at=?, completed_at=? WHERE status='running'
      `).run(timestamp, timestamp).changes;
      this.database.prepare(`
        UPDATE resources SET status='needs-review', parse_error_code='PROCESSING_INTERRUPTED', updated_at=? WHERE status='processing'
      `).run(timestamp);
      this.database.prepare(`
        UPDATE resource_pages SET parse_status='failed', parse_error_code='PROCESSING_INTERRUPTED', updated_at=? WHERE parse_status='processing'
      `).run(timestamp);
      return jobs;
    })();
  }

  listResources() {
    return (
      this.database
        .prepare("SELECT * FROM resources ORDER BY updated_at DESC")
        .all() as JsonObject[]
    ).map(toResource);
  }

  getStoredResource(id: string): StoredLibraryResource | undefined {
    const row = this.database
      .prepare("SELECT * FROM resources WHERE id = ?")
      .get(id) as JsonObject | undefined;
    return row
      ? { ...toResource(row), diskPath: String(row.disk_path) }
      : undefined;
  }

  updateResource(
    id: string,
    update: Partial<
      Pick<
        LibraryResource,
        | "title"
        | "kind"
        | "subject"
        | "grade"
        | "publisher"
        | "edition"
        | "isPrimary"
        | "status"
        | "pageCount"
        | "parseErrorCode"
        | "summary"
        | "tags"
        | "parsedPageStart"
        | "parsedPageEnd"
      >
    >,
  ) {
    const current = this.getStoredResource(id);
    if (!current) return undefined;
    const next = { ...current, ...update, updatedAt: new Date().toISOString() };
    this.database
      .prepare(
        `
      UPDATE resources SET title=?, kind=?, subject=?, grade=?, publisher=?, edition=?, is_primary=?, status=?, page_count=?,
      parse_error_code=?, summary=?, tags_json=?, parsed_page_start=?, parsed_page_end=?, updated_at=? WHERE id=?
    `,
      )
      .run(
        next.title,
        next.kind,
        next.subject,
        next.grade,
        next.publisher,
        next.edition,
        next.isPrimary ? 1 : 0,
        next.status,
        next.pageCount,
        next.parseErrorCode ?? null,
        next.summary,
        JSON.stringify(next.tags),
        next.parsedPageStart ?? null,
        next.parsedPageEnd ?? null,
        next.updatedAt,
        id,
      );
    return this.getStoredResource(id);
  }

  deleteResource(id: string) {
    return (
      this.database.prepare("DELETE FROM resources WHERE id = ?").run(id)
        .changes > 0
    );
  }

  replaceChunks(resourceId: string, chunks: ResourceChunk[]) {
    const now = new Date().toISOString();
    const remove = this.database.prepare(
      "DELETE FROM resource_chunks WHERE resource_id = ?",
    );
    const insert = this.database.prepare(`
      INSERT INTO resource_chunks
      (id, resource_id, parent_id, level, source_type, content_type, title, summary, text, markdown, resource_urls_json, tags_json, page_start, page_end, bounding_box_json, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.database.transaction(() => {
      remove.run(resourceId);
      chunks.forEach((chunk) =>
        insert.run(
          chunk.id,
          resourceId,
          chunk.parentId ?? null,
          chunk.level,
          chunk.sourceType ?? "",
          chunk.contentType ?? (chunk.level === "section" ? "heading" : chunk.level === "document" ? "page" : "paragraph"),
          chunk.title,
          chunk.summary,
          chunk.text,
          chunk.markdown ?? chunk.text,
          JSON.stringify(chunk.resourceUrls ?? []),
          JSON.stringify(chunk.tags),
          chunk.pageStart,
          chunk.pageEnd,
          chunk.boundingBox ? JSON.stringify(chunk.boundingBox) : null,
          chunk.order,
          now,
          now,
        ),
      );
    })();
  }

  mergeChunksForPages(resourceId: string, pageStart: number, pageEnd: number, chunks: ResourceChunk[]) {
    const remove = this.database.prepare(
      "DELETE FROM resource_chunks WHERE resource_id = ? AND page_start >= ? AND page_end <= ?",
    );
    const insert = this.database.prepare(`
      INSERT INTO resource_chunks
      (id, resource_id, parent_id, level, source_type, content_type, title, summary, text, markdown, resource_urls_json, tags_json, page_start, page_end, bounding_box_json, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const timestamp = new Date().toISOString();
    this.database.transaction(() => {
      remove.run(resourceId, pageStart, pageEnd);
      chunks.forEach((chunk) => insert.run(
        chunk.id, resourceId, chunk.parentId ?? null, chunk.level, chunk.sourceType ?? "",
        chunk.contentType ?? (chunk.level === "section" ? "heading" : chunk.level === "document" ? "page" : "paragraph"),
        chunk.title, chunk.summary, chunk.text, chunk.markdown ?? chunk.text, JSON.stringify(chunk.resourceUrls ?? []),
        JSON.stringify(chunk.tags), chunk.pageStart, chunk.pageEnd,
        chunk.boundingBox ? JSON.stringify(chunk.boundingBox) : null, chunk.order, timestamp, timestamp,
      ));
    })();
  }

  listChunks(resourceId: string) {
    return (
      this.database
        .prepare(
          `SELECT chunk.* FROM resource_chunks chunk
           WHERE chunk.resource_id = ? AND NOT EXISTS (
             SELECT 1 FROM resource_pages page WHERE page.resource_id = chunk.resource_id
             AND page.included = 0 AND page.page_number BETWEEN chunk.page_start AND chunk.page_end
           ) ORDER BY chunk.page_start, chunk.sort_order`,
        )
        .all(resourceId) as JsonObject[]
    ).map(toChunk);
  }

  /** Find matching resources without loading all document text into the request heap. */
  matchResourceContents(query: string): Array<{resourceId:string;matches:number}> {
    const pattern = `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    return this.database.prepare(`
      SELECT chunk.resource_id AS resourceId, COUNT(*) AS matches FROM resource_chunks chunk
      WHERE chunk.level = 'content' AND NOT EXISTS (
        SELECT 1 FROM resource_pages page WHERE page.resource_id=chunk.resource_id
        AND page.included=0 AND page.page_number BETWEEN chunk.page_start AND chunk.page_end
      ) AND (chunk.title LIKE ? ESCAPE '\\' OR chunk.text LIKE ? ESCAPE '\\')
      GROUP BY chunk.resource_id
    `).all(pattern,pattern) as Array<{resourceId:string;matches:number}>;
  }

  searchChunks(query: string, limit = 20) {
    const pattern = `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    return (
      this.database
        .prepare(
          `
      SELECT chunk.* FROM resource_chunks chunk
      WHERE chunk.level = 'content' AND NOT EXISTS (
        SELECT 1 FROM resource_pages page WHERE page.resource_id = chunk.resource_id
        AND page.included = 0 AND page.page_number BETWEEN chunk.page_start AND chunk.page_end
      ) AND (chunk.title LIKE ? ESCAPE '\\' OR chunk.text LIKE ? ESCAPE '\\' OR chunk.tags_json LIKE ? ESCAPE '\\')
      ORDER BY page_start, sort_order LIMIT ?
    `,
        )
        .all(pattern, pattern, pattern, limit) as JsonObject[]
    ).map(toChunk);
  }

  retrieveResourceChunks(resourceId: string, query: string, limit = 10) {
    const phrase = `"${query.replace(/"/g, '""')}"`;
    const substringResults = () => {
      const pattern = `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      return (this.database.prepare(`
        SELECT chunk.*, 0 AS retrieval_rank FROM resource_chunks chunk
        WHERE chunk.resource_id = ? AND chunk.level = 'content'
          AND (chunk.title LIKE ? ESCAPE '\\' OR chunk.text LIKE ? ESCAPE '\\')
          AND NOT EXISTS (
            SELECT 1 FROM resource_pages page WHERE page.resource_id = chunk.resource_id
              AND page.included = 0 AND page.page_number BETWEEN chunk.page_start AND chunk.page_end
          )
        ORDER BY chunk.page_start, chunk.sort_order LIMIT ?
      `).all(resourceId, pattern, pattern, limit) as JsonObject[]).map((row) => ({
        ...toChunk(row), retrievalRank: 0,
      }));
    };
    try {
      const fullTextResults = (this.database.prepare(`
        SELECT chunk.*, fts.rank AS retrieval_rank
        FROM resource_chunks_fts fts
        JOIN resource_chunks chunk ON chunk.id = fts.chunk_id
        WHERE fts.resource_id = ? AND resource_chunks_fts MATCH ?
          AND NOT EXISTS (
            SELECT 1 FROM resource_pages page WHERE page.resource_id = chunk.resource_id
              AND page.included = 0 AND page.page_number BETWEEN chunk.page_start AND chunk.page_end
          )
        ORDER BY fts.rank LIMIT ?
      `).all(resourceId, phrase, limit) as JsonObject[]).map((row) => ({
        ...toChunk(row), retrievalRank: Number(row.retrieval_rank),
      }));
      return fullTextResults.length ? fullTextResults : substringResults();
    } catch {
      return substringResults();
    }
  }

  getChunksByIds(ids: string[]) {
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(",");
    return (
      this.database
        .prepare(`SELECT * FROM resource_chunks WHERE id IN (${placeholders})`)
        .all(...ids) as JsonObject[]
    ).map(toChunk);
  }

  replacePendingSuggestions(
    resourceId: string,
    suggestions: DiscoverySuggestion[],
    pageRange?: { start: number; end: number },
  ) {
    const remove = pageRange
      ? this.database.prepare(`
          DELETE FROM discovery_suggestions
          WHERE resource_id = ? AND status = 'pending' AND EXISTS (
            SELECT 1 FROM json_each(source_chunk_ids_json) source
            JOIN resource_chunks chunk ON chunk.id = source.value
            WHERE chunk.page_start >= ? AND chunk.page_end <= ?
          )
        `)
      : this.database.prepare(
          "DELETE FROM discovery_suggestions WHERE resource_id = ? AND status = 'pending'",
        );
    const insert = this.database.prepare(`
      INSERT INTO discovery_suggestions
      (id, resource_id, kind, status, proposed_type, proposed_name, description, aliases_json, confidence, rationale, source_chunk_ids_json,
       existing_node_id, target_node_id, primary_mother_id, created_node_id, created_at, reviewed_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)
    `);
    this.database.transaction(() => {
      if (pageRange) remove.run(resourceId, pageRange.start, pageRange.end);
      else remove.run(resourceId);
      suggestions.forEach((item) =>
        insert.run(
          item.id,
          resourceId,
          item.kind,
          item.proposedType,
          item.proposedName,
          item.description,
          JSON.stringify(item.aliases),
          item.confidence,
          item.rationale,
          JSON.stringify(item.sourceChunkIds),
          item.existingNodeId ?? null,
          item.targetNodeId ?? null,
          item.primaryMotherId ?? null,
          item.createdAt,
        ),
      );
    })();
  }

  listSuggestions(resourceId?: string) {
    const rows = resourceId
      ? this.database
          .prepare(
            "SELECT * FROM discovery_suggestions WHERE resource_id = ? ORDER BY status, confidence DESC",
          )
          .all(resourceId)
      : this.database
          .prepare(
            "SELECT * FROM discovery_suggestions ORDER BY status, confidence DESC",
          )
          .all();
    return (rows as JsonObject[]).map(toSuggestion);
  }

  listNodes(includeArchived = false) {
    const sql = includeArchived
      ? "SELECT * FROM knowledge_nodes ORDER BY type, name"
      : "SELECT * FROM knowledge_nodes WHERE status = 'active' ORDER BY type, name";
    return (this.database.prepare(sql).all() as JsonObject[]).map(toNode);
  }

  searchNodes(query: string, subject?: string, limit = 20) {
    const pattern = `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    const rows = subject
      ? this.database
          .prepare(
            `SELECT * FROM knowledge_nodes WHERE status='active' AND subject=? AND (name LIKE ? ESCAPE '\\' OR aliases_json LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\') ORDER BY name LIMIT ?`,
          )
          .all(subject, pattern, pattern, pattern, limit)
      : this.database
          .prepare(
            `SELECT * FROM knowledge_nodes WHERE status='active' AND (name LIKE ? ESCAPE '\\' OR aliases_json LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\') ORDER BY name LIMIT ?`,
          )
          .all(pattern, pattern, pattern, limit);
    return (rows as JsonObject[]).map(toNode);
  }

  getNode(id: string) {
    const row = this.database
      .prepare("SELECT * FROM knowledge_nodes WHERE id = ?")
      .get(id) as JsonObject | undefined;
    return row ? toNode(row) : undefined;
  }

  listKnowledgeTree(subject: string) {
    const structuralTypes = new Set<KnowledgeEntity["type"]>([
      "domain",
      "topic",
      "knowledge",
    ]);
    const nodes = this.listNodes()
      .filter(
        (node) =>
          node.subject === subject && structuralTypes.has(node.type),
      )
      .sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name));
    const nodeIds = new Set(nodes.map((node) => node.id));
    return {
      subject,
      nodes,
      unclassified: nodes.filter(
        (node) =>
          node.type !== "domain" &&
          (!node.primaryMotherId || !nodeIds.has(node.primaryMotherId)),
      ),
    };
  }

  getKnowledgeFocus(id: string) {
    const node = this.getNode(id);
    if (!node || node.status !== "active") return undefined;
    const nodes = this.listNodes();
    const nodeById = new Map(nodes.map((item) => [item.id, item]));
    const relations = this.listRelations();
    const uniqueNodes = (ids: Iterable<string>) =>
      Array.from(new Set(ids))
        .map((nodeId) => nodeById.get(nodeId))
        .filter((item): item is KnowledgeEntity => Boolean(item));
    const motherChain: KnowledgeEntity[] = [];
    const visited = new Set<string>([node.id]);
    let motherId = node.primaryMotherId;
    while (motherId && !visited.has(motherId)) {
      visited.add(motherId);
      const mother = nodeById.get(motherId);
      if (!mother) break;
      motherChain.unshift(mother);
      motherId = mother.primaryMotherId;
    }
    const prerequisites = uniqueNodes(
      relations
        .filter((relation) => relation.type === "prerequisite" && relation.targetNodeId === id)
        .map((relation) => relation.sourceNodeId),
    );
    const dependents = uniqueNodes(
      relations
        .filter((relation) => relation.type === "prerequisite" && relation.sourceNodeId === id)
        .map((relation) => relation.targetNodeId),
    );
    const questionTypes = uniqueNodes(
      relations
        .filter((relation) => relation.type === "examines" && relation.targetNodeId === id)
        .map((relation) => relation.sourceNodeId),
    );
    const questionTypeIds = new Set(questionTypes.map((item) => item.id));
    if (node.type === "question-type") questionTypeIds.add(node.id);
    const methods = uniqueNodes(
      relations
        .filter(
          (relation) =>
            relation.type === "applies-to" &&
            (relation.targetNodeId === id || questionTypeIds.has(relation.targetNodeId)),
        )
        .map((relation) => relation.sourceNodeId),
    );
    const demonstrationTargets = new Set([
      id,
      ...questionTypeIds,
      ...methods.map((item) => item.id),
    ]);
    const examples = uniqueNodes(
      relations
        .filter(
          (relation) =>
            relation.type === "demonstrates" &&
            demonstrationTargets.has(relation.targetNodeId),
        )
        .map((relation) => relation.sourceNodeId),
    );
    const directlyConnectedIds = relations.flatMap((relation) => {
      if (relation.sourceNodeId === id) return [relation.targetNodeId];
      if (relation.targetNodeId === id) return [relation.sourceNodeId];
      return [];
    });
    const directNodes = uniqueNodes(directlyConnectedIds);
    const related = uniqueNodes(
      relations
        .filter(
          (relation) =>
            relation.type === "related" &&
            (relation.sourceNodeId === id || relation.targetNodeId === id),
        )
        .map((relation) =>
          relation.sourceNodeId === id
            ? relation.targetNodeId
            : relation.sourceNodeId,
        ),
    );
    const confusable = uniqueNodes(
      relations
        .filter(
          (relation) =>
            relation.type === "confusable" &&
            (relation.sourceNodeId === id || relation.targetNodeId === id),
        )
        .map((relation) =>
          relation.sourceNodeId === id
            ? relation.targetNodeId
            : relation.sourceNodeId,
        ),
    );
    const sourceLinks = this.listSourceLinks().filter((link) => link.nodeId === id);
    const resourceIds = new Set(sourceLinks.map((link) => link.resourceId));
    return {
      node,
      motherChain,
      children: nodes
        .filter((item) => item.primaryMotherId === id)
        .sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name)),
      prerequisites,
      dependents,
      questionTypes,
      methods,
      examples,
      abilities: directNodes.filter((item) => item.type === "ability"),
      errors: directNodes.filter((item) => item.type === "error"),
      related,
      confusable,
      sourceLinks,
      resources: this.listResources().filter((resource) => resourceIds.has(resource.id)),
    };
  }

  createNode(
    input: Pick<
      KnowledgeEntity,
      "name" | "type" | "description" | "aliases" | "subject" | "grade"
    > & {
      id?: string;
      stageIds?: string[];
      tags?: string[];
      primaryMotherId?: string;
      trainable?: boolean;
      sortOrder?: number;
      source?: KnowledgeEntity["source"];
    },
  ) {
    const id = input.id ?? randomUUID();
    const now = new Date().toISOString();
    const stageIds = input.stageIds?.length ? input.stageIds : ["stage_general"];
    const tags = input.tags ?? [];
    this.validateNodeCatalogs(input.subject, stageIds, tags);
    if (input.primaryMotherId) {
      const mother = this.getNode(input.primaryMotherId);
      const structuralTypes = new Set<KnowledgeEntity["type"]>([
        "domain",
        "topic",
        "knowledge",
      ]);
      if (
        !mother ||
        mother.status !== "active" ||
        mother.subject !== input.subject ||
        !structuralTypes.has(mother.type) ||
        !structuralTypes.has(input.type)
      ) {
        throw new Error("INVALID_PRIMARY_MOTHER");
      }
    }
    const trainable =
      input.trainable ??
      (input.type === "knowledge" || input.type === "ability");
    const code = this.nextNodeCode(input.subject, input.type);
    const siblingOrder = this.database.prepare(
      "SELECT COALESCE(MAX(sort_order), 0) AS value FROM knowledge_nodes WHERE status='active' AND subject=? AND primary_mother_id IS ?",
    ).get(input.subject, input.primaryMotherId ?? null) as { value: number };
    this.database
      .prepare(
        `
      INSERT INTO knowledge_nodes (id, code, name, type, description, aliases_json, subject, grade, stage_ids_json, tags_json, primary_mother_id, trainable, sort_order, source, version, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?)
    `,
      )
      .run(
        id,
        code,
        input.name,
        input.type,
        input.description,
        JSON.stringify(input.aliases),
        input.subject,
        input.grade,
        JSON.stringify(stageIds),
        JSON.stringify(tags),
        input.primaryMotherId ?? null,
        trainable ? 1 : 0,
        input.sortOrder ?? siblingOrder.value + 10,
        input.source ?? "teacher",
        now,
        now,
      );
    const node = this.getNode(id)!;
    this.recordRevision("node", id, 1, "create", node);
    return node;
  }

  updateNode(
    id: string,
    update: Partial<
      Pick<
        KnowledgeEntity,
        | "name"
        | "type"
        | "description"
        | "aliases"
        | "subject"
        | "grade"
        | "stageIds"
        | "tags"
        | "trainable"
        | "sortOrder"
        | "status"
      >
    > & { primaryMotherId?: string | null },
  ) {
    const current = this.getNode(id);
    if (!current) return undefined;
    const next: KnowledgeEntity = {
      ...current,
      ...update,
      primaryMotherId:
        update.primaryMotherId === null
          ? undefined
          : update.primaryMotherId ?? current.primaryMotherId,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.validateNodeCatalogs(next.subject, next.stageIds, next.tags);
    const structuralTypes = new Set<KnowledgeEntity["type"]>([
      "domain",
      "topic",
      "knowledge",
    ]);
    const activeChildren = this.listNodes().filter(
      (node) => node.primaryMotherId === id,
    );
    if (
      activeChildren.length &&
      (next.subject !== current.subject || !structuralTypes.has(next.type))
    ) {
      throw new Error("KNOWLEDGE_STRUCTURE_HAS_CHILDREN");
    }
    if (next.primaryMotherId) {
      const mother = this.getNode(next.primaryMotherId);
      if (
        !mother ||
        mother.status !== "active" ||
        mother.subject !== next.subject ||
        !structuralTypes.has(mother.type) ||
        !structuralTypes.has(next.type)
      ) {
        throw new Error("INVALID_PRIMARY_MOTHER");
      }
      const visited = new Set([id]);
      let cursor: KnowledgeEntity | undefined = mother;
      while (cursor) {
        if (visited.has(cursor.id)) {
          throw new Error("KNOWLEDGE_STRUCTURE_CYCLE");
        }
        visited.add(cursor.id);
        cursor = cursor.primaryMotherId
          ? this.getNode(cursor.primaryMotherId)
          : undefined;
      }
    }
    if (!structuralTypes.has(next.type)) next.primaryMotherId = undefined;
    this.database
      .prepare(
        `UPDATE knowledge_nodes SET name=?, type=?, description=?, aliases_json=?, subject=?, grade=?, stage_ids_json=?, tags_json=?, primary_mother_id=?, trainable=?, sort_order=?, status=?, version=?, updated_at=? WHERE id=?`,
      )
      .run(
        next.name,
        next.type,
        next.description,
        JSON.stringify(next.aliases),
        next.subject,
        next.grade,
        JSON.stringify(next.stageIds),
        JSON.stringify(next.tags),
        next.primaryMotherId ?? null,
        next.trainable ? 1 : 0,
        next.sortOrder,
        next.status,
        next.version,
        next.updatedAt,
        id,
      );
    this.recordRevision("node", id, next.version, "update", next);
    return this.getNode(id);
  }

  updateNodeStructure(
    id: string,
    update: {
      primaryMotherId?: string | null;
      trainable?: boolean;
      sortOrder?: number;
    },
  ) {
    const node = this.getNode(id);
    if (!node) return undefined;
    const nextMotherId =
      update.primaryMotherId === undefined
        ? node.primaryMotherId
        : update.primaryMotherId || undefined;
    return this.updateNode(id, {
      primaryMotherId: nextMotherId ?? null,
      trainable: update.trainable ?? node.trainable,
      sortOrder: update.sortOrder ?? node.sortOrder,
    });
  }

  mergeNode(sourceId: string, targetId: string) {
    const source = this.getNode(sourceId);
    const target = this.getNode(targetId);
    if (!source || !target || sourceId === targetId) return undefined;
    const now = new Date().toISOString();
    this.database.transaction(() => {
      if (target.primaryMotherId === sourceId) {
        this.database
          .prepare(
            "UPDATE knowledge_nodes SET primary_mother_id = ? WHERE id = ?",
          )
          .run(source.primaryMotherId ?? null, targetId);
      }
      this.database
        .prepare(
          "UPDATE knowledge_nodes SET primary_mother_id = ? WHERE primary_mother_id = ? AND id <> ?",
        )
        .run(targetId, sourceId, targetId);
      this.database
        .prepare(
          "UPDATE OR IGNORE knowledge_source_links SET node_id = ? WHERE node_id = ?",
        )
        .run(targetId, sourceId);
      this.database
        .prepare("DELETE FROM knowledge_source_links WHERE node_id = ?")
        .run(sourceId);
      this.database
        .prepare(
          "UPDATE OR IGNORE knowledge_relations SET source_node_id = ? WHERE source_node_id = ?",
        )
        .run(targetId, sourceId);
      this.database
        .prepare(
          "UPDATE OR IGNORE knowledge_relations SET target_node_id = ? WHERE target_node_id = ?",
        )
        .run(targetId, sourceId);
      this.database
        .prepare(
          "DELETE FROM knowledge_relations WHERE source_node_id = ? OR target_node_id = ?",
        )
        .run(sourceId, sourceId);
      this.database
        .prepare(
          "UPDATE knowledge_nodes SET status='merged', merged_into_id=?, version=version+1, updated_at=? WHERE id=?",
        )
        .run(targetId, now, sourceId);
    })();
    this.recordRevision("node", sourceId, source.version + 1, "merge", {
      ...source,
      status: "merged",
      mergedIntoId: targetId,
    });
    return this.getNode(sourceId);
  }

  createRelation(
    input: Pick<
      KnowledgeRelation,
      "sourceNodeId" | "targetNodeId" | "type" | "description"
    > & { source?: KnowledgeRelation["source"] },
  ) {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database
      .prepare(
        `
      INSERT INTO knowledge_relations (id, source_node_id, target_node_id, type, description, source, version, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'active', ?, ?)
    `,
      )
      .run(
        id,
        input.sourceNodeId,
        input.targetNodeId,
        input.type,
        input.description,
        input.source ?? "teacher",
        now,
        now,
      );
    const relation = toRelation(
      this.database
        .prepare("SELECT * FROM knowledge_relations WHERE id = ?")
        .get(id) as JsonObject,
    );
    this.recordRevision("relation", id, 1, "create", relation);
    return relation;
  }

  listRelations() {
    return (
      this.database
        .prepare(
          "SELECT * FROM knowledge_relations WHERE status = 'active' ORDER BY created_at",
        )
        .all() as JsonObject[]
    ).map(toRelation);
  }

  listSourceLinks() {
    return (
      this.database
        .prepare(
          "SELECT * FROM knowledge_source_links ORDER BY is_primary DESC, created_at DESC",
        )
        .all() as JsonObject[]
    ).map(toSourceLink);
  }

  listRevisions(entityType: "node" | "relation", entityId: string) {
    return this.database
      .prepare(
        "SELECT version, action, snapshot_json AS snapshot, actor, created_at AS createdAt FROM entity_revisions WHERE entity_type = ? AND entity_id = ? ORDER BY version DESC",
      )
      .all(entityType, entityId) as Array<{
      version: number;
      action: string;
      snapshot: string;
      actor: string;
      createdAt: string;
    }>;
  }

  reviewSuggestion(
    id: string,
    decision: "accepted" | "ignored" | "merged",
    mergeTargetId?: string,
    primaryMotherId?: string | null,
  ) {
    const row = this.database
      .prepare("SELECT * FROM discovery_suggestions WHERE id = ?")
      .get(id) as JsonObject | undefined;
    if (!row) return undefined;
    const suggestion = toSuggestion(row);
    if (suggestion.status !== "pending") return suggestion;
    const resource = this.getStoredResource(suggestion.resourceId);
    const chunks = this.listChunks(suggestion.resourceId);
    const sourceChunk = chunks.find((chunk) =>
      suggestion.sourceChunkIds.includes(chunk.id),
    );
    const now = new Date().toISOString();
    let nodeId = suggestion.existingNodeId;
    this.database.transaction(() => {
      if (decision === "accepted" && suggestion.kind === "node") {
        nodeId =
          nodeId ??
          this.createNode({
            name: suggestion.proposedName,
            type: suggestion.proposedType as KnowledgeEntity["type"],
            description: suggestion.description,
            aliases: suggestion.aliases,
            subject: resource?.subject ?? "",
            grade: resource?.grade ?? "",
            primaryMotherId:
              suggestion.proposedType === "knowledge"
                ? primaryMotherId === undefined
                  ? suggestion.primaryMotherId
                  : primaryMotherId ?? undefined
                : undefined,
            source: "ai-confirmed",
          }).id;
        if (nodeId && sourceChunk)
          this.insertSourceLink(
            nodeId,
            sourceChunk,
            Boolean(resource?.isPrimary),
          );
      }
      if (
        decision === "accepted" &&
        suggestion.kind === "source-link" &&
        suggestion.existingNodeId &&
        sourceChunk
      ) {
        nodeId = suggestion.existingNodeId;
        this.insertSourceLink(
          nodeId,
          sourceChunk,
          Boolean(resource?.isPrimary),
        );
      }
      if (
        decision === "accepted" &&
        suggestion.kind === "relation" &&
        suggestion.existingNodeId &&
        suggestion.targetNodeId
      ) {
        if (suggestion.proposedType === "parent") {
          this.updateNodeStructure(suggestion.existingNodeId, {
            primaryMotherId: suggestion.targetNodeId,
          });
        } else {
          this.createRelation({
            sourceNodeId: suggestion.existingNodeId,
            targetNodeId: suggestion.targetNodeId,
            type: suggestion.proposedType as KnowledgeRelationType,
            description: suggestion.description,
            source: "ai-confirmed",
          });
        }
      }
      if (decision === "merged" && mergeTargetId && sourceChunk) {
        nodeId = mergeTargetId;
        this.insertSourceLink(
          mergeTargetId,
          sourceChunk,
          Boolean(resource?.isPrimary),
        );
      }
      this.database
        .prepare(
          "UPDATE discovery_suggestions SET status=?, created_node_id=?, target_node_id=COALESCE(?, target_node_id), reviewed_at=? WHERE id=?",
        )
        .run(decision, nodeId ?? null, mergeTargetId ?? null, now, id);
    })();
    return toSuggestion(
      this.database
        .prepare("SELECT * FROM discovery_suggestions WHERE id = ?")
        .get(id) as JsonObject,
    );
  }

  private insertSourceLink(
    nodeId: string,
    chunk: ResourceChunk,
    isPrimary: boolean,
  ) {
    this.database
      .prepare(
        `
      INSERT OR IGNORE INTO knowledge_source_links
      (id, node_id, resource_id, chunk_id, page_number, is_primary, quote, bounding_box_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        randomUUID(),
        nodeId,
        chunk.resourceId,
        chunk.id,
        chunk.pageStart,
        isPrimary ? 1 : 0,
        chunk.text.slice(0, 1000),
        chunk.boundingBox ? JSON.stringify(chunk.boundingBox) : null,
        new Date().toISOString(),
      );
  }

  private recordRevision(
    entityType: string,
    entityId: string,
    version: number,
    action: string,
    snapshot: unknown,
  ) {
    this.database
      .prepare(
        "INSERT INTO entity_revisions (entity_type, entity_id, version, action, snapshot_json, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        entityType,
        entityId,
        version,
        action,
        JSON.stringify(snapshot),
        "teacher",
        new Date().toISOString(),
      );
  }
}

const repositories = new Map<string, ResourceRepository>();
export const getResourceRepository = () => {
  const database = getResourceDatabase();
  const key = database.name;
  const existing = repositories.get(key);
  if (existing) return existing;
  const repository = new ResourceRepository(database);
  repository.seedBaseKnowledge();
  repositories.set(key, repository);
  return repository;
};

export const resourceRepository = new Proxy({} as ResourceRepository, {
  get: (_target, property) => {
    const repository = getResourceRepository() as unknown as Record<PropertyKey, unknown>;
    const value = repository[property];
    return typeof value === 'function' ? value.bind(repository) : value;
  },
});
