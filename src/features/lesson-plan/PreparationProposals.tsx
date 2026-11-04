import { useState } from "react";
import { Check, X } from "lucide-react";
import { GlassButton } from "../../components/glass/Glass";
import DocumentEditor from "../../components/document/DocumentEditor";
import type { DocumentRecord } from "../../domain/document";
import type { DocumentProposal } from "../../domain/preparation";
import {
  applyDocumentProposal,
  discardDocumentProposal,
} from "../../services/preparationApi";

export default function PreparationProposals({
  preparationId,
  document,
  proposals,
  beforeMutation,
  onChanged,
  onError,
}: {
  preparationId: string;
  document: DocumentRecord;
  proposals: DocumentProposal[];
  beforeMutation: () => Promise<boolean>;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(""),
    [expanded, setExpanded] = useState("");
  const pending = proposals.filter(
    (proposal) =>
      proposal.documentId === document.id && proposal.status === "pending",
  );
  const apply = async (proposal: DocumentProposal) => {
    if (!(await beforeMutation())) return;
    setBusy(proposal.id);
    try {
      await applyDocumentProposal(
        preparationId,
        proposal.id,
        crypto.randomUUID(),
      );
      await onChanged();
    } catch (cause) {
      onError((cause as Error).message);
    } finally {
      setBusy("");
    }
  };
  const discard = async (id: string) => {
    setBusy(id);
    try {
      await discardDocumentProposal(preparationId, id);
      await onChanged();
    } catch (cause) {
      onError((cause as Error).message);
    } finally {
      setBusy("");
    }
  };
  if (!pending.length) return null;
  return (
    <section className="qs-prep-proposals" aria-label="待应用的 AI 修改">
      <div className="qs-prep-section-head">
        <strong>待应用修改 · {pending.length}</strong>
      </div>
      {pending.map((proposal) => (
        <article key={proposal.id} className="qs-prep-proposal">
          <p>{proposal.summary}</p>
          <small>
            基于版本 {proposal.baseRevision}
            {proposal.baseRevision !== document.revision
              ? " · 当前稿已变化，需核对后重新生成建议"
              : ""}
          </small>
          <div className="qs-prep-inline-actions">
            <GlassButton
              onClick={() =>
                setExpanded((value) =>
                  value === proposal.id ? "" : proposal.id,
                )
              }
            >
              {expanded === proposal.id ? "收起对照" : "对照查看"}
            </GlassButton>
            <GlassButton
              disabled={
                Boolean(busy) || proposal.baseRevision !== document.revision
              }
              onClick={() => void apply(proposal)}
            >
              <Check size={16} />
              应用修改
            </GlassButton>
            <GlassButton
              disabled={Boolean(busy)}
              onClick={() => void discard(proposal.id)}
            >
              <X size={16} />
              不采用
            </GlassButton>
          </div>
          {expanded === proposal.id && (
            <div className="qs-prep-proposal-comparison">
              <section>
                <h4>当前稿 · 版本 {document.revision}</h4>
                <DocumentEditor
                  content={document.content}
                  documentKey={`proposal-before-${document.id}-${document.revision}`}
                  readOnly
                />
              </section>
              <section>
                <h4>AI 建议稿 · 尚未应用</h4>
                <DocumentEditor
                  content={proposal.content}
                  documentKey={`proposal-after-${proposal.id}`}
                  readOnly
                />
              </section>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
