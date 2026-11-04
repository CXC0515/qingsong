import { defineTool } from "@deepseek-ai/dsh-tools";
import { requireImageModel } from "./official-materials.mjs";
/** Produces reviewable candidates. This tool cannot apply a candidate to a teacher document. */
export function preparationTool(ctx, bridge, turns) {
  return defineTool({
    name: "qingsong_preparation",
    description:
      "协作处理当前会话已关联的备课。begin建立任务并返回taskId和result.baseRevision；progress记录实际进度；propose提交完整的Tiptap文档JSON候选（content为JSON字符串），保留未修改段落与稳定id，必须使用任务起点baseRevision。候选不改正式正文，由教师在备课页应用。finish仅用于没有正文修改的讨论/检查或需要补充信息。render按本次sourceId查看最多3页图片，需图片模型。先用统一读取工具读当前正文和所选资料。不读取整个材料池，不更改其他教学业务。",
    parameters: {
      action: {
        type: "string",
        enum: ["begin", "progress", "propose", "finish", "render"],
        required: true,
      },
      taskId: { type: "string" },
      stage: { type: "string" },
      message: { type: "string" },
      baseRevision: { type: "number" },
      content: {
        type: "string",
        description:
          "完整Tiptap JSON字符串；节点仅支持正文、标题、列表、表格、图片、公式等受控类型。图片保留原assetId，禁止外部URL。",
      },
      summary: { type: "string" },
      operationId: {
        type: "string",
        description: "本次候选的UUID，重试同内容复用",
      },
      status: { type: "string", enum: ["completed", "needs-input", "failed"] },
      sourceId: { type: "string" },
      start: { type: "number" },
      limit: { type: "number" },
    },
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
      if (!state || ++state.queries > (state.budget?.queries ?? 12))
        throw Error(
          "本轮备课操作次数已达上限，已有内容保留，请缩小范围后继续。",
        );
      if (!state.preparationContext)
        throw Error("请从具体教案打开助手，当前会话没有关联备课。");
      if (args.action === "render") await requireImageModel(ctx, exec);
      const output = await bridge(
        {
          kind: "preparation-tool",
          sessionId: exec.agent.id,
          lease: state.lease,
          sourceText: state.sourceText ?? "",
          input: args,
        },
        AbortSignal.any([exec.signal, AbortSignal.timeout(90000)]),
      );
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
