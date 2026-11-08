import { documentChanges } from "../../domain/documentChanges";
import { lazy, Suspense, useState } from "react";
import { Check, X } from "lucide-react";
import { GlassButton } from "../../components/glass/Glass";
const DocumentEditor = lazy(() => import("../../components/document/DocumentEditor"));
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
  const [showFull, setShowFull] = useState(false);
  const pending = proposals.filter(
    (proposal) =>
      proposal.documentId === document.id && proposal.status === "pending",
  );
  const apply = async (proposal: DocumentProposal) => {
    if (!(await beforeMutation())) {
      onError("当前教案修改尚未保存，AI 修改还没有应用。请先确认保存状态后重试。");
      return;
    }
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
      {pending.map((proposal) => {
        const changes = documentChanges(document.content, proposal.content);
        const comparison = showFull
          ? { before: document.content, after: proposal.content }
          : changes;
        const disabledReason = busy
          ? "正在处理另一条修改建议。"
          : !changes.hasChanges
            ? "这条建议与当前稿相同，无法应用。"
            : proposal.baseRevision !== document.revision
              ? "当前稿已变化，这条建议基于旧版本，需重新生成后再应用。"
              : "";
        return (
          <article key={proposal.id} className="qs-prep-proposal">
            <p>{proposal.summary}</p>
            <small>
              {changes.hasChanges
                ? `修改 ${changes.changed} 处 · 新增 ${changes.added} 处 · 删除 ${changes.removed} 处`
                : "正文未发生变化"}
            </small>
            <small>
              基于版本 {proposal.baseRevision}
              {proposal.baseRevision !== document.revision
                ? " · 当前稿已变化，需核对后重新生成建议"
                : ""}
            </small>
            <div className="qs-prep-inline-actions">
              <GlassButton
                onClick={() => {
                  setExpanded((value) =>
                    value === proposal.id ? "" : proposal.id,
                  );
                  setShowFull(false);
                }}
              >
                {expanded === proposal.id ? "收起对照" : "对照查看"}
              </GlassButton>
              <GlassButton
                disabled={
                  Boolean(busy) ||
                  !changes.hasChanges ||
                  proposal.baseRevision !== document.revision
                }
                onClick={() => void apply(proposal)}
                aria-label={disabledReason ? `应用修改：${disabledReason}` : "应用修改"}
                title={disabledReason || undefined}
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
            {disabledReason && <small className="qs-prep-proposal-disabled-reason" role="status">{disabledReason}</small>}
            {expanded === proposal.id && (
              <div>
                <GlassButton onClick={() => setShowFull((value) => !value)}>
                  {showFull ? "只看修改处" : "查看整篇对照"}
                </GlassButton>
                <div className="qs-prep-proposal-comparison">
                  <section>
                    <h4>当前稿</h4>
                    <Suspense fallback={<p role="status">正在载入预览…</p>}><DocumentEditor
                      content={
                        comparison.before.content.length
                          ? comparison.before
                          : { type: "doc", content: [{ type: "paragraph" }] }
                      }
                      documentKey={`proposal-before-${document.id}-${document.revision}`}
                      readOnly
                    /></Suspense>
                  </section>
                  <section>
                    <h4>AI 建议稿 · 尚未应用</h4>
                    <Suspense fallback={<p role="status">正在载入预览…</p>}><DocumentEditor
                      content={
                        comparison.after.content.length
                          ? comparison.after
                          : { type: "doc", content: [{ type: "paragraph" }] }
                      }
                      documentKey={`proposal-after-${proposal.id}`}
                      readOnly
                    /></Suspense>
                  </section>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
