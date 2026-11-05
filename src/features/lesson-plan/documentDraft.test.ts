import test from "node:test";
import assert from "node:assert/strict";
import { DocumentDraft, type DocumentSaveOperation } from "./documentDraft";
import type { DocumentRecord, RichDocument } from "../../domain/document";
const content = (text: string): RichDocument => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const document = (revision = 1, text = "original"): DocumentRecord => ({
  id: "document",
  preparationId: "preparation",
  title: "教案",
  revision,
  content: content(text),
  createdAt: "",
  updatedAt: "",
});
const rejection = (status: number) =>
  Object.assign(new Error("保存被拒绝"), { status });

test("a definite content rejection can be corrected without retrying the poisoned snapshot", async () => {
  const calls: DocumentSaveOperation[] = [];
  const draft = new DocumentDraft(
    document(),
    async (operation) => {
      calls.push(operation);
      if (calls.length === 1) throw rejection(400);
      return { ...document(2), content: operation.content };
    },
    () => {},
  );
  draft.update(content("bad table"));
  assert.equal(await draft.flush(), false);
  assert.equal(draft.getSnapshot().saveState, "error");
  draft.update(content("corrected table"));
  assert.equal(draft.getSnapshot().saveState, "dirty");
  assert.equal(await draft.flush(), true);
  assert.equal(draft.getSnapshot().dirty, false);
  assert.notEqual(calls[0].operationId, calls[1].operationId);
  assert.deepEqual(calls[1].content, content("corrected table"));
});
test("an unknown response retries the same operation before queued newer teacher edits", async () => {
  const calls: DocumentSaveOperation[] = [];
  const draft = new DocumentDraft(
    document(),
    async (operation) => {
      calls.push(operation);
      if (calls.length === 1) throw rejection(0);
      return { ...document(calls.length), content: operation.content };
    },
    () => {},
  );
  draft.update(content("first"));
  assert.equal(await draft.flush(), false);
  draft.update(content("newer"));
  assert.equal(draft.getSnapshot().saveState, "error");
  assert.equal(await draft.flush(), true);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1], calls[0]);
  assert.notEqual(calls[2].operationId, calls[0].operationId);
  assert.equal(calls[2].expectedRevision, 2);
  assert.deepEqual(calls[2].content, content("newer"));
});
test("concurrent edits queue once and returned normalization does not make a clean draft dirty", async () => {
  let resolve: (record: DocumentRecord) => void;
  const calls: DocumentSaveOperation[] = [];
  const draft = new DocumentDraft(
    document(),
    (operation) => {
      calls.push(operation);
      if (calls.length === 1)
        return new Promise((done) => {
          resolve = done;
        });
      const normalized = structuredClone(operation.content);
      normalized.content[0].attrs = { id: "stable-id" };
      return Promise.resolve({ ...document(3), content: normalized });
    },
    () => {},
  );
  draft.update(content("first"));
  const pending = draft.flush();
  assert.equal(draft.flush(), pending);
  draft.update(content("second"));
  resolve!({ ...document(2), content: calls[0].content });
  assert.equal(await pending, true);
  assert.equal(calls.length, 2);
  assert.equal(draft.getSnapshot().content.content[0].attrs.id, "stable-id");
  assert.equal(draft.getSnapshot().dirty, false);
});
test("conflicts preserve input and require an explicit adoption of the latest revision", async () => {
  let saved = 0;
  const draft = new DocumentDraft(
    document(),
    async () => {
      saved++;
      throw rejection(409);
    },
    () => {},
  );
  draft.update(content("my edit"));
  assert.equal(await draft.flush(), false);
  draft.receive(document(2, "other edit"));
  assert.deepEqual(draft.getSnapshot().content, content("my edit"));
  assert.equal(await draft.flush(), false);
  assert.equal(saved, 1);
  draft.replace(document(2, "other edit"));
  assert.equal(draft.getSnapshot().saveState, "saved");
  assert.equal(draft.getSnapshot().revision, 2);
});
