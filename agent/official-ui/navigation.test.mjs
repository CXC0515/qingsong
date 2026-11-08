import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const realm = { AbortController, AbortSignal, setTimeout, clearTimeout };
vm.runInNewContext(
  await readFile(new URL("./navigation.js", import.meta.url), "utf8"),
  realm,
);
const { openContext, observeSelectedSession } = realm.QingsongAssistantNavigation;
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
      connectWorkspace:async(id)=>{calls.push("connect:"+id);return "s1";},
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
    openContext(f.ctx, { workspaceId: "w1", sessionId: "missing" }, {timeoutMs:30}),
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

test("a catalog pull already in flight is shared instead of duplicated", async () => {
  const f = fixture();
  f.workspaces.set({ items: [{ workspaceId: "w1" }], state: "idle" });
  let pulls = 0;
  f.ctx.sessions.refresh = async () => {
    pulls++;
    if (pulls === 1)
      f.sessions.set({ byId: { s1: { id: "s1" } }, phase: "ready" });
  };
  await openContext(f.ctx, { workspaceId: "w1", sessionId: "s1" });
  assert.equal(pulls, 1);
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

test("selected native session reports content readiness without exposing the session id", async () => {
  const f = fixture(), messages = [];
  f.sessions.set({ byId: { secretSessionId: { id: "secretSessionId", retainedBy: { mainView: 1 } } }, phase: "ready" });
  let resolveReady, released = 0;
  f.ctx.sessions.retain = (id, options) => {
    assert.equal(id, "secretSessionId");
    assert.ok(options.signal instanceof AbortSignal);
    return { ready: new Promise(resolve => { resolveReady = resolve; }), release: () => released++ };
  };
  const stop = observeSelectedSession(f.ctx, state => messages.push(state), { setInterval: () => 1, clearInterval: () => {} });
  assert.equal(messages[0].phase, "loading");
  resolveReady({ sessionId: "secretSessionId" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(messages.at(-1).phase, "ready");
  assert.ok(!JSON.stringify(messages).includes("secretSessionId"));
  assert.equal(released, 1);
  stop();
});

test("selected session changes cancel old observation and ignore late readiness", async () => {
  const f = fixture(), messages = [], pending = new Map(), releases = [];
  f.ctx.sessions.retain = (id, options) => {
    let resolve;
    const ready = new Promise(done => { resolve = done; });
    pending.set(id, { resolve, signal: options.signal });
    return { ready, release: () => releases.push(id) };
  };
  f.sessions.set({ byId: { first: { id: "first", retainedBy: { mainView: 1 } } }, phase: "ready" });
  const stop = observeSelectedSession(f.ctx, state => messages.push(state), { setInterval: () => 1, clearInterval: () => {} });
  f.sessions.set({ byId: { second: { id: "second", retainedBy: { mainView: 1 } } }, phase: "ready" });
  assert.equal(pending.get("first").signal.aborted, true);
  pending.get("first").resolve();
  pending.get("second").resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(messages.map(state => state.phase), ["loading", "loading", "ready"]);
  assert.deepEqual(releases, ["first", "second"]);
  stop();
});

test("selected session content rejection reports failure and releases its reference", async () => {
  const f = fixture(), messages = [];
  f.sessions.set({ byId: { s1: { id: "s1", retainedBy: { mainView: 1 } } }, phase: "ready" });
  let rejectReady, released = 0;
  f.ctx.sessions.retain = () => ({ ready: new Promise((_resolve, reject) => { rejectReady = reject; }), release: () => released++ });
  const stop = observeSelectedSession(f.ctx, state => messages.push(state), { setInterval: () => 1, clearInterval: () => {} });
  rejectReady(new Error("private underlying failure"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(messages.at(-1).phase, "error");
  assert.ok(!JSON.stringify(messages).includes("private underlying failure"));
  assert.equal(released, 1);
  stop();
});

test("stalled content stops ticking, can finish later, and releases on disposal", async () => {
  const f = fixture(), messages = [];
  let clock = 0, tick, resolveReady, cancelled = 0, released = 0;
  f.sessions.set({ byId: { s1: { id: 's1', retainedBy: { mainView: 1 } } }, phase: 'ready' });
  f.ctx.sessions.retain = () => ({ ready: new Promise(resolve => { resolveReady = resolve; }), release: () => released++ });
  const stop = observeSelectedSession(f.ctx, state => messages.push(state), { now: () => clock, setInterval: callback => { tick = callback; return 1; }, clearInterval: () => cancelled++ });
  clock = 15000; tick();
  assert.equal(messages.at(-1).phase, 'slow');
  clock = 45000; tick();
  assert.equal(messages.at(-1).phase, 'stalled');
  assert.equal(cancelled, 1);
  resolveReady();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(messages.at(-1).phase, 'ready');
  stop();
  assert.equal(released, 1);
  assert.equal(f.sessions.observers, 0);
});

test("retention notifications during a selection change cannot restart an old observation", () => {
  const f = fixture();
  const rows = id => ({ byId: { [id]: { id, retainedBy: { mainView: 1 } } }, phase: 'ready' });
  const retained = [];
  f.sessions.set(rows('first'));
  f.ctx.sessions.retain = id => {
    retained.push(id);
    f.sessions.set(f.sessions.getSnapshot());
    return { ready: new Promise(() => {}), release: () => f.sessions.set(f.sessions.getSnapshot()) };
  };
  const stop = observeSelectedSession(f.ctx, () => {}, { setInterval: () => 1, clearInterval: () => {} });
  f.sessions.set(rows('second'));
  assert.deepEqual(retained, ['first', 'second']);
  stop();
});

test("workspace entry reuses DSH current member and adds no ownership check",async()=>{const f=fixture();f.workspaces.set({items:[{workspaceId:"w1",sessionIds:["s1"]}],state:"idle"});f.sessions.set({byId:{s1:{id:"s1",retainedBy:{mainView:1}}},phase:"ready"});const result=await openContext(f.ctx,{workspaceId:"w1"});assert.equal(result.sessionId,"s1");assert.ok(!f.calls.includes("connect:w1"));});
test("empty workspace entry uses native connect and preserves draft",async()=>{const f=fixture();f.workspaces.set({items:[{workspaceId:"w1",sessionIds:[]}],state:"idle"});const result=await openContext(f.ctx,{workspaceId:"w1",instruction:"修改建议如下："});assert.equal(result.sessionId,"s1");assert.ok(f.calls.includes("connect:w1"));assert.ok(f.calls.includes("draft:修改建议如下："));});

test('returning to preparation reopens the existing native conversation without creating a blank',async()=>{
 const f=fixture();f.workspaces.set({items:[{workspaceId:'w1',sessionIds:['s1']}],state:'idle'});f.sessions.set({byId:{s1:{id:'s1',retainedBy:{mainView:0}}},phase:'ready'});
 const result=await openContext(f.ctx,{workspaceId:'w1'});assert.equal(result.sessionId,'s1');assert.ok(!f.calls.includes('connect:w1'));assert.ok(f.calls.includes('open:s1'));
});

test('ready catalog without a target row waits for the asynchronously projected creation',async()=>{
 const f=fixture();f.workspaces.set({items:[{workspaceId:'w1',sessionIds:[]}],state:'idle',phase:'ready'});
 f.ctx.sessions.refresh=async()=>{};
 f.ctx.uiWorkspace.connectWorkspace=async()=>{setTimeout(()=>f.sessions.set({phase:'ready',byId:{s1:{id:'s1'}}}),15);return 's1';};
 const result=await openContext(f.ctx,{workspaceId:'w1'},{timeoutMs:500});
 assert.equal(result.sessionId,'s1');assert.ok(f.calls.includes('open:s1'));
});
test('archived selected sessions are not restored as the preparation current conversation',async()=>{
 const f=fixture();f.workspaces.set({items:[{workspaceId:'w1',sessionIds:['s1','old']}],archivedSessionIds:['old'],phase:'ready'});
 f.sessions.set({phase:'ready',byId:{old:{id:'old',retainedBy:{mainView:1},updatedAt:99},s1:{id:'s1',updatedAt:1}}});
 assert.equal((await openContext(f.ctx,{workspaceId:'w1'})).sessionId,'s1');
});

test('known workspace membership waits for its row instead of creating a new conversation', async () => {
 const f=fixture();
 f.workspaces.set({items:[{workspaceId:'w1',sessionIds:['s1']}],phase:'ready'});
 f.ctx.sessions.refresh=async()=>{};
 const pending=openContext(f.ctx,{workspaceId:'w1'},{timeoutMs:500});
 setTimeout(()=>f.sessions.set({phase:'ready',byId:{s1:{id:'s1'}}}),15);
 assert.equal((await pending).sessionId,'s1');
 assert.ok(!f.calls.includes('connect:w1'));
 assert.ok(f.calls.includes('open:s1'));
});
