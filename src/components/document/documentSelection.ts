import type { Editor } from "@tiptap/react";
export interface DocumentSelection {
  blockIds: string[];
  text: string;
}
export interface DocumentAssistantRequest {
  instruction: string;
  selection: DocumentSelection;
}
/** Explicit whole-table requests keep the table root, rather than expanding a cell selection. */
export function readDocumentSelection(
  editor: Editor,
  scope: "selection" | "table" | "block" = "selection",
): DocumentSelection {
  const { from, to, $from } = editor.state.selection;
  if (scope === "table" || (scope === "block" && editor.isActive("table"))) {
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === "table")
        return {
          blockIds: node.attrs.id ? [String(node.attrs.id)] : [],
          text: node.textBetween(0, node.content.size, "\n").slice(0, 12000),
        };
    }
  }
  const ids: string[] = [];
  if (from !== to)
    editor.state.doc.nodesBetween(from, to, (node) => {
      if (node.attrs.id) ids.push(String(node.attrs.id));
    });
  else if (scope === "block" && $from.parent.attrs.id)
    ids.push(String($from.parent.attrs.id));
  return {
    blockIds: [...new Set(ids)],
    text:
      from === to
        ? scope === "block"
          ? $from.parent.textContent.slice(0, 12000)
          : ""
        : editor.state.doc.textBetween(from, to, "\n").slice(0, 12000),
  };
}
