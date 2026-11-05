import test from "node:test";
import assert from "node:assert/strict";
import { documentChanges } from "./documentChanges";
import type { RichDocument } from "./document";
const block = (id: string, text: string) => ({
  type: "paragraph",
  attrs: { id },
  content: [{ type: "text", text }],
});
test("a review only includes changed, inserted and removed blocks, preserving table structure", () => {
  const table = {
    type: "table",
    attrs: { id: "table" },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { colspan: 1, rowspan: 1 },
            content: [block("cell", "before")],
          },
        ],
      },
    ],
  };
  const before: RichDocument = {
    type: "doc",
    content: [block("intro", "same"), table, block("remove", "old")],
  };
  const edited = structuredClone(table);
  edited.content[0].content[0].content[0].content[0].text = "after";
  const after: RichDocument = {
    type: "doc",
    content: [block("new", "inserted"), block("intro", "same"), edited],
  };
  const result = documentChanges(before, after);
  assert.deepEqual([result.changed, result.added, result.removed], [1, 1, 1]);
  assert.deepEqual(result.before.content, [table, block("remove", "old")]);
  assert.deepEqual(result.after.content, [block("new", "inserted"), edited]);
  assert.equal(result.after.content[1].type, "table");
  assert.equal(
    documentChanges(before, structuredClone(before)).hasChanges,
    false,
  );
});

test("moving existing blocks is included in the review", () => {
  const a = block("a", "first"),
    b = block("b", "second");
  const changes = documentChanges(
    { type: "doc", content: [a, b] },
    { type: "doc", content: [b, a] },
  );
  assert.equal(changes.changed, 2);
  assert.deepEqual(changes.before.content, [a, b]);
  assert.deepEqual(changes.after.content, [b, a]);
});
