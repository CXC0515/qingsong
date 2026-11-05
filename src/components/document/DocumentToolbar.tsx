import { useEffect, useRef, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  List,
  ListOrdered,
  Table2,
  Undo2,
  Redo2,
  ImagePlus,
  Sigma,
  Plus,
  ChevronDown,
  Palette,
  Trash2,
  Heading,
  Minus,
  Quote,
  Sparkles,
} from "lucide-react";
import EditorButton, { createMenuButton } from "./EditorButton";
import DocumentFormatMenu from "./DocumentFormatMenu";
import DocumentTableMenu from "./DocumentTableMenu";
import {
  readDocumentSelection,
  type DocumentAssistantRequest,
} from "./documentSelection";

type Menu = "insert" | "format" | "table" | null;
export default function DocumentToolbar({
  editor,
  menuRequest,
  imageBusy,
  onImage,
  onFormula,
  onAssistant,
  onError,
}: {
  editor: Editor;
  menuRequest: number;
  imageBusy: boolean;
  onImage?: () => void;
  onFormula: () => void;
  onAssistant?: (request: DocumentAssistantRequest) => void;
  onError?: (message: string) => void;
}) {
  const [menu, setMenu] = useState<Menu>(null),
    [filter, setFilter] = useState("");
  const host = useRef<HTMLDivElement>(null),
    lastRequest = useRef(menuRequest);
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      heading: editor.getAttributes("heading").level ?? 0,
      bold: editor.isActive("bold"),
      table: editor.isActive("table"),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  });
  useEffect(() => {
    if (menuRequest !== lastRequest.current) {
      lastRequest.current = menuRequest;
      setFilter("");
      setMenu("insert");
    }
  }, [menuRequest]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) {
        setMenu(null);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
        if (!editor.isDestroyed) editor.commands.focus();
      }
    };
    window.document.addEventListener("pointerdown", close);
    window.document.addEventListener("keydown", escape);
    return () => {
      window.document.removeEventListener("pointerdown", close);
      window.document.removeEventListener("keydown", escape);
    };
  }, [editor]);
  const tableWasActive = useRef(active.table);
  useEffect(() => {
    if (tableWasActive.current && !active.table) setMenu(null);
    tableWasActive.current = active.table;
  }, [active.table]);
  const run = (action: () => void) => {
    setMenu(null);
    setFilter("");
    action();
  };
  const toggle = (next: Menu) => {
    setMenu((value) => (value === next ? null : next));
    setFilter("");
  };
  const button = createMenuButton(run);
  const ask = (instruction: string, scope: "selection" | "table" | "block") =>
    onAssistant?.({
      instruction,
      selection: readDocumentSelection(editor, scope),
    });
  const insertion = [
    {
      label: "表格",
      icon: <Table2 size={18} />,
      action: () => {
        setMenu("table");
      },
    },
    {
      label: "一级标题",
      icon: <Heading size={18} />,
      action: () => editor.chain().focus().setHeading({ level: 1 }).run(),
    },
    {
      label: "二级标题",
      icon: <Heading size={18} />,
      action: () => editor.chain().focus().setHeading({ level: 2 }).run(),
    },
    {
      label: "无序列表",
      icon: <List size={18} />,
      action: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "有序列表",
      icon: <ListOrdered size={18} />,
      action: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "引用",
      icon: <Quote size={18} />,
      action: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "分隔线",
      icon: <Minus size={18} />,
      action: () => editor.chain().focus().setHorizontalRule().run(),
    },
    { label: "公式", icon: <Sigma size={18} />, action: onFormula },
    ...(onImage
      ? [
          {
            label: imageBusy ? "正在上传图片" : "图片",
            icon: <ImagePlus size={18} />,
            action: onImage,
          },
        ]
      : []),
  ].filter((item) => item.label.includes(filter.trim()));
  return (
    <div ref={host} className="qs-editor-controls">
      <div className="qs-editor-toolbar" role="toolbar" aria-label="正文格式">
        <select
          aria-label="段落样式"
          value={active.heading}
          onChange={(event) => {
            const level = Number(event.target.value);
            if (level)
              editor
                .chain()
                .focus()
                .setHeading({ level: level as 1 | 2 | 3 })
                .run();
            else editor.chain().focus().setParagraph().run();
          }}
        >
          <option value="0">正文</option>
          <option value="1">一级标题</option>
          <option value="2">二级标题</option>
          <option value="3">三级标题</option>
        </select>
        <EditorButton
          label="加粗"
          active={active.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={18} />
        </EditorButton>
        <EditorButton
          label="插入内容"
          text
          active={menu === "insert" || menu === "table"}
          onClick={() => toggle("insert")}
        >
          <Plus size={17} />
          <span>插入</span>
        </EditorButton>
        <EditorButton
          label="更多文字格式"
          text
          active={menu === "format"}
          onClick={() => toggle("format")}
        >
          <Palette size={17} />
          <span>格式</span>
          <ChevronDown size={12} />
        </EditorButton>
        <div className="qs-editor-history-actions">
          <EditorButton
            label="撤销输入"
            disabled={!active.canUndo}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 size={18} />
          </EditorButton>
          <EditorButton
            label="重做输入"
            disabled={!active.canRedo}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 size={18} />
          </EditorButton>
        </div>
      </div>
      {active.table && (
        <div
          className="qs-editor-table-bar"
          role="toolbar"
          aria-label="当前表格操作"
        >
          <span>当前表格</span>
          <EditorButton
            label="表格操作"
            text
            active={menu === "table"}
            onClick={() => toggle("table")}
          >
            <Table2 size={17} />
            <span>行列与单元格</span>
            <ChevronDown size={12} />
          </EditorButton>
          <EditorButton
            label="删除表格"
            text
            danger
            onClick={() =>
              run(() => {
                editor.chain().focus().deleteTable().run();
              })
            }
          >
            <Trash2 size={17} />
            <span>删除表格</span>
          </EditorButton>
          {onAssistant && (
            <EditorButton
              label="请 AI 完善当前表格"
              text
              onClick={() =>
                ask(
                  "请核对并完善当前表格的课堂活动设计，保留原有内容中有效的部分，先提出修改建议。",
                  "table",
                )
              }
            >
              <Sparkles size={17} />
              <span>AI 完善表格</span>
            </EditorButton>
          )}
        </div>
      )}
      {menu === "insert" && (
        <div className="qs-editor-popover" role="dialog" aria-label="插入内容">
          <label className="qs-editor-menu-search">
            <span>插入内容</span>
            <input
              aria-label="查找可插入的内容"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="输入名称，如表格、标题"
              autoFocus
            />
          </label>
          <div className="qs-editor-menu-grid">
            {insertion.map((item) =>
              button(
                item.label,
                item.icon,
                () => {
                  item.action();
                  if (item.label === "表格") setMenu("table");
                },
                imageBusy && item.label === "正在上传图片",
              ),
            )}
          </div>
          {onAssistant &&
            button("请 AI 编写或完善当前段落", <Sparkles size={18} />, () =>
              ask(
                "请结合本次备课资料与要求，编写或完善当前段落，先给出修改建议。",
                "block",
              ),
            )}
        </div>
      )}
      {menu === "format" && (
        <DocumentFormatMenu editor={editor} onAction={run} onError={onError} />
      )}
      {menu === "table" && <DocumentTableMenu editor={editor} onAction={run} />}
    </div>
  );
}
