import type { DocumentRecord, RichDocument } from "../../domain/document";

export interface DocumentSaveOperation {
  expectedRevision: number;
  operationId: string;
  content: RichDocument;
}
export interface DocumentDraftSnapshot {
  content: RichDocument;
  revision: number;
  saveState: "saved" | "dirty" | "saving" | "error" | "conflict";
  error: string;
  dirty: boolean;
}
/** The same save queue handles toolbar edits, AI changes and an unknown network result. */
export class DocumentDraft {
  private savedContent: string;
  private pending?: DocumentSaveOperation;
  private inFlight?: Promise<boolean>;
  private listeners = new Set<() => void>();
  private snapshot: DocumentDraftSnapshot;
  constructor(
    document: DocumentRecord,
    private save: (operation: DocumentSaveOperation) => Promise<DocumentRecord>,
    private onSaved: (document: DocumentRecord) => void,
  ) {
    this.savedContent = JSON.stringify(document.content);
    this.snapshot = {
      content: document.content,
      revision: document.revision,
      saveState: "saved",
      error: "",
      dirty: false,
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(change: Partial<DocumentDraftSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    this.snapshot.dirty = Boolean(
      this.pending ||
        JSON.stringify(this.snapshot.content) !== this.savedContent,
    );
    for (const listener of this.listeners) listener();
  }
  update = (content: RichDocument) => {
    const recoverable = this.snapshot.saveState === "error" && !this.pending;
    const changed = JSON.stringify(content) !== this.savedContent;
    this.publish({
      content,
      ...((recoverable ||
        ["saved", "dirty"].includes(this.snapshot.saveState)) &&
      !this.inFlight
        ? { saveState: changed ? "dirty" : "saved", error: "" }
        : {}),
    });
  };
  receive(document: DocumentRecord) {
    if (document.revision <= this.snapshot.revision) return;
    if (this.snapshot.dirty) {
      this.publish({
        saveState: "conflict",
        error:
          "这份教案已在别处修改。你的输入仍保留，请先下载草稿或核对最新版，不能直接覆盖。",
      });
    } else this.replace(document);
  }
  replace(document: DocumentRecord) {
    // Explicit recovery only; a remote refresh must never silently discard input.
    if (this.inFlight) return;
    this.pending = undefined;
    this.savedContent = JSON.stringify(document.content);
    this.publish({
      content: document.content,
      revision: document.revision,
      saveState: "saved",
      error: "",
    });
  }
  flush = (): Promise<boolean> => {
    if (this.snapshot.saveState === "conflict") return Promise.resolve(false);
    if (this.inFlight) return this.inFlight;
    if (!this.snapshot.dirty) return Promise.resolve(true);
    this.publish({ saveState: "saving", error: "" });
    this.inFlight = this.persist().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  };
  private async persist(): Promise<boolean> {
    while (
      this.pending ||
      JSON.stringify(this.snapshot.content) !== this.savedContent
    ) {
      if (this.snapshot.saveState === "conflict") return false;
      this.pending ??= {
        expectedRevision: this.snapshot.revision,
        operationId: crypto.randomUUID(),
        content: this.snapshot.content,
      };
      const operation = this.pending;
      try {
        const saved = await this.save(operation);
        const hasNewerEdits =
          JSON.stringify(this.snapshot.content) !==
          JSON.stringify(operation.content);
        this.pending = undefined;
        this.savedContent = JSON.stringify(saved.content);
        this.publish({
          revision: saved.revision,
          ...(!hasNewerEdits ? { content: saved.content } : {}),
        });
        this.onSaved(saved);
      } catch (cause) {
        const status =
          cause && typeof cause === "object" && "status" in cause
            ? Number(cause.status)
            : 0;
        // These responses explicitly rejected the write. The teacher can correct the content.
        // Timeouts/5xx are ambiguous: retry the original operation before sending newer edits.
        if ([400, 413, 422].includes(status)) this.pending = undefined;
        this.publish({
          saveState: status === 409 ? "conflict" : "error",
          error:
            cause instanceof Error
              ? cause.message
              : "保存未完成，输入仍保留，请重试。",
        });
        return false;
      }
    }
    if (this.snapshot.saveState === "conflict") return false;
    this.publish({ saveState: "saved", error: "" });
    return true;
  }
}
