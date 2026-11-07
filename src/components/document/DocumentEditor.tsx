import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { RichDocument } from "../../domain/document";
import { createDocumentExtensions } from "./documentExtensions";
import {
  readDocumentSelection,
  type DocumentAssistantRequest,
  type DocumentSelection,
} from "./documentSelection";
import { Plus } from "lucide-react";
import { useEditorState } from "@tiptap/react";
import DocumentToolbar from "./DocumentToolbar";
import SelectionActions from "./SelectionActions";
import DocumentImageActions from "./DocumentImageActions";
import type { MouseEvent as ReactMouseEvent } from "react";
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
    [menuRequest, setMenuRequest] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const [linePosition, setLinePosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [hoverBlock, setHoverBlock] = useState<{
    position: number;
    insertPosition: number;
    top: number;
    left: number;
    anchor: DOMRect;
  } | null>(null);
  const [contextAnchor, setContextAnchor] = useState<DOMRect | null>(null);
  const [contextInsert, setContextInsert] = useState(false);
  const equationPosition = useRef<number | null>(null),
    imageInput = useRef<HTMLInputElement>(null);
  const extensions = useMemo(
    () =>
      createDocumentExtensions((latex, position) => {
        if (!readOnly) {
          equationPosition.current = position;
          setFormula(latex);
        }
      }),
    [readOnly],
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
            readOnly ||
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
    [documentKey, readOnly],
  );
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
  const trackHoveredBlock = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (
      !editor ||
      readOnly ||
      (event.target instanceof Element &&
        event.target.closest(".qs-editor-line-insert"))
    )
      return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const content = target.closest(".qs-document-content");
    if (!content) return;
    if (target.closest("table, tr, td, th")) {
      setHoverBlock(null);
      return;
    }
    const coordinates = editor.view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });
    if (!coordinates) return;
    const $position = editor.state.doc.resolve(coordinates.pos);
    let start = -1;
    let insertPosition = -1;
    for (let depth = $position.depth; depth > 0; depth--) {
      const node = $position.node(depth);
      if (node.isTextblock) {
        start = $position.before(depth);
        insertPosition = $position.after(depth);
        break;
      }
    }
    let blockNode = start >= 0 ? editor.state.doc.nodeAt(start) : null;
    if (!blockNode && $position.nodeAfter?.type.name === "image") {
      start = coordinates.pos;
      blockNode = $position.nodeAfter;
      insertPosition = start + blockNode.nodeSize;
    } else if (!blockNode && $position.nodeBefore?.type.name === "image") {
      blockNode = $position.nodeBefore;
      start = coordinates.pos - blockNode.nodeSize;
      insertPosition = coordinates.pos;
    }
    if (
      !blockNode ||
      start < 0 ||
      insertPosition < 0 ||
      (blockNode.type.name === "paragraph" && blockNode.content.size === 0)
    ) {
      setHoverBlock(null);
      return;
    }
    const dom = editor.view.nodeDOM(start);
    if (!(dom instanceof HTMLElement)) return;
    const box = dom.getBoundingClientRect();
    const hostBox = host.current?.getBoundingClientRect();
    if (!hostBox) return;
    setHoverBlock((current) =>
      current?.position === start
        ? current
        : {
            position: start,
            insertPosition,
            top: box.top - hostBox.top + (box.height - 28) / 2,
            left: Math.max(0, box.left - hostBox.left - 34),
            anchor: new DOMRect(
              box.left - 34,
              box.top + (box.height - 28) / 2,
              28,
              28,
            ),
          },
    );
  };
  const insertFormula = () => {
    if (!editor || !formula?.trim()) return;
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
  const uploadImage = async (file?: File) => {
    if (!file || !onImageUpload || !editor) return;
    setImageBusy(true);
    try {
      const attrs = await onImageUpload(file);
      if (!editor.isDestroyed)
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
      onMouseMove={trackHoveredBlock}
      onMouseLeave={() => setHoverBlock(null)}
      onScrollCapture={() => setHoverBlock(null)}
    >
      {!readOnly && editor && !editor.isDestroyed && (
        <>
          <DocumentToolbar
            editor={editor}
            menuRequest={menuRequest}
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
      {formula !== null && (
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
      {(hoverBlock || linePosition) !== null && !readOnly && (
        <button
          type="button"
          className="qs-editor-line-insert"
          style={
            hoverBlock
              ? { top: hoverBlock.top, left: hoverBlock.left }
              : linePosition!
          }
          aria-label={hoverBlock ? "在此段落后插入内容" : "在空行插入内容"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            if (hoverBlock && editor) {
              editor
                .chain()
                .insertContentAt(hoverBlock.insertPosition, {
                  type: "paragraph",
                })
                .setTextSelection(hoverBlock.insertPosition + 1)
                .focus()
                .run();
              setContextAnchor(hoverBlock.anchor);
            } else {
              setContextAnchor(
                (
                  event.currentTarget as HTMLButtonElement
                ).getBoundingClientRect(),
              );
            }
            setContextInsert(true);
            setMenuRequest((value) => value + 1);
          }}
        >
          <Plus size={16} />
        </button>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
