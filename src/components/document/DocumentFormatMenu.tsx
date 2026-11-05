import { useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Palette,
  Link2,
  Unlink,
  Minus,
} from "lucide-react";
import EditorButton, { createMenuButton } from "./EditorButton";
import { isDocumentLinkHref } from "../../domain/documentContract";
export default function DocumentFormatMenu({
  editor,
  onAction,
  onError,
}: {
  editor: Editor;
  onAction: (action: () => void) => void;
  onError?: (message: string) => void;
}) {
  const [link, setLink] = useState<string | null>(null);
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      bullet: editor.isActive("bulletList"),
      ordered: editor.isActive("orderedList"),
      highlight: editor.isActive("highlight"),
      align:
        editor.getAttributes("paragraph").textAlign ??
        editor.getAttributes("heading").textAlign ??
        "left",
      fontFamily: editor.getAttributes("textStyle").fontFamily ?? "",
      fontSize: editor.getAttributes("textStyle").fontSize ?? "",
      color: editor.getAttributes("textStyle").color ?? "#1f2937",
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  });
  const button = createMenuButton(onAction);
  const applyLink = () => {
    const href = link?.trim() ?? "";
    if (href && !isDocumentLinkHref(href)) {
      onError?.("请填写完整的 http:// 或 https:// 网页链接，正文保留。");
      return;
    }
    onAction(() => {
      const chain = editor.chain().focus().extendMarkRange("link");
      if (href) chain.setLink({ href }).run();
      else chain.unsetLink().run();
    });
  };
  return (
    <div className="qs-editor-popover" role="dialog" aria-label="文字格式设置">
      <div className="qs-editor-format-buttons">
        <EditorButton
          label="斜体"
          active={active.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={18} />
        </EditorButton>
        <EditorButton
          label="下划线"
          active={active.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline size={18} />
        </EditorButton>
        <EditorButton
          label="删除线"
          active={active.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={18} />
        </EditorButton>
        <EditorButton
          label="文字高亮"
          active={active.highlight}
          onClick={() =>
            editor.chain().focus().toggleHighlight({ color: "#fff1a8" }).run()
          }
        >
          <Palette size={18} />
        </EditorButton>
        <EditorButton
          label="编辑链接"
          onClick={() => setLink(editor.getAttributes("link").href ?? "")}
        >
          <Link2 size={18} />
        </EditorButton>
        <EditorButton
          label="移除链接"
          disabled={!editor.isActive("link")}
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Unlink size={18} />
        </EditorButton>
      </div>
      <div className="qs-editor-format-fields">
        <label>
          字体
          <select
            aria-label="文字字体"
            value={active.fontFamily}
            onChange={(event) =>
              event.target.value
                ? editor.chain().focus().setFontFamily(event.target.value).run()
                : editor.chain().focus().unsetFontFamily().run()
            }
          >
            <option value="">默认字体</option>
            <option value="Noto Sans CJK SC">中文黑体</option>
            <option value="serif">衬线字体</option>
            <option value="Arial">Arial</option>
          </select>
        </label>
        <label>
          字号
          <select
            aria-label="文字字号"
            value={active.fontSize}
            onChange={(event) =>
              event.target.value
                ? editor.chain().focus().setFontSize(event.target.value).run()
                : editor.chain().focus().unsetFontSize().run()
            }
          >
            <option value="">默认字号</option>
            {["14px", "16px", "18px", "20px", "24px", "28px"].map((size) => (
              <option key={size} value={size}>
                {size.replace("px", "")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="qs-editor-color-palette" aria-label="文字颜色">
        {[
          ["#1f2937", "正文黑"],
          ["#25634b", "松绿"],
          ["#1d4ed8", "蓝色"],
          ["#b42318", "红色"],
          ["#b45309", "棕色"],
          ["#5b6472", "灰色"],
        ].map(([color, name]) => (
          <button
            key={color}
            type="button"
            aria-label={`文字颜色：${name}`}
            title={name}
            aria-pressed={active.color.toLowerCase() === color}
            style={{ color }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().setColor(color).run()}
          >
            <span style={{ backgroundColor: color }} />
          </button>
        ))}
      </div>
      <div className="qs-editor-format-buttons">
        {[
          ["left", "左对齐", <AlignLeft size={18} />],
          ["center", "居中", <AlignCenter size={18} />],
          ["right", "右对齐", <AlignRight size={18} />],
          ["justify", "两端对齐", <AlignJustify size={18} />],
        ].map(([align, label, icon]) => (
          <EditorButton
            key={String(align)}
            label={String(label)}
            active={active.align === align}
            onClick={() =>
              editor.chain().focus().setTextAlign(String(align)).run()
            }
          >
            {icon}
          </EditorButton>
        ))}
        <EditorButton
          label="无序列表"
          active={active.bullet}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={18} />
        </EditorButton>
        <EditorButton
          label="有序列表"
          active={active.ordered}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={18} />
        </EditorButton>
      </div>
      <div className="qs-editor-menu-grid">
        {button(
          "撤销输入",
          <Undo2 size={18} />,
          () => {
            editor.chain().focus().undo().run();
          },
          !active.canUndo,
        )}
        {button(
          "重做输入",
          <Redo2 size={18} />,
          () => {
            editor.chain().focus().redo().run();
          },
          !active.canRedo,
        )}
        {button("清除文字格式", <Minus size={18} />, () => {
          editor.chain().focus().unsetAllMarks().run();
        })}
      </div>
      {link !== null && (
        <div className="qs-editor-link-form">
          <label>
            网页链接
            <input
              aria-label="网页链接地址"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
              }}
            />
          </label>
          <button type="button" onClick={applyLink}>
            应用链接
          </button>
        </div>
      )}
    </div>
  );
}
