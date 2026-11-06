import {
  parsePreparationInput,
  preparationToolParameters,
  PreparationContractError,
} from "../src/domain/preparationToolContract.mjs";
import { ReadToolFailure } from "./tool-contract-recovery.mjs";
import { createHash } from "node:crypto";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { requireImageModel } from "./official-materials.mjs";
/** Produces reviewable candidates. This tool cannot apply a candidate to a teacher document. */
export function preparationTool(ctx, bridge, turns) {
  return defineTool({
    name: "qingsong_preparation",
    description:
      "处理会话中教师已发送的教案引用。begin用referenceId明确本次目标并建立任务并返回taskId和baseRevision；progress记录实际进度；propose提交完整的Tiptap文档JSON候选（content为JSON字符串），保留未修改段落与稳定id，必须使用任务起点baseRevision。候选不改正式正文，由教师在备课页应用。finish仅用于没有正文修改的讨论/检查或需要补充信息。render按本次sourceId查看最多3页图片，需图片模型。status回读当前轮次任务及候选保存状态；propose成功不再finish。先用统一读取工具读当前正文和所选资料。不读取整个材料池，不更改其他教学业务。",
    parameters: preparationToolParameters(),
    output: {
      schema: { type: "string" },
      render: (_args, value) => {
        const { result, imageRefs = [] } = JSON.parse(value);
        return [
          { type: "text", text: JSON.stringify(result) },
          ...imageRefs.map((attachment) => ({ type: "image", attachment })),
        ];
      },
    },
    async execute(args, exec) {
      const state = turns.get(exec.agent?.id);
      const fail = (failure) => {
        if (state) {
          state.toolFailures ??= new Map();
          state.toolFailures.set(exec.callId, failure);
        }
        throw new ReadToolFailure(failure);
      };
      if (!state || ++state.queries > (state.budget?.queries ?? 12))
        return fail({
          code: "TOOL_BUDGET_EXHAUSTED",
          message: "本轮备课次数已达上限，已有内容保留，请缩小范围后继续。",
          recovery: "stop",
        });
      if (!state.preparationContext)
        return fail({
          code: "PREPARATION_CONTEXT_REQUIRED",
          message: "请添加并发送教案引用后再修改，已有内容保留。",
          recovery: "stop",
        });
      const sort = (value) =>
        Array.isArray(value)
          ? value.map(sort)
          : value && typeof value === "object"
            ? Object.fromEntries(
                Object.keys(value)
                  .sort()
                  .map((key) => [key, sort(value[key])]),
              )
            : value;
      const key = createHash("sha256")
        .update(JSON.stringify(sort(args)))
        .digest("hex");
      state.preparationFailures ??= new Map();
      const previous = state.preparationFailures.get(key);
      if (previous)
        return fail({
          ...previous,
          code: "REPEATED_TOOL_FAILURE",
          message: "相同备课参数已经失败，本次未重复执行。" + previous.message,
        });
      try {
        args = parsePreparationInput(args);
      } catch (error) {
        if (error instanceof PreparationContractError) {
          const failure = {
            code: error.code,
            message: error.message,
            issues: error.issues,
            recovery: error.recovery,
            nextAction: error.nextAction,
          };
          state.preparationFailures.set(key, failure);
          return fail(failure);
        }
        throw error;
      }
      if (
        (state.preparationStopped || state.stopReading) &&
        args.action !== "status"
      )
        return fail(state.preparationStopped ?? state.stopReading);
      if (args.action === "render") await requireImageModel(ctx, exec);
      const call = (input) =>
        bridge(
          {
            kind: "preparation-tool",
            sessionId: exec.agent.id,
            lease: state.lease,
            sourceText: state.sourceText ?? "",
            input,
          },
          AbortSignal.any([exec.signal, AbortSignal.timeout(90000)]),
        );
      let output;
      try {
        output = await call(args);
      } catch (error) {
        const original =
          error instanceof ReadToolFailure ? error.failure : null;
        if (original && original.recovery !== "retry_once") {
          const failure = {
            ...original,
            nextAction: original.nextAction?.includes("discover")
              ? "按当前备课动作约定修正；版本或任务错误先读取当前状态，不要原样重试。"
              : original.nextAction,
          };
          state.preparationFailures.set(key, failure);
          if (failure.recovery === "stop") state.preparationStopped = failure;
          return fail(failure);
        }
        // Transport failure can happen after persistence. Read status before reporting failure.
        if (
          !exec.signal.aborted &&
          args.action !== "render" &&
          args.action !== "status"
        ) {
          try {
            if(++state.queries>(state.budget?.queries??12))throw Error("TOOL_BUDGET_EXHAUSTED");
            const status = await call({
              action: "status",
              ...(args.taskId ? { taskId: args.taskId } : {}),
            });
            const verified = status.verification;
            const matches =
              args.action === "begin"
                ? status.status === "running"
                : args.action === "propose"
                  ? verified?.submission?.operationId === args.operationId &&
                    verified?.submission?.fingerprint ===
                      createHash("sha256")
                        .update(
                          JSON.stringify([
                            args.taskId,
                            args.baseRevision,
                            args.content,
                            args.summary,
                            args.operationId,
                          ]),
                        )
                        .digest("hex") &&
                    !!status.proposalId
                  : args.action === "progress"
                    ? status.stage === args.stage &&
                      status.message === args.message
                    : args.action === "finish"
                      ? status.status === args.status &&
                        status.message === args.message
                      : false;
            if (verified?.verified && matches) output = status;
          } catch {
            /* Preserve unknown outcome; a failed read cannot prove a failed write. */
          }
        }
        if (!output) {
          const failure = {
            code: "PREPARATION_OUTCOME_UNKNOWN",
            message:
              "本次备课操作结果尚未核实，已有内容保留。请先查看任务及候选状态，不要重复生成或声称未保存。",
            recovery: "stop",
            nextAction:
              "停止写入；可用status核对当前任务，或请教师在备课页查看。",
          };
          state.preparationFailures.set(key, failure);
          state.preparationStopped = failure;
          return fail(failure);
        }
      }
      if (args.action !== "render" && !output.verification?.verified) {
        state.preparationStopped = {
          code: "PREPARATION_VERIFY_FAILED",
          message:
            "操作回执缺少保存状态核验，已有内容保留。请查看任务和候选，不要重复提交。",
          recovery: "stop",
        };
        return fail(state.preparationStopped);
      }
      try {
        const { images = [], reservationId, ...result } = output;
        const imageRefs = [];
        for (const image of images) {
          exec.signal.throwIfAborted();
          imageRefs.push(
            await ctx.attachments.saveImage({
              data: Buffer.from(image.data, "base64"),
              mediaType: image.mediaType,
              name: image.name,
            }),
          );
        }
        return JSON.stringify({ result, imageRefs });
      } finally {
        if (output.reservationId)
          await bridge(
            {
              kind: "material-images-saved",
              reservationId: output.reservationId,
            },
            AbortSignal.timeout(10000),
          );
      }
    },
  });
}
