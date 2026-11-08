/* Shared by the injected browser client and the deterministic navigation tests. */
(function (global) {
  const sessionRefreshes = new WeakMap();
  function refreshSessions(ctx, signal) {
    let pending = sessionRefreshes.get(ctx.sessions);
    if (!pending) {
      pending = Promise.resolve().then(() => ctx.sessions.refresh()).finally(() => {
        if (sessionRefreshes.get(ctx.sessions) === pending) sessionRefreshes.delete(ctx.sessions);
      });
      sessionRefreshes.set(ctx.sessions, pending);
    }
    return abortable(pending, signal);
  }
  class NavigationError extends Error {
    constructor(stage, cause) {
      super("Assistant navigation failed: " + stage, { cause });
      this.name = "QingsongNavigationError";
      this.stage = stage;
    }
  }
  function abortable(operation, signal) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const stop = () => reject(signal.reason);
      signal.addEventListener("abort", stop, { once: true });
      Promise.resolve(operation)
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", stop));
    });
  }
  function waitFor(source, select, signal) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {},
        settled = false;
      const settle = (action, value) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        signal.removeEventListener("abort", stop);
        action(value);
      };
      const stop = () => settle(reject, signal.reason);
      const inspect = () => {
        try {
          const value = select(source.getSnapshot());
          if (value !== undefined) settle(resolve, value);
        } catch (error) {
          settle(reject, error);
        }
      };
      signal.addEventListener("abort", stop, { once: true });
      unsubscribe = source.subscribe(inspect);
      if (settled) unsubscribe();
      else inspect();
    });
  }
  async function openContext(
    ctx,
    target,
    { signal: callerSignal, timeoutMs = 22000, onStage = () => {}, onTiming = () => {} } = {},
  ) {
    const controller = new AbortController();
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, controller.signal])
      : controller.signal;
    const now = () => global.performance?.now() ?? Date.now();
    const started = now();
    let stageStarted = started;
    const timings = [];
    let stage = "workspace-directory";
    const measure = () => {
      const finished = now();
      const timing = { stage, durationMs: Math.round(finished - stageStarted) };
      timings.push(timing);
      onTiming(timing);
      stageStarted = finished;
    };
    const timer = setTimeout(
      () => controller.abort(new NavigationError(stage)),
      timeoutMs,
    );
    const changeStage = (value) => {
      if (value !== stage) measure();
      stage = value;
      onStage(value);
      signal.throwIfAborted();
    };
    try {
      if (typeof target?.workspaceId !== "string" || !target.workspaceId)
        throw new NavigationError("target");
      changeStage("workspace-directory");
      await waitFor(
        ctx.workspaces.list,
        (snapshot) => {
          const workspace = snapshot.items.find(
            (item) => item.workspaceId === target.workspaceId,
          );
          if (workspace) return workspace;
          if (snapshot.state === "error") throw new NavigationError(stage);
        },
        signal,
      );
      if (target.sessionId) {
        changeStage("session-directory");
        // Host-created sessions are not safe to retain until the native catalog knows them.
        if (!ctx.sessions.list.getSnapshot().byId[target.sessionId])
          await refreshSessions(ctx, signal);
        await waitFor(
          ctx.sessions.list,
          (snapshot) => {
            const session = snapshot.byId[target.sessionId];
            if (session) return session;
            if (snapshot.state === "error")
              throw new NavigationError(stage);
          },
          signal,
        );
        changeStage("session-content");
        const reference = ctx.sessions.retain(target.sessionId, {
          source: "qingsong-preparation",
          signal,
        });
        try {
          const binding = await abortable(reference.ready, signal);
          changeStage("session-navigation");
          ctx.uiWorkspace.openSession(target.sessionId);
          signal.throwIfAborted();
          if (target.instruction) {
            changeStage("draft");
            ctx.conversation.input.requestDraftInitialization(binding, {
              prompt: target.instruction,
              whenDraftExists: "keep",
            });
          }
          measure();
          return {
            timings, totalMs: Math.round(now() - started),
            preparationId: target.preparationId, documentId: target.documentId,
            workspaceId: target.workspaceId,
            sessionId: target.sessionId,
          };
        } finally {
          reference.release();
        }
      }
      changeStage("workspace-navigation");
      // Workspace membership and the Session projection arrive on separate streams.
      // A ready catalog is not proof that a particular membership row has arrived.
      await waitFor(ctx.sessions.list, snapshot => snapshot.phase === 'ready' ? true : undefined, signal);
      let workspace = ctx.workspaces.list.getSnapshot().items.find(item => item.workspaceId === target.workspaceId);
      let listed = ctx.sessions.list.getSnapshot().byId ?? {};
      if ((workspace.sessionIds ?? []).some(id => !listed[id])) {
        await refreshSessions(ctx, signal);
        workspace = ctx.workspaces.list.getSnapshot().items.find(item => item.workspaceId === target.workspaceId);
        listed = ctx.sessions.list.getSnapshot().byId ?? {};
      }
      const archived = ctx.workspaces.list.getSnapshot().archivedSessionIds ?? [];
      const members = (workspace.sessionIds ?? []).filter(id => !archived.includes(id));
      const selected = Object.values(listed).find(row => (row.retainedBy?.mainView ?? 0) > 0 && members.includes(row.id));
      let remembered;
      try { remembered = JSON.parse(global.sessionStorage?.getItem('qingsong:last-workspace-session') ?? '{}')[target.workspaceId]; } catch {}
      const previous = members.includes(remembered) ? remembered :
        members.slice().sort((a,b) => (listed[b]?.updatedAt ?? 0) - (listed[a]?.updatedAt ?? 0))[0];
      const sessionId = selected?.id ?? previous ?? await abortable(ctx.uiWorkspace.connectWorkspace(target.workspaceId,{agentPreset:"qingsong"}),signal);
      return await openContext(ctx,{...target,sessionId},{signal,timeoutMs,onStage,onTiming});
    } catch (error) {
      if (callerSignal?.aborted) throw callerSignal.reason;
      throw error instanceof NavigationError
        ? error
        : new NavigationError(stage, error);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  function observeSelectedSession(ctx, onState, options = {}) {
    const now = options.now ?? (() => global.performance?.now() ?? Date.now());
    const schedule = options.setInterval ?? global.setInterval;
    const cancel = options.clearInterval ?? global.clearInterval;
    const intervalMs = options.intervalMs ?? 1000;
    const slowAfterMs = options.slowAfterMs ?? 15000;
    const stalledAfterMs = options.stalledAfterMs ?? 45000;
    let current;
    let disposed = false;
    let inspecting = false;

    const release = record => {
      if (record.settled) return;
      record.settled = true;
      cancel(record.timer);
      record.controller.abort();
      record.reference?.release();
      record.reference = undefined;
    };
    const finish = (record, phase) => {
      if (disposed || current !== record || record.settled) return;
      const durationMs = Math.max(0, Math.round(now() - record.started));
      release(record);
      onState({ phase, durationMs });
    };
    const inspect = () => {
      if (disposed || inspecting) return;
      inspecting = true;
      try {
      const sessionId = Object.values(ctx.sessions.list.getSnapshot().byId ?? {})
        .find(row => (row.retainedBy?.mainView ?? 0) > 0)?.id;
      if (sessionId === current?.sessionId) return;
      if (current) release(current);
      current = undefined;
      if (!sessionId) {
        onState({ phase: 'empty', durationMs: 0 });
        return;
      }
      const workspace=ctx.workspaces?.list.getSnapshot().items.find(item=>item.sessionIds?.includes(sessionId));
      if(workspace)try{const saved=JSON.parse(global.sessionStorage?.getItem('qingsong:last-workspace-session')??'{}');saved[workspace.workspaceId]=sessionId;global.sessionStorage?.setItem('qingsong:last-workspace-session',JSON.stringify(saved));}catch{}

      const record = { sessionId, controller: new AbortController(), started: now(), reference: undefined, timer: undefined, settled: false };
      current = record;
      const elapsed = () => Math.max(0, Math.round(now() - record.started));
      onState({ phase: 'loading', durationMs: 0 });
      record.timer = schedule(() => {
        if (current !== record || record.settled) return;
        const durationMs = elapsed();
        onState({ phase: durationMs >= stalledAfterMs ? 'stalled' : durationMs >= slowAfterMs ? 'slow' : 'loading', durationMs });
        if (durationMs >= stalledAfterMs) cancel(record.timer);
      }, intervalMs);
      try {
        record.reference = ctx.sessions.retain(sessionId, {
          source: 'qingsong-session-observer',
          signal: record.controller.signal,
        });
        Promise.resolve(record.reference.ready).then(
          () => finish(record, 'ready'),
          () => finish(record, 'error'),
        );
      } catch {
        finish(record, 'error');
      }
      } finally { inspecting = false; }
    };

    const unsubscribe = ctx.sessions.list.subscribe(inspect);
    inspect();
    return () => {
      disposed = true;
      unsubscribe();
      if (current) release(current);
      current = undefined;
    };
  }
  global.QingsongAssistantNavigation = Object.freeze({
    openContext,
    observeSelectedSession,
    NavigationError,
  });
})(globalThis);
