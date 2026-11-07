import { useCallback, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  X,
  Expand,
} from "lucide-react";
import EditorButton from "./EditorButton";
import EditorContextLayer from "./EditorContextLayer";

export default function DocumentImageActions({ editor }: { editor: Editor }) {
  const selected = useEditorState({
    editor,
    selector: ({ editor }) => {
      const selection = editor.state.selection;
      return selection instanceof NodeSelection &&
        selection.node.type.name === "image"
        ? { pos: selection.from, attrs: selection.node.attrs }
        : null;
    },
  });
  const [preview, setPreview] = useState(false);
  const image = useCallback(() => {
    if (!selected || editor.isDestroyed) return null;
    const node = editor.view.nodeDOM(selected.pos);
    return node instanceof HTMLElement ? node.querySelector("img") : null;
  }, [editor, selected]);
  const anchor = useCallback(
    () => image()?.getBoundingClientRect() ?? null,
    [image],
  );
  if (!selected) return null;
  const resize = (fraction: number) => {
    const element = image();
    if (!element) return;
    const container = element.closest("[data-resize-container]")?.parentElement;
    if (!container) return;
    const style = getComputedStyle(container);
    const available =
      container.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    const ratio =
      Number(selected.attrs.width) / Number(selected.attrs.height) ||
      element.naturalWidth / element.naturalHeight ||
      1;
    const width = Math.max(48, Math.round(available * fraction));
    editor
      .chain()
      .focus()
      .updateAttributes("image", {
        width,
        height: Math.max(1, Math.round(width / ratio)),
      })
      .run();
  };
  return (
    <>
      <EditorContextLayer anchor={anchor} label="图片操作">
        {(
          [
            ["left", "图片左对齐", AlignLeft],
            ["center", "图片居中", AlignCenter],
            ["right", "图片右对齐", AlignRight],
          ] as const
        ).map(([align, label, Icon]) => (
          <EditorButton
            key={align}
            label={label}
            active={(selected.attrs.textAlign ?? "left") === align}
            onClick={() =>
              editor
                .chain()
                .focus()
                .updateAttributes("image", { textAlign: align })
                .run()
            }
          >
            <Icon size={18} />
          </EditorButton>
        ))}
        <span className="qs-editor-context-separator" />
        <select
          aria-label="图片尺寸"
          value=""
          onChange={(event) => {
            resize(Number(event.target.value));
            event.target.value = "";
          }}
        >
          <option value="" disabled>
            尺寸
          </option>
          <option value="0.25">四分之一栏宽</option>
          <option value="0.5">一半栏宽</option>
          <option value="0.75">四分之三栏宽</option>
          <option value="1">填满栏宽</option>
        </select>
        <EditorButton label="预览图片" onClick={() => setPreview(true)}>
          <Expand size={18} />
        </EditorButton>
        <EditorButton
          label="删除图片"
          danger
          onClick={() => editor.chain().focus().deleteSelection().run()}
        >
          <Trash2 size={18} />
        </EditorButton>
      </EditorContextLayer>
      {preview && (
        <div
          className="qs-editor-image-preview"
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          onClick={() => setPreview(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setPreview(false);
          }}
        >
          <button
            autoFocus
            type="button"
            aria-label="关闭图片预览"
            onClick={() => setPreview(false)}
          >
            <X />
          </button>
          <img
            src={selected.attrs.src}
            alt={selected.attrs.alt ?? "教案图片"}
          />
        </div>
      )}
    </>
  );
}
