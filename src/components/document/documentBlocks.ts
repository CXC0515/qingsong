import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

export interface DocumentBlock { position: number; node: ProseMirrorNode }
/** Tables and lists are indivisible; a column is its own block movement boundary. */
export function documentBlockAt(doc: ProseMirrorNode, position: number): DocumentBlock | null {
  if (position < 0 || position > doc.content.size) return null;
  const resolved = doc.resolve(position);
  for (let depth = 1; depth <= resolved.depth; depth++) {
    const node = resolved.node(depth);
    if (["columns", "column"].includes(node.type.name)) continue;
    return { position: resolved.before(depth), node };
  }
  const after = resolved.nodeAfter;
  return after?.isBlock && after.type.name !== "column" ? { position, node: after } : null;
}
export function selectDocumentBlock(state: EditorState, position: number): Transaction | null {
  const node = state.doc.nodeAt(position);
  if (!node?.isBlock) return null;
  const selection = node.isTextblock
    ? TextSelection.create(state.doc, position + 1, position + node.nodeSize - 1)
    : NodeSelection.create(state.doc, position);
  return state.tr.setSelection(selection);
}
/** Reorder siblings in one undo step, preserving IDs and every structural subtree. */
export function moveDocumentBlock(state: EditorState, from: number, to: number, after = false): Transaction | null {
  if (from === to || from < 0 || to < 0 || from > state.doc.content.size || to > state.doc.content.size) return null;
  const source = state.doc.resolve(from), target = state.doc.resolve(to);
  if (source.parent !== target.parent || !source.nodeAfter?.isBlock || !target.nodeAfter?.isBlock) return null;
  if (!["doc", "column"].includes(source.parent.type.name)) return null;
  const parent = source.parent, sourceIndex = source.index(), targetIndex = target.index();
  const nodes: ProseMirrorNode[] = [];
  parent.forEach(node => nodes.push(node));
  const [moved] = nodes.splice(sourceIndex, 1);
  let insertion = targetIndex + (after ? 1 : 0);
  if (sourceIndex < insertion) insertion--;
  if (insertion === sourceIndex) return null;
  nodes.splice(insertion, 0, moved);
  const content = Fragment.fromArray(nodes);
  if (!parent.type.validContent(content)) return null;
  const start = source.start();
  const transaction = closeHistory(state.tr).replaceWith(start, start + parent.content.size, content);
  const movedPosition = start + nodes.slice(0, insertion).reduce((sum, node) => sum + node.nodeSize, 0);
  transaction.setSelection(NodeSelection.create(transaction.doc, movedPosition));
  return transaction.scrollIntoView();
}
export function moveDocumentBlockBy(state: EditorState, position: number, direction: -1 | 1): Transaction | null {
  if (position < 0 || position > state.doc.content.size) return null;
  const resolved = state.doc.resolve(position), node = resolved.nodeAfter;
  const otherIndex = resolved.index() + direction;
  if (!node || otherIndex < 0 || otherIndex >= resolved.parent.childCount) return null;
  const adjacent = resolved.parent.child(otherIndex);
  const target = direction < 0 ? position - adjacent.nodeSize : position + node.nodeSize;
  return moveDocumentBlock(state, position, target, direction > 0);
}
