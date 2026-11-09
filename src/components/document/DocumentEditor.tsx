import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { RichDocument } from "../../domain/document";
import { createDocumentExtensions } from "./documentExtensions";
import {
  readDocumentSelection,
  type DocumentAssistantRequest,
  type DocumentSelection,
} from "./documentSelection";
import { Columns2, Image, Quote, GripVertical, Heading, List, Plus, Table2, Type } from "lucide-react";
import { useEditorState } from "@tiptap/react";
import DocumentToolbar from "./DocumentToolbar";
import EditorContextLayer from "./EditorContextLayer";
import { documentBlockAt, moveDocumentBlock, moveDocumentBlockBy, selectDocumentBlock } from "./documentBlocks";
import SelectionActions from "./SelectionActions";
import DocumentImageActions from "./DocumentImageActions";
import type { PointerEvent as ReactPointerEvent } from "react";
import "katex/dist/katex.min.css";
export type {
  DocumentSelection,
  DocumentAssistantRequest,
} from "./documentSelection";

export interface DocumentEditorProps {
  content: RichDocument;
  documentKey: string;
  readOnly?: boolean;
  onChange?: (content: RichDocument) => void;
  onSelection?: (selection: DocumentSelection) => void;
  onRequestAssistant?: (request: DocumentAssistantRequest) => void;
  onImageUpload?: (file: File) => Promise<{
    assetId: string;
    src: string;
    alt: string;
    width: number;
    height: number;
  }>;
  onError?: (message: string) => void;
}
export default function DocumentEditor({
  content,
  documentKey,
  readOnly = false,
  onChange,
  onSelection,
  onImageUpload,
  onError,
  onRequestAssistant,
}: DocumentEditorProps) {
  const callbacks = useRef({ onChange, onSelection });
  callbacks.current = { onChange, onSelection };
  const [formula, setFormula] = useState<string | null>(null),
    [imageBusy, setImageBusy] = useState(false),
    [menuRequest, setMenuRequest] = useState(0),
    [formatRequest,setFormatRequest]=useState(0);
  const host = useRef<HTMLDivElement>(null);
  const [linePosition, setLinePosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [hoverBlock, setHoverBlock] = useState<{
    position: number;
    insertPosition: number;
    nodeSize:number;
    nodeType:string;
    empty:boolean;
    top: number;
    left: number;
    anchor: DOMRect;
  } | null>(null);
  const [contextAnchor, setContextAnchor] = useState<DOMRect | null>(null);
  const [contextInsert, setContextInsert] = useState(false);
  const dragSource = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{position:number;after:boolean;top:number;left:number;width:number}|null>(null);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const equationPosition = useRef<number | null>(null),
    imageInput = useRef<HTMLInputElement>(null);
  const extensions = useMemo(
    () =>
      createDocumentExtensions((latex, position) => {
        if (!readOnlyRef.current) {
          equationPosition.current = position;
          setFormula(latex);
        }
      }),
    [],
  );
  const editor = useEditor(
    {
      extensions,
      content,
      editable: !readOnly,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "qs-document-content",
          "aria-label": readOnly ? "教案版本正文" : "教案正文编辑区",
        },
        handleKeyDown: (view, event) => {
          if (
            readOnlyRef.current ||
            event.key !== "/" ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            event.isComposing
          )
            return false;
          const { selection } = view.state;
          if (
            !selection.empty ||
            selection.$from.parent.type.name === "codeBlock"
          )
            return false;
          const before = selection.$from.parent.textBetween(
            0,
            selection.$from.parentOffset,
          );
          if (before && !/\s$/.test(before)) return false;
          event.preventDefault();
          setContextAnchor(null);
          setContextInsert(true);
          setMenuRequest((value) => value + 1);
          return true;
        },
      },
      onUpdate: ({ editor }) =>
        callbacks.current.onChange?.(editor.getJSON() as RichDocument),
      onSelectionUpdate: ({ editor }) =>
        callbacks.current.onSelection?.(readDocumentSelection(editor)),
    },
    [documentKey],
  );
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!readOnly);
    if (readOnly) {setFormula(null);setHoverBlock(null);setDropTarget(null);}
  }, [editor, readOnly]);
  useEffect(() => {
    if (
      !editor ||
      editor.isDestroyed ||
      JSON.stringify(editor.getJSON()) === JSON.stringify(content)
    )
      return;
    editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, content]);
  const blankLine = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null;
      const { selection } = editor.state;
      return selection.empty &&
        selection.$from.parent.type.name === "paragraph" &&
        selection.$from.parent.content.size === 0
        ? selection.from
        : null;
    },
  });
  useEffect(() => {
    if (!editor || readOnly || blankLine === null) {
      setLinePosition(null);
      return;
    }
    const update = () => {
      if (editor.isDestroyed || !host.current) return;
      const coords = editor.view.coordsAtPos(blankLine);
      const box = host.current.getBoundingClientRect();
      setLinePosition({
        top: coords.top - box.top + (coords.bottom - coords.top - 28) / 2,
        left: Math.max(0, coords.left - box.left - 34),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host.current!);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [editor, readOnly, blankLine, content]);
  const insertAnchor = useCallback(() => {
    if (!editor || editor.isDestroyed) return null;
    if (contextAnchor) return contextAnchor;
    const coords = editor.view.coordsAtPos(editor.state.selection.from);
    return new DOMRect(
      coords.left - 34,
      coords.top,
      28,
      coords.bottom - coords.top,
    );
  }, [editor, contextAnchor]);
  const trackHoveredBlock = (event: Pick<ReactPointerEvent<HTMLDivElement>,"target"|"clientX"|"clientY">) => {
    if (
      !editor ||
      readOnly ||
      (event.target instanceof Element &&
      event.target.closest(".qs-editor-line-insert, .qs-editor-block-control"))
    )
      return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const content = target.closest(".qs-document-content");
    if (!content) return;
    const coordinates = editor.view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });
    if (!coordinates) return;
    const block = documentBlockAt(editor.state.doc, coordinates.pos);
    if (!block) {setHoverBlock(null);return;}
    const {position:start,node:blockNode}=block;
    const insertPosition=start+blockNode.nodeSize;
    const dom = editor.view.nodeDOM(start);
    if (!(dom instanceof HTMLElement)) return;
    const box = dom.getBoundingClientRect();
    const hostBox = host.current?.getBoundingClientRect();
    if (!hostBox) return;
    setHoverBlock({
            position: start,
            insertPosition,
            nodeSize:blockNode!.nodeSize,
            nodeType:blockNode!.type.name,
            empty:blockNode!.type.name==="paragraph"&&blockNode!.content.size===0,
            top: Math.max(0, box.top - hostBox.top - (window.matchMedia("(max-width:700px)").matches?52:38)),
            left: Math.max(0, box.left - hostBox.left),
            anchor: new DOMRect(
              box.left - 34,
              box.top + (box.height - 28) / 2,
              28,
              28,
            ),
          });
  };
  useEffect(()=>{
    if(!editor||readOnly)return;
    const update=()=>{
      const coords=editor.view.coordsAtPos(editor.state.selection.from);
      trackHoveredBlock({target:editor.view.dom,clientX:coords.left,clientY:coords.top+2});
    };
    editor.on("selectionUpdate",update);editor.on("update",update);
    window.addEventListener("resize",update);
    return()=>{editor.off("selectionUpdate",update);editor.off("update",update);window.removeEventListener("resize",update);};
  },[editor,readOnly]);
  const insertFormula = () => {
    if (!editor || readOnlyRef.current || !formula?.trim()) return;
    if (equationPosition.current !== null) {
      const node = editor.state.doc.nodeAt(equationPosition.current);
      if (node && ["inlineMath", "blockMath"].includes(node.type.name))
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(equationPosition.current, undefined, {
            ...node.attrs,
            latex: formula.trim(),
            omml: null,
          }),
        );
    } else
      editor
        .chain()
        .focus()
        .insertContent({ type: "inlineMath", attrs: { latex: formula.trim() } })
        .run();
    setFormula(null);
  };
  const selectBlock=()=>{
    if(!editor||!hoverBlock||readOnlyRef.current)return;
    const transaction=selectDocumentBlock(editor.state,hoverBlock.position);
    if(transaction)editor.view.dispatch(transaction);
  };
  const moveBlock=(direction:-1|1)=>{
    if(!editor||!hoverBlock||readOnlyRef.current)return;
    const transaction=moveDocumentBlockBy(editor.state,hoverBlock.position,direction);
    if(transaction){editor.view.dispatch(transaction);setHoverBlock(null);}
  };
  const dragOver=(event:React.DragEvent<HTMLDivElement>)=>{
    if(!editor||readOnlyRef.current||dragSource.current===null)return;
    const coordinates=editor.view.posAtCoords({left:event.clientX,top:event.clientY});
    const block=coordinates&&documentBlockAt(editor.state.doc,coordinates.pos);
    const dom=block&&editor.view.nodeDOM(block.position);
    if(!block||!(dom instanceof HTMLElement)||!host.current){setDropTarget(null);return;}
    const box=dom.getBoundingClientRect(),hostBox=host.current.getBoundingClientRect();
    const after=event.clientY>box.top+box.height/2;
    if(!moveDocumentBlock(editor.state,dragSource.current,block.position,after)){setDropTarget(null);return;}
    event.preventDefault();event.dataTransfer.dropEffect="move";
    setDropTarget({position:block.position,after,top:(after?box.bottom:box.top)-hostBox.top,left:box.left-hostBox.left,width:box.width});
  };
  const drop=(event:React.DragEvent<HTMLDivElement>)=>{
    if(dragSource.current===null)return;
    event.preventDefault();event.stopPropagation();
    if(editor&&!readOnlyRef.current&&dropTarget){
      const transaction=moveDocumentBlock(editor.state,dragSource.current,dropTarget.position,dropTarget.after);
      if(transaction)editor.view.dispatch(transaction);
    }
    dragSource.current=null;setDropTarget(null);setHoverBlock(null);
  };
  const uploadImage = async (file?: File) => {
    if (!file || !onImageUpload || !editor || readOnlyRef.current) return;
    setImageBusy(true);
    try {
      const attrs = await onImageUpload(file);
      if (!editor.isDestroyed && !readOnlyRef.current)
        editor.chain().focus().insertContent({ type: "image", attrs }).run();
    } catch (error) {
      onError?.(
        error instanceof Error ? error.message : "图片未能插入，已有内容保留。",
      );
    } finally {
      setImageBusy(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  };
  return (
    <div
      ref={host}
      className={`qs-document-editor ${readOnly ? "is-readonly" : ""}`}
      onPointerMove={trackHoveredBlock}
      onPointerDown={trackHoveredBlock}
      onDragOverCapture={dragOver}
      onDropCapture={drop}
      onMouseLeave={event => {if(dragSource.current===null&&!(event.relatedTarget instanceof Element&&event.relatedTarget.closest('[data-editor-context-layer]')))setHoverBlock(null);}}
      onScrollCapture={() => setHoverBlock(null)}
    >
      {!readOnly && editor && !editor.isDestroyed && (
        <>
          <DocumentToolbar
            editor={editor}
            menuRequest={menuRequest}
            formatRequest={formatRequest}
            insertAnchor={contextInsert ? insertAnchor : undefined}
            onToolbarInsert={() => {
              setContextInsert(false);
              setContextAnchor(null);
            }}
            imageBusy={imageBusy}
            onImage={
              onImageUpload ? () => imageInput.current?.click() : undefined
            }
            onFormula={() => {
              equationPosition.current = null;
              setFormula("");
            }}
            onAssistant={onRequestAssistant}
            onError={onError}
          />
          <SelectionActions editor={editor} onAssistant={onRequestAssistant} />
          <DocumentImageActions editor={editor} />
        </>
      )}
      <input
        ref={imageInput}
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label="选择插入的图片"
        onChange={(event) => void uploadImage(event.target.files?.[0])}
      />
      {formula !== null && !readOnly && (
        <div className="qs-equation-input">
          <label>
            公式
            <input
              value={formula}
              onChange={(event) => setFormula(event.target.value)}
              placeholder="例如 x^2 + y^2 = 1"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  insertFormula();
                }
                if (event.key === "Escape") setFormula(null);
              }}
              autoFocus
            />
          </label>
          <button
            type="button"
            onClick={insertFormula}
            disabled={!formula.trim()}
          >
            应用公式
          </button>
          <button type="button" onClick={() => setFormula(null)}>
            取消
          </button>
        </div>
      )}
      {(hoverBlock || linePosition) !== null && !readOnly && (hoverBlock ? (
        <EditorContextLayer label="内容块操作" anchor={()=>{const dom=editor?.view.nodeDOM(hoverBlock.position);return dom instanceof HTMLElement?dom.getBoundingClientRect():null;}}>
        <div className="qs-editor-block-control" style={{position:"static"}}>
          {hoverBlock.empty ? <button type="button" className="qs-editor-line-insert" aria-label="在空行插入内容" onMouseDown={event=>event.preventDefault()} onClick={event=>{selectBlock();setContextAnchor((event.currentTarget as HTMLButtonElement).getBoundingClientRect());setContextInsert(true);setMenuRequest(value=>value+1);}}><Plus size={16}/></button> : <>
            <button type="button" className="qs-editor-block-type" aria-label="设置内容格式" onMouseDown={event=>event.preventDefault()} onClick={event=>{selectBlock();setContextInsert(true);setContextAnchor((event.currentTarget as HTMLButtonElement).getBoundingClientRect());setFormatRequest(value=>value+1);}}>{hoverBlock.nodeType==="heading"?<Heading size={16}/>:hoverBlock.nodeType.includes("List")?<List size={16}/>:hoverBlock.nodeType==="table"?<Table2 size={16}/>:hoverBlock.nodeType==="image"?<Image size={16}/>:hoverBlock.nodeType==="blockquote"?<Quote size={16}/>:hoverBlock.nodeType==="columns"?<Columns2 size={16}/>:<Type size={16}/>}</button>
            <button type="button" className="qs-editor-block-grip" aria-label="移动内容块" draggable onDragEnd={()=>{dragSource.current=null;setDropTarget(null);setHoverBlock(null);}} onDragStart={event=>{dragSource.current=hoverBlock.position;event.dataTransfer.setData("application/x-qingsong-block",String(hoverBlock.position));event.dataTransfer.effectAllowed="move";}}><GripVertical size={16}/></button>
            <button type="button" className="qs-editor-block-move" aria-label="上移内容块" title="上移" onMouseDown={event=>event.preventDefault()} onClick={()=>moveBlock(-1)}>↑</button><button type="button" className="qs-editor-block-move" aria-label="下移内容块" title="下移" onMouseDown={event=>event.preventDefault()} onClick={()=>moveBlock(1)}>↓</button>
          </>}
        </div></EditorContextLayer>
      ) : <button type="button" className="qs-editor-line-insert" style={linePosition!} aria-label="在空行插入内容" onMouseDown={event=>event.preventDefault()} onClick={event=>{selectBlock();setContextAnchor((event.currentTarget as HTMLButtonElement).getBoundingClientRect());setContextInsert(true);setMenuRequest(value=>value+1);}}><Plus size={16}/></button>)}
      {dropTarget&&!readOnly&&<div className="qs-editor-drop-line" style={{top:dropTarget.top,left:dropTarget.left,width:dropTarget.width}} aria-hidden="true"/>}
      <EditorContent editor={editor} />
    </div>
  );
}
