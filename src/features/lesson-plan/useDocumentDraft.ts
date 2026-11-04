import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentRecord, RichDocument } from "../../domain/document";
import {
  savePreparationDocument,
  PreparationApiError,
} from "../../services/preparationApi";

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
interface DraftState {
  id: string;
  revision: number;
  content: RichDocument;
  savedContent: string;
  error: string;
  conflict: boolean;
  pending?: {
    expectedRevision: number;
    operationId: string;
    content: RichDocument;
  };
  inFlight?: Promise<boolean>;
}
export function useDocumentDraft(
  preparationId: string,
  document: DocumentRecord,
  onSaved: (document: DocumentRecord) => void,
) {
  const make = (value: DocumentRecord): DraftState => ({
    id: value.id,
    revision: value.revision,
    content: value.content,
    savedContent: JSON.stringify(value.content),
    error: "",
    conflict: false,
  });
  const current = useRef<DraftState>(make(document));
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  const [content, setContent] = useState(document.content),
    [saveState, setSaveState] = useState<SaveState>("saved"),
    [error, setError] = useState("");
  const [change, setChange] = useState(0);
  useEffect(() => {
    const state = current.current;
    if (state.id !== document.id) {
      current.current = make(document);
      setContent(document.content);
      setSaveState("saved");
      setError("");
      return;
    }
    if (document.revision <= state.revision) return;
    if (JSON.stringify(state.content) !== state.savedContent || state.pending) {
      state.conflict = true;
      state.error =
        "这份教案已在别处修改。你的输入仍保留，请先下载草稿或核对最新版，不能直接覆盖。";
      setSaveState("conflict");
      setError(state.error);
      return;
    }
    state.revision = document.revision;
    state.content = document.content;
    state.savedContent = JSON.stringify(document.content);
    setContent(document.content);
    setSaveState("saved");
    setError("");
  }, [document.id, document.revision]);
  const update = useCallback((next: RichDocument) => {
    const state = current.current;
    state.content = next;
    setContent(next);
    setChange((value) => value + 1);
    if (!state.error && !state.inFlight)
      setSaveState(
        JSON.stringify(next) === state.savedContent ? "saved" : "dirty",
      );
  }, []);
  const flush = useCallback(async (): Promise<boolean> => {
    const state = current.current;
    if (state.conflict) return false;
    if (state.inFlight) return state.inFlight;
    if (!state.pending && JSON.stringify(state.content) === state.savedContent)
      return true;
    state.error = "";
    setError("");
    setSaveState("saving");
    const save = async (): Promise<boolean> => {
      // An unknown response is retried with the exact original operation before newer edits.
      while (
        state.pending ||
        JSON.stringify(state.content) !== state.savedContent
      ) {
        if (current.current !== state) return false;
        state.pending ??= {
          expectedRevision: state.revision,
          operationId: crypto.randomUUID(),
          content: state.content,
        };
        const operation = state.pending;
        try {
          const saved = await savePreparationDocument(
            preparationId,
            state.id,
            operation,
          );
          if (current.current !== state) return false;
          state.revision = saved.revision;
          state.savedContent = JSON.stringify(operation.content);
          state.pending = undefined;
          savedCallback.current(saved);
        } catch (cause) {
          state.conflict =
            cause instanceof PreparationApiError && cause.status === 409;
          state.error =
            cause instanceof Error
              ? cause.message
              : "保存未完成，输入仍保留，请重试。";
          if (current.current === state) {
            setError(state.error);
            setSaveState(state.conflict ? "conflict" : "error");
          }
          return false;
        }
      }
      if (current.current === state) setSaveState("saved");
      return true;
    };
    state.inFlight = save();
    try {
      return await state.inFlight;
    } finally {
      state.inFlight = undefined;
    }
  }, [preparationId]);
  useEffect(() => {
    if (!change || current.current.error || current.current.conflict) return;
    const timer = setTimeout(() => void flush(), 900);
    return () => clearTimeout(timer);
  }, [change, flush]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      const state = current.current;
      if (
        state.pending ||
        JSON.stringify(state.content) !== state.savedContent
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, []);
  const dirty = () =>
    Boolean(
      current.current.pending ||
        JSON.stringify(current.current.content) !==
          current.current.savedContent,
    );
  const useLatest = () => {
    current.current = make(document);
    setContent(document.content);
    setSaveState("saved");
    setError("");
  };
  const downloadRecovery = () => {
    const file = new Blob(
      [
        JSON.stringify(
          {
            title: document.title,
            revision: current.current.revision,
            content: current.current.content,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(file),
      anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${document.title}-未保存草稿.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return {
    content,
    update,
    flush,
    saveState,
    error,
    dirty,
    downloadRecovery,
    useLatest,
    getRevision: () => current.current.revision,
  };
}
