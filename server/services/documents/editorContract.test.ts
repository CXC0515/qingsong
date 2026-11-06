import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import { getSchema } from "@tiptap/core";
import { createDocumentExtensions } from "../../../src/components/document/documentExtensions";
import {
  documentAttributeIssue,
  documentFontSizePoints,
  documentColorHex,
} from "../../../src/domain/documentContract";
import type { RichDocument, DocumentNode } from "../../../src/domain/document";
import {
  createPreparation,
  saveDocument,
  getDocument,
  normalizeRichDocument,
} from "../preparation/preparationService";
import {
  runWithWorkspace,
  type WorkspaceContext,
} from "../../context/workspaceContext";
import { closePreparationDatabase } from "../../database/preparationDatabase";
import { exportPreparationDocx } from "./docxExport";
import { importPreparationDocx } from "./docxImport";
const root =
  process.env.QS_EDITOR_QA_DIRECTORY ??
  (await mkdtemp(path.join(os.tmpdir(), "qs-editor-contract-")));
await mkdir(root, { recursive: true });
const context: WorkspaceContext = {
  userId: "editor-contract-user",
  workspaceId: "editor-contract-workspace",
  role: "teacher",
  root,
  dataDirectory: path.join(root, "data"),
  uploadDirectory: path.join(root, "uploads"),
};
const schema = getSchema(createDocumentExtensions());
const text = (text: string): DocumentNode => ({ type: "text", text });
const paragraph = (content: DocumentNode[] = []): DocumentNode => ({
  type: "paragraph",
  content,
});
after(async () => {
  closePreparationDatabase();
  if (!process.env.QS_EDITOR_QA_DIRECTORY)
    await rm(root, { recursive: true, force: true });
});

test("actual editor schema output saves table and ordered list default attributes and keeps stable IDs", () =>
  runWithWorkspace(context, () => {
    const detail = createPreparation({
      title: "实际编辑器契约",
      operationId: randomUUID(),
    });
    const content = schema
      .nodeFromJSON({
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  { type: "tableHeader", content: [paragraph([text("表头")])] },
                  { type: "tableCell", content: [paragraph()] },
                ],
              },
            ],
          },
          {
            type: "orderedList",
            content: [
              { type: "listItem", content: [paragraph([text("步骤")])] },
            ],
          },
          { type: "horizontalRule" },
        ],
      })
      .toJSON();
    assert.equal(content.content[0].content[0].content[0].attrs.align, null);
    assert.equal(content.content[1].attrs.type, null);
    const saved = saveDocument(detail.preparation.id, detail.documents[0].id, {
      expectedRevision: 1,
      operationId: randomUUID(),
      content,
    });
    const reloaded = getDocument(detail.preparation.id, saved.id);
    const editorAgain = schema.nodeFromJSON(reloaded.content).toJSON();
    assert.equal(
      editorAgain.content[2].attrs.id,
      reloaded.content.content[2].attrs?.id,
    );
    assert.equal(normalizeRichDocument(editorAgain).content[0].type, "table");
  }));

test("formatting validation is per-node and accepts safe clipboard RGB without accepting CSS injection", () => {
  for (const [name, mark] of Object.entries(schema.marks)) {
    const defaults = Object.fromEntries(
      Object.entries(mark.spec.attrs ?? {}).map(([key, definition]) => [
        key,
        definition.default,
      ]),
    );
    if (name === "link") defaults.href = "https://example.com/";
    assert.equal(
      documentAttributeIssue(name, defaults, true),
      undefined,
      `${name} defaults`,
    );
  }
  assert.equal(
    documentAttributeIssue("tableCell", {
      align: null,
      colspan: 1,
      rowspan: 1,
      colwidth: null,
    }),
    undefined,
  );
  assert.equal(
    documentAttributeIssue("orderedList", { start: 1, type: null }),
    undefined,
  );
  assert.equal(documentColorHex("rgb(37, 99, 75)"), "#25634b");
  assert.equal(documentColorHex("rgba(37,99,75,1)"), "#25634b");
  assert.equal(
    documentAttributeIssue(
      "link",
      {
        href: "https://example.com",
        target: null,
        rel: null,
        class: null,
        title: null,
      },
      true,
    ),
    undefined,
  );
  assert.equal(
    documentAttributeIssue("image", {
      id: null,
      assetId: null,
      src: null,
      alt: null,
      title: null,
      width: null,
      height: null,
    }),
    undefined,
  );
  assert.ok(documentAttributeIssue("paragraph", { colspan: 2 }));
  assert.ok(
    documentAttributeIssue(
      "textStyle",
      { color: "url(https://example.invalid/track)" },
      true,
    ),
  );
  assert.ok(
    documentAttributeIssue("link", { href: "javascript:alert(1)" }, true),
  );
  assert.ok(
    documentAttributeIssue("textStyle", { fontSize: "100000px" }, true),
  );
});

test("editor formatting survives Word export and import: links, highlights, numbering, headers, column widths and alignment", async () =>
  runWithWorkspace(context, async () => {
    const detail = createPreparation({
      title: "教案排版互通样本",
      operationId: randomUUID(),
    });
    const content: RichDocument = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2, textAlign: "center" },
          content: [
            {
              type: "text",
              text: "教学目标",
              marks: [
                {
                  type: "textStyle",
                  attrs: {
                    color: "rgb(37, 99, 75)",
                    fontFamily: "Arial",
                    fontSize: "20px",
                  },
                },
              ],
            },
          ],
        },
        paragraph([
          {
            type: "text",
            text: "参考原文",
            marks: [
              {
                type: "link",
                attrs: { href: "https://example.com/source?a=1&b=2" },
              },
              { type: "underline" },
              { type: "highlight", attrs: { color: "#fff1a8" } },
            ],
          },
        ]),
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: {
                    colspan: 1,
                    rowspan: 1,
                    colwidth: [140],
                    align: "center",
                  },
                  content: [paragraph([text("教师活动")])],
                },
                {
                  type: "tableHeader",
                  attrs: {
                    colspan: 1,
                    rowspan: 1,
                    colwidth: [260],
                    align: "right",
                  },
                  content: [paragraph([text("学生活动")])],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 2, rowspan: 1, colwidth: [140, 260] },
                  content: [paragraph([text("合并教学环节")])],
                },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          attrs: { start: 3, type: "a" },
          content: [
            { type: "listItem", content: [paragraph([text("找出文本证据")])] },
            { type: "listItem", content: [paragraph([text("解释推理过程")])] },
          ],
        },
      ],
    };
    const actual = schema.nodeFromJSON(content).toJSON();
    const saved = saveDocument(detail.preparation.id, detail.documents[0].id, {
      expectedRevision: 1,
      operationId: randomUUID(),
      content: actual,
    });
    const exported = await exportPreparationDocx(saved);
    if (process.env.QS_EDITOR_QA_DIRECTORY) {
      await writeFile(
        path.join(root, "editor-formatting.docx"),
        exported.bytes,
      );
      await writeFile(
        path.join(root, "source.json"),
        JSON.stringify(saved.content, null, 2),
      );
    }
    const archive = await JSZip.loadAsync(exported.bytes);
    const xml = await archive.file("word/document.xml")!.async("string");
    assert.match(xml, /w:tblHeader/);
    assert.match(xml, /w:color w:val="25634b"/i);
    const imported = await importPreparationDocx(
      detail.preparation.id,
      exported.bytes,
    );
    const heading = imported.content.content[0];
    assert.equal(heading.attrs?.textAlign, "center");
    const style = heading.content![0].marks!.find(
      (mark) => mark.type === "textStyle",
    )!.attrs!;
    assert.equal(style.fontFamily, "Arial");
    assert.equal(documentFontSizePoints(style.fontSize), 15);
    assert.equal(style.color, "#25634b");
    const linked = imported.content.content[1].content![0];
    assert.equal(
      linked.marks!.find((mark) => mark.type === "link")!.attrs!.href,
      "https://example.com/source?a=1&b=2",
    );
    assert.equal(
      linked.marks!.find((mark) => mark.type === "highlight")!.attrs!.color,
      "#fff1a8",
    );
    const table = imported.content.content.find(
      (node) => node.type === "table",
    )!;
    assert.equal(table.content![0].content![0].type, "tableHeader");
    assert.deepEqual(table.content![0].content![0].attrs!.colwidth, [140]);
    assert.deepEqual(table.content![1].content![0].attrs!.colwidth, [140, 260]);
    assert.equal(table.content![0].content![1].attrs!.align, "right");
    const list = imported.content.content.find(
      (node) => node.type === "orderedList",
    )!;
    assert.equal(list.attrs!.start, 3);
    assert.equal(list.attrs!.type, "a");
    assert.equal(list.content!.length, 2);
    normalizeRichDocument(
      schema.nodeFromJSON(imported.content).toJSON(),
      detail.preparation.id,
    );
  }));

test("vertical table merges preserve unequal column widths and fully covered rows through Word", async () =>
  runWithWorkspace(context, async () => {
    const detail = createPreparation({
      title: "纵向合并表格",
      operationId: randomUUID(),
    });
    const cell = (value: string, width: number, rowspan = 1): DocumentNode => ({
      type: "tableCell",
      attrs: { colspan: 1, rowspan, colwidth: [width] },
      content: [paragraph([text(value)])],
    });
    const saved = saveDocument(detail.preparation.id, detail.documents[0].id, {
      expectedRevision: 1,
      operationId: randomUUID(),
      content: schema.nodeFromJSON({
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              { type: "tableRow", content: [cell("跨行", 100, 2), cell("右上", 300)] },
              { type: "tableRow", content: [cell("右下", 300)] },
            ],
          },
          {
            type: "table",
            content: [
              { type: "tableRow", content: [cell("整列跨行", 180, 2)] },
              { type: "tableRow", content: [] },
            ],
          },
        ],
      }).toJSON(),
    });
    const exported = await exportPreparationDocx(saved);
    const imported = await importPreparationDocx(detail.preparation.id, exported.bytes);
    const [unequal, covered] = imported.content.content;
    assert.deepEqual(unequal.content![0].content![0].attrs!.colwidth, [100]);
    assert.deepEqual(unequal.content![0].content![1].attrs!.colwidth, [300]);
    assert.deepEqual(unequal.content![1].content![0].attrs!.colwidth, [300]);
    assert.equal(unequal.content![0].content![0].attrs!.rowspan, 2);
    assert.equal(covered.content!.length, 2);
    assert.equal(covered.content![0].content![0].attrs!.rowspan, 2);
    assert.equal(covered.content![1].content!.length, 0);
    normalizeRichDocument(schema.nodeFromJSON(imported.content).toJSON(), detail.preparation.id);
  }));

test("table validation rejects uncovered empty rows, overlapping merges and spans beyond the table", () => {
  const cell = (colspan = 1, rowspan = 1): DocumentNode => ({
    type: "tableCell",
    attrs: { colspan, rowspan },
    content: [paragraph()],
  });
  const row = (...content: DocumentNode[]): DocumentNode => ({ type: "tableRow", content });
  for (const rows of [
    [row(cell()), row()],
    [row(cell(1, 2), cell()), row(cell(2))],
    [row(cell(), cell(1, 2), cell()), row(cell(2), cell())],
    [row(cell(1, 2))],
  ]) {
    assert.throws(() => normalizeRichDocument({
      type: "doc",
      content: [{ type: "table", content: rows }],
    }), /表格合并范围或行列不完整/);
  }
});

test("Feishu-style Word outline headings and legacy horizontal merges import as editable structure", async () => {
  const archive = new JSZip();
  const run = (value: string) => `<w:p><w:r><w:t>${value}</w:t></w:r></w:p>`;
  archive.file("word/document.xml", `
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:pPr><w:pStyle w:val="2"/><w:outlineLvl w:val="1"/><w:jc w:val="center"/></w:pPr><w:r><w:t>教学目标</w:t></w:r></w:p>
      <w:tbl><w:tblGrid><w:gridCol w:w="2625"/><w:gridCol w:w="4875"/></w:tblGrid>
        <w:tr><w:tc>${run("教师活动")}</w:tc><w:tc>${run("学生活动")}</w:tc></w:tr>
        <w:tr><w:tc><w:tcPr><w:hMerge w:val="restart"/></w:tcPr>${run("合并教学环节")}</w:tc><w:tc><w:tcPr><w:hMerge w:val="continue"/></w:tcPr><w:p/></w:tc></w:tr>
      </w:tbl>
    </w:body></w:document>`);
  const imported = await importPreparationDocx("synthetic", await archive.generateAsync({ type: "nodebuffer" }));
  assert.equal(imported.content.content[0].type, "heading");
  assert.deepEqual(imported.content.content[0].attrs, { level: 2, textAlign: "center" });
  const merged = imported.content.content[1].content![1].content![0];
  assert.equal(merged.attrs!.colspan, 2);
  assert.deepEqual(merged.attrs!.colwidth, [175, 325]);
  assert.equal(merged.content!.length, 1);
  normalizeRichDocument(imported.content);

  const combinedRow = (vertical: string) => `<w:tr>
    <w:tc><w:tcPr><w:hMerge w:val="restart"/><w:vMerge w:val="${vertical}"/></w:tcPr>${run(vertical === "restart" ? "横纵合并" : "")}</w:tc>
    <w:tc><w:tcPr><w:hMerge w:val="continue"/><w:vMerge w:val="${vertical}"/></w:tcPr><w:p/></w:tc>
  </w:tr>`;
  archive.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl>${combinedRow("restart")}${combinedRow("continue")}</w:tbl></w:body></w:document>`);
  const combined = await importPreparationDocx("synthetic", await archive.generateAsync({ type: "nodebuffer" }));
  assert.equal(combined.content.content[0].content![0].content![0].attrs!.rowspan, 2);
  assert.equal(combined.content.content[0].content![0].content![0].attrs!.colspan, 2);
  normalizeRichDocument(combined.content);

  archive.file("word/document.xml", `
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl>
      <w:tr><w:tc><w:tcPr><w:hMerge w:val="continue"/></w:tcPr>${run("孤立续接")}</w:tc></w:tr>
    </w:tbl></w:body></w:document>`);
  await assert.rejects(importPreparationDocx("synthetic", await archive.generateAsync({ type: "nodebuffer" })), /横向合并范围损坏/);
});

test('two and three columns survive editor schema, save, Word export and import without table borders',async()=>runWithWorkspace(context,async()=>{
 for (const count of [2,3]) {
  const detail=createPreparation({title:'分栏往返'+count,operationId:randomUUID()});
  const input={type:'doc',content:[{type:'columns',content:Array.from({length:count},(_,index)=>({type:'column',content:[paragraph([text('第'+(index+1)+'栏正文')])]}))}]};
  const content=schema.nodeFromJSON(input).toJSON() as RichDocument;
  const saved=saveDocument(detail.preparation.id,detail.documents[0].id,{expectedRevision:1,operationId:randomUUID(),content});
  const {bytes}=await exportPreparationDocx(saved);
  const zip=await JSZip.loadAsync(bytes);const xml=await zip.file('word/document.xml')!.async('string');
  assert.match(xml,/QingsongColumns/);assert.match(xml,/w:val="none"/);
  const imported=await importPreparationDocx(detail.preparation.id,bytes);
  assert.equal(imported.content.content[0].type,'columns');
  assert.equal(imported.content.content[0].content?.length,count);
  const normalized=normalizeRichDocument(imported.content,detail.preparation.id);
  assert.equal(schema.nodeFromJSON(normalized).child(0).childCount,count);
 }
}));
