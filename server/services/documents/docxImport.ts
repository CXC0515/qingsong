import path from "node:path";
import JSZip from "jszip";
import {
  DOMParser,
  XMLSerializer,
  type Element as XmlElement,
  type Node as XmlNode,
} from "@xmldom/xmldom";
import type { DocumentNode, RichDocument } from "../../../src/domain/document";
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
  const relFile = archive.file("word/_rels/document.xml.rels");
  if (relFile)
    for (const rel of childElements(parseXml(await relFile.async("string")))) {
      if (rel.getAttribute("TargetMode") === "External") continue;
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
    const heading = /(?:heading|标题)\s*([1-6])/i.exec(style);
    const blocks: DocumentNode[] = [],
      inline: DocumentNode[] = [];
    const flush = () => {
      if (inline.length) {
        blocks.push({
          type: heading ? "heading" : "paragraph",
          ...(heading ? { attrs: { level: Number(heading[1]) } } : {}),
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
        if (asset) blocks.push(asset);
        return;
      }
      let marks = inherited;
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
        type: heading ? "heading" : "paragraph",
        ...(heading ? { attrs: { level: Number(heading[1]) } } : {}),
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
      return [
        {
          type: definition?.format === "bullet" ? "bulletList" : "orderedList",
          ...(definition?.format === "bullet"
            ? {}
            : { attrs: { start: definition?.start ?? 1 } }),
          content: [{ type: "listItem", content: blocks }],
        },
      ];
    }
    return blocks;
  };
  const table = async (element: XmlElement): Promise<DocumentNode> => {
    const rows: DocumentNode[] = [];
    const merged = new Map<number, DocumentNode>();
    for (const row of childElements(element).filter(
      (n) => n.localName === "tr",
    )) {
      const cells: DocumentNode[] = [];
      let column = 0;
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
        const merge = properties && direct(properties, "vMerge");
        if (merge && attr(merge, "val") !== "restart" && merged.has(column)) {
          const original = merged.get(column)!;
          original.attrs!.rowspan = Number(original.attrs!.rowspan ?? 1) + 1;
          column += colspan;
          continue;
        }
        const content: DocumentNode[] = [];
        for (const child of childElements(cell)) {
          if (child.localName === "p")
            content.push(...(await paragraph(child)));
          if (child.localName === "tbl") content.push(await table(child));
        }
        const result: DocumentNode = {
          type: "tableCell",
          attrs: { colspan, rowspan: 1, colwidth: null },
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
      const next = await paragraph(child);
      const previous = content.at(-1);
      if (
        next.length === 1 &&
        previous?.type === next[0].type &&
        ["bulletList", "orderedList"].includes(previous.type)
      )
        previous.content!.push(...next[0].content!);
      else content.push(...next);
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
