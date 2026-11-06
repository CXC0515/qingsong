import type { Editor } from "@tiptap/react";
import { TableMap } from "@tiptap/pm/tables";
export interface DocumentSelection {
  blockIds: string[];
  text: string;
  location?: { from: number; to: number; blocks: { id: string; from: number; to: number }[]; table?: { id: string; row: number; column: number } };
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
  const blocks: {id:string;from:number;to:number}[]=[];
  let table: {id:string;row:number;column:number}|undefined;
  for(let depth=$from.depth;depth>0;depth--) {
    if($from.node(depth).type.name==="table") {
      const cell=TableMap.get($from.node(depth)).findCell($from.before(depth+2)-$from.start(depth));
      table={id:String($from.node(depth).attrs.id??""),row:cell.top+1,column:cell.left+1};break;
    }
  }
  editor.state.doc.nodesBetween(from,to,(node,pos)=>{
    if(node.attrs.id && node.isTextblock) {
      const start=Math.max(0,Math.min(node.content.size,from-pos-1));
      const end=Math.max(start,Math.min(node.content.size,to-pos-1));
      blocks.push({id:String(node.attrs.id),from:node.textBetween(0,start).length,to:node.textBetween(0,end).length});
    }
  });
  const location={from,to,blocks,...(table?{table}:{})};
  if (scope === "table" || (scope === "block" && editor.isActive("table"))) {
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === "table")
        return {
          location,
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
    ...(ids.length?{location}:{}),
    blockIds: [...new Set(ids)],
    text:
      from === to
        ? scope === "block"
          ? $from.parent.textContent.slice(0, 12000)
          : ""
        : editor.state.doc.textBetween(from, to, "\n").slice(0, 12000),
  };
}
