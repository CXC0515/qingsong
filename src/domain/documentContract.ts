/** Shared persistence contract for the editor, assistants and document converters. */
export const documentStableNodeTypes: readonly string[] = [
  "columns",
  "column",
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
  "horizontalRule",
  "image",
  "inlineMath",
  "blockMath",
];
export const documentNodeAttributes: Readonly<
  Record<string, readonly string[]>
> = {
  doc: [],
  columns: ["id", "ratios"],
  column: ["id"],
  text: [],
  hardBreak: [],
  paragraph: ["id", "textAlign"],
  heading: ["id", "level", "textAlign"],
  blockquote: ["id"],
  bulletList: ["id"],
  orderedList: ["id", "start", "type"],
  listItem: ["id"],
  table: ["id"],
  tableRow: ["id"],
  tableCell: ["id", "colspan", "rowspan", "colwidth", "align"],
  tableHeader: ["id", "colspan", "rowspan", "colwidth", "align"],
  codeBlock: ["id", "language"],
  horizontalRule: ["id"],
  image: ["id", "assetId", "src", "alt", "title", "width", "height", "textAlign"],
  inlineMath: ["id", "latex", "omml"],
  blockMath: ["id", "latex", "omml"],
};
export const documentMarkAttributes: Readonly<
  Record<string, readonly string[]>
> = {
  bold: [],
  italic: [],
  underline: [],
  strike: [],
  code: [],
  link: ["href", "target", "rel", "class", "title"],
  textStyle: ["color", "fontFamily", "fontSize"],
  highlight: ["color"],
};
export const documentTextAlignments = [
  "left",
  "center",
  "right",
  "justify",
] as const;
export function isDocumentLinkHref(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 2000 ||
    /[\u0000-\u0020<>]/.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}
export function documentColorHex(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const rgb =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(1(?:\.0+)?))?\s*\)$/i.exec(
      value,
    );
  if (!rgb || rgb.slice(1, 4).some((channel) => Number(channel) > 255)) return;
  return (
    "#" +
    rgb
      .slice(1, 4)
      .map((channel) => Number(channel).toString(16).padStart(2, "0"))
      .join("")
  );
}
export function isDocumentColor(value: unknown): value is string {
  return documentColorHex(value) !== undefined;
}
export function isDocumentFontFamily(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 100 &&
    /^[\p{L}\p{N} _,'"-]+$/u.test(value)
  );
}
export function documentFontSizePoints(value: unknown): number | undefined {
  if (typeof value !== "string") return;
  const match = /^(\d+(?:\.\d+)?)(pt|px)$/.exec(value);
  if (!match) return;
  const points = Number(match[1]) * (match[2] === "px" ? 0.75 : 1);
  return points >= 6 && points <= 96 ? points : undefined;
}
/** Returns a reason rather than coercing input or silently removing unsupported formatting. */
export function documentAttributeIssue(
  type: string,
  attrs: Record<string, unknown>,
  mark = false,
): string | undefined {
  const allowed = (mark ? documentMarkAttributes : documentNodeAttributes)[
    type
  ];
  if (!allowed || Object.keys(attrs).some((key) => !allowed.includes(key)))
    return "不支持的排版属性";
  if (mark && type === "link" && !isDocumentLinkHref(attrs.href))
    return "链接地址无效";
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (
      typeof value === "string" &&
      (value.length > (key === "omml" ? 50000 : 10000) ||
        value.includes("\u0000"))
    )
      return "属性内容过长或无效";
    if (["colspan", "rowspan", "start", "width", "height"].includes(key)) {
      const max =
        key === "start"
          ? 100000
          : ["colspan", "rowspan"].includes(key)
            ? 50
            : 10000;
      if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > max)
        return "表格、列表或图片尺寸无效";
    } else if (key === "ratios") {
      if(!Array.isArray(value)||![2,3].includes(value.length)||value.some(n=>!Number.isInteger(n)||n<1||n>100))return "分栏比例无效";
    } else if (key === "colwidth") {
      if (
        !Array.isArray(value) ||
        !value.length ||
        value.length > 50 ||
        value.some((n) => !Number.isInteger(n) || n < 0 || n > 10000)
      )
        return "表格列宽无效";
    } else if (key === "align" || key === "textAlign") {
      if (!(documentTextAlignments as readonly unknown[]).includes(value))
        return "对齐方式无效";
    } else if (key === "type") {
      if (!["1", "a", "A", "i", "I"].includes(String(value)))
        return "列表编号样式无效";
    } else if (key === "level") {
      if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 6)
        return "标题级别无效";
    } else if (key === "color") {
      if (!isDocumentColor(value)) return "文字颜色无效";
    } else if (key === "fontFamily") {
      if (!isDocumentFontFamily(value)) return "字体无效";
    } else if (key === "fontSize") {
      if (documentFontSizePoints(value) === undefined) return "字号无效";
    } else if (key === "href") {
      if (!isDocumentLinkHref(value)) return "链接地址无效";
    } else if (key === "target") {
      if (!["_blank", "_self"].includes(String(value)))
        return "链接打开方式无效";
    } else if (typeof value !== "string") return "属性内容无效";
  }
}

export const documentOrderedListFormats: Readonly<Record<string, string>> = {
  "1": "decimal",
  a: "lowerLetter",
  A: "upperLetter",
  i: "lowerRoman",
  I: "upperRoman",
};
export const documentCapabilities = {
  version: "qingsong-document-v2",
  nodes: documentNodeAttributes,
  marks: documentMarkAttributes,
  textAlign: documentTextAlignments,
  orderedListType: Object.keys(documentOrderedListFormats),
  constraints: {
    links: "仅HTTP/HTTPS网页链接",
    images: "仅复用当前备课受控assetId与src，不填写任意文件路径",
    colors: "#RRGGBB或不含透明度的rgb颜色",
    fontSize: "px或pt单位，6至96pt",
    stableIds: "局部改写保留范围外节点、属性和稳定id",
  },
} as const;
