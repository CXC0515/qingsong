import { Node, type Editor } from '@tiptap/core';

export const DocumentColumns = Node.create({
  name: 'columns', group: 'block', content: 'column{2,3}', isolating: true,
  parseHTML: () => [{tag: 'div[data-document-columns]'}],
  renderHTML: ({HTMLAttributes}) => ['div', {...HTMLAttributes, 'data-document-columns': ''}, 0],
});
export const DocumentColumn = Node.create({
  name: 'column', content: 'block+', isolating: true,
  parseHTML: () => [{tag: 'div[data-document-column]'}],
  renderHTML: ({HTMLAttributes}) => ['div', {...HTMLAttributes, 'data-document-column': ''}, 0],
});
export function insertDocumentColumns(editor: Editor, count: 2 | 3) {
  // A nested layout is harder to read and has no reliable narrow-screen composition.
  if (editor.isActive('columns')) return false;
  return editor.chain().focus().insertContent({type:'columns', content:
    Array.from({length:count}, () => ({type:'column', content:[{type:'paragraph'}]})),
  }).run();
}
export function removeDocumentColumns(editor: Editor) {
  const {$from} = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name !== 'columns') continue;
    const blocks = [];
    for (let c=0; c<node.childCount; c++) {
      const column = node.child(c);
      for (let i=0; i<column.childCount; i++) blocks.push(column.child(i));
    }
    editor.view.dispatch(editor.state.tr.replaceWith($from.before(depth), $from.after(depth), blocks));
    editor.commands.focus();
    return true;
  }
  return false;
}
