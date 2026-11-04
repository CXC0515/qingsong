import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import * as service from "../services/preparation/preparationService";
import type { SaveDocumentInput } from "../services/preparation/preparationService";
const router = Router();
const id = (request: Request, key: string) => String(request.params[key]);
const handle =
  (action: (request: Request) => unknown | Promise<unknown>) =>
  (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve()
      .then(() => action(request))
      .then((result) => response.json(result))
      .catch(next);
  };
router.use("/preparations", (_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});
router.get(
  "/preparations",
  handle(() => ({ preparations: service.listPreparations() })),
);
router.post(
  "/preparations",
  handle((request) => ({
    preparation: service.createPreparation(request.body),
  })),
);
router.get(
  "/preparations/:id",
  handle((request) => ({
    preparation: service.getPreparation(id(request, "id")),
  })),
);
router.patch(
  "/preparations/:id",
  handle((request) => ({
    preparation: service.updatePreparation(id(request, "id"), request.body),
  })),
);
router.post(
  "/preparations/:id/documents",
  handle((request) => ({
    document: service.forkDocument(id(request, "id"), request.body),
  })),
);
router.get(
  "/preparations/:id/documents/:documentId",
  handle((request) => ({
    document: service.getDocument(id(request, "id"), id(request, "documentId")),
  })),
);
router.put(
  "/preparations/:id/documents/:documentId",
  handle((request) => ({
    document: service.saveDocument(
      id(request, "id"),
      id(request, "documentId"),
      request.body as SaveDocumentInput,
    ),
  })),
);
router.get(
  "/preparations/:id/documents/:documentId/revisions",
  handle((request) => ({
    revisions: service.listRevisions(
      id(request, "id"),
      id(request, "documentId"),
    ),
  })),
);
router.get(
  "/preparations/:id/documents/:documentId/revisions/:revision",
  handle((request) => ({
    document: service.getDocument(
      id(request, "id"),
      id(request, "documentId"),
      Number(request.params.revision),
    ),
  })),
);
router.post(
  "/preparations/:id/documents/:documentId/restore",
  handle((request) => ({
    document: service.restoreRevision(
      id(request, "id"),
      id(request, "documentId"),
      request.body,
    ),
  })),
);
router.post(
  "/preparations/:id/sources",
  handle(async (request) => ({
    source: await service.addSource(id(request, "id"), request.body),
  })),
);
router.delete(
  "/preparations/:id/sources/:sourceId",
  handle((request) =>
    service.removeSource(id(request, "id"), id(request, "sourceId")),
  ),
);
router.get(
  "/preparations/:id/proposals",
  handle((request) => ({
    proposals: service.listProposals(id(request, "id")),
  })),
);
router.post(
  "/preparations/:id/proposals",
  handle((request) => ({
    proposal: service.createProposal(id(request, "id"), request.body),
  })),
);
router.post(
  "/preparations/:id/proposals/:proposalId/apply",
  handle((request) => ({
    document: service.applyProposal(
      id(request, "id"),
      id(request, "proposalId"),
      request.body,
    ),
  })),
);
router.post(
  "/preparations/:id/proposals/:proposalId/discard",
  handle((request) => ({
    proposal: service.discardProposal(
      id(request, "id"),
      id(request, "proposalId"),
      request.body,
    ),
  })),
);
router.get(
  "/preparations/:id/tasks",
  handle((request) => ({ tasks: service.listTasks(id(request, "id")) })),
);
router.get(
  "/preparations/:id/tasks/:taskId",
  handle((request) => ({
    task: service.getTask(id(request, "id"), id(request, "taskId")),
  })),
);
router.post(
  "/preparations/:id/tasks/:taskId/cancel",
  handle(async (request) => {
    const task = service.cancelTask(
      id(request, "id"),
      id(request, "taskId"),
      request.body,
    );
    if (task.status !== "cancelled" || !task.sessionId) return { task };
    try {
      const { cancelPreparationSession } = await import(
        "../services/assistant/officialAssistant"
      );
      await cancelPreparationSession(task.sessionId);
      return { task };
    } catch {
      return {
        task,
        warning:
          "已阻止任务继续写入候选，但尚未确认模型停止。已有教案和建议保留，请在助手中点击停止或稍后核对。",
      };
    }
  }),
);
router.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    if (error instanceof service.PreparationError) {
      response
        .status(error.status)
        .json({ code: error.code, message: error.message, saved: false });
      return;
    }
    if (error instanceof ZodError) {
      response
        .status(400)
        .json({
          code: "INVALID_PREPARATION_INPUT",
          message:
            "备课内容或操作格式不正确，尚未保存。请检查必填内容和操作范围后重试。",
          saved: false,
        });
      return;
    }
    next(error);
  },
);
export default router;
