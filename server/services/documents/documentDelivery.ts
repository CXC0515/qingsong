import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { getWorkspaceContext } from "../../context/workspaceContext";
import {
  getDocument,
  getPreparation,
  resolveSourceFile,
} from "../preparation/preparationService";
import {
  exportPreparationDocx,
  DOCUMENT_CONVERTER_VERSION,
} from "./docxExport";
import { PreparationDocumentError } from "./errors";

const agentRequire = createRequire(
  new URL("../../../agent/package.json", import.meta.url),
);
const inFlight = new Map<string, Promise<ExportRecord>>();
const previewFlights = new Map<string, Promise<string>>();
let activeConversions = 0;
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const exportsRoot = () =>
  path.join(getWorkspaceContext().dataDirectory, "preparation-exports");
const safeFileName = (title: string) =>
  title.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 100) || "教案";
interface ExportManifest {
  version: 1;
  id: string;
  preparationId: string;
  documentId: string;
  revision: number;
  format: "docx" | "pdf";
  fileName: string;
  sha256: string;
  sizeBytes: number;
  warnings: string[];
  createdAt: string;
}
export interface ExportRecord {
  id: string;
  url: string;
  fileName: string;
  revision: number;
  format: "docx" | "pdf";
  warnings: string[];
}
const publicExport = (record: ExportManifest): ExportRecord => ({
  id: record.id,
  url: `/api/preparations/${record.preparationId}/exports/${record.id}`,
  fileName: record.fileName,
  revision: record.revision,
  format: record.format,
  warnings: record.warnings,
});

async function convertPdf(
  inputPath: string,
  outputPath: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (activeConversions >= 1)
    throw new PreparationDocumentError(
      "DOCUMENT_CONVERTER_BUSY",
      "另一份文档正在转换，原稿和已保存版本保留。请稍后重试。",
      409,
    );
  activeConversions++;
  let converter:
    | {
        render: (
          input: { inputPath: string; outputPath: string },
          signal?: AbortSignal,
        ) => Promise<{ missingFonts: string[] }>;
        dispose: () => Promise<void>;
      }
    | undefined;
  try {
    const { createConverter } = agentRequire("@deepseek-ai/libreoffice-kit");
    converter = await createConverter({
      fontMetadataCacheDirectory: false,
      timeoutMs: 60_000,
      maxInputBytes: 64 * 1024 * 1024,
      maxOutputBytes: 64 * 1024 * 1024,
      maxLoadedFontBytes: 128 * 1024 * 1024,
    });
    const result = await converter!.render({ inputPath, outputPath }, signal);
    return result.missingFonts.length
      ? [
          `部分原字体不可用，已使用替代字体：${result.missingFonts.slice(0, 8).join("、")}。请查看PDF排版。`,
        ]
      : [];
  } catch (error) {
    if (signal?.aborted)
      throw new PreparationDocumentError(
        "DOCUMENT_CANCELLED",
        "文档转换已停止，原稿和已保存版本保留。",
      );
    throw new PreparationDocumentError(
      "DOCUMENT_CONVERSION_FAILED",
      "文档转换失败，原稿和已保存版本保留。可能缺少转换环境、字体或文件损坏，请稍后重试。",
      503,
    );
  } finally {
    try {
      await converter?.dispose();
    } finally {
      activeConversions--;
    }
  }
}
async function loadManifest(
  preparationId: string,
  id: string,
): Promise<ExportManifest | null> {
  if (!/^[a-f0-9]{64}$/.test(id))
    throw new PreparationDocumentError(
      "EXPORT_NOT_FOUND",
      "找不到这份导出文件，请重新导出。",
      404,
    );
  try {
    const record = JSON.parse(
      await readFile(
        path.join(exportsRoot(), preparationId, `${id}.json`),
        "utf8",
      ),
    ) as ExportManifest;
    if (
      record.version !== 1 ||
      record.preparationId !== preparationId ||
      record.id !== id ||
      !["docx", "pdf"].includes(record.format)
    )
      throw Error("manifest");
    getDocument(preparationId, record.documentId, record.revision);
    return record;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new PreparationDocumentError(
      "EXPORT_UNREADABLE",
      "导出记录暂时无法读取，原稿保留，请重新导出。",
      503,
    );
  }
}

export async function createDocumentExport(
  preparationId: string,
  documentId: string,
  revision: number,
  format: "docx" | "pdf",
  signal?: AbortSignal,
): Promise<ExportRecord> {
  const record = getDocument(preparationId, documentId, revision);
  const id = hash(
    JSON.stringify([
      getWorkspaceContext().userId,
      record,
      format,
      DOCUMENT_CONVERTER_VERSION,
    ]),
  );
  try {
    const cached = await loadManifest(preparationId, id);
    if (cached) {
      await resolveDocumentExport(preparationId, id);
      return publicExport(cached);
    }
  } catch (error) {
    // Exports are derived artifacts. Rebuild a damaged artifact from the immutable revision.
    if (
      !(error instanceof PreparationDocumentError) ||
      !["EXPORT_UNREADABLE", "EXPORT_FILE_CHANGED"].includes(error.code)
    )
      throw error;
  }
  const key = path.join(exportsRoot(), preparationId, id);
  const previous = inFlight.get(key);
  if (previous) return previous;
  if (inFlight.size >= 4)
    throw new PreparationDocumentError(
      "EXPORT_QUEUE_FULL",
      "当前导出任务较多，原稿已保留，请稍后重试。",
      429,
    );
  const pending = (async () => {
    signal?.throwIfAborted();
    const directory = path.dirname(key);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${key}.${randomUUID()}`;
    const docxFile = `${temporary}.docx`,
      pdfFile = `${temporary}.pdf`;
    try {
      const result = await exportPreparationDocx(record);
      if (result.bytes.length > 64 * 1024 * 1024)
        throw new PreparationDocumentError(
          "EXPORT_TOO_LARGE",
          "导出文件超过64MB，原稿保留。请缩小图片后重试。",
        );
      await writeFile(docxFile, result.bytes, { mode: 0o600, flag: "wx" });
      const warnings = [...result.warnings];
      if (format === "pdf")
        warnings.push(...(await convertPdf(docxFile, pdfFile, signal)));
      signal?.throwIfAborted();
      const output = format === "pdf" ? pdfFile : docxFile;
      const bytes = await readFile(output);
      if (
        !bytes.length ||
        (format === "pdf" && bytes.subarray(0, 5).toString() !== "%PDF-")
      )
        throw new PreparationDocumentError(
          "EXPORT_INVALID",
          "导出文件未通过核对，原稿保留，请重试。",
          500,
        );
      const manifest: ExportManifest = {
        version: 1,
        id,
        preparationId,
        documentId,
        revision,
        format,
        fileName: `${safeFileName(record.title)}.${format}`,
        sha256: hash(bytes),
        sizeBytes: bytes.length,
        warnings,
        createdAt: new Date().toISOString(),
      };
      await rename(output, `${key}.${format}`);
      await writeFile(`${temporary}.json`, JSON.stringify(manifest), {
        mode: 0o600,
        flag: "wx",
      });
      await rename(`${temporary}.json`, `${key}.json`);
      return publicExport(manifest);
    } finally {
      await Promise.all(
        [docxFile, pdfFile, `${temporary}.json`].map((file) =>
          rm(file, { force: true }),
        ),
      );
    }
  })();
  inFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (inFlight.get(key) === pending) inFlight.delete(key);
  }
}

export async function resolveDocumentExport(preparationId: string, id: string) {
  getPreparation(preparationId);
  const manifest = await loadManifest(preparationId, id);
  if (!manifest)
    throw new PreparationDocumentError(
      "EXPORT_NOT_FOUND",
      "导出文件尚未生成或已不可用，原稿保留，请重新导出。",
      404,
    );
  const filePath = path.join(
    exportsRoot(),
    preparationId,
    `${id}.${manifest.format}`,
  );
  try {
    const info = await lstat(filePath);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size !== manifest.sizeBytes ||
      hash(await readFile(filePath)) !== manifest.sha256
    )
      throw Error("digest");
  } catch {
    throw new PreparationDocumentError(
      "EXPORT_FILE_CHANGED",
      "导出文件无法通过完整性核对，原稿保留，请重新导出。",
      503,
    );
  }
  return {
    filePath,
    fileName: manifest.fileName,
    mimeType:
      manifest.format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

export async function resolveSourcePreview(
  preparationId: string,
  sourceId: string,
  signal?: AbortSignal,
) {
  const source = await resolveSourceFile(preparationId, sourceId);
  if (
    source.mimeType === "application/pdf" ||
    source.mimeType.startsWith("image/")
  )
    return { ...source, warnings: [] };
  const extension = path.extname(source.fileName).toLowerCase();
  if (
    ![
      ".doc",
      ".docx",
      ".odt",
      ".ppt",
      ".pptx",
      ".odp",
      ".xls",
      ".xlsx",
      ".ods",
    ].includes(extension)
  )
    throw new PreparationDocumentError(
      "SOURCE_PREVIEW_UNSUPPORTED",
      "这份资料暂不支持页面预览，原件仍保留，可下载原件查看。",
    );
  const key = path.join(
    exportsRoot(),
    preparationId,
    `preview-${hash(source.sha256 + DOCUMENT_CONVERTER_VERSION)}`,
  );
  const output = `${key}.pdf`;
  try {
    const info = await lstat(output);
    if (
      info.isFile() &&
      !info.isSymbolicLink() &&
      info.size >= 5 &&
      info.size <= 64 * 1024 * 1024
    ) {
      const file = await open(output, "r");
      try {
        const header = Buffer.alloc(5);
        await file.read(header, 0, 5, 0);
        if (header.toString() === "%PDF-")
          return {
            filePath: output,
            fileName: `${source.fileName}.pdf`,
            mimeType: "application/pdf",
            warnings: [],
          };
      } finally {
        await file.close();
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  let pending = previewFlights.get(key);
  if (!pending) {
    if (previewFlights.size >= 4)
      throw new PreparationDocumentError(
        "PREVIEW_QUEUE_FULL",
        "当前预览任务较多，原件保留，请稍后重试。",
        429,
      );
    pending = (async () => {
      await mkdir(path.dirname(key), { recursive: true, mode: 0o700 });
      const temporary = `${key}.${randomUUID()}.pdf`;
      try {
        await convertPdf(source.filePath, temporary, signal);
        signal?.throwIfAborted();
        const bytes = await readFile(temporary);
        if (
          bytes.length > 64 * 1024 * 1024 ||
          bytes.subarray(0, 5).toString() !== "%PDF-"
        )
          throw new PreparationDocumentError(
            "PREVIEW_INVALID",
            "预览转换未通过核对，原件保留，请重试。",
            503,
          );
        await rename(temporary, output);
        return output;
      } finally {
        await rm(temporary, { force: true });
      }
    })();
    previewFlights.set(key, pending);
  }
  try {
    await pending;
    return {
      filePath: output,
      fileName: `${source.fileName}.pdf`,
      mimeType: "application/pdf",
      warnings: ["预览是转换后的页面，原件未修改。"],
    };
  } finally {
    if (previewFlights.get(key) === pending) previewFlights.delete(key);
  }
}
