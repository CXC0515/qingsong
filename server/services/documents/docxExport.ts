import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import sharp from "sharp";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  HeadingLevel,
  AlignmentType,
  ExternalHyperlink,
  LevelFormat,
  TableLayoutType,
  ShadingType,
  BorderStyle,
  type ILevelsOptions,
  type ParagraphChild,
} from "docx";
import type {
  DocumentNode,
  DocumentRecord,
} from "../../../src/domain/document";
import {
  documentFontSizePoints,
  documentColorHex,
  documentOrderedListFormats,
  isDocumentLinkHref,
} from "../../../src/domain/documentContract";
import { resolveDocumentAsset } from "./documentAssets";
import { latexToOmml, ommlToLatex, validateOmml } from "./officeMath";
import { PreparationDocumentError } from "./errors";

export const DOCUMENT_CONVERTER_VERSION = "preparation-documents-v3";
const paragraphAlignment = (value: unknown) =>
  ({
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
  })[String(value)];
const headingLevels = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

/** One deterministic writer is used by current and historical exports. */
export async function exportPreparationDocx(
  record: DocumentRecord,
): Promise<{ bytes: Buffer; warnings: string[] }> {
  const warnings = new Set<string>();
  const formulas = new Map<string, string>();
  const numbering: Array<{ reference: string; levels: ILevelsOptions[] }> = [];
  const image = async (node: DocumentNode): Promise<ImageRun> => {
    const asset = await resolveDocumentAsset(
      record.preparationId,
      String(node.attrs?.assetId ?? ""),
    );
    const input = await readFile(asset.filePath);
    const normalized = await sharp(input, {
      limitInputPixels: 40_000_000,
      animated: false,
    })
      .rotate()
      .png()
      .toBuffer({ resolveWithObject: true });
    const desiredWidth = Number(node.attrs?.width) || normalized.info.width;
    const desiredHeight = Number(node.attrs?.height) || normalized.info.height;
    const ratio = Math.min(1, 620 / desiredWidth, 850 / desiredHeight);
    return new ImageRun({
      type: "png",
      data: normalized.data,
      transformation: {
        width: Math.max(1, Math.round(desiredWidth * ratio)),
        height: Math.max(1, Math.round(desiredHeight * ratio)),
      },
      altText: {
        title: String(node.attrs?.alt ?? asset.fileName),
        description: String(node.attrs?.alt ?? asset.fileName),
        name: asset.fileName,
      },
    });
  };
  const inline = async (
    nodes: DocumentNode[] = [],
  ): Promise<ParagraphChild[]> => {
    const output: ParagraphChild[] = [];
    for (const node of nodes) {
      if (node.type === "hardBreak") {
        output.push(new TextRun({ break: 1 }));
        continue;
      }
      if (node.type === "inlineMath" || node.type === "blockMath") {
        const latex = String(node.attrs?.latex ?? "");
        const original =
          typeof node.attrs?.omml === "string"
            ? validateOmml(node.attrs.omml)
            : undefined;
        if (original && latex && ommlToLatex(original) !== latex)
          throw new PreparationDocumentError(
            "FORMULA_VERSION_CONFLICT",
            "公式显示内容与原公式结构不一致，尚未导出。请重新编辑该公式后重试。",
          );
        const omml = original ?? latexToOmml(latex, node.type === "blockMath");
        const marker = `QSFORMULA${formulas.size}_${createHash("sha256").update(omml).digest("hex").slice(0, 12)}`;
        formulas.set(marker, omml);
        output.push(new TextRun(marker));
        continue;
      }
      if (node.type === "image") {
        output.push(await image(node));
        continue;
      }
      if (node.type !== "text") {
        output.push(...(await inline(node.content)));
        continue;
      }
      const marks = new Map(
        (node.marks ?? []).map((mark) => [mark.type, mark.attrs ?? {}]),
      );
      const style = marks.get("textStyle") ?? {};
      const color = documentColorHex(style.color)?.slice(1);
      const highlight = documentColorHex(marks.get("highlight")?.color);
      const fontSize = documentFontSizePoints(style.fontSize);
      const text = new TextRun({
        text: node.text ?? "",
        bold: marks.has("bold"),
        italics: marks.has("italic"),
        underline: marks.has("underline") ? {} : undefined,
        strike: marks.has("strike"),
        color,
        ...(typeof style.fontFamily === "string"
          ? { font: style.fontFamily }
          : {}),
        ...(fontSize ? { size: fontSize * 2 } : {}),
        ...(typeof highlight === "string"
          ? {
              shading: {
                fill: highlight.replace("#", ""),
                type: ShadingType.CLEAR,
              },
            }
          : {}),
        ...(marks.has("code") ? { font: "Courier New" } : {}),
      });
      const href = marks.get("link")?.href;
      if (isDocumentLinkHref(href))
        output.push(new ExternalHyperlink({ children: [text], link: href }));
      else output.push(text);
    }
    return output;
  };
  const blocks = async (
    nodes: DocumentNode[],
    list?: { reference: string; level: number },
  ): Promise<Array<Paragraph | Table>> => {
    const result: Array<Paragraph | Table> = [];
    for (const node of nodes) {
      if (["bulletList", "orderedList"].includes(node.type)) {
        const level = Math.min(8, list ? list.level + 1 : 0);
        const reference = `lesson-list-${numbering.length}`;
        numbering.push({
          reference,
          levels: Array.from({ length: 9 }, (_, index) => ({
            level: index,
            format:
              node.type === "orderedList"
                ? ((documentOrderedListFormats[
                    String(node.attrs?.type ?? "1")
                  ] ?? LevelFormat.DECIMAL) as ILevelsOptions["format"])
                : LevelFormat.BULLET,
            text: node.type === "orderedList" ? `%${index + 1}.` : "•",
            start: Number(node.attrs?.start) || 1,
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 360 * (index + 1), hanging: 240 } },
            },
          })),
        });
        result.push(
          ...(await blocks(node.content ?? [], { reference, level })),
        );
        continue;
      }
      if (node.type === "listItem") {
        const content = [...(node.content ?? [])];
        const first = content.shift() ?? { type: "paragraph" };
        result.push(
          new Paragraph({
            children: await inline(first.content),
            alignment: paragraphAlignment(first.attrs?.textAlign),
            ...(list
              ? { numbering: { reference: list.reference, level: list.level } }
              : {}),
            spacing: { after: 80 },
          }),
        );
        result.push(...(await blocks(content, list)));
        continue;
      }
      if (node.type === "columns") {
        const none = {style:BorderStyle.NONE, size:0, color:'FFFFFF'};
        const cells: TableCell[] = [];
        const ratios = Array.isArray(node.attrs?.ratios) && node.attrs.ratios.length === node.content?.length ? node.attrs.ratios as number[] : (node.content ?? []).map(()=>1);
        const total = ratios.reduce((sum,n)=>sum+n,0);
        for (const [index,column] of (node.content ?? []).entries()) {
          const children = await blocks(column.content ?? []);
          cells.push(new TableCell({children:children.length ? children : [new Paragraph('')],
            width:{size:100*ratios[index]/total,type:WidthType.PERCENTAGE},
            borders:{top:none,bottom:none,left:none,right:none}, margins:{left:120,right:120},
          }));
        }
        result.push(new Table({rows:[new TableRow({children:cells})],
          width:{size:100,type:WidthType.PERCENTAGE}, layout:TableLayoutType.FIXED,
          columnWidths:ratios.map(n=>Math.floor(9638*n/total)),
          borders:{top:none,bottom:none,left:none,right:none,insideHorizontal:none,insideVertical:none},
          // A named borderless table style preserves column boundaries on Word round trips.
          style:'QingsongColumns',
        }));
        continue;
      }
      if (node.type === "table") {
        const columnWidths: number[] = [];
        const occupiedUntil: number[] = [];
        // Editor rows omit cells covered by an earlier rowspan. Resolve their real
        // grid positions once, for both column widths and individual cell widths.
        const layout = (node.content ?? []).map((row, rowIndex) => {
          let column = 0;
          const cells = (row.content ?? []).map((cell) => {
            while ((occupiedUntil[column] ?? 0) > rowIndex) column++;
            const span = Number(cell.attrs?.colspan) || 1;
            const start = column;
            const rowSpan = Number(cell.attrs?.rowspan) || 1;
            const widths = Array.isArray(cell.attrs?.colwidth)
              ? cell.attrs.colwidth
              : [];
            for (let c = 0; c < span; c++) {
              columnWidths[column + c] =
                Number(widths[c]) || columnWidths[column + c] || 120;
              occupiedUntil[column + c] = rowIndex + rowSpan;
            }
            column += span;
            return { cell, column: start, span };
          });
          return { row, cells };
        });
        const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
        const scale = Math.min(1, 620 / totalWidth);
        if (scale < 1)
          warnings.add("表格列宽已按纸张宽度等比缩小，网页中的原始列宽保留。");
        const wordWidths = columnWidths.map((width) =>
          Math.round(width * scale * 15),
        );
        const rows: TableRow[] = [];
        for (const { row, cells: positionedCells } of layout) {
          const cells: TableCell[] = [];
          for (const { cell, column, span } of positionedCells) {
            const alignment = String(cell.attrs?.align ?? "");
            const aligned = cell.content?.map((child) =>
              ["paragraph", "heading"].includes(child.type) &&
              !child.attrs?.textAlign &&
              alignment
                ? { ...child, attrs: { ...child.attrs, textAlign: alignment } }
                : child,
            );
            const content = await blocks(aligned ?? []);
            cells.push(
              new TableCell({
                children: content.length ? content : [new Paragraph("")],
                columnSpan: span,
                width: {
                  size: wordWidths
                    .slice(column, column + span)
                    .reduce((sum, width) => sum + width, 0),
                  type: WidthType.DXA,
                },
                rowSpan: Number(cell.attrs?.rowspan) || 1,
                ...(cell.type === "tableHeader"
                  ? { shading: { fill: "F0F2F0" } }
                  : {}),
              }),
            );
          }
          // Keep an empty editor row: docx adds the vertical-merge continuation
          // cells while constructing Table, and needs the row to be present.
          rows.push(
            new TableRow({
              children: cells,
              tableHeader:
                Boolean(row.content?.length) &&
                row.content?.every(
                  (cell) => cell.type === "tableHeader",
                ),
            }),
          );
        }
        if (rows.length)
          result.push(
            new Table({
              rows,
              columnWidths: wordWidths,
              layout: TableLayoutType.FIXED,
              width: { size: 100, type: WidthType.PERCENTAGE },
            }),
          );
        continue;
      }
      if (node.type === "blockquote") {
        result.push(...(await blocks(node.content ?? [])));
        continue;
      }
      if (node.type === "horizontalRule") {
        result.push(
          new Paragraph({
            text: "────────────────",
            spacing: { before: 80, after: 80 },
          }),
        );
        continue;
      }
      if (node.type === "image") {
        result.push(
          new Paragraph({
            children: [await image(node)],
            alignment: node.attrs?.textAlign === "center" ? AlignmentType.CENTER : node.attrs?.textAlign === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
            spacing: { after: 160 },
          }),
        );
        continue;
      }
      if (node.type === "blockMath") {
        result.push(
          new Paragraph({
            children: await inline([node]),
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 100 },
          }),
        );
        continue;
      }
      const alignment = paragraphAlignment(node.attrs?.textAlign);
      result.push(
        new Paragraph({
          children: await inline(node.content ?? (node.text ? [node] : [])),
          ...(node.type === "heading"
            ? {
                heading:
                  headingLevels[
                    Math.min(6, Math.max(1, Number(node.attrs?.level) || 1)) - 1
                  ],
                keepNext: true,
              }
            : {}),
          alignment,
          spacing: { after: 140, line: 330 },
        }),
      );
    }
    return result;
  };
  const content = await blocks(record.content.content);
  const document = new Document({
    numbering: { config: numbering },
    title: record.title,
    creator: "青松教师",
    description: "青松教案",
    styles: {
      default: {
        document: {
          run: { font: "Noto Sans CJK SC", size: 22 },
          paragraph: { spacing: { after: 140 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
          },
        },
        children: content.length ? content : [new Paragraph("")],
      },
    ],
  });
  const bytes = await Packer.toBuffer(document);
  if (!formulas.size) return { bytes, warnings: [...warnings] };
  const archive = await JSZip.loadAsync(bytes);
  const xml = await archive.file("word/document.xml")!.async("string");
  const dom = new DOMParser().parseFromString(xml, "application/xml");
  const texts = Array.from(
    dom.getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
      "t",
    ),
  );
  for (const text of texts) {
    const formula = formulas.get(text.textContent ?? "");
    if (!formula) continue;
    const math = new DOMParser().parseFromString(
      formula,
      "application/xml",
    ).documentElement;
    const run = text.parentNode;
    if (!run?.parentNode)
      throw new PreparationDocumentError(
        "FORMULA_EXPORT_FAILED",
        "公式写入失败，原稿保留，请重试。",
        500,
      );
    run.parentNode.replaceChild(dom.importNode(math, true), run);
    formulas.delete(text.textContent ?? "");
  }
  if (formulas.size)
    throw new PreparationDocumentError(
      "FORMULA_EXPORT_FAILED",
      "部分公式尚未写入文件，原稿保留，请重试。",
      500,
    );
  archive.file("word/document.xml", new XMLSerializer().serializeToString(dom));
  return {
    bytes: await archive.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    }),
    warnings: [...warnings],
  };
}
