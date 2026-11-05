import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { RichDocument } from "../../domain/document";
import { createDocumentExtensions } from "./documentExtensions";
import {
  readDocumentSelection,
  type DocumentAssistantRequest,
  type DocumentSelection,
} from "./documentSelection";
import DocumentToolbar from "./DocumentToolbar";
import SelectionActions from "./SelectionActions";
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
    <div className={`qs-document-editor ${readOnly ? "is-readonly" : ""}`}>
      {!readOnly && editor && !editor.isDestroyed && (
        <>
          <DocumentToolbar
            editor={editor}
            menuRequest={menuRequest}
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
      <EditorContent editor={editor} />
    </div>
  );
}
