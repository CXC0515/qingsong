import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const realm = { AbortController, AbortSignal, setTimeout, clearTimeout };
vm.runInNewContext(
  await readFile(new URL("./navigation.js", import.meta.url), "utf8"),
  realm,
);
const { openContext } = realm.QingsongAssistantNavigation;
function source(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      state = next;
      listeners.forEach((listener) => listener());
    },
    get observers() {
      return listeners.size;
    },
  };
}
function fixture() {
  const workspaces = source({ items: [], state: "idle", phase: "ready" }),
    sessions = source({ byId: {}, phase: "ready" }),
    calls = [];
  const ctx = {
    workspaces: { list: workspaces },
    sessions: {
      list: sessions,
      refresh: async () => {
        calls.push("refresh");
        sessions.set({ byId: { s1: { id: "s1" } }, phase: "ready" });
      },
      retain: (id, options) => {
        assert.ok(
          sessions.getSnapshot().byId[id],
          "must catalog before retain",
        );
        calls.push("retain:" + id);
        return {
          ready: Promise.resolve({ sessionId: id }),
          release: () => calls.push("release:" + id),
        };
      },
    },
    uiWorkspace: {
      openSession: (id) => calls.push("open:" + id),
      openWorkspace: async (id) => calls.push("workspace:" + id),
    },
    conversation: {
      input: {
        requestDraftInitialization: (binding, options) => {
          assert.equal(options.whenDraftExists, "keep");
          calls.push("draft:" + options.prompt);
        },
      },
    },
  };
  return { ctx, workspaces, sessions, calls };
}
test("host-created workspace and session arrive before retain/navigation, preserving existing drafts", async () => {
  const f = fixture(),
    opening = openContext(
      f.ctx,
      { workspaceId: "w1", sessionId: "s1", instruction: "完善当前表格" },
      { timeoutMs: 1000 },
    );
  assert.deepEqual(f.calls, []);
  f.workspaces.set({
    items: [{ workspaceId: "w1" }],
    state: "idle",
    phase: "ready",
  });
  const result = await opening;
  assert.equal(result.sessionId, "s1");
  assert.deepEqual(f.calls, [
    "refresh",
    "retain:s1",
    "open:s1",
    "draft:完善当前表格",
    "release:s1",
  ]);
  assert.equal(f.workspaces.observers, 0);
  assert.equal(f.sessions.observers, 0);
});
test("failed native refresh cannot masquerade as a loaded target and never opens a blank fallback", async () => {
  const f = fixture();
  f.workspaces.set({ items: [{ workspaceId: "w1" }], state: "idle" });
  f.ctx.sessions.refresh = async () => {};
  await assert.rejects(
    openContext(f.ctx, { workspaceId: "w1", sessionId: "missing" }),
    (error) => error.stage === "session-directory",
  );
  assert.ok(
    !f.calls.some(
      (call) => call.startsWith("workspace:") || call.startsWith("open:"),
    ),
  );
});
test("cancelling an old target releases its listener and cannot replace a newer selection", async () => {
  const f = fixture(),
    cancel = new AbortController();
  const old = openContext(
    f.ctx,
    { workspaceId: "old", sessionId: "s1" },
    { signal: cancel.signal, timeoutMs: 1000 },
  );
  cancel.abort();
  await assert.rejects(old, (error) => error.name === "AbortError");
  f.workspaces.set({ items: [{ workspaceId: "w1" }], state: "idle" });
  await openContext(f.ctx, { workspaceId: "w1", sessionId: "s1" });
  assert.ok(!f.calls.includes("workspace:old"));
  assert.equal(f.workspaces.observers, 0);
});
test("cancel during session readiness releases its reference and never navigates", async () => {
  const f = fixture(),
    cancel = new AbortController();
  f.workspaces.set({ items: [{ workspaceId: "w1" }], state: "idle" });
  let ready;
  const waiting = new Promise((resolve) => (ready = resolve));
  f.ctx.sessions.retain = () => ({
    ready: waiting,
    release: () => f.calls.push("released"),
  });
  const pending = openContext(
    f.ctx,
    { workspaceId: "w1", sessionId: "s1" },
    { signal: cancel.signal },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  cancel.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  ready({ sessionId: "s1" });
  assert.deepEqual(f.calls, ["refresh", "released"]);
});
test("workspace follow errors and timeouts expose the failing phase and clean subscriptions", async () => {
  const f = fixture();
  await assert.rejects(
    openContext(f.ctx, { workspaceId: "w1" }, { timeoutMs: 5 }),
    (error) => error.stage === "workspace-directory",
  );
  assert.equal(f.workspaces.observers, 0);
  f.workspaces.set({ items: [], state: "error" });
  await assert.rejects(
    openContext(f.ctx, { workspaceId: "w1" }),
    (error) => error.stage === "workspace-directory",
  );
  assert.equal(f.workspaces.observers, 0);
});

test("a catalog pull already in flight before host creation is followed by a fresh pull", async () => {
  const f = fixture();
  f.workspaces.set({ items: [{ workspaceId: "w1" }], state: "idle" });
  let pulls = 0;
  f.ctx.sessions.refresh = async () => {
    pulls++;
    if (pulls === 2)
      f.sessions.set({ byId: { s1: { id: "s1" } }, phase: "ready" });
  };
  await openContext(f.ctx, { workspaceId: "w1", sessionId: "s1" });
  assert.equal(pulls, 2);
  assert.ok(f.calls.includes("open:s1"));
});

test("the native web plugin injects the tested helper before client activation", async () => {
  const { apply } = await import("./index.mjs");
  let inject;
  const rows = [];
  apply({
    on: (name, fn) => {
      assert.equal(name, "webserver/index-inject");
      inject = fn;
    },
  });
  inject(rows);
  const script = rows.find((row) => row.kind === "script");
  assert.equal(script.placement, "head");
  assert.equal(
    script.text,
    await readFile(new URL("./navigation.js", import.meta.url), "utf8"),
  );
  assert.ok(!script.text.toLowerCase().includes("</script"));
});


test("known sessions skip catalog RPC but still await content and report timings", async () => {
  const f = fixture();
  f.workspaces.set({ items: [{ workspaceId: "w1" }], state: "idle" });
  f.sessions.set({ byId: { s1: { id: "s1" } }, phase: "ready" });
  f.ctx.sessions.refresh = () => { throw new Error("redundant catalog request"); };
  const timings = [];
  const result = await openContext(f.ctx, { workspaceId: "w1", sessionId: "s1" }, {
    onTiming: timing => timings.push(timing),
  });
  assert.deepEqual(f.calls, ["retain:s1", "open:s1", "release:s1"]);
  assert.deepEqual(timings.map(t => t.stage), ["workspace-directory", "session-directory", "session-content", "session-navigation"]);
  assert.ok(timings.every(t => Number.isFinite(t.durationMs) && t.durationMs >= 0));
  assert.ok(result.totalMs >= 0);
});
