import { useEffect, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { Bold, Italic, Sparkles } from "lucide-react";
import EditorButton from "./EditorButton";
import {
  readDocumentSelection,
  type DocumentAssistantRequest,
} from "./documentSelection";

export default function SelectionActions({
  editor,
  onAssistant,
}: {
  editor: Editor;
  onAssistant?: (request: DocumentAssistantRequest) => void;
}) {
  const selection = useEditorState({
    editor,
    selector: ({ editor }) => ({
      from: editor.state.selection.from,
      to: editor.state.selection.to,
      focused: editor.isFocused,
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
    }),
  });
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    const locate = () => {
      if (
        editor.isDestroyed ||
        selection.from === selection.to ||
        !selection.focused
      ) {
        setPosition(null);
        return;
      }
      try {
        const a = editor.view.coordsAtPos(selection.from),
          b = editor.view.coordsAtPos(selection.to);
        const top = Math.min(a.top, b.top) - 52;
        // The fixed toolbar stays inside the viewport; outside selections do not leave a floating orphan.
        if (
          Math.max(a.bottom, b.bottom) < 56 ||
          Math.min(a.top, b.top) > window.innerHeight
        ) {
          setPosition(null);
          return;
        }
        setPosition({
          left: Math.max(
            10,
            Math.min((a.left + b.left) / 2 - 146, window.innerWidth - 302),
          ),
          top: Math.max(58, top),
        });
      } catch {
        setPosition(null);
      }
    };
    locate();
    window.addEventListener("scroll", locate, true);
    window.addEventListener("resize", locate);
    return () => {
      window.removeEventListener("scroll", locate, true);
      window.removeEventListener("resize", locate);
    };
  }, [editor, selection.from, selection.to, selection.focused]);
  if (!position) return null;
  const ask = () =>
    onAssistant?.({
      instruction:
        "请修改引用内容。\n修改建议如下：\n",
      selection: readDocumentSelection(editor),
    });
  return (
    <div
      className="qs-editor-selection-actions"
      role="toolbar"
      aria-label="选中内容快捷操作"
      style={position}
    >
      <EditorButton
        label="选中文字加粗"
        active={selection.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={17} />
      </EditorButton>
      <EditorButton
        label="选中文字斜体"
        active={selection.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={17} />
      </EditorButton>
      {onAssistant && (
        <EditorButton label="请 AI 改写选中内容" text onClick={ask}>
          <Sparkles size={17} />
          <span>AI 改写选中内容</span>
        </EditorButton>
      )}
    </div>
  );
}
