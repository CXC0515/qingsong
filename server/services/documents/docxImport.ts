import path from "node:path";
import JSZip from "jszip";
import {
  DOMParser,
  XMLSerializer,
  type Element as XmlElement,
  type Node as XmlNode,
} from "@xmldom/xmldom";
import type { DocumentNode, RichDocument } from "../../../src/domain/document";
import {
  isDocumentLinkHref,
  isDocumentColor,
  isDocumentFontFamily,
  documentFontSizePoints,
  documentOrderedListFormats,
} from "../../../src/domain/documentContract";
import { validateZipBudget } from "../assistant/materialReader";
import { storeDocumentImage } from "./documentAssets";
import { PreparationDocumentError } from "./errors";
import { ommlToLatex, validateOmml } from "./officeMath";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const M = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const childElements = (node: XmlNode): XmlElement[] =>
  Array.from(node.childNodes).filter((n) => n.nodeType === 1) as XmlElement[];
const direct = (node: XmlNode, name: string) =>
  childElements(node).find((n) => n.localName === name);
const attr = (node: XmlElement | undefined, name: string) =>
  node?.getAttributeNS(W, name) ?? node?.getAttribute(`w:${name}`) ?? "";
function parseXml(xml: string): XmlElement {
  if (xml.length > 16 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new PreparationDocumentError(
      "DOCX_XML_INVALID",
      "Word内容结构不受支持，原件保留，教案未修改。",
    );
  let invalid = false;
  const document = new DOMParser({
    onError: () => {
      invalid = true;
    },
  }).parseFromString(xml, "application/xml");
  if (invalid || !document.documentElement)
    throw new PreparationDocumentError(
      "DOCX_XML_INVALID",
      "Word内容格式损坏，原件保留，教案未修改。",
    );
  return document.documentElement;
}

/** Import structure rather than a text dump. Original files remain the layout reference. */
export async function importPreparationDocx(
  preparationId: string,
  bytes: Buffer,
): Promise<{ content: RichDocument; warnings: string[] }> {
  validateZipBudget(bytes);
  const archive = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const main = archive.file("word/document.xml");
  if (!main)
    throw new PreparationDocumentError(
      "DOCX_INVALID",
      "文件不是可读取的Word文档，原件保留，教案未修改。",
    );
  const root = parseXml(await main.async("string"));
  const warnings = new Set<string>();
  const relationships = new Map<string, string>();
  const hyperlinks = new Map<string, string>();
  const relFile = archive.file("word/_rels/document.xml.rels");
  if (relFile)
    for (const rel of childElements(parseXml(await relFile.async("string")))) {
      if (rel.getAttribute("TargetMode") === "External") {
        const target = rel.getAttribute("Target");
        if (
          rel.getAttribute("Type")?.endsWith("/hyperlink") &&
          isDocumentLinkHref(target)
        )
          hyperlinks.set(rel.getAttribute("Id") ?? "", target);
        continue;
      }
      const target = path.posix.normalize(
        path.posix.join("word", rel.getAttribute("Target") ?? ""),
      );
      if (target.startsWith("word/") && !target.includes(".."))
        relationships.set(rel.getAttribute("Id") ?? "", target);
    }
  const styles = new Map<string, string>();
  const stylesFile = archive.file("word/styles.xml");
  if (stylesFile)
    for (const style of childElements(
      parseXml(await stylesFile.async("string")),
    ))
      styles.set(attr(style, "styleId"), attr(direct(style, "name"), "val"));
  const numbering = new Map<string, { format: string; start: number }>();
  const numberFile = archive.file("word/numbering.xml");
  if (numberFile) {
    const numbers = childElements(parseXml(await numberFile.async("string")));
    const formats = new Map(
      numbers
        .filter((n) => n.localName === "abstractNum")
        .map((n) => {
          const level = direct(n, "lvl") ?? n;
          return [
            attr(n, "abstractNumId"),
            {
              format: attr(direct(level, "numFmt"), "val"),
              start: Number(attr(direct(level, "start"), "val")) || 1,
            },
          ];
        }),
    );
    for (const n of numbers.filter((n) => n.localName === "num"))
      numbering.set(
        attr(n, "numId"),
        formats.get(attr(direct(n, "abstractNumId"), "val")) ?? {
          format: "decimal",
          start: 1,
        },
      );
  }
  for (const name of Object.keys(archive.files)) {
    if (
      /^word\/(header|footer|comments|footnotes|endnotes)\d*\.xml$/.test(name)
    )
      warnings.add("页眉页脚、批注或脚注未转入可编辑正文，请对照原件核对。");
  }
  if (
    root.getElementsByTagNameNS(W, "ins").length ||
    root.getElementsByTagNameNS(W, "del").length
  )
    warnings.add(
      "原件含修订记录；导入采用插入后、删除后的正文，历史修订仍保留在原件中。",
    );
  if (root.getElementsByTagNameNS(W, "txbxContent").length)
    warnings.add("原件含文本框或浮动内容，未按原始版式还原，请对照原件核对。");
  const listIdentities = new WeakMap<DocumentNode, string>();
  const appendContent = (target: DocumentNode[], next: DocumentNode[]) => {
    for (const node of next) {
      const previous = target.at(-1);
      if (
        previous?.type === node.type &&
        listIdentities.has(node) &&
        listIdentities.get(previous) === listIdentities.get(node)
      )
        previous.content!.push(...(node.content ?? []));
      else target.push(node);
    }
  };
  const imageCache = new Map<string, DocumentNode>();
  const image = async (drawing: XmlElement): Promise<DocumentNode | null> => {
    const blip = Array.from(drawing.getElementsByTagName("*")).find(
      (n) => n.localName === "blip",
    );
    const id =
      blip?.getAttributeNS(R, "embed") ?? blip?.getAttribute("r:embed");
    const target = id && relationships.get(id);
    if (!target) {
      warnings.add("部分绘图、链接图片或图表未转入正文，请查看原件。");
      return null;
    }
    const cached = imageCache.get(target);
    if (cached) return structuredClone(cached);
    const file = archive.file(target);
    if (!file) {
      warnings.add("原件中的一张图片缺失，请对照原件核对。");
      return null;
    }
    try {
      const asset = await storeDocumentImage(
        preparationId,
        await file.async("nodebuffer"),
        path.posix.basename(target),
      );
      const extent = Array.from(drawing.getElementsByTagName("*")).find(
        (n) => n.localName === "extent",
      );
      const width = extent
        ? Math.round(Number(extent.getAttribute("cx")) / 9525)
        : asset.width;
      const height = extent
        ? Math.round(Number(extent.getAttribute("cy")) / 9525)
        : asset.height;
      const node: DocumentNode = {
        type: "image",
        attrs: {
          assetId: asset.id,
          src: asset.url,
          alt: asset.fileName,
          width: Math.min(width || asset.width || 600, 1600),
          height: Math.min(height || asset.height || 400, 3000),
        },
      };
      imageCache.set(target, node);
      return structuredClone(node);
    } catch (error) {
      if (!(error instanceof PreparationDocumentError)) throw error;
      warnings.add(`一张图片未导入：${error.message}`);
      return null;
    }
  };
  const paragraph = async (element: XmlElement): Promise<DocumentNode[]> => {
    const properties = direct(element, "pPr");
    const styleId = attr(properties && direct(properties, "pStyle"), "val");
    const style = styles.get(styleId) ?? styleId;
    const namedHeading = /(?:heading|标题)\s*([1-6])/i.exec(style);
    const outline = attr(properties && direct(properties, "outlineLvl"), "val");
    // Feishu exports numeric style IDs with no style definitions, but keeps the
    // standard zero-based outline level on the paragraph itself.
    const headingLevel = /^[0-5]$/.test(outline)
      ? Number(outline) + 1
      : namedHeading ? Number(namedHeading[1]) : undefined;
    const alignmentValue = attr(properties && direct(properties, "jc"), "val");
    const alignment =
      alignmentValue === "both"
        ? "justify"
        : ["left", "right", "center", "justify"].includes(alignmentValue)
          ? alignmentValue
          : undefined;
    const paragraphAttrs = {
      ...(headingLevel ? { level: headingLevel } : {}),
      ...(alignment ? { textAlign: alignment } : {}),
    };
    const blocks: DocumentNode[] = [],
      inline: DocumentNode[] = [];
    const flush = () => {
      if (inline.length) {
        blocks.push({
          type: headingLevel ? "heading" : "paragraph",
          ...(Object.keys(paragraphAttrs).length
            ? { attrs: paragraphAttrs }
            : {}),
          content: inline.splice(0),
        });
      }
    };
    const visit = async (
      node: XmlElement,
      inherited: DocumentNode["marks"] = [],
    ) => {
      if (
        node.namespaceURI === M &&
        ["oMath", "oMathPara"].includes(node.localName)
      ) {
        const clone = node.cloneNode(true) as XmlElement;
        clone.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:m", M);
        clone.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:w", W);
        const omml = validateOmml(new XMLSerializer().serializeToString(clone));
        if (
          Array.from(clone.getElementsByTagNameNS(M, "*")).some((part) =>
            [
              "nary",
              "m",
              "eqArr",
              "limLow",
              "limUpp",
              "acc",
              "bar",
              "groupChr",
            ].includes(part.localName),
          )
        )
          warnings.add(
            "部分复杂公式仅保留了Word原公式，网页预览可能简化。请对照原件核对；编辑这些公式前建议保留原稿。",
          );
        const formula: DocumentNode = {
          type: node.localName === "oMathPara" ? "blockMath" : "inlineMath",
          attrs: { latex: ommlToLatex(omml) || "\\text{公式}", omml },
        };
        if (formula.type === "blockMath") {
          flush();
          blocks.push(formula);
        } else inline.push(formula);
        return;
      }
      if (
        node.namespaceURI === W &&
        ["pPr", "rPr", "del", "txbxContent", "sectPr"].includes(node.localName)
      )
        return;
      if (
        node.namespaceURI === W &&
        ["drawing", "pict", "object"].includes(node.localName)
      ) {
        flush();
        const asset = await image(node);
        if (asset) {if(alignment)asset.attrs={...asset.attrs,textAlign:alignment};blocks.push(asset);}
        return;
      }
      let marks = inherited;
      if (node.namespaceURI === W && node.localName === "hyperlink") {
        const id = node.getAttributeNS(R, "id") ?? node.getAttribute("r:id");
        const href = id && hyperlinks.get(id);
        if (href)
          marks = [
            ...(inherited ?? []),
            {
              type: "link",
              attrs: {
                href,
                target: "_blank",
                rel: "noopener noreferrer nofollow",
                class: null,
              },
            },
          ];
        else
          warnings.add(
            "部分内部或非网页链接保留了文字，链接目标未转入编辑稿。",
          );
      }
      if (node.localName === "r") {
        const properties = direct(node, "rPr");
        marks = [...inherited];
        for (const [tag, type] of [
          ["b", "bold"],
          ["i", "italic"],
          ["u", "underline"],
          ["strike", "strike"],
        ]) {
          const property = properties && direct(properties, tag);
          if (
            property &&
            !["0", "false", "none"].includes(attr(property, "val"))
          )
            marks.push({ type });
        }
        const textStyle: Record<string, unknown> = {};
        const color = attr(properties && direct(properties, "color"), "val");
        if (/^[0-9a-f]{6}$/i.test(color))
          textStyle.color = "#" + color.toLowerCase();
        const font = properties && direct(properties, "rFonts");
        const family =
          attr(font, "eastAsia") || attr(font, "ascii") || attr(font, "hAnsi");
        if (family && isDocumentFontFamily(family))
          textStyle.fontFamily = family;
        const halfPoints = Number(
          attr(properties && direct(properties, "sz"), "val"),
        );
        if (halfPoints) {
          const size = `${halfPoints / 2}pt`;
          if (documentFontSizePoints(size) !== undefined)
            textStyle.fontSize = size;
          else
            warnings.add(
              "部分字号超出网页编辑范围，文字已保留，请对照原件核对。",
            );
        }
        if (Object.keys(textStyle).length)
          marks.push({ type: "textStyle", attrs: textStyle });
        const fill = attr(properties && direct(properties, "shd"), "fill");
        const named = attr(
          properties && direct(properties, "highlight"),
          "val",
        );
        const namedColors: Record<string, string> = {
          yellow: "#ffff00",
          green: "#00ff00",
          cyan: "#00ffff",
          magenta: "#ff00ff",
          blue: "#0000ff",
          red: "#ff0000",
          darkBlue: "#000080",
          darkCyan: "#008080",
          darkGreen: "#008000",
          darkMagenta: "#800080",
          darkRed: "#800000",
          darkYellow: "#808000",
          darkGray: "#808080",
          lightGray: "#c0c0c0",
          black: "#000000",
          white: "#ffffff",
        };
        const highlight = /^[0-9a-f]{6}$/i.test(fill)
          ? "#" + fill.toLowerCase()
          : namedColors[named];
        if (isDocumentColor(highlight))
          marks.push({ type: "highlight", attrs: { color: highlight } });
      }
      if (node.namespaceURI === W && node.localName === "t") {
        if (node.textContent)
          inline.push({
            type: "text",
            text: node.textContent,
            ...(marks?.length ? { marks } : {}),
          });
        return;
      }
      if (node.namespaceURI === W && node.localName === "tab") {
        inline.push({ type: "text", text: "    " });
        return;
      }
      if (node.namespaceURI === W && ["br", "cr"].includes(node.localName)) {
        inline.push({ type: "hardBreak" });
        return;
      }
      for (const child of childElements(node)) await visit(child, marks);
    };
    for (const child of childElements(element)) await visit(child);
    flush();
    if (!blocks.length)
      blocks.push({
        type: headingLevel ? "heading" : "paragraph",
        ...(Object.keys(paragraphAttrs).length
          ? { attrs: paragraphAttrs }
          : {}),
      });
    const numberingProperties = properties && direct(properties, "numPr");
    if (numberingProperties) {
      const numId = attr(direct(numberingProperties, "numId"), "val");
      const level = Number(
        attr(direct(numberingProperties, "ilvl"), "val") || 0,
      );
      if (level > 0)
        warnings.add("多级编号已转为可编辑列表，请核对层级与原编号。");
      const definition = numbering.get(numId);
      const list: DocumentNode = {
        type: definition?.format === "bullet" ? "bulletList" : "orderedList",
        ...(definition?.format === "bullet"
          ? {}
          : {
              attrs: {
                start: definition?.start ?? 1,
                type:
                  Object.keys(documentOrderedListFormats).find(
                    (key) =>
                      documentOrderedListFormats[key] === definition?.format,
                  ) ?? null,
              },
            }),
        content: [{ type: "listItem", content: blocks }],
      };
      listIdentities.set(list, numId);
      return [list];
    }
    return blocks;
  };
  const table = async (element: XmlElement): Promise<DocumentNode> => {
    const rows: DocumentNode[] = [];
    const grid = direct(element, "tblGrid");
    const gridWidths = grid
      ? childElements(grid).map((column) =>
          Math.max(1, Math.round(Number(attr(column, "w")) / 15)),
        )
      : [];
    const merged = new Map<number, DocumentNode>();
    for (const row of childElements(element).filter(
      (n) => n.localName === "tr",
    )) {
      const cells: DocumentNode[] = [];
      const headerProperty =
        direct(row, "trPr") && direct(direct(row, "trPr")!, "tblHeader");
      const headerRow = Boolean(
        headerProperty &&
          !["0", "false", "off"].includes(attr(headerProperty, "val")),
      );
      let column = 0;
      const groups: Array<{ cells: XmlElement[]; colspan: number }> = [];
      let horizontal: (typeof groups)[number] | undefined;
      for (const cell of childElements(row).filter(
        (n) => n.localName === "tc",
      )) {
        const properties = direct(cell, "tcPr");
        const colspan = Math.min(
          50,
          Math.max(
            1,
            Number(attr(properties && direct(properties, "gridSpan"), "val")) ||
              1,
          ),
        );
        const merge = properties && direct(properties, "hMerge");
        const mode = merge ? attr(merge, "val") || "continue" : "";
        if (mode === "continue") {
          if (!horizontal || horizontal.colspan + colspan > 50)
            throw new PreparationDocumentError(
              "DOCX_TABLE_INVALID",
              "Word表格的横向合并范围损坏，原件保留，教案未修改。",
            );
          horizontal.cells.push(cell);
          horizontal.colspan += colspan;
        } else {
          if (mode && mode !== "restart")
            throw new PreparationDocumentError(
              "DOCX_TABLE_INVALID",
              "Word表格的横向合并格式不受支持，原件保留，教案未修改。",
            );
          const group = { cells: [cell], colspan };
          groups.push(group);
          horizontal = mode === "restart" ? group : undefined;
        }
      }
      for (const group of groups) {
        const cell = group.cells[0];
        const properties = direct(cell, "tcPr");
        const colspan = group.colspan;
        const merge = properties && direct(properties, "vMerge");
        if (merge && attr(merge, "val") !== "restart" && merged.has(column)) {
          const original = merged.get(column)!;
          original.attrs!.rowspan = Number(original.attrs!.rowspan ?? 1) + 1;
          column += colspan;
          continue;
        }
        const content: DocumentNode[] = [];
        for (const [index, member] of group.cells.entries()) {
          for (const child of childElements(member)) {
            if (child.localName === "p") {
              const next = await paragraph(child);
              // Continuation cells are usually empty; preserve any real content
              // without appending a blank line for every covered grid column.
              if (!index || next.some((node) => node.content?.length))
                appendContent(content, next);
            }
            if (child.localName === "tbl") content.push(await table(child));
          }
        }
        const shading = attr(properties && direct(properties, "shd"), "fill");
        const firstAlignment = content.find((node) =>
          ["paragraph", "heading"].includes(node.type),
        )?.attrs?.textAlign;
        const widths = gridWidths.slice(column, column + colspan);
        const result: DocumentNode = {
          type:
            headerRow || shading.toUpperCase() === "F0F2F0"
              ? "tableHeader"
              : "tableCell",
          attrs: {
            colspan,
            rowspan: 1,
            colwidth:
              widths.length === colspan && widths.every(Number.isFinite)
                ? widths
                : null,
            align: typeof firstAlignment === "string" ? firstAlignment : null,
          },
          content: content.length ? content : [{ type: "paragraph" }],
        };
        cells.push(result);
        for (let c = column; c < column + colspan; c++) {
          if (merge) merged.set(c, result);
          else merged.delete(c);
        }
        column += colspan;
      }
      rows.push({ type: "tableRow", content: cells });
    }
    const caption = direct(direct(element, 'tblPr') ?? element, 'tblStyle');
    if (attr(caption, 'val') === 'QingsongColumns' && rows.length === 1 && [2,3].includes(rows[0].content?.length ?? 0))
      {
        const widths=rows[0].content!.map(cell=>Number((cell.attrs?.colwidth as number[] | undefined)?.[0])||1);
        const total=widths.reduce((sum,n)=>sum+n,0);
        const ratios=widths.map(n=>Math.max(1,Math.round(n/total*100)));
        return {type:'columns',...(new Set(ratios).size>1?{attrs:{ratios}}:{}),content:rows[0].content!.map(cell=>({type:'column',content:cell.content}))};
      }
    return { type: "table", content: rows };
  };
  const body = direct(root, "body");
  if (!body)
    throw new PreparationDocumentError(
      "DOCX_INVALID",
      "Word正文缺失，原件保留，教案未修改。",
    );
  const content: DocumentNode[] = [];
  for (const child of childElements(body)) {
    if (child.localName === "p") {
      appendContent(content, await paragraph(child));
    } else if (child.localName === "tbl") content.push(await table(child));
    else if (child.localName !== "sectPr")
      warnings.add("原件包含特殊正文结构，未完整转入编辑稿，请对照原件核对。");
  }
  warnings.add(
    "已导入可编辑内容；原件的分页、字体和浮动版式可能不同，可在资料中对照原件。",
  );
  return {
    content: {
      type: "doc",
      content: content.length ? content : [{ type: "paragraph" }],
    },
    warnings: [...warnings],
  };
}
