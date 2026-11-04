import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import multer from "multer";
import { z, ZodError } from "zod";
import { resumeAuthenticatedWorkspace } from "../middleware/authenticated";
import { uploadRateLimit } from "../middleware/security";
import {
  getDocument,
  resolveSourceFile,
  saveDocument,
  PreparationError,
} from "../services/preparation/preparationService";
import {
  storeDocumentImage,
  resolveDocumentAsset,
} from "../services/documents/documentAssets";
import { importPreparationDocx } from "../services/documents/docxImport";
import {
  createDocumentExport,
  resolveDocumentExport,
  resolveSourcePreview,
} from "../services/documents/documentDelivery";
import { PreparationDocumentError } from "../services/documents/errors";

const router = Router();
const id = (request: Request, key = "id") =>
  z.uuid().parse(request.params[key]);
const operationId = z
  .string()
  .min(8)
  .max(160)
  .regex(/^[a-zA-Z0-9_-]+$/);
const handle =
  (operation: (request: Request, response: Response) => Promise<unknown>) =>
  (request: Request, response: Response, next: NextFunction) => {
    response.setHeader("Cache-Control", "private, no-store");
    operation(request, response)
      .then((result) => {
        if (result !== undefined && !response.headersSent)
          response.json(result);
      })
      .catch(next);
  };
function signalFor(request: Request, response: Response) {
  const controller = new AbortController();
  request.once("aborted", () => controller.abort());
  response.once("close", () => {
    if (!response.writableFinished) controller.abort();
  });
  return AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]);
}
function sendFile(
  response: Response,
  file: { filePath: string; fileName: string; mimeType: string },
  attachment = false,
) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'self'",
  );
  response.setHeader(
    "Content-Disposition",
    `${attachment ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
  );
  response.type(file.mimeType);
  return new Promise<void>((resolve, reject) =>
    response.sendFile(file.filePath, (error) =>
      error ? reject(error) : resolve(),
    ),
  );
}

router.post(
  "/preparations/:id/import",
  handle(async (request) => {
    const preparationId = id(request);
    const input = z
      .object({
        sourceId: z.uuid(),
        documentId: z.uuid(),
        expectedRevision: z.number().int().positive(),
        operationId,
      })
      .strict()
      .parse(request.body);
    getDocument(preparationId, input.documentId);
    const source = await resolveSourceFile(preparationId, input.sourceId);
    if (path.extname(source.fileName).toLowerCase() !== ".docx")
      throw new PreparationDocumentError(
        "IMPORT_FORMAT_UNSUPPORTED",
        "可编辑底稿当前支持DOCX文件。这份资料仍可作为参考阅读；请使用Word另存为DOCX后导入。",
      );
    const imported = await importPreparationDocx(
      preparationId,
      await readFile(source.filePath),
    );
    const document = saveDocument(
      preparationId,
      input.documentId,
      {
        expectedRevision: input.expectedRevision,
        operationId: input.operationId,
        content: imported.content,
      },
      "import",
      `从 ${source.fileName} 导入底稿`,
    );
    return { document, warnings: imported.warnings };
  }),
);
router.post(
  "/preparations/:id/documents/:documentId/exports",
  handle(async (request, response) => {
    const input = z
      .object({
        revision: z.number().int().positive(),
        format: z.enum(["docx", "pdf"]),
        operationId,
      })
      .strict()
      .parse(request.body);
    return {
      export: await createDocumentExport(
        id(request),
        id(request, "documentId"),
        input.revision,
        input.format,
        signalFor(request, response),
      ),
    };
  }),
);
router.get(
  "/preparations/:id/exports/:exportId",
  handle(async (request, response) => {
    const file = await resolveDocumentExport(
      id(request),
      String(request.params.exportId),
    );
    await sendFile(response, file, true);
  }),
);
router.get(
  "/preparations/:id/sources/:sourceId/preview",
  handle(async (request, response) => {
    const file = await resolveSourcePreview(
      id(request),
      id(request, "sourceId"),
      signalFor(request, response),
    );
    if (file.warnings.length)
      response.setHeader(
        "X-Qingsong-Preview-Warnings",
        encodeURIComponent(file.warnings.join(" ")),
      );
    await sendFile(response, file);
  }),
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 10 * 1024 * 1024 },
});
router.post(
  "/preparations/:id/assets",
  uploadRateLimit,
  upload.single("file"),
  resumeAuthenticatedWorkspace,
  handle(async (request) => {
    if (!request.file)
      throw new PreparationDocumentError(
        "IMAGE_REQUIRED",
        "尚未选择图片，教案未修改，请选择图片。",
      );
    return {
      asset: await storeDocumentImage(
        id(request),
        request.file.buffer,
        request.file.originalname,
      ),
    };
  }),
);
router.get(
  "/preparations/:id/assets/:assetId",
  handle(async (request, response) => {
    const file = await resolveDocumentAsset(
      id(request),
      id(request, "assetId"),
    );
    await sendFile(response, file);
  }),
);
router.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    if (
      error instanceof PreparationDocumentError ||
      error instanceof PreparationError
    ) {
      response
        .status(error.status)
        .json({ code: error.code, message: error.message, saved: false });
      return;
    }
    if (error instanceof ZodError) {
      response
        .status(400)
        .json({
          code: "INVALID_DOCUMENT_REQUEST",
          message: "文档操作格式不正确，原稿未修改，请重新选择文件或版本。",
          saved: false,
        });
      return;
    }
    if (error instanceof multer.MulterError) {
      response
        .status(400)
        .json({
          code: error.code,
          message: "图片超过10MB或上传格式不正确，教案未修改，请检查后重试。",
          saved: false,
        });
      return;
    }
    next(error);
  },
);
export default router;
