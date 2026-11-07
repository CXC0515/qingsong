import { DocumentColumns, DocumentColumn } from "./documentColumns";
import { Extension, ResizableNodeView, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Mathematics from "@tiptap/extension-mathematics";
import {
  TextStyle,
  Color,
  FontFamily,
  FontSize,
} from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { Plugin } from "@tiptap/pm/state";
import {
  documentStableNodeTypes,
  isDocumentLinkHref,
} from "../../domain/documentContract";

/** Stable identity is shared by manual edits, AI proposals, history and conversions. */
const StableIdentity = Extension.create({
  name: "qingsongDocumentIdentity",
  addGlobalAttributes() {
    return [
      {
        types: [...documentStableNodeTypes],
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: (attrs) =>
              attrs.id ? { "data-block-id": attrs.id } : {},
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((transaction) => transaction.docChanged))
            return null;
          const transaction = state.tr,
            ids = new Set<string>();
          state.doc.descendants((node, pos) => {
            if (
              !(documentStableNodeTypes as readonly string[]).includes(
                node.type.name,
              )
            )
              return;
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
    return {
      ...this.parent?.(),
      assetId: { default: null },
      textAlign: { default: null },
    };
  },
  addNodeView() {
    const parent = this.parent?.();
    if (!parent) return null;
    return (props) => {
      const view = parent(props) as ResizableNodeView;
      const element = view.dom.querySelector("img")!;
      const originalUpdate = view.update.bind(view),
        originalDestroy = view.destroy.bind(view);
      const apply = () => {
        const attrs = view.node.attrs;
        element.style.width = attrs.width ? `${attrs.width}px` : "";
        element.style.height = "auto";
        view.dom.style.justifyContent =
          attrs.textAlign === "center"
            ? "center"
            : attrs.textAlign === "right"
              ? "flex-end"
              : "flex-start";
      };
      const limit = () => {
        const container = view.dom.parentElement;
        if (!container) return;
        const style = getComputedStyle(container);
        view.maxSize = {
          width: Math.max(
            48,
            container.clientWidth -
              parseFloat(style.paddingLeft) -
              parseFloat(style.paddingRight),
          ),
        };
      };
      view.dom.addEventListener("mousedown", limit, true);
      view.dom.addEventListener("touchstart", limit, true);
      view.update = (node, decorations, inner) => {
        const valid = originalUpdate(node, decorations, inner);
        if (valid) apply();
        return valid;
      };
      view.destroy = () => {
        view.dom.removeEventListener("mousedown", limit, true);
        view.dom.removeEventListener("touchstart", limit, true);
        originalDestroy();
      };
      apply();
      return view;
    };
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
export function createDocumentExtensions(
  onEquation?: (latex: string, position: number) => void,
): Extensions {
  return [
    StarterKit.configure({
      link: {
        openOnClick: false,
        autolink: false,
        isAllowedUri: (url) => isDocumentLinkHref(url),
      },
    }),
    TableKit.configure({ table: { resizable: true } }),
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    TextAlign.configure({ types: ["paragraph", "heading"] }),
    Highlight.configure({ multicolor: true }),
    Placeholder.configure({
      placeholder:
        "开始编写教案，输入 / 插入内容；选中文字或表格可请 AI 协助。",
    }),
    OwnedImage.configure({
      resize: {
        enabled: true,
        directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
        minWidth: 48,
        minHeight: 32,
        alwaysPreserveAspectRatio: true,
      },
    }),
    Mathematics.configure({
      inlineOptions: {
        onClick: (node, position) => onEquation?.(node.attrs.latex, position),
      },
      blockOptions: {
        onClick: (node, position) => onEquation?.(node.attrs.latex, position),
      },
    }),
    DocumentColumns,
    DocumentColumn,
    StableIdentity,
    EquationSource,
  ];
}
