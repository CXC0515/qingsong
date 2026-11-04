import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import {
  runWithWorkspace,
  type WorkspaceContext,
} from "../../context/workspaceContext";
import { closePreparationDatabase } from "../../database/preparationDatabase";
import { closeResourceDatabase } from "../../database/resourceDatabase";
import { materialPoolRepository } from "../../repositories/materialPoolRepository";
import * as prep from "./preparationService";
const root = await mkdtemp(path.join(tmpdir(), "qs-preparation-test-"));
const context = (
  userId: string,
  workspaceId = "workspace-shared",
): WorkspaceContext => ({
  userId,
  workspaceId,
  role: "teacher",
  root,
  dataDirectory: path.join(root, workspaceId, "data"),
  uploadDirectory: path.join(root, workspaceId, "uploads"),
});
const alice = context("teacher-alice"),
  bob = context("teacher-bob");
const op = () => randomUUID();
const content = (text: string) => ({
  type: "doc" as const,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
after(async () => {
  closePreparationDatabase();
  closeResourceDatabase();
  await rm(root, { recursive: true, force: true });
});

test("immutable revisions, idempotent saves, conflicts and restore without losing later history", () =>
  runWithWorkspace(alice, () => {
    const detail = prep.createPreparation({
      title: "测试备课",
      subject: "数学",
      operationId: op(),
    });
    const id = detail.preparation.id,
      original = detail.documents[0];
    const request = {
      expectedRevision: 1,
      operationId: op(),
      content: content("第一版内容"),
    };
    const first = prep.saveDocument(id, original.id, request);
    assert.equal(first.revision, 2);
    assert.deepEqual(prep.saveDocument(id, original.id, request), first);
    assert.throws(
      () =>
        prep.saveDocument(id, original.id, {
          ...request,
          content: content("偷换请求"),
        }),
      /编号已用于其他内容/,
    );
    assert.throws(
      () =>
        prep.saveDocument(id, original.id, { ...request, operationId: op() }),
      /已经有新修改/,
    );
    const second = prep.saveDocument(id, original.id, {
      expectedRevision: 2,
      operationId: op(),
      content: content("第二版内容"),
    });
    const restored = prep.restoreRevision(id, original.id, {
      revision: 2,
      expectedRevision: 3,
      operationId: op(),
    });
    assert.equal(restored.revision, 4);
    assert.deepEqual(restored.content, first.content);
    assert.deepEqual(
      prep.getDocument(id, original.id, 3).content,
      second.content,
    );
    assert.equal(prep.listRevisions(id, original.id).length, 4);
    const fork = prep.forkDocument(id, {
      sourceDocumentId: original.id,
      revision: 3,
      title: "基础练习版",
      operationId: op(),
    });
    assert.equal(fork.revision, 1);
    assert.equal(fork.sourceDocumentId, original.id);
    assert.deepEqual(fork.content, second.content);
  }));

test("owner isolation even when teachers share the same workspace database", () => {
  const detail = runWithWorkspace(alice, () =>
    prep.createPreparation({ title: "自己的备课", operationId: op() }),
  );
  runWithWorkspace(bob, () => {
    assert.equal(prep.listPreparations().length, 0);
    assert.throws(
      () => prep.getPreparation(detail.preparation.id),
      /当前账号可访问/,
    );
    assert.throws(
      () => prep.getDocument(detail.preparation.id, detail.documents[0].id),
      /当前账号可访问/,
    );
    assert.equal(prep.getSessionBinding("native-session-123"), undefined);
  });
  runWithWorkspace(context("teacher-alice", "workspace-other"), () =>
    assert.equal(prep.listPreparations().length, 0),
  );
});

test("AI proposal cannot overwrite a teacher edit and applying once records a revision", () =>
  runWithWorkspace(alice, () => {
    const detail = prep.createPreparation({
        title: "提议测试",
        operationId: op(),
      }),
      id = detail.preparation.id,
      doc = detail.documents[0];
    const proposal = prep.createProposal(id, {
      documentId: doc.id,
      baseRevision: 1,
      content: content("AI建议"),
      summary: "补充例题",
      operationId: op(),
    });
    assert.equal(prep.getDocument(id, doc.id).revision, 1);
    prep.saveDocument(id, doc.id, {
      expectedRevision: 1,
      content: content("教师自己修改"),
      operationId: op(),
    });
    assert.throws(
      () => prep.applyProposal(id, proposal.id, { operationId: op() }),
      /已经有新修改/,
    );
    assert.equal(prep.listProposals(id)[0].status, "pending");
    const newer = prep.createProposal(id, {
      documentId: doc.id,
      baseRevision: 2,
      content: content("AI新建议"),
      summary: "修改当前稿",
      operationId: op(),
    });
    const apply = { operationId: op() },
      result = prep.applyProposal(id, newer.id, apply);
    assert.equal(result.revision, 3);
    assert.deepEqual(prep.applyProposal(id, newer.id, apply), result);
    assert.equal(
      prep.listProposals(id).find((p) => p.id === newer.id)?.status,
      "applied",
    );
    assert.throws(
      () => prep.discardProposal(id, newer.id, { operationId: op() }),
      /建议已应用/,
    );
  }));

test("sources recheck availability and content identity; removing selection preserves original", async () => {
  await mkdir(alice.uploadDirectory, { recursive: true });
  const filePath = path.join(alice.uploadDirectory, "sample.txt"),
    bytes = Buffer.from("可追溯材料");
  await writeFile(filePath, bytes);
  await runWithWorkspace(alice, async () => {
    const detail = prep.createPreparation({
      title: "资料测试",
      operationId: op(),
    });
    const item = materialPoolRepository.createItem({
      id: randomUUID(),
      originalName: "参考.txt",
      detectedMime: "text/plain",
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      diskPath: filePath,
      source: "test",
    });
    const request = {
      kind: "pool",
      id: item.id,
      role: "reference",
      operationId: op(),
    };
    const source = await prep.addSource(detail.preparation.id, request);
    assert.equal(
      (await prep.addSource(detail.preparation.id, request)).id,
      source.id,
    );
    assert.equal(
      (await prep.resolveSourceFile(detail.preparation.id, source.id)).filePath,
      await realpath(filePath),
    );
    materialPoolRepository.setTrashed(item.id, true);
    await assert.rejects(
      prep.resolveSourceFile(detail.preparation.id, source.id),
      /已回收/,
    );
    materialPoolRepository.setTrashed(item.id, false);
    await writeFile(filePath, "资料被替换");
    await assert.rejects(
      prep.resolveSourceFile(detail.preparation.id, source.id),
      /内容已变化/,
    );
    prep.removeSource(detail.preparation.id, source.id);
    assert.equal(prep.getPreparation(detail.preparation.id).sources.length, 0);
    assert.ok(materialPoolRepository.getItem(item.id));
  });
});

test("workspaces, sessions and tasks persist independently from a chat; bindings cannot retarget", () =>
  runWithWorkspace(alice, () => {
    prep.setNativeWorkspace("default", "native-workspace-default");
    prep.setNativeWorkspace("preparation", "native-workspace-preparation");
    const detail = prep.createPreparation({
        title: "任务测试",
        operationId: op(),
      }),
      id = detail.preparation.id,
      doc = detail.documents[0];
    prep.bindSession(
      id,
      doc.id,
      "native-session-123",
      "native-workspace-preparation",
    );
    assert.equal(
      prep.getSessionBinding("native-session-123")?.documentId,
      doc.id,
    );
    assert.equal(
      prep.findPreparationSession(id, doc.id)?.sessionId,
      "native-session-123",
    );
    const another = prep.createPreparation({
      title: "另一课",
      operationId: op(),
    });
    assert.throws(
      () =>
        prep.bindSession(
          another.preparation.id,
          another.documents[0].id,
          "native-session-123",
          "native-workspace-preparation",
        ),
      /已关联另一份教案/,
    );
    const task = prep.createTask(id, {
      instruction: "补充练习",
      documentId: doc.id,
      sessionId: "native-session-123",
      operationId: op(),
    });
    prep.updateTask(id, task.id, { status: "running", stage: "reading" });
    prep.interruptPreparationTasks();
    assert.equal(prep.getTask(id, task.id).status, "interrupted");
    closePreparationDatabase();
    assert.equal(
      prep.getNativeWorkspace("default"),
      "native-workspace-default",
    );
    assert.equal(prep.getTask(id, task.id).status, "interrupted");
  }));

test("document validation rejects active content, arbitrary image URLs and assets from another preparation", () =>
  runWithWorkspace(alice, () => {
    assert.throws(
      () =>
        prep.normalizeRichDocument({
          type: "doc",
          content: [{ type: "script", text: "bad" }],
        }),
      /尚不支持/,
    );
    assert.throws(
      () =>
        prep.normalizeRichDocument({
          type: "doc",
          content: [
            {
              type: "image",
              attrs: { assetId: op(), src: "https://example.com/image.png" },
            },
          ],
        }),
      /图片地址无效/,
    );
    const detail = prep.createPreparation({
      title: "图片范围测试",
      operationId: op(),
    });
    assert.throws(
      () =>
        prep.saveDocument(detail.preparation.id, detail.documents[0].id, {
          expectedRevision: 1,
          operationId: op(),
          content: {
            type: "doc",
            content: [{ type: "image", attrs: { assetId: op() } }],
          },
        }),
      /图片不属于/,
    );
    assert.throws(
      () =>
        prep.normalizeRichDocument({
          type: "doc",
          content: [
            {
              type: "blockMath",
              attrs: { latex: "x", omml: "<!DOCTYPE malicious>" },
            },
          ],
        }),
      /公式包含/,
    );
  }));

test("document validation bounds layout dimensions and rejects structures the editor would discard", () =>
  runWithWorkspace(alice, () => {
    for (const attrs of [
      { colspan: 1000000 },
      { rowspan: -1 },
      { width: 100000000 },
      { height: 1.5 },
      { start: "bad" },
    ]) {
      assert.throws(
        () =>
          prep.normalizeRichDocument({
            type: "doc",
            content: [{ type: "paragraph", attrs }],
          }),
        /尺寸无效/,
      );
    }
    for (const node of [
      { type: "table" },
      { type: "table", content: [{ type: "tableRow" }] },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "heading", attrs: { level: 1 } }],
          },
        ],
      },
    ]) {
      assert.throws(
        () => prep.normalizeRichDocument({ type: "doc", content: [node] }),
        /必要段落|正文段落/,
      );
    }
  }));
