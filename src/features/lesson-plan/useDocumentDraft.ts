import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { DocumentRecord } from "../../domain/document";
import { savePreparationDocument } from "../../services/preparationApi";
import { DocumentDraft } from "./documentDraft";

export function useDocumentDraft(
  preparationId: string,
  document: DocumentRecord,
  onSaved: (document: DocumentRecord) => void,
) {
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  const draft = useMemo(
    () =>
      new DocumentDraft(
        document,
        (operation) =>
          savePreparationDocument(preparationId, document.id, operation),
        (next) => savedCallback.current(next),
      ),
    [preparationId, document.id],
  );
  const state = useSyncExternalStore(
    draft.subscribe,
    draft.getSnapshot,
    draft.getSnapshot,
  );
  useEffect(() => {
    draft.receive(document);
  }, [draft, document.revision]);
  useEffect(() => {
    if (state.saveState !== "dirty") return;
    const timer = setTimeout(() => void draft.flush(), 900);
    return () => clearTimeout(timer);
  }, [draft, state.content, state.saveState]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (draft.getSnapshot().dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [draft]);
  const downloadRecovery = () => {
    const current = draft.getSnapshot();
    const file = new Blob(
      [
        JSON.stringify(
          {
            title: document.title,
            revision: current.revision,
            content: current.content,
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
    ...state,
    update: draft.update,
    flush: draft.flush,
    dirty: () => draft.getSnapshot().dirty,
    useLatest: () => draft.replace(document),
    downloadRecovery,
    getRevision: () => draft.getSnapshot().revision,
  };
}
