/* Shared by the injected browser client and the deterministic navigation tests. */
(function (global) {
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
    { signal: callerSignal, timeoutMs = 22000, onStage = () => {} } = {},
  ) {
    const controller = new AbortController();
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, controller.signal])
      : controller.signal;
    let stage = "workspace-directory";
    const timer = setTimeout(
      () => controller.abort(new NavigationError(stage)),
      timeoutMs,
    );
    const changeStage = (value) => {
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
        await abortable(ctx.sessions.refresh(), signal);
        // A first refresh may have joined an older in-flight pull that began before Host creation.
        if (!ctx.sessions.list.getSnapshot().byId[target.sessionId])
          await abortable(ctx.sessions.refresh(), signal);
        await waitFor(
          ctx.sessions.list,
          (snapshot) => {
            const session = snapshot.byId[target.sessionId];
            if (session) return session;
            if (snapshot.state === "error" || snapshot.phase === "ready")
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
              whenDraftExists: "append",
            });
          }
          return {
            workspaceId: target.workspaceId,
            sessionId: target.sessionId,
          };
        } finally {
          reference.release();
        }
      }
      changeStage("workspace-navigation");
      await abortable(
        ctx.uiWorkspace.openWorkspace(target.workspaceId, undefined, {
          agentPreset: "qingsong",
        }),
        signal,
      );
      signal.throwIfAborted();
      return { workspaceId: target.workspaceId };
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
  global.QingsongAssistantNavigation = Object.freeze({
    openContext,
    NavigationError,
  });
})(globalThis);
