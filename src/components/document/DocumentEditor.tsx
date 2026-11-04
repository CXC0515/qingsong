import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Mathematics from "@tiptap/extension-mathematics";
import { Plugin } from "@tiptap/pm/state";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Table2,
  Undo2,
  Redo2,
  ImagePlus,
  Sigma,
} from "lucide-react";
import type { RichDocument } from "../../domain/document";
import "katex/dist/katex.min.css";

export interface DocumentSelection {
  blockIds: string[];
  text: string;
}
const blockTypes = [
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "codeBlock",
  "image",
  "inlineMath",
  "blockMath",
];
const StableIdentity = Extension.create({
  name: "qingsongDocumentIdentity",
  addGlobalAttributes() {
    return [
      {
        types: blockTypes,
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: (attrs) =>
              attrs.id ? { "data-block-id": attrs.id } : {},
          },
        },
      },
      {
        types: ["paragraph", "heading"],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) => element.style.textAlign || null,
            renderHTML: (attrs) =>
              attrs.textAlign
                ? { style: `text-align: ${attrs.textAlign}` }
                : {},
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((transaction) => transaction.docChanged))
            return null;
          const transaction = state.tr,
            ids = new Set<string>();
          state.doc.descendants((node, pos) => {
            if (!blockTypes.includes(node.type.name)) return;
            const id = node.attrs.id;
            if (!id || ids.has(id)) {
              const next = crypto.randomUUID();
              transaction.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                id: next,
              });
              ids.add(next);
            } else ids.add(id);
          });
          return transaction.docChanged ? transaction : null;
        },
      }),
    ];
  },
});
const OwnedImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), assetId: { default: null } };
  },
});
const EquationSource = Extension.create({
  name: "qingsongEquationSource",
  addGlobalAttributes: () => [
    {
      types: ["inlineMath", "blockMath"],
      attributes: { omml: { default: null, rendered: false } },
    },
  ],
});
function readSelection(editor: Editor): DocumentSelection {
  const { from, to } = editor.state.selection,
    ids: string[] = [];
  if (from !== to)
    editor.state.doc.nodesBetween(from, to, (node) => {
      if (node.attrs.id) ids.push(String(node.attrs.id));
    });
  return {
    blockIds: [...new Set(ids)],
    text:
      from === to
        ? ""
        : editor.state.doc.textBetween(from, to, "\n").slice(0, 12000),
  };
}
export interface DocumentEditorProps {
  content: RichDocument;
  documentKey: string;
  readOnly?: boolean;
  onChange?: (content: RichDocument) => void;
  onSelection?: (selection: DocumentSelection) => void;
  onImageUpload?: (
    file: File,
  ) => Promise<{
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
}: DocumentEditorProps) {
  const callbacks = useRef({ onChange, onSelection });
  callbacks.current = { onChange, onSelection };
  const [formula, setFormula] = useState<string | null>(null),
    [imageBusy, setImageBusy] = useState(false);
  const equationPosition = useRef<number | null>(null),
    imageInput = useRef<HTMLInputElement>(null);
  const extensions = useMemo(
    () => [
      StarterKit.configure({ link: { openOnClick: false, autolink: false } }),
      TableKit.configure({ table: { resizable: true } }),
      OwnedImage,
      Mathematics.configure({
        inlineOptions: {
          onClick: (node, pos) => {
            if (readOnly) return;
            equationPosition.current = pos;
            setFormula(node.attrs.latex);
          },
        },
        blockOptions: {
          onClick: (node, pos) => {
            if (readOnly) return;
            equationPosition.current = pos;
            setFormula(node.attrs.latex);
          },
        },
      }),
      StableIdentity,
      EquationSource,
    ],
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
      },
      onUpdate: ({ editor }) =>
        callbacks.current.onChange?.(editor.getJSON() as RichDocument),
      onSelectionUpdate: ({ editor }) =>
        callbacks.current.onSelection?.(readSelection(editor)),
    },
    [documentKey, readOnly],
  );
  const active = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor && !editor.isDestroyed
        ? {
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            bullet: editor.isActive("bulletList"),
            ordered: editor.isActive("orderedList"),
            heading: editor.getAttributes("heading").level ?? 0,
          }
        : null,
  });
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
  const tool = (
    label: string,
    action: () => void,
    icon: ReactNode,
    selected = false,
    disabled = false,
  ) => (
    <button
      type="button"
      className="qs-editor-tool"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      disabled={!editor || disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={action}
    >
      {icon}
    </button>
  );
  return (
    <div className={`qs-document-editor ${readOnly ? "is-readonly" : ""}`}>
      {!readOnly && (
        <div className="qs-editor-toolbar" role="toolbar" aria-label="正文格式">
          <select
            aria-label="段落样式"
            value={active?.heading ?? 0}
            onChange={(event) => {
              const level = Number(event.target.value);
              if (level)
                editor
                  ?.chain()
                  .focus()
                  .setHeading({ level: level as 1 | 2 | 3 })
                  .run();
              else editor?.chain().focus().setParagraph().run();
            }}
          >
            <option value="0">正文</option>
            <option value="1">一级标题</option>
            <option value="2">二级标题</option>
            <option value="3">三级标题</option>
          </select>
          {tool(
            "加粗",
            () => {
              editor?.chain().focus().toggleBold().run();
            },
            <Bold size={17} />,
            active?.bold,
          )}
          {tool(
            "斜体",
            () => {
              editor?.chain().focus().toggleItalic().run();
            },
            <Italic size={17} />,
            active?.italic,
          )}
          {tool(
            "无序列表",
            () => {
              editor?.chain().focus().toggleBulletList().run();
            },
            <List size={17} />,
            active?.bullet,
          )}
          {tool(
            "有序列表",
            () => {
              editor?.chain().focus().toggleOrderedList().run();
            },
            <ListOrdered size={17} />,
            active?.ordered,
          )}
          {tool(
            "插入表格",
            () => {
              editor
                ?.chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run();
            },
            <Table2 size={17} />,
          )}
          {onImageUpload &&
            tool(
              imageBusy ? "正在上传图片" : "插入图片",
              () => imageInput.current?.click(),
              <ImagePlus size={17} />,
              false,
              imageBusy,
            )}
          {tool(
            "插入公式",
            () => {
              equationPosition.current = null;
              setFormula("");
            },
            <Sigma size={17} />,
          )}
          {tool(
            "撤销输入",
            () => {
              editor?.chain().focus().undo().run();
            },
            <Undo2 size={17} />,
          )}
          {tool(
            "重做输入",
            () => {
              editor?.chain().focus().redo().run();
            },
            <Redo2 size={17} />,
          )}
          <input
            ref={imageInput}
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => void uploadImage(event.target.files?.[0])}
          />
        </div>
      )}
      {formula !== null && (
        <div className="qs-equation-input">
          <label>
            公式{" "}
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
