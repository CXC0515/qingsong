import { Node, type Editor } from "@tiptap/core";

export const DocumentColumns = Node.create({
  name: "columns",
  group: "block",
  content: "column{2,3}",
  isolating: true,
  addAttributes: () => ({
    ratios: {
      default: null,
      parseHTML: (element) => {
        try {
          return JSON.parse(
            element.getAttribute("data-column-ratios") ?? "null",
          );
        } catch {
          return null;
        }
      },
      renderHTML: (attrs) =>
        Array.isArray(attrs.ratios)
          ? {
              "data-column-ratios": JSON.stringify(attrs.ratios),
              style:
                "grid-template-columns:" +
                attrs.ratios.map((n: number) => `minmax(0,${n}fr)`).join(" "),
            }
          : {},
    },
  }),
  parseHTML: () => [{ tag: "div[data-document-columns]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    { ...HTMLAttributes, "data-document-columns": "" },
    0,
  ],
});
export const DocumentColumn = Node.create({
  name: "column",
  content: "block+",
  isolating: true,
  parseHTML: () => [{ tag: "div[data-document-column]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    { ...HTMLAttributes, "data-document-column": "" },
    0,
  ],
});
export function insertDocumentColumns(editor: Editor, count: 2 | 3) {
  // A nested layout is harder to read and has no reliable narrow-screen composition.
  if (editor.isActive("columns")) return false;
  const { selection } = editor.state;
  if (selection.$from.blockRange(selection.$to)?.depth !== 0) return false;
  const range = selection.$from.blockRange(selection.$to);
  // Wrap whole selected paragraphs; never consume partial table cells or lists.
  const wrap =
    range?.depth === 0 &&
    (!selection.empty || selection.$from.parent.content.size > 0);
  const content = wrap
    ? editor.state.doc.slice(range.start, range.end).content.toJSON()
    : [{ type: "paragraph" }];
  const node = {
    type: "columns",
    content: Array.from({ length: count }, (_, i) => ({
      type: "column",
      content: i === 0 ? content : [{ type: "paragraph" }],
    })),
  };
  return editor
    .chain()
    .focus()
    .insertContentAt(
      wrap ? { from: range.start, to: range.end } : selection.from,
      node,
    )
    .run();
}
export function removeDocumentColumns(editor: Editor) {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name !== "columns") continue;
    const blocks = [];
    for (let c = 0; c < node.childCount; c++) {
      const column = node.child(c);
      for (let i = 0; i < column.childCount; i++) blocks.push(column.child(i));
    }
    editor.view.dispatch(
      editor.state.tr.replaceWith(
        $from.before(depth),
        $from.after(depth),
        blocks,
      ),
    );
    editor.commands.focus();
    return true;
  }
  return false;
}
