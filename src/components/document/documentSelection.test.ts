import test from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { createDocumentExtensions } from "./documentExtensions";
import { readDocumentSelection } from "./documentSelection";

const schema = getSchema(createDocumentExtensions());
function tableEditor(text: string) {
  const paragraph = schema.nodes.paragraph.create(
    { id: "paragraph-a" },
    text ? schema.text(text) : undefined,
  );
  const other = schema.nodes.paragraph.create(
    { id: "paragraph-b" },
    schema.text("邻格原文"),
  );
  const table = schema.nodes.table.create({ id: "table-current" }, [
    schema.nodes.tableRow.create(null, [
      schema.nodes.tableCell.create(null, paragraph),
      schema.nodes.tableCell.create(null, other),
    ]),
  ]);
  const doc = schema.nodes.doc.create(null, [table]);
  let cursor = 0;
  doc.descendants((node, pos) => {
    if (node.attrs.id === "paragraph-a") cursor = pos + 1;
  });
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, cursor),
  });
  return {
    state,
    isActive: (type: string) => type === "table",
  } as unknown as Editor;
}
test("AI table action freezes the whole current table even when the cursor selects no text", () => {
  const editor = tableEditor("课堂活动");
  assert.deepEqual(readDocumentSelection(editor), { blockIds: [], text: "" });
  const selected = readDocumentSelection(editor, "table");
  assert.deepEqual(selected.blockIds, ["table-current"]);
  assert.match(selected.text, /课堂活动/);
  assert.match(selected.text, /邻格原文/);
});
test("empty current cell still yields a table boundary for AI, without inventing a paragraph selection", () => {
  const editor = tableEditor("");
  assert.deepEqual(readDocumentSelection(editor, "table").blockIds, [
    "table-current",
  ]);
  assert.deepEqual(readDocumentSelection(editor, "block").blockIds, [
    "table-current",
  ]);
});
