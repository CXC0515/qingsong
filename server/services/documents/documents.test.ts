import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import {
  runWithWorkspace,
  type WorkspaceContext,
} from "../../context/workspaceContext";
import { closePreparationDatabase } from "../../database/preparationDatabase";
import {
  createPreparation,
  getDocument,
  saveDocument,
} from "../preparation/preparationService";
import { storeDocumentImage, resolveDocumentAsset } from "./documentAssets";
import { exportPreparationDocx } from "./docxExport";
import { importPreparationDocx } from "./docxImport";
import {
  createDocumentExport,
  resolveDocumentExport,
} from "./documentDelivery";
import { latexToOmml, ommlToLatex, validateOmml } from "./officeMath";
import type { RichDocument } from "../../../src/domain/document";

const root =
  process.env.QS_DOCUMENT_QA_DIRECTORY ||
  (await mkdtemp(path.join(os.tmpdir(), "qs-document-test-")));
const alice: WorkspaceContext = {
  userId: "teacher-alice",
  workspaceId: "workspace-shared",
  role: "teacher",
  root,
  dataDirectory: path.join(root, "data"),
  uploadDirectory: path.join(root, "uploads"),
};
after(async () => {
  closePreparationDatabase();
  if (!process.env.QS_DOCUMENT_QA_DIRECTORY)
    await rm(root, { recursive: true, force: true });
});

test("school-level equations preserve editable OMML and reject unknown commands and foreign XML", () => {
  const xml = latexToOmml("x^{2}+\\frac{1}{2}+\\sqrt{9}");
  assert.match(xml, /m:sSup/);
  assert.match(xml, /m:f/);
  assert.match(xml, /m:rad/);
  assert.match(ommlToLatex(xml), /frac\{1\}\{2\}/);
  assert.throws(() => latexToOmml("\\includegraphics{secret}"), /暂不支持/);
  assert.throws(
    () =>
      validateOmml(
        '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><m:oMath/>',
      ),
    /公式/,
  );
  assert.throws(
    () =>
      validateOmml(
        '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><script>bad</script></m:oMath>',
      ),
    /公式/,
  );
});

test("DOCX import rejects entity declarations and ignores remote image relationships", async () =>
  runWithWorkspace(alice, async () => {
    const detail = createPreparation({
      title: "导入边界验证",
      subject: "语文",
      operationId: randomUUID(),
    });
    const archive = new JSZip();
    archive.file(
      "word/document.xml",
      '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&x;</w:t></w:r></w:p></w:body></w:document>',
    );
    await assert.rejects(
      importPreparationDocx(
        detail.preparation.id,
        await archive.generateAsync({ type: "nodebuffer" }),
      ),
      /结构不受支持/,
    );
    archive.file(
      "word/document.xml",
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body><w:p><w:r><w:t>正文保留</w:t><w:drawing><a:blip r:embed="remote"/></w:drawing></w:r></w:p></w:body></w:document>',
    );
    archive.file(
      "word/_rels/document.xml.rels",
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="remote" Target="https://example.invalid/image.png" TargetMode="External"/></Relationships>',
    );
    const imported = await importPreparationDocx(
      detail.preparation.id,
      await archive.generateAsync({ type: "nodebuffer" }),
    );
    assert.match(JSON.stringify(imported.content), /正文保留/);
    assert.doesNotMatch(JSON.stringify(imported.content), /"type":"image"/);
    assert.ok(
      imported.warnings.some((warning) => warning.includes("链接图片")),
    );
    archive.file(
      "word/document.xml",
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body><w:p><m:oMath><m:m><m:mr><m:e><m:r><m:t>1</m:t></m:r></m:e></m:mr></m:m></m:oMath></w:p></w:body></w:document>',
    );
    const complex = await importPreparationDocx(
      detail.preparation.id,
      await archive.generateAsync({ type: "nodebuffer" }),
    );
    assert.ok(complex.warnings.some((warning) => warning.includes("复杂公式")));
    assert.match(JSON.stringify(complex.content), /m:mr/);
  }));

test("unsupported formula blocks export while the saved document remains available", async () =>
  runWithWorkspace(alice, async () => {
    const detail = createPreparation({
      title: "公式边界验证",
      subject: "数学",
      operationId: randomUUID(),
    });
    const preparationId = detail.preparation.id,
      documentId = detail.documents[0].id;
    const document = saveDocument(preparationId, documentId, {
      expectedRevision: 1,
      operationId: randomUUID(),
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "inlineMath",
                attrs: { latex: "\\begin{matrix}1&2\\end{matrix}" },
              },
            ],
          },
        ],
      },
    });
    await assert.rejects(
      createDocumentExport(
        preparationId,
        documentId,
        document.revision,
        "docx",
      ),
      /暂不支持/,
    );
    assert.equal(getDocument(preparationId, documentId).revision, 2);
    assert.match(
      JSON.stringify(getDocument(preparationId, documentId).content),
      /matrix/,
    );
  }));

test("rich DOCX round-trip preserves text, merged table, picture and editable equations", async () =>
  runWithWorkspace(alice, async () => {
    const detail = createPreparation({
      title: "结构化教案验证",
      subject: "数学",
      operationId: randomUUID(),
    });
    const preparationId = detail.preparation.id,
      documentId = detail.documents[0].id;
    const pixels = await sharp({
      create: { width: 280, height: 100, channels: 3, background: "#dce9df" },
    })
      .png()
      .toBuffer();
    const asset = await storeDocumentImage(preparationId, pixels, "图示.png");
    const content: RichDocument = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "一元二次方程教学设计" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "目标：学生能根据等式性质完成推导。",
              marks: [{ type: "bold" }],
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "例题：" },
            {
              type: "inlineMath",
              attrs: { latex: "x^{2}+\\frac{1}{2}=\\sqrt{9}" },
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 2, rowspan: 1 },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "教学安排" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "教师提问" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "学生解释" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "image",
          attrs: {
            assetId: asset.id,
            src: asset.url,
            alt: "关系示意图",
            width: 280,
            height: 100,
          },
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { rowspan: 2 },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "连续活动" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "先观察" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "再解释" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "独立完成练习。" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "说明每一步的依据。" }],
                },
              ],
            },
          ],
        },
      ],
    };
    const record = saveDocument(preparationId, documentId, {
      expectedRevision: 1,
      operationId: randomUUID(),
      content,
    });
    const result = await exportPreparationDocx(record);
    const zip = await JSZip.loadAsync(result.bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    assert.match(xml, /m:oMath/);
    assert.match(xml, /m:f/);
    assert.match(xml, /w:gridSpan/);
    assert.match(xml, /a:blip/);
    const imported = await importPreparationDocx(preparationId, result.bytes);
    const serialized = JSON.stringify(imported.content);
    assert.match(serialized, /学生解释/);
    assert.match(serialized, /"colspan":2/);
    assert.match(serialized, /"rowspan":2/);
    assert.match(serialized, /"type":"image"/);
    assert.match(serialized, /"omml":/);
    assert.match(serialized, /"type":"orderedList"/);
    const importedRecord = saveDocument(
      preparationId,
      documentId,
      {
        expectedRevision: 2,
        operationId: randomUUID(),
        content: imported.content,
      },
      "import",
    );
    const roundTrip = await exportPreparationDocx(importedRecord);
    assert.ok(roundTrip.bytes.length > 1000);
    const oldExport = await createDocumentExport(
      preparationId,
      documentId,
      2,
      "docx",
    );
    saveDocument(preparationId, documentId, {
      expectedRevision: 3,
      operationId: randomUUID(),
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "后来修改的新内容" }],
          },
        ],
      },
    });
    const historical = await resolveDocumentExport(preparationId, oldExport.id);
    const historicalXml = await (
      await JSZip.loadAsync(await readFile(historical.filePath))
    )
      .file("word/document.xml")!
      .async("string");
    assert.match(historicalXml, /学生解释/);
    assert.doesNotMatch(historicalXml, /后来修改的新内容/);
    assert.equal(getDocument(preparationId, documentId).revision, 4);
    assert.deepEqual(
      await createDocumentExport(preparationId, documentId, 2, "docx"),
      oldExport,
    );
    await writeFile(historical.filePath, "damaged cached export");
    await assert.rejects(
      resolveDocumentExport(preparationId, oldExport.id),
      /完整性/,
    );
    assert.deepEqual(
      await createDocumentExport(preparationId, documentId, 2, "docx"),
      oldExport,
    );
    const rebuilt = await resolveDocumentExport(preparationId, oldExport.id);
    assert.ok(
      (await JSZip.loadAsync(await readFile(rebuilt.filePath))).file(
        "word/document.xml",
      ),
    );
    await assert.rejects(
      runWithWorkspace({ ...alice, userId: "teacher-bob" }, () =>
        resolveDocumentExport(preparationId, oldExport.id),
      ),
      /当前账号/,
    );
    await assert.rejects(
      runWithWorkspace({ ...alice, userId: "teacher-bob" }, () =>
        resolveDocumentAsset(preparationId, asset.id),
      ),
      /当前账号/,
    );

    const pdf = await createDocumentExport(preparationId, documentId, 2, "pdf");
    const file = await resolveDocumentExport(preparationId, pdf.id);
    assert.equal(
      (await readFile(file.filePath)).subarray(0, 5).toString(),
      "%PDF-",
    );
    if (process.env.QS_DOCUMENT_QA_DIRECTORY) {
      const { createConverter } = createRequire(
        new URL("../../../agent/package.json", import.meta.url),
      )("@deepseek-ai/libreoffice-kit");
      const converter = await createConverter({
        fontMetadataCacheDirectory: false,
        timeoutMs: 60_000,
        maxLoadedFontBytes: 128 * 1024 * 1024,
      });
      try {
        const outputDir = path.join(root, "rendered");
        await mkdir(outputDir, { recursive: true });
        const rendered = await converter.renderImages({
          inputPath: file.filePath,
          outputDir: path.join(outputDir, randomUUID()),
          pages: [1],
          dpi: 110,
        });
        console.log(
          JSON.stringify({
            documentQa: {
              pdf: file.filePath,
              image: rendered.images[0].path,
              warnings: pdf.warnings,
            },
          }),
        );
      } finally {
        await converter.dispose();
      }
    }
  }));
