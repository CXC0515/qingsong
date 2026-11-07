import { useCallback } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Sparkles,
  Columns2,
  Columns3,
} from "lucide-react";
import EditorButton from "./EditorButton";
import EditorContextLayer from "./EditorContextLayer";
import { insertDocumentColumns } from "./documentColumns";
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
  const selected = useEditorState({
    editor,
    selector: ({ editor }) => ({
      text:
        editor.state.selection instanceof TextSelection &&
        !editor.state.selection.empty &&
        /\S/u.test(
          editor.state.doc.textBetween(
            editor.state.selection.from,
            editor.state.selection.to,
          ),
        ),
      from: editor.state.selection.from,
      to: editor.state.selection.to,
      focused: editor.isFocused,
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      canColumns:
        !editor.isActive("columns") &&
        editor.state.selection.$from.blockRange(editor.state.selection.$to)
          ?.depth === 0,
    }),
  });
  const anchor = useCallback(() => {
    if (editor.isDestroyed) return null;
    const { from, to } = editor.state.selection;
    const a = editor.view.coordsAtPos(from),
      b = editor.view.coordsAtPos(to);
    return new DOMRect(
      Math.min(a.left, b.left),
      Math.min(a.top, b.top),
      Math.abs(b.right - a.left),
      Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top),
    );
  }, [editor, selected.from, selected.to]);
  if (!selected.text || !selected.focused) return null;
  return (
    <EditorContextLayer anchor={anchor} label="选中文字操作">
      <EditorButton
        label="选中文字加粗"
        active={selected.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={17} />
      </EditorButton>
      <EditorButton
        label="选中文字斜体"
        active={selected.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={17} />
      </EditorButton>
      <EditorButton
        label="选中文字下划线"
        active={selected.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline size={17} />
      </EditorButton>
      <EditorButton
        label="选中文字删除线"
        active={selected.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={17} />
      </EditorButton>
      {selected.canColumns && (
        <>
          <EditorButton
            label="选中段落分为双栏"
            onClick={() => insertDocumentColumns(editor, 2)}
          >
            <Columns2 size={17} />
          </EditorButton>
          <EditorButton
            label="选中段落分为三栏"
            onClick={() => insertDocumentColumns(editor, 3)}
          >
            <Columns3 size={17} />
          </EditorButton>
        </>
      )}
      {onAssistant && (
        <EditorButton
          label="请 AI 改写选中内容"
          onClick={() =>
            onAssistant({
              instruction: "请修改引用内容。\n修改建议如下：\n",
              selection: readDocumentSelection(editor),
            })
          }
        >
          <Sparkles size={17} />
        </EditorButton>
      )}
    </EditorContextLayer>
  );
}
