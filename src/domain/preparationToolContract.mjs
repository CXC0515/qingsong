/** One contract for model documentation and executable validation. */
const text = (max, min = 0) => ({
  type: "string",
  maxLength: max,
  minLength: min,
});
const uuid = { type: "string", format: "uuid" };
const integer = (min, max) => ({
  type: "number",
  integer: true,
  minimum: min,
  maximum: max,
});
export const preparationActions = {
  begin: { referenceId: {...uuid, optional:true}, stage: { ...text(80), default: "准备资料" } },
  progress: {
    taskId: uuid,
    stage: text(80),
    message: { ...text(1000), optional: true },
  },
  propose: {
    taskId: uuid,
    baseRevision: integer(1, Number.MAX_SAFE_INTEGER),
    content: text(400000, 1),
    summary: { ...text(2000, 1), trim: true },
    operationId: uuid,
  },
  finish: {
    taskId: uuid,
    status: { type: "string", enum: ["completed", "needs-input", "failed"] },
    message: text(2000),
  },
  render: {
    referenceId: {...uuid, optional:true},
    sourceId: uuid,
    start: { ...integer(1, Number.MAX_SAFE_INTEGER), default: 1 },
    limit: { ...integer(1, 3), default: 1 },
  },
  status: { taskId: { ...uuid, optional: true } },
};
export class PreparationContractError extends Error {
  constructor(issues) {
    super(
      "备课参数有误：" +
        issues.map((i) => i.field + " " + i.problem).join("；") +
        "。本次操作未执行，已有内容保留。",
    );
    this.code = "INVALID_PREPARATION_INPUT";
    this.issues = issues;
    this.recovery = "correct_arguments";
    this.nextAction = "按issues修正当前动作参数后再调用，不要原样重试。";
  }
}
export function parsePreparationInput(input) {
  const action = input?.action,
    fields = Object.hasOwn(preparationActions, action ?? "")
      ? preparationActions[action]
      : undefined,
    issues = [];
  if (!fields)
    throw new PreparationContractError([
      {
        field: "action",
        problem: "必须是 " + Object.keys(preparationActions).join("/"),
      },
    ]);
  const result = { action };
  for (const key of Object.keys(input))
    if (key !== "action" && !Object.hasOwn(fields, key))
      issues.push({ field: action + "." + key, problem: "此动作不接受该字段" });
  for (const [key, spec] of Object.entries(fields)) {
    let value = input[key] ?? (input[key] === null ? null : spec.default),
      field = action + "." + key;
    if (value === undefined) {
      if (!spec.optional) issues.push({ field, problem: "缺少必填字段" });
      continue;
    }
    if (typeof value !== spec.type) {
      issues.push({ field, problem: "类型应为 " + spec.type });
      continue;
    }
    if (spec.trim) value=value.trim();
    if (spec.enum && !spec.enum.includes(value))
      issues.push({ field, problem: "允许 " + spec.enum.join("/") });
    if (
      spec.type === "string" &&
      (value.length < (spec.minLength ?? 0) ||
        value.length > (spec.maxLength ?? Infinity))
    )
      issues.push({ field, problem: "长度不符合要求" });
    if (
      spec.format === "uuid" &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    )
      issues.push({ field, problem: "必须是有效UUID" });
    if (
      spec.integer &&
      (!Number.isSafeInteger(value) ||
        value < spec.minimum ||
        value > spec.maximum)
    )
      issues.push({
        field,
        problem: "整数范围 " + spec.minimum + "—" + spec.maximum,
      });
    result[key] = value;
  }
  if (issues.length) throw new PreparationContractError(issues);
  return result;
}
export function preparationToolParameters() {
  const parameters = {
    action: {
      type: "string",
      enum: Object.keys(preparationActions),
      required: true,
      description: "每次只调用一种动作，只传该动作列出的字段。" + Object.entries(preparationActions).map(([action, fields]) => {
        const required = Object.entries(fields).filter(([, spec]) => !spec.optional && !Object.hasOwn(spec, "default")).map(([key]) => key);
        const optional = Object.entries(fields).filter(([, spec]) => spec.optional || Object.hasOwn(spec, "default")).map(([key]) => key);
        return action + "必填：" + (required.join("、") || "无") + "；可选/默认：" + (optional.join("、") || "无");
      }).join("。"),
    },
  };
  for (const [action, fields] of Object.entries(preparationActions))
    for (const [key, spec] of Object.entries(fields)) {
      const native = parameters[key] ?? {
        type: spec.type,
        ...(spec.enum ? { enum: spec.enum } : {}),
      };
      native.description = [
        native.description,
        action +
          "：" +
          (spec.optional || Object.hasOwn(spec, "default") ? "可选" : "必填") +
          (spec.format ? "，" + spec.format : "") +
          (spec.maxLength ? "，最多" + spec.maxLength + "字符" : "") +
          (spec.integer ? "，整数" + spec.minimum + "—" + spec.maximum : "") +
          (Object.hasOwn(spec, "default") ? "，默认" + spec.default : ""),
      ]
        .filter(Boolean)
        .join("；");
      parameters[key] = native;
    }
  parameters.content.description +=
    "；完整Tiptap JSON字符串，保留范围外内容及稳定id，图片仅复用assetId";
  parameters.operationId.description += "；同一次候选重试必须复用，不得换号";
  return parameters;
}
