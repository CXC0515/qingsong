import { documentChanges } from "../../domain/documentChanges";
import { lazy, Suspense, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { GlassButton } from "../../components/glass/Glass";
const DocumentEditor = lazy(() => import("../../components/document/DocumentEditor"));
import type { DocumentRecord } from "../../domain/document";
import type { DocumentProposal } from "../../domain/preparation";
import {
  applyDocumentProposal,
  discardDocumentProposal,
  getDocumentRevision,
} from "../../services/preparationApi";

export default function PreparationProposals({
  preparationId,
  document,
  proposals,
  locked=false,
  onRegenerate,
  beforeMutation,
  onChanged,
  onError,
}: {
  preparationId: string;
  document: DocumentRecord;
  proposals: DocumentProposal[];
  locked?:boolean;
  onRegenerate: (proposal:DocumentProposal) => Promise<void>;
  beforeMutation: () => Promise<boolean>;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(""),
    [expanded, setExpanded] = useState("");
  const [showFull, setShowFull] = useState(false);
  const [baselines,setBaselines]=useState<Record<string,DocumentRecord>>({});
  const [baselineErrors,setBaselineErrors]=useState<Record<string,string>>({});
  const [retry,setRetry]=useState(0);
  const pending = proposals.filter(
    (proposal) =>
      proposal.documentId === document.id && proposal.status === "pending",
  );
  useEffect(()=>{
    let active=true;
    void Promise.all(pending.filter(proposal=>!baselines[proposal.id]).map(async proposal=>{
      try{return [proposal.id,await getDocumentRevision(preparationId,document.id,proposal.baseRevision)] as const;}
      catch{if(active)setBaselineErrors(current=>({...current,[proposal.id]:"生成时底稿暂未读到。原建议和当前稿保留，请重试读取。"}));return null;}
    })).then(entries=>{if(active&&entries.length)setBaselines(current=>({...current,...Object.fromEntries(entries.filter(entry=>entry!==null))}));});
    return()=>{active=false;};
  },[preparationId,document.id,pending.map(item=>item.id).join("|"),retry]);
  const apply = async (proposal: DocumentProposal) => {
    if(locked||busy||!baselines[proposal.id]||proposal.baseRevision!==document.revision)return;
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
    if(locked||busy)return;
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
        const baseline=baselines[proposal.id];
        const changes = documentChanges(baseline?.content??document.content, proposal.content);
        const comparison = showFull
          ? { before: baseline?.content??document.content, after: proposal.content }
          : changes;
        const disabledReason = busy
          ? "正在处理另一条修改建议。"
          : locked
            ? "AI 正在修改这份教案，暂不能应用其他建议。"
            : !baseline
              ? (baselineErrors[proposal.id]||"正在读取生成时底稿，请稍候。")
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
                  locked ||
                  !baseline ||
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
                disabled={Boolean(busy) || locked}
                onClick={() => void discard(proposal.id)}
              >
                <X size={16} />
                不采用
              </GlassButton>
              {proposal.baseRevision!==document.revision&&<GlassButton disabled={locked||Boolean(busy)} onClick={()=>void onRegenerate(proposal)}>按最新稿重新生成</GlassButton>}
            </div>
            {!baseline&&baselineErrors[proposal.id]&&<GlassButton onClick={()=>setRetry(value=>value+1)}>重试读取底稿</GlassButton>}
            {disabledReason && <small className="qs-prep-proposal-disabled-reason" role="status">{disabledReason}</small>}
            {expanded === proposal.id && baseline && (
              <div>
                <GlassButton disabled={locked} onClick={() => setShowFull((value) => !value)}>
                  {showFull ? "只看修改处" : "查看整篇对照"}
                </GlassButton>
                <div className="qs-prep-proposal-comparison">
                  <section>
                    <h4>生成时底稿 · 版本 {proposal.baseRevision}</h4>
                    <Suspense fallback={<p role="status">正在载入预览…</p>}><DocumentEditor
                      content={comparison.before.content.length?comparison.before:{ type: "doc", content: [{ type: "paragraph" }] }}
                      documentKey={`proposal-before-${proposal.id}-${proposal.baseRevision}`}
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
                  <section>
                    <h4>当前稿 · 版本 {document.revision}</h4>
                    <Suspense fallback={<p role="status">正在载入预览…</p>}><DocumentEditor
                      content={document.content.content.length?document.content:{type:"doc",content:[{type:"paragraph"}]}}
                      documentKey={`proposal-current-${document.id}-${document.revision}`}
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
