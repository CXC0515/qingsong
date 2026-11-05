import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { preparationTool } from "./official-preparation.mjs";
import { ReadToolFailure } from "./tool-contract-recovery.mjs";
const fixture = (bridge) => {
  const state = {
    queries: 0,
    budget: { queries: 20 },
    preparationContext: {},
    lease: "fixture:turn",
  };
  const tool = preparationTool({}, bridge, new Map([["fixture", state]]));
  const execute = (args) =>
    tool.execute(args, {
      agent: { id: "fixture" },
      callId: randomUUID(),
      signal: new AbortController().signal,
    });
  return { state, execute };
};
test("missing fields and equivalent repeated bad parameters never reach the bridge", async () => {
  let calls = 0;
  const { execute } = fixture(async () => {
    calls++;
  });
  const args = {
    action: "propose",
    taskId: randomUUID(),
    baseRevision: 1,
    content: "{}",
    operationId: randomUUID(),
  };
  await assert.rejects(execute(args), (e) =>
    e.failure.issues.some((i) => i.field === "propose.summary"),
  );
  await assert.rejects(
    execute(Object.fromEntries(Object.entries(args).reverse())),
    (e) => e.code === "REPEATED_TOOL_FAILURE",
  );
  assert.equal(calls, 0);
});
test("lost proposal response is reconciled by status without a second write", async () => {
  const args = {
      action: "propose",
      taskId: randomUUID(),
      baseRevision: 1,
      content: "{}",
      summary: "摘要",
      operationId: randomUUID(),
    },
    calls = [];
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        args.taskId,
        args.baseRevision,
        args.content,
        args.summary,
        args.operationId,
      ]),
    )
    .digest("hex");
  const { execute } = fixture(async (body) => {
    calls.push(body.input.action);
    if (body.input.action === "propose") throw Error("connection lost");
    return {
      taskId: args.taskId,
      proposalId: "saved",
      verification: {
        verified: true,
        submission: { operationId: args.operationId, fingerprint },
      },
    };
  });
  const result = JSON.parse(await execute(args));
  assert.equal(result.result.proposalId, "saved");
  assert.deepEqual(calls, ["propose", "status"]);
});
test("unconfirmed outcome stops further writes but permits status", async () => {
  const calls = [];
  const { execute } = fixture(async (body) => {
    calls.push(body.input.action);
    if (body.input.action === "status")
      return { verification: { verified: true, taskFound: false } };
    throw Error("connection lost");
  });
  await assert.rejects(
    execute({ action: "begin" }),
    (e) => e.code === "PREPARATION_OUTCOME_UNKNOWN",
  );
  await assert.rejects(
    execute({ action: "begin", stage: "换个阶段" }),
    (e) => e.code === "PREPARATION_OUTCOME_UNKNOWN",
  );
  const status = JSON.parse(await execute({ action: "status" }));
  assert.equal(status.result.verification.taskFound, false);
  assert.deepEqual(calls, ["begin", "status", "status"]);
});
test("permission stop is not retried or replaced by status", async () => {
  const calls = [];
  const { execute } = fixture(async (body) => {
    calls.push(body.input.action);
    throw new ReadToolFailure({
      code: "ACCESS_DENIED",
      message: "权限失效",
      recovery: "stop",
    });
  });
  await assert.rejects(
    execute({ action: "begin" }),
    (e) => e.code === "ACCESS_DENIED",
  );
  await assert.rejects(
    execute({ action: "begin", stage: "新阶段" }),
    (e) => e.code === "ACCESS_DENIED",
  );
  assert.deepEqual(calls, ["begin"]);
});
