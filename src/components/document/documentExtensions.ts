import { Extension, type Extensions } from "@tiptap/core";
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
    OwnedImage,
    Mathematics.configure({
      inlineOptions: {
        onClick: (node, position) => onEquation?.(node.attrs.latex, position),
      },
      blockOptions: {
        onClick: (node, position) => onEquation?.(node.attrs.latex, position),
      },
    }),
    StableIdentity,
    EquationSource,
  ];
}
