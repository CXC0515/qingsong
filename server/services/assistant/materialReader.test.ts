import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import ExcelJS from 'exceljs';
import {PDFDocument, StandardFonts} from 'pdf-lib';
import {readAssistantMaterial, type AssistantMaterialInput} from './materialReader';

const python = process.env.QS_ASSISTANT_PYTHON || 'python3';
const hasOffice = spawnSync(python, ['-c', 'import docx,pptx'], {stdio: 'ignore'}).status === 0;
async function fixture(name: string, mimeType: string, bytes: Uint8Array) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qs-material-test-'));
  const filePath = path.join(root, name);
  await writeFile(filePath, bytes);
  const input: AssistantMaterialInput = {filePath, fileName: name, mimeType, sha256: createHash('sha256').update(bytes).digest('hex')};
  return {root, input, close: () => rm(root, {recursive: true, force: true})};
}
test('text window is bounded with source lines and incomplete coverage', async () => {
  const f = await fixture('lesson.md', 'text/markdown', Buffer.from('第一行\n第二行\n第三行'));
  try {
    const result = await readAssistantMaterial(f.input, {start: 2, limit: 1});
    assert.deepEqual(result.items, [{index: 2, text: '第二行'}]);
    assert.equal(result.coverage.complete, false); assert.equal(result.coverage.nextStart, 3);
    assert.equal(result.sources[0].index, 2);
    const all = await readAssistantMaterial(f.input);
    assert.equal(all.coverage.complete, true);
    const markdown = await readAssistantMaterial({...f.input, fileName: 'lesson.markdown', mimeType: 'application/octet-stream'});
    assert.equal(markdown.coverage.complete, true);
  } finally {await f.close();}
});
test('rejects changed bytes, symlinks, invalid windows and cancellation', async () => {
  const f = await fixture('a.txt', 'text/plain', Buffer.from('original'));
  try {
    await assert.rejects(readAssistantMaterial({...f.input, sha256: '0'.repeat(64)}), {code: 'MATERIAL_CONTENT_CHANGED'});
    await symlink(f.input.filePath, path.join(f.root, 'alias'));
    await assert.rejects(readAssistantMaterial({...f.input, filePath: path.join(f.root, 'alias')}), {code: 'MATERIAL_NOT_FILE'});
    await assert.rejects(readAssistantMaterial(f.input, {start: 0}), {code: 'MATERIAL_RANGE_INVALID'});
    await assert.rejects(readAssistantMaterial(f.input, {signal: AbortSignal.abort()}));
  } finally {await f.close();}
});
test('text output truncation is explicit, not a full-document claim', async () => {
  const f = await fixture('large.txt', 'text/plain', Buffer.from('x'.repeat(50000)));
  try {const result = await readAssistantMaterial(f.input);assert.equal(result.items[0].text.length, 40000);assert.equal(result.coverage.truncated, true);assert.equal(result.coverage.complete, false);}
  finally {await f.close();}
});
test('PDF extracts selected text pages and marks image-only pages without calling OCR', async () => {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([200, 200]).drawText('Lesson one', {x: 10, y: 100, size: 12, font});
  pdf.addPage([200, 200]);
  const f = await fixture('lesson.pdf', 'application/pdf', await pdf.save());
  try {
    const first = await readAssistantMaterial(f.input, {limit: 1}); assert.match(first.items[0].text, /Lesson one/);assert.equal(first.coverage.nextStart, 2);
    const scan = await readAssistantMaterial(f.input, {start: 2, limit: 1});assert.equal(scan.items[0].textLayerEmpty, true);assert.match(scan.warnings[0], /未执行OCR/);
  } finally {await f.close();}
});
test('Excel exposes sheets, source cells and computes numeric stats without fabricating formula caches', async () => {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('成绩');
  sheet.addRow(['姓名', '成绩']);sheet.addRow(['甲', 80]);sheet.addRow(['乙', 100]);
  sheet.getCell('B4').value = {formula: 'SUM(B2:B3)'};
  workbook.addWorksheet('另表');
  const f = await fixture('scores.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new Uint8Array(await workbook.xlsx.writeBuffer()));
  try {
    const catalog = await readAssistantMaterial(f.input);assert.equal(catalog.sheets.length, 2);assert.equal(catalog.coverage.complete, false);
    const result = await readAssistantMaterial(f.input, {sheet: '成绩', range: 'A1:B4'});
    assert.equal(result.items[3].cells[1].cachedResultMissing, true);assert.equal(result.sources[1].range, 'A2:B2');
    const stats = await readAssistantMaterial(f.input, {action: 'stats', sheet: '成绩', range: 'B2:B4'});
    assert.equal(stats.statistics.sum, 180);assert.equal(stats.statistics.average, 90);assert.equal(stats.statistics.cachedResultMissing, 1);
    await assert.rejects(readAssistantMaterial(f.input, {action: 'stats', sheet: '成绩'}), {code: 'MATERIAL_RANGE_REQUIRED'});
    await assert.rejects(readAssistantMaterial(f.input, {sheet: '成绩', range: 'A1:Z500'}), {code: 'MATERIAL_RANGE_LIMIT'});
  } finally {await f.close();}
});
test('real DOCX and PPTX use DSH-selected Python libraries with bounded structure and notes', {skip: !hasOffice}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qs-office-fixture-'));
  try {
    const made = spawnSync(python, ['-c', `from docx import Document\nfrom pptx import Presentation\nfrom pathlib import Path\np=Path(${JSON.stringify(root)})\nd=Document(); d.add_paragraph('Word paragraph'); t=d.add_table(rows=1,cols=2);t.cell(0,0).text='甲';t.cell(0,1).text='80';d.save(p/'sample.docx')\nr=Presentation();s=r.slides.add_slide(r.slide_layouts[1]);s.shapes.title.text='Slide title';s.notes_slide.notes_text_frame.text='Teacher notes';r.save(p/'sample.pptx')`], {encoding: 'utf8'});
    assert.equal(made.status, 0, made.stderr);
    for (const name of ['sample.docx', 'sample.pptx']) {
      const filePath = path.join(root, name), bytes = await readFile(filePath);
      const result = await readAssistantMaterial({filePath, fileName: name, mimeType: 'application/octet-stream', sha256: createHash('sha256').update(bytes).digest('hex')});
      assert.equal(result.coverage.complete, true);
      assert.match(result.items.map((i: any) => i.text).join('\n'), name.endsWith('docx') ? /Word paragraph[\s\S]*甲 \| 80/ : /Slide title[\s\S]*Teacher notes/);
    }
  } finally {await rm(root, {recursive: true, force: true});}
});
test('image reading normalizes into caller-owned private directory and source remains unchanged', async () => {
  const {default: sharp} = await import('sharp');
  const bytes = await sharp({create: {width: 40, height: 20, channels: 3, background: '#123456'}}).png().toBuffer();
  const f = await fixture('image.png', 'image/png', bytes);
  try {
    const result = await readAssistantMaterial(f.input, {outputDirectory: path.join(f.root, 'cache')});
    assert.equal(result.kind, 'images');assert.equal(result.images[0].width, 40);assert.equal(result.images[0].mediaType, 'image/png');
    assert.equal(createHash('sha256').update(await readFile(f.input.filePath)).digest('hex'), f.input.sha256);
  } finally {await f.close();}
});
test('native LibreOffice Kit renders selected PDF page to a real PNG', {timeout: 60000}, async () => {
  const pdf = await PDFDocument.create();pdf.addPage([100, 100]);
  const f = await fixture('page.pdf', 'application/pdf', await pdf.save());
  try {
    const result = await readAssistantMaterial(f.input, {action: 'render', start: 1, limit: 1, outputDirectory: path.join(f.root, 'cache')});
    const png = await readFile(result.images[0].path);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(result.coverage.complete, true);assert.equal(result.images[0].page, 1);
    await assert.rejects(readFile(path.join(result.renderDirectory, 'source.pdf')), {code: 'ENOENT'});
    assert.equal(createHash('sha256').update(await readFile(f.input.filePath)).digest('hex'), f.input.sha256);
  } finally {await f.close();}
});
