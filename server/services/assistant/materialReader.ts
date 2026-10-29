import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { RESOURCE_UPLOAD_LIMIT_BYTES, RESOURCE_UPLOAD_LIMIT_LABEL } from '../../../src/domain/uploadPolicy';

const agentRequire = createRequire(new URL('../../../agent/package.json', import.meta.url));
const MAX_BYTES = RESOURCE_UPLOAD_LIMIT_BYTES;
const MAX_TEXT = 40_000;
const MAX_CELLS = 5_000;
let renderBusy = false;
export const MATERIAL_READER_VERSION = 'assistant-material-reader-v1';
export const parserVersion = MATERIAL_READER_VERSION;
export interface AssistantMaterialInput { filePath: string; fileName: string; mimeType: string; sha256: string }
export interface AssistantMaterialReadOptions {
  action?: 'read' | 'render' | 'stats'; start?: number; limit?: number;
  sheet?: string; range?: string; signal?: AbortSignal;
  /** Private caller-owned cache directory; never taken from model arguments. */
  outputDirectory?: string;
}
export class AssistantMaterialReadError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
function fail(code: string, message: string): never { throw new AssistantMaterialReadError(code, message); }
function windowOf(options: AssistantMaterialReadOptions, max: number, fallback: number) {
  const start = options.start ?? 1, limit = options.limit ?? fallback;
  if (!Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > max)
    fail('MATERIAL_RANGE_INVALID', `读取起点必须为正整数，每次最多读取${max}项。原件未修改，请缩小范围。`);
  return {start, limit};
}
function envelope(input: AssistantMaterialInput, unit: string, total: number, start: number, items: any[], clipped = false, warnings: string[] = []) {
  const end = start + items.length - 1;
  return {kind: unit, fileName: input.fileName, sha256: input.sha256, readerVersion: MATERIAL_READER_VERSION, items,
    sources: items.map(item => ({unit, index: item.index, ...(item.sheet ? {sheet: item.sheet, range: item.range} : {})})),
    coverage: {unit, total, from: start, to: Math.max(start - 1, end), complete: start === 1 && end >= total && !clipped,
      truncated: clipped, nextStart: end < total ? end + 1 : null}, warnings};
}
function boundedItems(raw: any[]) {
  let remaining = MAX_TEXT, clipped = false;
  const items: any[] = [];
  for (const item of raw) {
    const text = String(item.text ?? '');
    if (remaining <= 0) { clipped = true; break; }
    items.push({...item, text: text.slice(0, remaining), ...(text.length > remaining ? {truncated: true} : {})});
    if (text.length > remaining) clipped = true;
    remaining -= Math.min(text.length, remaining);
  }
  return {items, clipped};
}
async function verifiedBytes(input: AssistantMaterialInput, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const stat = await lstat(input.filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('MATERIAL_NOT_FILE', '附件不是可读取的普通文件。原件未修改，请重新选择资料。');
  if (stat.size === 0 || stat.size > MAX_BYTES) fail('MATERIAL_SIZE_LIMIT', `附件为空或超过${RESOURCE_UPLOAD_LIMIT_LABEL}读取上限。原件未修改，请拆分后重试。`);
  const bytes = await readFile(input.filePath, {signal});
  if (bytes.byteLength > MAX_BYTES || !/^[a-f0-9]{64}$/.test(input.sha256) || createHash('sha256').update(bytes).digest('hex') !== input.sha256)
    fail('MATERIAL_CONTENT_CHANGED', '附件内容与引用版本不一致。原件未修改，请重新选择资料。');
  return bytes;
}
function textRead(input: AssistantMaterialInput, bytes: Buffer, options: AssistantMaterialReadOptions) {
  const {start, limit} = windowOf(options, 1000, 200);
  let text: string;
  try { text = new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch { return fail('MATERIAL_TEXT_ENCODING', '文件不是有效UTF-8文本。原件未修改，请转换编码后重试。'); }
  if (text.includes('\0')) fail('MATERIAL_BINARY_UNSUPPORTED', '该文件不是可直接读取的文本。原件已保留，请选择对应文档格式。');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const result = boundedItems(lines.slice(start - 1, start - 1 + limit).map((text, n) => ({index: start + n, text})));
  return envelope(input, 'line', lines.length, start, result.items, result.clipped);
}
async function pdfRead(input: AssistantMaterialInput, bytes: Buffer, options: AssistantMaterialReadOptions) {
  const {start, limit} = windowOf(options, 10, 3);
  const {getDocument} = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const rootRequire = createRequire(import.meta.url);
  const standardFontDataUrl = path.join(path.dirname(rootRequire.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
  const task = getDocument({data: new Uint8Array(bytes), standardFontDataUrl, isEvalSupported: false, disableFontFace: true, useSystemFonts: false});
  const abort = () => { void task.destroy(); };
  options.signal?.addEventListener('abort', abort, {once: true});
  try {
    const document = await task.promise;
    const raw: any[] = [], warnings: string[] = [];
    for (let pageNumber = start; pageNumber <= Math.min(document.numPages, start + limit - 1); pageNumber++) {
      options.signal?.throwIfAborted();
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((part: any) => typeof part.str === 'string' ? part.str + (part.hasEOL ? '\n' : ' ') : '').join('').trim();
      raw.push({index: pageNumber, text, textLayerEmpty: !text});
      if (!text) warnings.push(`第${pageNumber}页未提取到文字层；本次未执行OCR，需渲染看图或另行识别，不能据此判断页面为空。`);
      page.cleanup();
    }
    const result = boundedItems(raw);
    return envelope(input, 'page', document.numPages, start, result.items, result.clipped, warnings);
  } finally { options.signal?.removeEventListener('abort', abort); await task.destroy(); }
}
function cellScalar(cell: ExcelJS.Cell) {
  const value: any = cell.value;
  if (value && typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) return {value: value.result ?? null, formula: value.formula ?? value.sharedFormula, cachedResultMissing: value.result === undefined};
    if ('richText' in value) return {value: value.richText.map((v: any) => v.text).join('')};
    if ('text' in value) return {value: value.text, ...(value.hyperlink ? {hyperlink: value.hyperlink} : {})};
    if (value instanceof Date) return {value: value.toISOString()};
    return {value};
  }
  return {value: value ?? null};
}
function a1Range(range: string, rowCount: number, columnCount: number) {
  const match = /^([A-Z]{1,3})([1-9]\d*)(?::([A-Z]{1,3})([1-9]\d*))?$/i.exec(range);
  if (!match) fail('MATERIAL_RANGE_INVALID', '单元格范围请使用A1或A1:D20形式。原件未修改，请修正范围。');
  const col = (v: string) => [...v.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const c1 = col(match[1]), r1 = Number(match[2]), c2 = col(match[3] ?? match[1]), r2 = Number(match[4] ?? match[2]);
  if (r2 < r1 || c2 < c1 || r2 > 1_048_576 || c2 > 16_384 || (r2 - r1 + 1) * (c2 - c1 + 1) > MAX_CELLS)
    fail('MATERIAL_RANGE_LIMIT', '单次单元格范围不能超过5000格，也不能倒置或超出工作表规格。原件未修改，请缩小范围。');
  return {r1, c1, r2: Math.min(r2, rowCount), c2: Math.min(c2, columnCount), requested: {r1, c1, r2, c2}};
}
function validateZipBudget(bytes: Buffer) {
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > bytes.length) fail('MATERIAL_ARCHIVE_INVALID', 'Office文件不是有效归档，原件未修改。');
  const count = bytes.readUInt16LE(eocd + 10), offset = bytes.readUInt32LE(eocd + 16);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  if (bytes.readUInt16LE(eocd + 4) || bytes.readUInt16LE(eocd + 6) || eocd + 22 + bytes.readUInt16LE(eocd + 20) !== bytes.length || offset + centralSize !== eocd) fail('MATERIAL_ARCHIVE_INVALID', 'Office文件归档目录无效，原件未修改。');
  if (count === 65535 || count > 10000 || offset === 0xffffffff) fail('MATERIAL_ARCHIVE_LIMIT', 'Office文件归档结构超限，原件未修改。');
  let p = offset, total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > eocd || bytes.readUInt32LE(p) !== 0x02014b50) fail('MATERIAL_ARCHIVE_INVALID', 'Office文件归档目录损坏，原件未修改。');
    const flags = bytes.readUInt16LE(p + 8), size = bytes.readUInt32LE(p + 24);
    total += size;
    if ((flags & 1) || size === 0xffffffff || total > 128 * 1024 * 1024) fail('MATERIAL_ARCHIVE_LIMIT', 'Office文件加密或解压后过大，原件未修改。');
    p += 46 + bytes.readUInt16LE(p + 28) + bytes.readUInt16LE(p + 30) + bytes.readUInt16LE(p + 32);
  }
  if (p !== offset + centralSize) fail('MATERIAL_ARCHIVE_INVALID', 'Office文件归档项目数不一致，原件未修改。');
}
async function excelRead(input: AssistantMaterialInput, bytes: Buffer, options: AssistantMaterialReadOptions) {
  validateZipBudget(bytes);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as any);
  const catalog = workbook.worksheets.map(sheet => ({name: sheet.name, rows: sheet.rowCount, columns: sheet.columnCount, state: sheet.state}));
  if (!options.sheet && workbook.worksheets.length !== 1) return {kind: 'spreadsheet', fileName: input.fileName, sha256: input.sha256, sheets: catalog,
    coverage: {complete: false, unit: 'sheet', total: catalog.length}, sources: [], warnings: ['请指定工作表后读取；尚未读取单元格，也未执行统计。']};
  const sheet = options.sheet ? workbook.getWorksheet(options.sheet) : workbook.worksheets[0];
  if (!sheet) fail('MATERIAL_SHEET_NOT_FOUND', '找不到指定工作表。原件未修改，请先查看工作表名称。');
  const {start, limit} = windowOf(options, 100, 30);
  if (sheet.columnCount > 100 && !options.range) fail('MATERIAL_RANGE_REQUIRED', '工作表列数较多，请指定单元格范围。原件未修改，尚未读取。');
  if (options.action === 'stats' && !options.range) fail('MATERIAL_RANGE_REQUIRED', '统计需要明确的单元格范围，例如B2:B40。原件未修改，尚未计算。');
  const totalRows = sheet.rowCount;
  const selected = a1Range(options.range ?? `A${start}:${sheet.getColumn(Math.max(1, sheet.columnCount)).letter}${start + limit - 1}`, sheet.rowCount, sheet.columnCount);
  if (options.range) { selected.r2 = selected.requested.r2; selected.c2 = selected.requested.c2; }
  const rows: any[] = [], values: number[] = [];
  let cachedResultMissing = 0, nonNumeric = 0, empty = 0;
  for (let r = selected.r1; r <= selected.r2; r++) {
    options.signal?.throwIfAborted();
    const cells: any[] = [];
    for (let c = selected.c1; c <= selected.c2; c++) {
      const cell = sheet.getCell(r, c), data = cellScalar(cell);
      if (data.cachedResultMissing) cachedResultMissing++;
      if (typeof data.value === 'number' && Number.isFinite(data.value)) values.push(data.value);
      else if (data.value === null || data.value === '') empty++;
      else nonNumeric++;
      cells.push({address: cell.address, ...data});
    }
    rows.push({index: r, sheet: sheet.name, range: `${sheet.getColumn(selected.c1).letter}${r}:${sheet.getColumn(Math.max(selected.c1, selected.c2)).letter}${r}`, cells});
  }
  const numericCount = values.length, sum = values.reduce((a, b) => a + b, 0);
  const warnings = ['公式仅返回文件已保存的缓存结果，本次没有重算；缓存值可能过期。'];
  if (cachedResultMissing) warnings.push(`${cachedResultMissing}个公式缺少缓存值，未纳入统计。`);
  if (options.action === 'stats') return {kind: 'statistics', fileName: input.fileName, sha256: input.sha256, sheet: sheet.name, range: options.range,
    statistics: {numericCount, sum, average: numericCount ? sum / numericCount : null, min: numericCount ? Math.min(...values) : null, max: numericCount ? Math.max(...values) : null, empty, nonNumeric, cachedResultMissing},
    sources: [{sheet: sheet.name, range: options.range}], coverage: {complete: true, scope: 'requested-range', ...selected.requested}, warnings};
  let size = 0, clipped = false;
  const items = rows.filter(row => { const bytes = JSON.stringify(row).length; if (clipped || size + bytes > MAX_TEXT) {clipped = true; return false;} size += bytes; return true; });
  const result = envelope(input, 'row', totalRows, selected.r1, items, clipped, warnings);
  return {...result, sheets: catalog, sheet: sheet.name, requestedRange: options.range ?? null,
    coverage: {...result.coverage, scope: options.range ? 'requested-range' : 'sheet', complete: !clipped && (options.range ? selected.r2 >= selected.requested.r2 || selected.r2 === totalRows : selected.r1 === 1 && selected.r2 >= totalRows), columnsRead: selected.c2}};
}
async function officeRead(input: AssistantMaterialInput, bytes: Buffer, options: AssistantMaterialReadOptions) {
  const {start, limit} = windowOf(options, 20, 5);
  validateZipBudget(bytes);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'qs-office-read-'));
  const snapshot = path.join(directory, 'source' + path.extname(input.fileName).toLowerCase());
  try {
    await writeFile(snapshot, bytes, {mode: 0o600});
    const command = process.env.QS_ASSISTANT_PYTHON?.trim() || process.env.PADDLEOCR_PYTHON?.trim() || 'python3';
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(command, [fileURLToPath(new URL('../../workers/read_assistant_office.py', import.meta.url)), snapshot, String(start), String(limit)], {stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
      let stdout = '', settled = false;
      const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(stdout); };
      const abort = () => { child.kill('SIGKILL'); finish(new AssistantMaterialReadError('MATERIAL_CANCELLED', '读取已取消，原件未修改。')); };
      const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new AssistantMaterialReadError('MATERIAL_READ_TIMEOUT', '文档读取超时，原件已保留，请缩小范围后重试。')); }, 30_000);
      options.signal?.addEventListener('abort', abort, {once: true});
      if (options.signal?.aborted) abort();
      child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => {stdout += chunk; if (stdout.length > 512_000) {child.kill('SIGKILL'); finish(new AssistantMaterialReadError('MATERIAL_OUTPUT_LIMIT', '读取结果过大，原件已保留，请缩小范围。'));}});
      child.stderr.resume(); child.on('error', () => finish(new AssistantMaterialReadError('MATERIAL_DEPENDENCY_MISSING', '文档读取环境不可用，原件已保留，请联系管理员配置Python及Office库。')));
      child.on('close', code => code === 0 ? finish() : finish(new AssistantMaterialReadError('MATERIAL_OFFICE_READ_FAILED', '文档读取失败，可能文件损坏、加密或缺少解析库。原件已保留，请检查文件或联系管理员。')));
    });
    const raw = JSON.parse(output), result = boundedItems(raw.items);
    return envelope(input, raw.unit, raw.total, start, result.items, result.clipped || raw.truncated, raw.warnings ?? []);
  } finally { await rm(directory, {recursive: true, force: true}); }
}
async function renderedRead(input: AssistantMaterialInput, bytes: Buffer, options: AssistantMaterialReadOptions) {
  const {start, limit} = windowOf(options, 3, 1);
  if (!options.outputDirectory || !path.isAbsolute(options.outputDirectory)) fail('MATERIAL_RENDER_DIRECTORY', '缺少受控预览目录，原件未修改，请重新打开助手。');
  const extension = path.extname(input.fileName).toLowerCase();
  if (!['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'].includes(extension)) fail('MATERIAL_RENDER_UNSUPPORTED', '此文件格式不支持页面预览，原件未修改。');
  await mkdir(options.outputDirectory, {recursive: true, mode: 0o700});
  const directory = await mkdtemp(path.join(options.outputDirectory, 'render-'));
  const snapshot = path.join(directory, 'source' + extension);
  let converter: any;
  try {
    const {createConverter} = agentRequire('@deepseek-ai/libreoffice-kit');
    await writeFile(snapshot, bytes, {mode: 0o600});
    converter = await createConverter({fontMetadataCacheDirectory: false, timeoutMs: 45_000, maxInputBytes: MAX_BYTES, maxOutputBytes: 24 * 1024 * 1024,
      maxArchiveEntries: 10_000, maxUncompressedBytes: 128 * 1024 * 1024, maxFontFiles: 5000, maxLoadedFontBytes: 128 * 1024 * 1024});
    const isSheet = ['.xlsx', '.xls'].includes(extension);
    if (isSheet && (!options.sheet || !options.range)) fail('MATERIAL_RANGE_REQUIRED', '表格预览需要明确工作表及单元格范围，原件未修改。');
    const manifest = await converter.renderImages({inputPath: snapshot, outputDir: path.join(directory, 'images'),
      ...(isSheet ? {sheet: options.sheet, range: options.range} : {pages: Array.from({length: limit}, (_, n) => start + n)}),
      dpi: 110, maxPages: 3, maxPixels: 4_000_000, maxDimension: 4096}, options.signal);
    // The immutable original already lives in attachments/material-pool. Cache only derived images.
    await rm(snapshot);
    if (manifest.images.reduce((n: number, image: any) => n + image.byteLength, 0) > 10 * 1024 * 1024) fail('MATERIAL_IMAGE_LIMIT', '预览图片合计超过10MiB，原件未修改，请缩小范围。');
    return {kind: 'images', fileName: input.fileName, sha256: input.sha256, readerVersion: MATERIAL_READER_VERSION, renderDirectory: directory,
      images: manifest.images.map((image: any) => ({...image, mediaType: 'image/png'})), missingFonts: manifest.missingFonts,
      sources: manifest.images.map((image: any) => ({page: image.page, sheet: image.sheet, range: image.range})),
      coverage: {unit: isSheet ? 'sheet-range' : 'page', total: manifest.pageCount, from: start, count: manifest.images.length,
        complete: !isSheet && start === 1 && manifest.images.length === manifest.pageCount},
      warnings: ['页面渲染不等于OCR文字提取；需由支持图片的模型读取画面。']};
  } catch (error) {
    await rm(directory, {recursive: true, force: true});
    if (error instanceof AssistantMaterialReadError) throw error;
    fail('MATERIAL_RENDER_FAILED', '文档页面渲染失败，原件已保留。可能缺少转换引擎、文件损坏或范围无效，请检查后重试。');
  } finally { await converter?.dispose(); }
}
async function imageRead(input: AssistantMaterialInput, bytes: Buffer, options: AssistantMaterialReadOptions) {
  const {default: sharp} = await import('sharp');
  const metadata = await sharp(bytes, {limitInputPixels: 64_000_000, animated: false}).metadata();
  if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format ?? '')) fail('MATERIAL_IMAGE_FORMAT', '图片格式不支持，请转为PNG、JPEG、WebP或GIF。原件未修改。');
  if (!options.outputDirectory || !path.isAbsolute(options.outputDirectory)) fail('MATERIAL_RENDER_DIRECTORY', '缺少受控图片目录，原件未修改，请重新打开助手。');
  await mkdir(options.outputDirectory, {recursive: true, mode: 0o700});
  const directory = await mkdtemp(path.join(options.outputDirectory, 'image-'));
  try {
    options.signal?.throwIfAborted();
    const imagePath = path.join(directory, 'image.png');
    const info = await sharp(bytes, {limitInputPixels: 64_000_000, animated: false}).rotate().resize({width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true}).png().toFile(imagePath);
    options.signal?.throwIfAborted();
    if (info.size > 10 * 1024 * 1024) fail('MATERIAL_IMAGE_LIMIT', '规范化图片超过10MiB，请缩小图片后重试。原件未修改。');
    return {kind: 'images', fileName: input.fileName, sha256: input.sha256, readerVersion: MATERIAL_READER_VERSION,
      renderDirectory: directory, images: [{path: imagePath, mediaType: 'image/png', width: info.width, height: info.height, byteLength: info.size}],
      sources: [{unit: 'image', index: 1}], coverage: {complete: true, unit: 'image', total: 1}, warnings: metadata.pages && metadata.pages > 1 ? ['动画图片仅读取首帧。'] : []};
  } catch (error) { await rm(directory, {recursive: true, force: true}); throw error; }
}
async function legacyRead(input: AssistantMaterialInput, bytes: Buffer, options: AssistantMaterialReadOptions) {
  windowOf(options, 10, 3);
  if (renderBusy) fail('MATERIAL_RENDER_BUSY', '另一个资料正在转换，原件已保留，请稍后重试。');
  renderBusy = true;
  let directory: string | undefined, converter: any;
  try {
    directory = await mkdtemp(path.join(os.tmpdir(), 'qs-legacy-read-'));
    const source = path.join(directory, 'source' + path.extname(input.fileName).toLowerCase());
    const pdf = path.join(directory, 'converted.pdf');
    await writeFile(source, bytes, {mode: 0o600});
    const {createConverter} = agentRequire('@deepseek-ai/libreoffice-kit');
    converter = await createConverter({fontMetadataCacheDirectory: false, timeoutMs: 45_000, maxInputBytes: MAX_BYTES, maxOutputBytes: 24 * 1024 * 1024});
    const converted = await converter.render({inputPath: source, outputPath: pdf}, options.signal);
    const result = await pdfRead(input, await readFile(pdf, {signal: options.signal}), options);
    return {...result, kind: 'converted-document', missingFonts: converted.missingFonts,
      warnings: ['旧版Office已通过DSH LibreOffice Kit转换为PDF读取；来源页码指转换后的页面，表格公式、幻灯片备注和原始结构未完整保留。原件未修改。', ...result.warnings]};
  } catch (error) {
    if (error instanceof AssistantMaterialReadError) throw error;
    fail('MATERIAL_LEGACY_READ_FAILED', '旧版Office转换读取失败，原件已保留。请检查文件或转换为新版格式后重试。');
  } finally {try {await converter?.dispose();} finally {if (directory) await rm(directory, {recursive: true, force: true}); renderBusy = false;}}
}
/** Reads only a caller-authorized immutable snapshot. Never executes model-provided scripts or paths. */
async function readAuthorizedMaterial(input: AssistantMaterialInput, options: AssistantMaterialReadOptions = {}): Promise<any> {
  const bytes = await verifiedBytes(input, options.signal);
  const extension = path.extname(input.fileName).toLowerCase();
  if (options.action && !['read', 'render', 'stats'].includes(options.action)) fail('MATERIAL_ACTION_INVALID', '不支持该资料操作，原件未修改。');
  if (options.action === 'stats' && extension !== '.xlsx') fail('MATERIAL_STATS_UNSUPPORTED', '当前统计仅支持XLSX工作表，原件未修改。');
  if (input.mimeType.startsWith('image/')) return imageRead(input, bytes, options);
  if (options.action === 'render') {
    if (renderBusy) fail('MATERIAL_RENDER_BUSY', '另一个资料正在生成预览，原件已保留，请稍后重试。');
    renderBusy = true;
    try { return await renderedRead(input, bytes, options); } finally { renderBusy = false; }
  }
  if (extension === '.pdf') return pdfRead(input, bytes, options);
  if (extension === '.xlsx') return excelRead(input, bytes, options);
  if (extension === '.docx' || extension === '.pptx') return officeRead(input, bytes, options);
  if (['.doc', '.ppt', '.xls'].includes(extension)) return legacyRead(input, bytes, options);
  if (input.mimeType.startsWith('text/') || ['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.yaml', '.yml', '.xml', '.html'].includes(extension)) return textRead(input, bytes, options);
  fail('MATERIAL_FORMAT_UNSUPPORTED', '此格式尚无可用读取方法，原件已保留。请转换为PDF、Word、PPT、Excel或文本后重试。');
}

export async function readAssistantMaterial(input: AssistantMaterialInput, options: AssistantMaterialReadOptions = {}): Promise<any> {
  try { return await readAuthorizedMaterial(input, options); }
  catch (error) {
    if (error instanceof AssistantMaterialReadError) throw error;
    if (options.signal?.aborted) fail('MATERIAL_CANCELLED', '资料读取已取消，原件未修改。');
    fail('MATERIAL_READ_FAILED', '资料读取失败，原件已保留。文件可能损坏、加密或格式不符，请检查文件后重试。');
  }
}
