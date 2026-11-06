import { createHash } from "node:crypto";
import { parsePreparationInput } from "../../../src/domain/preparationToolContract.mjs";
import { documentCapabilities } from "../../../src/domain/documentContract";
import { preparationRepository } from "../../repositories/preparationRepository";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getWorkspaceContext } from "../../context/workspaceContext";
import * as preparations from "../preparation/preparationService";
import { officialMaterialHome } from "./officialAttachments";
import { readAssistantMaterial } from "./materialReader";
import type { PreparationAssistantTarget } from "../../../src/domain/preparationAssistant";
import type { DocumentNode, RichDocument } from "../../../src/domain/document";
import { createPreparationReference, resolveTaskReference, sessionPreparationReferences } from "./preparationReferences";
import { assertCandidateDelivery } from "../preparation/candidateDelivery";

export const preparationTargetSchema = z
  .object({
    mode: z.enum(["default", "preparation"]),
    sessionId: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/).optional(),
    preparationId: z.uuid().optional(),
    documentId: z.uuid().optional(),
    revision: z.number().int().positive().optional(),
    selection: z
      .object({
        blockIds: z.array(z.string().min(1).max(160)).max(100),
        text: z.string().max(12000),
        location: z.object({from:z.number().int().nonnegative(),to:z.number().int().nonnegative(),blocks:z.array(z.object({id:z.string().max(160),from:z.number().int().nonnegative(),to:z.number().int().nonnegative()}).strict()).max(100),table:z.object({id:z.string().max(160),row:z.number().int().positive(),column:z.number().int().positive()}).strict().optional()}).strict().optional(),
      })
      .strict()
      .optional(),
    instruction: z.string().max(8000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.documentId || value.selection) && !value.preparationId)
      ctx.addIssue({
        code: "custom",
        message: "请先指定备课，再选择教案或正文。",
      });
    if (value.mode === "default" && value.preparationId)
      ctx.addIssue({
        code: "custom",
        message: "具体教案须在备课工作空间打开。",
      });
  });
type NativeCall = (method: string, request: unknown) => Promise<any>;
type Selection = NonNullable<PreparationAssistantTarget["selection"]>;
interface TaskSnapshot {
  executionLease?: string;
  baseRevision: number;
  selection?: Selection;
  inputFingerprint: string;
  proposalId?: string;
  submission?: { operationId: string; fingerprint: string };
}
const navigationLocks = new Map<string, Promise<unknown>>();
const scopeKey = () => {
  const context = getWorkspaceContext();
  return context.userId + ":" + context.workspaceId;
};

/** Serialize only target resolution, not model execution; simultaneous opens reuse one native workspace. */
async function serializedTarget<T>(action: () => Promise<T>): Promise<T> {
  const scope = scopeKey(),
    previous = navigationLocks.get(scope) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(action);
  navigationLocks.set(scope, pending);
  try {
    return await pending;
  } finally {
    if (navigationLocks.get(scope) === pending) navigationLocks.delete(scope);
  }
}
export async function resolvePreparationTarget(
  input: unknown,
  native: NativeCall,
): Promise<PreparationAssistantTarget> {
  const args = preparationTargetSchema.parse(input);
  // Check the teacher-owned business target before creating any native directories or sessions.
  const detail = args.preparationId
    ? preparations.getPreparation(args.preparationId)
    : undefined;
  const document = detail
    ? preparations.getDocument(
        detail.preparation.id,
        args.documentId ?? detail.documents[0].id,
      )
    : undefined;
  return serializedTarget(async () => {
    const kind = args.mode === "default" ? "default" : "preparation";
    let workspaceId = preparations.getNativeWorkspace(kind);
    if (!workspaceId) {
      const directory = path.join(
        officialMaterialHome(getWorkspaceContext()),
        kind === "default" ? "empty-workspace" : "preparation-workspace",
      );
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const created = await native("workspace/create", { path: directory });
      workspaceId = created.workspace.workspaceId;
      await native("workspace/rename", {
        workspaceId,
        title: kind === "default" ? "我的工作区" : "备课",
      });
      preparations.setNativeWorkspace(kind, workspaceId!);
    }
    if (!detail || !document) return { workspaceId: workspaceId!, sessionId:args.sessionId };
    const reference = createPreparationReference({...args,preparationId:detail.preparation.id,documentId:document.id});
    return {workspaceId:workspaceId!,sessionId:args.sessionId,reference,instruction:args.instruction};
  });
}
/** Read back business storage; never infer writes from a model failure. */
export function preparationSavedOutcome(sessionId: string) {
  const references=sessionPreparationReferences(sessionId);
  const allTasks=preparationRepository.list<import("../../../src/domain/preparation").PreparationTask>("preparation_tasks").filter(task=>task.sessionId===sessionId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const latest=allTasks[0];
  let currentReference;
  try { currentReference = resolveTaskReference(sessionId); } catch (error) {
    if (!(error instanceof preparations.PreparationError) || error.code !== 'PREPARATION_TARGET_REQUIRED') throw error;
  }
  const binding=latest?{preparationId:latest.preparationId,documentId:latest.documentId!}:currentReference;
  if (!binding) return {bound:false as const};
  const document = preparations.getDocument(binding.preparationId, binding.documentId ?? preparations.getPreparation(binding.preparationId).documents[0].id);
  const tasks = preparations.listTasks(binding.preparationId).filter(task => task.sessionId === sessionId && task.documentId === document.id);
  const proposalIds = new Set(tasks.map(task => (task.result as TaskSnapshot | undefined)?.proposalId).filter(Boolean));
  const proposals = preparations.listProposals(binding.preparationId).filter(proposal => proposalIds.has(proposal.id));
  const title=preparations.getPreparation(binding.preparationId).preparation.title;
  const selected=currentReference?.documentId===document.id?currentReference:undefined;
  return {lastInstruction:[...tasks].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]?.instruction,selection:selected?.selection?{...selected.selection,revision:selected.revision,stale:selected.revision!==document.revision}:undefined,bound:true as const, preparationId:binding.preparationId, documentId:document.id, title:title===document.title?title:title+' · '+document.title, revision:document.revision, pending:proposals.filter(p => p.status === 'pending').length, applied:proposals.filter(p => p.status === 'applied').length, tasks:tasks.map(task => ({status:task.status,updatedAt:task.updatedAt})).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))};
}
export function preparationRuntimeContext(sessionId: string) {
  const references = sessionPreparationReferences(sessionId);
  if (!references.length) return null;
  const entries = references.map(reference => {
    const detail = preparations.getPreparation(reference.preparationId);
    const latest = preparations.getDocument(reference.preparationId, reference.documentId);
    return {
      ...reference,
      stale: latest.revision !== reference.revision,
      latestRevision: latest.revision,
      sourceUrl: '/?page=lesson-plan&preparationId='+reference.preparationId+'&documentId='+reference.documentId,
      document: {id: reference.documentId, title: reference.title, revision: reference.revision, ref: {type: "lessonPlan", id: reference.documentId, parentId: reference.preparationId}, readFilters: {revision: reference.revision}},
      preparation: detail.preparation,
      sources: detail.sources.map(source => ({...source, ref: {type: "preparationSource", id: source.id, parentId: reference.preparationId}})),
    };
  });
  return {
    references: entries,
    // A single source retains the established Skill context shape, without a session binding.
    ...(entries.length === 1 ? entries[0] : {}),
    documentFormat: documentCapabilities,
    instructions: "这些是教师实际发送的教案版本引用，不是会话归属。先用qingsong_read按document.ref及readFilters读取引用版本。允许讨论多份教案；修改时begin指定referenceId，后续沿用taskId，不猜修改目标。stale为true表示正文已有新版：请教师从教案页重新添加引用后修改。候选由教师确认应用，不能声称已写入正式稿。",
  };
}
function selectedBlocks(
  document: RichDocument,
  selection?: Selection,
): Selection | undefined {
  if (!selection?.blockIds.length) return undefined;
  const selected = new Set(selection.blockIds),
    ancestors = new Set<string>(),
    found = new Set<string>();
  function visit(node: DocumentNode, selectedAncestors: string[]) {
    const id = typeof node.attrs?.id === "string" ? node.attrs.id : undefined;
    const next =
      id && selected.has(id) ? [...selectedAncestors, id] : selectedAncestors;
    if (id && selected.has(id)) {
      found.add(id);
      selectedAncestors.forEach((parent) => ancestors.add(parent));
    }
    node.content?.forEach((child) => visit(child, next));
  }
  document.content.forEach((node) => visit(node, []));
  if ([...selected].some((id) => !found.has(id)))
    throw new preparations.PreparationError(
      "SELECTION_CHANGED",
      "选中的内容已变化，未开始改写。请重新选择需要修改的段落。",
      409,
    );
  return {
    blockIds: [...selected].filter((id) => !ancestors.has(id)),
    text: selection.text,
  };
}
/** Remove editable subtrees and compare the remaining document, including position and formatting. */
function assertSelectionScope(
  original: RichDocument,
  candidate: RichDocument,
  selection?: Selection,
) {
  if (!selection?.blockIds.length) return;
  const editable = new Set(selection.blockIds);
  const immutable = (node: DocumentNode): DocumentNode | undefined => {
    if (typeof node.attrs?.id === "string" && editable.has(node.attrs.id))
      return undefined;
    return {
      ...node,
      ...(node.content
        ? {
            content: node.content.flatMap((child) => {
              const kept = immutable(child);
              return kept ? [kept] : [];
            }),
          }
        : {}),
    };
  };
  if (
    JSON.stringify(immutable(original)) !== JSON.stringify(immutable(candidate))
  )
    throw new preparations.PreparationError(
      "PROPOSAL_OUT_OF_SCOPE",
      "这份修改涉及选区以外的内容，尚未保存候选或修改正文。请只修改选中段落，其他调整另行提出。",
      409,
    );
}
/** Read persisted state before claiming a task/candidate was saved. No teaching-quality claim. */
function verifiedTask(
  prepId: string,
  taskId: string,
  action: string,
  expected?: { status?: string; stage?: string; message?: string },
) {
  const task = preparations.getTask(prepId, taskId),
    snapshot = task.result as TaskSnapshot | undefined;
  const document = preparations.getDocument(prepId, task.documentId!);
  const proposal = snapshot?.proposalId
    ? preparations
        .listProposals(prepId)
        .find((p) => p.id === snapshot.proposalId)
    : undefined;
  if (
    snapshot?.proposalId &&
    (!proposal ||
      proposal.documentId !== document.id ||
      proposal.baseRevision !== snapshot.baseRevision)
  )
    throw new preparations.PreparationError(
      "PREPARATION_VERIFY_FAILED",
      "保存结果未能核实，已有内容保留。请查看任务和候选状态，不要重复提交。",
      409,
    );
  if (
    expected &&
    Object.entries(expected).some(
      ([field, value]) => task[field as keyof typeof task] !== value,
    )
  )
    throw new preparations.PreparationError(
      "PREPARATION_VERIFY_FAILED",
      "任务保存状态与请求不一致，已有内容保留。请核对任务，不要重复提交。",
      409,
    );
  return {
    ...task,
    taskId: task.id,
    baseRevision: snapshot?.baseRevision,
    ...(proposal ? { proposalId: proposal.id } : {}),
    verification: {
      verified: true,
      action,
      taskStatus: task.status,
      documentRevision: document.revision,
      proposal: proposal
        ? {
            id: proposal.id,
            status: proposal.status,
            appliedRevision: proposal.appliedRevision,
          }
        : null,
      submission: snapshot?.submission ?? null,
      message:
        proposal?.status === "applied"
          ? "候选已应用，请以正式版本为准。"
          : proposal
            ? "候选已保存；本工具没有应用到正式正文。"
            : "任务状态已回读；本工具没有应用到正式正文。",
    },
  };
}
function submissionFingerprint(args: any) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        args.taskId,
        args.baseRevision,
        args.content,
        args.summary,
        args.operationId,
      ]),
    )
    .digest("hex");
}
export async function preparationAssistantTool(
  sessionId: string,
  input: unknown,
  sourceText: string,
  signal?: AbortSignal,
  executionLease?: string,
) {
  signal?.throwIfAborted();
  const args: any = parsePreparationInput(input);
  const tasks=preparationRepository.list<import("../../../src/domain/preparation").PreparationTask>("preparation_tasks").filter(task=>task.sessionId===sessionId).sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt));
  const target=args.taskId?tasks.find(task=>task.id===args.taskId):tasks.filter(task=>!executionLease||(task.result as TaskSnapshot|undefined)?.executionLease===executionLease).at(-1);
  const reference=args.action==="begin"||args.action==="render"?resolveTaskReference(sessionId,args.referenceId):undefined;
  const prepId=reference?.preparationId??target?.preparationId;
  if (!prepId&&args.action==="status"&&!args.taskId) return {verification:{verified:true,action:"status",taskFound:false,message:"本轮未找到任务，未执行写入。"}};
  if (!prepId) throw new preparations.PreparationError("PREPARATION_TARGET_REQUIRED","请添加教案引用并明确本次目标，已有内容保留。");
  const document=preparations.getDocument(prepId,reference?.documentId??target!.documentId!);
  if (args.action === "render") {
    const file = await preparations.resolveSourceFile(prepId, args.sourceId);
    const outputDirectory = path.join(
      officialMaterialHome(getWorkspaceContext()),
      "qingsong-materials",
      "cache",
      "preparation",
      prepId,
      args.sourceId,
    );
    return readAssistantMaterial(file, {
      action: "render",
      start: args.start,
      limit: args.limit,
      signal,
      outputDirectory,
    });
  }
  const ownedTasks = () =>
    preparations
      .listTasks(prepId)
      .filter(
        (t) =>
          t.sessionId === sessionId &&
          t.documentId === document.id &&
          (!executionLease ||
            (t.result as TaskSnapshot | undefined)?.executionLease ===
              executionLease),
      );
  if (args.action === "status") {
    const task = args.taskId
      ? preparations.getTask(prepId, args.taskId)
      : ownedTasks().at(-1);
    if (!task)
      return {
        verification: {
          verified: true,
          action: "status",
          taskFound: false,
          message: "本轮未找到任务，未执行写入。",
        },
      };
    if (!ownedTasks().some((t) => t.id === task.id))
      throw new preparations.PreparationError(
        "TASK_SCOPE_MISMATCH",
        "任务不属于当前教案会话或轮次，未执行写入。",
        403,
      );
    return verifiedTask(prepId, task.id, "status");
  }
  if (args.action === "begin") {
    // A lost begin response must not create a second task in the same execution lease.
    const prior = executionLease ? ownedTasks().at(-1) : undefined;
    if (prior) return verifiedTask(prepId, prior.id, "begin");
    const selected = reference;
    if (
      selected && selected.revision !== document.revision
    )
      throw new preparations.PreparationError(
        "SELECTION_CHANGED",
        "正文已变化，未开始改写。请重新选择段落后重试。",
        409,
      );
    const snapshot: TaskSnapshot = {
      executionLease,
      baseRevision: document.revision,
      selection: selectedBlocks(document.content, selected?.selection),
      inputFingerprint: preparations.preparationInputFingerprint(prepId),
    };
    const task = preparations.createTask(prepId, {
      documentId: document.id,
      sessionId,
      instruction: sourceText || "备课协作",
      stage: args.stage,
      operationId: randomUUID(),
      result: snapshot,
    });
    preparations.updateTask(prepId, task.id, { status: "running" });
    return verifiedTask(prepId, task.id, "begin", {
      status: "running",
      stage: args.stage,
    });
  }
  const task = preparations.getTask(prepId, args.taskId);
  if (task.sessionId !== sessionId || task.documentId !== document.id)
    throw new preparations.PreparationError(
      "TASK_SCOPE_MISMATCH",
      "任务不属于当前教案会话，未修改正文。",
    );
  if (
    executionLease &&
    (task.result as TaskSnapshot | undefined)?.executionLease !== executionLease
  )
    throw new preparations.PreparationError(
      "TASK_TURN_MISMATCH",
      "任务属于此前的执行轮次，未修改正文。请重新开始当前任务。",
      409,
    );
  const savedSnapshot = task.result as TaskSnapshot | undefined;
  if (
    args.action === "propose" &&
    savedSnapshot?.submission?.operationId === args.operationId
  ) {
    if (savedSnapshot.submission.fingerprint !== submissionFingerprint(args))
      throw new preparations.PreparationError(
        "OPERATION_CONFLICT",
        "同一操作编号对应的候选内容不同，未重复提交，请核对原候选。",
        409,
      );
    if (savedSnapshot.proposalId)
      return verifiedTask(prepId, task.id, "propose");
  }
  if (
    args.action === "finish" &&
    task.status === args.status &&
    task.message === args.message
  )
    return verifiedTask(prepId, task.id, "finish");
  if (["cancelled", "interrupted", "failed", "completed"].includes(task.status))
    throw new preparations.PreparationError(
      "TASK_ALREADY_FINISHED",
      "任务已停止或结束，请重新开始；正文未修改。",
      409,
    );
  if (args.action === "progress") {
    preparations.updateTask(prepId, task.id, {
      status: "running",
      stage: args.stage,
      message: args.message,
    });
    return verifiedTask(prepId, task.id, "progress", {
      status: "running",
      stage: args.stage,
      message: args.message,
    });
  }
  if (args.action === "finish") {
    preparations.updateTask(prepId, task.id, {
      status: args.status,
      stage: args.status === "completed" ? "已完成" : "需要处理",
      message: args.message,
    });
    return verifiedTask(prepId, task.id, "finish", {
      status: args.status,
      message: args.message,
    });
  }
  const snapshot = task.result as TaskSnapshot;
  if (args.baseRevision !== snapshot?.baseRevision)
    throw new preparations.PreparationError(
      "VERSION_CONFLICT",
      "候选版本与任务起点不一致，请重新核对正文；没有应用修改。",
      409,
    );
  if (
    snapshot.inputFingerprint !==
    preparations.preparationInputFingerprint(prepId)
  )
    throw new preparations.PreparationError(
      "INPUT_CHANGED",
      "备课要求或资料已变化，尚未保存旧候选。请按当前要求重新开始。",
      409,
    );
  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(args.content);
  } catch {
    throw new preparations.PreparationError(
      "INVALID_DOCUMENT",
      "修改候选不是完整的文档格式，尚未保存候选或修改正文。请重新提交完整文档。",
    );
  }
  const candidate = preparations.normalizeRichDocument(parsedContent, prepId);
  assertSelectionScope(
    preparations.getDocument(prepId, document.id, args.baseRevision).content,
    candidate,
    snapshot.selection,
  );
  assertCandidateDelivery(preparations.getDocument(prepId,document.id,args.baseRevision).content,candidate);
  signal?.throwIfAborted();
  return preparationRepository.transaction(() => {
    // Candidate, operation identity, task completion and verification commit atomically.
    const submission = {
      operationId: args.operationId,
      fingerprint: submissionFingerprint(args),
    };
    preparations.updateTask(prepId, task.id, {
      result: { ...snapshot, submission },
    });
    const proposal = preparations.createProposal(prepId, {
      documentId: document.id,
      baseRevision: args.baseRevision,
      content: candidate,
      summary: args.summary,
      operationId: args.operationId,
    });
    preparations.updateTask(prepId, task.id, {
      status: "completed",
      stage: "修改候选已就绪",
      message: "请在教案中查看并应用；当前正文尚未改变。",
      result: { ...snapshot, submission, proposalId: proposal.id },
    });
    const stored = preparations
      .listProposals(prepId)
      .find((item) => item.id === proposal.id);
    if (
      !stored ||
      JSON.stringify(stored.content) !== JSON.stringify(candidate) ||
      stored.summary !== args.summary
    )
      throw new preparations.PreparationError(
        "PREPARATION_VERIFY_FAILED",
        "候选保存内容核验失败，本次事务已撤回。已有内容保留，请核对后重试。",
        409,
      );
    const verified = verifiedTask(prepId, task.id, "propose");
    if (verified.verification.taskStatus !== "completed")
      throw new preparations.PreparationError(
        "PREPARATION_VERIFY_FAILED",
        "候选任务状态未能确认，请核对候选后继续。",
        409,
      );
    return {
      ...verified,
      message: "修改候选已保存，请教师查看并应用。教案正文尚未改变。",
    };
  });
}
/** Called after native cancel/error/turn end; never marks generated content as successfully completed. */
export function stopSessionTasks(
  sessionId: string,
  status: "cancelled" | "interrupted" | "failed" = "interrupted",
  message = "本轮执行已结束但任务尚未完成。已有教案保留，可重新开始。",
  executionLease?: string,
) {
  return preparationRepository.list<import("../../../src/domain/preparation").PreparationTask>("preparation_tasks")
    .filter(task=>task.sessionId===sessionId&&["running","queued"].includes(task.status)&&(!executionLease||(task.result as TaskSnapshot|undefined)?.executionLease===executionLease))
    .map(task=>preparations.updateTask(task.preparationId,task.id,{status,message}));
}
