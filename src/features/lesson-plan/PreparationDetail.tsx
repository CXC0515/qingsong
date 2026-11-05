import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  BookOpen,
  Download,
  FilePlus2,
  History,
  MessageSquare,
  Save,
  Settings2,
  X,
  Square,
} from "lucide-react";
import { GlassButton, GlassSegments } from "../../components/glass/Glass";
import ResponsiveDialog from "../../components/ResponsiveDialog";
import { WorkspaceToolbar } from "../../components/WorkspaceUI";
import type { DocumentRecord } from "../../domain/document";
import type {
  PreparationDetail as Detail,
  PreparationSource,
} from "../../domain/preparation";
import type { DocumentSelection } from "../../components/document/DocumentEditor";
import {
  cancelPreparationTask,
  forkPreparationDocument,
  getPreparation,
  importPreparationSource,
  uploadPreparationImage,
  type DocumentExport,
} from "../../services/preparationApi";
import PreparationSources from "./PreparationSources";
import PreparationProposals from "./PreparationProposals";
import DocumentHistory, {
  ExportResult,
  makeDocumentExport,
} from "./DocumentHistory";
import { useDocumentDraft } from "./useDocumentDraft";
import { PreparationSettings, ForkDialog } from "./PreparationDialogs";
import { getKnowledgeGraph } from "../../services/resourceApi";
import type { KnowledgeEntity } from "../../domain/types";

const DocumentEditor = lazy(
  () => import("../../components/document/DocumentEditor"),
);
const PdfPageViewer = lazy(() => import("../../components/PdfPageViewer"));
type Panel = "document" | "sources";
export default function PreparationDetail({
  initial,
  initialDocumentId,
  onBack,
  onShowToast,
}: {
  initial: Detail;
  initialDocumentId?: string;
  onBack: () => void;
  onShowToast: (message: string) => void;
}) {
  const [detail, setDetail] = useState(initial),
    [documentId, setDocumentId] = useState(
      initialDocumentId || initial.documents[0]?.id,
    );
  const [panel, setPanel] = useState<Panel>("document"),
    [history, setHistory] = useState(false),
    [settings, setSettings] = useState(false),
    [forking, setForking] = useState(false);
  const [knowledge, setKnowledge] = useState<KnowledgeEntity[]>([]);
  const [reader, setReader] = useState<PreparationSource | null>(null),
    [readerPage, setReaderPage] = useState(1),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [file, setFile] = useState<DocumentExport | null>(null);
  const selection = useRef<DocumentSelection>({ blockIds: [], text: "" }),
    refreshId = useRef(0);
  const preparationId = detail.preparation.id;
  const document =
    detail.documents.find((item) => item.id === documentId) ??
    detail.documents[0];
  const acceptDocument = useCallback(
    (next: DocumentRecord) =>
      setDetail((current) => ({
        ...current,
        documents: current.documents.map((item) =>
          item.id === next.id && next.revision >= item.revision ? next : item,
        ),
      })),
    [],
  );
  const draft = useDocumentDraft(preparationId, document, acceptDocument);
  const flushRef = useRef(draft.flush),
    dirtyRef = useRef(draft.dirty);
  flushRef.current = draft.flush;
  dirtyRef.current = draft.dirty;
  const refresh = useCallback(async () => {
    const sequence = ++refreshId.current;
    const next = await getPreparation(preparationId);
    if (sequence === refreshId.current) setDetail(next);
  }, [preparationId]);
  useEffect(() => {
    const context = {
      preparationId,
      documentId: document.id,
      revision: document.revision,
    };
    window.dispatchEvent(
      new CustomEvent("qingsong:preparation-context", { detail: context }),
    );
    const url = new URL(window.location.href);
    url.searchParams.set("page", "lesson-plan");
    url.searchParams.set("preparationId", preparationId);
    url.searchParams.set("documentId", document.id);
    window.history.replaceState(null, "", url);
  }, [preparationId, document.id, document.revision]);
  useEffect(() => {
    const prevent = (event: Event) => {
      if (dirtyRef.current()) {
        event.preventDefault();
        setError("当前修改尚未保存。请先保存或下载草稿，再离开备课。");
        void flushRef.current();
      }
    };
    const changed = () => {
      void refresh().catch(() => {});
    };
    window.addEventListener("qingsong:preparation-before-leave", prevent);
    window.addEventListener("qingsong:preparation-changed", changed);
    const timer = setInterval(() => {
      if (!window.document.hidden) changed();
    }, 5000);
    return () => {
      clearInterval(timer);
      refreshId.current++;
      window.removeEventListener("qingsong:preparation-before-leave", prevent);
      window.removeEventListener("qingsong:preparation-changed", changed);
    };
  }, [refresh]);
  useEffect(() => {
    if (initialDocumentId) setDocumentId(initialDocumentId);
  }, [initialDocumentId]);
  const report = (message: string) => {
    setError(message);
    onShowToast(message);
  };
  const openAssistant = async (instruction?: string) => {
    if (!(await draft.flush())) return;
    window.dispatchEvent(
      new CustomEvent("qingsong:preparation-assistant", {
        detail: {
          preparationId,
          documentId: document.id,
          revision: draft.getRevision(),
          ...(selection.current.blockIds.length ? { selection: selection.current } : {}),
          ...(instruction ? { instruction } : {}),
        },
      }),
    );
  };
  const changeDocument = async (id: string) => {
    if (await draft.flush()) {
      selection.current = { blockIds: [], text: "" };
      setDocumentId(id);
      setFile(null);
      setError("");
    }
  };
  const leave = async () => {
    if (await draft.flush()) onBack();
  };
  const importSource = async (source: PreparationSource) => {
    if (!(await draft.flush())) return;
    if (
      !window.confirm(
        `将“${source.title}”导入为当前稿？已有正文会保留在历史版本中。`,
      )
    )
      return;
    setBusy("import");
    setError("");
    try {
      const result = await importPreparationSource(preparationId, {
        sourceId: source.id,
        documentId: document.id,
        expectedRevision: draft.getRevision(),
        operationId: crypto.randomUUID(),
      });
      acceptDocument(result.document);
      setPanel("document");
      if (result.warnings.length) setError(result.warnings.join("；"));
      onShowToast("底稿已导入，原件和旧版本保留。");
    } catch (cause) {
      report((cause as Error).message);
    } finally {
      setBusy("");
    }
  };
  const exportCurrent = async (format: "docx" | "pdf") => {
    if (!(await draft.flush())) return;
    setBusy("export");
    setFile(null);
    setError("");
    try {
      setFile(
        await makeDocumentExport(
          preparationId,
          document.id,
          draft.getRevision(),
          format,
        ),
      );
    } catch (cause) {
      report((cause as Error).message);
    } finally {
      setBusy("");
    }
  };
  useEffect(() => {
    let active = true;
    void getKnowledgeGraph()
      .then((graph) => {
        if (active) setKnowledge(graph.nodes);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const sourcePreview = reader
    ? `/api/preparations/${preparationId}/sources/${reader.id}/preview`
    : "";
  return (
    <div className="qs-prep-detail">
      <WorkspaceToolbar label="备课操作">
        <div className="qs-prep-title-group">
          <GlassButton
            variant="ghost"
            onClick={() => void leave()}
            aria-label="返回备课列表"
          >
            <ArrowLeft size={19} />
          </GlassButton>
          <div>
            <strong>{detail.preparation.title}</strong>
            <span>
              {[
                detail.preparation.subject,
                detail.preparation.grade,
                detail.preparation.edition,
              ]
                .filter(Boolean)
                .join(" · ") || "本课信息待补充"}
            </span>
          </div>
        </div>
        <div className="qs-prep-main-actions">
          <span
            className={`qs-prep-save-state ${draft.error ? "has-error" : ""}`}
            role="status"
          >
            {
              {
                saved: "已保存",
                dirty: "有修改",
                saving: "正在保存…",
                error: "保存未确认",
                conflict: "版本冲突",
              }[draft.saveState]
            }
          </span>
          <GlassButton
            disabled={Boolean(busy)}
            onClick={() => void draft.flush()}
          >
            <Save size={16} />
            保存
          </GlassButton>
          <GlassButton onClick={() => void openAssistant()}>
            <MessageSquare size={16} />
            AI 助手
          </GlassButton>
        </div>
      </WorkspaceToolbar>
      <div className="qs-prep-document-actions">
        <select
          aria-label="选择教学版本"
          value={document.id}
          onChange={(event) => void changeDocument(event.target.value)}
        >
          {detail.documents.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <GlassButton onClick={() => setSettings(true)}>
          <Settings2 size={16} />
          本课要求
        </GlassButton>
        <GlassButton
          onClick={async () => {
            if (await draft.flush()) setHistory(true);
          }}
        >
          <History size={16} />
          历史版本
        </GlassButton>
        <GlassButton onClick={() => setForking(true)}>
          <FilePlus2 size={16} />
          另存教学版本
        </GlassButton>
        <div className="qs-prep-export-actions">
          <GlassButton
            disabled={Boolean(busy)}
            onClick={() => void exportCurrent("docx")}
          >
            <Download size={16} />
            Word
          </GlassButton>
          <GlassButton
            disabled={Boolean(busy)}
            onClick={() => void exportCurrent("pdf")}
          >
            PDF
          </GlassButton>
        </div>
      </div>
      {(error || draft.error) && (
        <div className="qs-prep-feedback" role="alert">
          <p>{error || draft.error}</p>
          {draft.error && (
            <div className="qs-prep-inline-actions">
              <button type="button" onClick={() => void draft.flush()}>
                重试保存
              </button>
              <button type="button" onClick={draft.downloadRecovery}>
                下载未保存草稿
              </button>
              {draft.saveState === "conflict" && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "请先下载未保存草稿。改用服务器上的最新版后，将替换编辑区中的当前输入。",
                      )
                    )
                      draft.useLatest();
                  }}
                >
                  改用最新版
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            aria-label="收起提示"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {file && <ExportResult file={file} />}
      {busy && (
        <p className="qs-prep-busy" role="status">
          {busy === "import"
            ? "正在导入底稿，现有内容保留…"
            : "正在生成文件，教案已经保存…"}
        </p>
      )}
      {detail.tasks
        .filter((task) =>
          [
            "queued",
            "running",
            "needs-input",
            "failed",
            "interrupted",
          ].includes(task.status),
        )
        .map((task) => (
          <div className="qs-prep-task" key={task.id}>
            <span>
              {task.status === "queued"
                ? "排队中"
                : task.status === "running"
                  ? "正在处理"
                  : task.status === "needs-input"
                    ? "需要补充"
                    : "上次任务未完成"}{" "}
              · {task.stage || task.instruction}
              <small>{task.message}</small>
            </span>
            {["queued", "running"].includes(task.status) && (
              <GlassButton
                onClick={async () => {
                  try {
                    const result = await cancelPreparationTask(
                      preparationId,
                      task.id,
                    );
                    await refresh();
                    if (result.warning) report(result.warning);
                  } catch (cause) {
                    report((cause as Error).message);
                  }
                }}
              >
                <Square size={14} />
                停止
              </GlassButton>
            )}
          </div>
        ))}
      <div className="qs-prep-mobile-tabs">
        <GlassSegments
          label="备课工作面"
          value={panel}
          onChange={setPanel}
          options={[
            { value: "document", label: "教案正文" },
            { value: "sources", label: `资料 · ${detail.sources.length}` },
          ]}
        />
      </div>
      <div className="qs-prep-workspace" data-panel={panel}>
        <main className="qs-prep-writing">
          <PreparationProposals
            preparationId={preparationId}
            document={document}
            proposals={detail.proposals}
            beforeMutation={draft.flush}
            onChanged={refresh}
            onError={report}
          />
          <div className="qs-prep-writing-head">
            <span>
              {document.title} · 版本 {document.revision}
            </span>
            <button
              type="button"
              onClick={() =>
                void openAssistant(
                  "请根据本课要求和已选资料编写或完善当前教案，先形成待应用的修改建议。",
                )
              }
            >
              请 AI 编写／完善
            </button>
          </div>
          <Suspense fallback={<p className="qs-prep-empty">正在准备编辑器…</p>}>
            <DocumentEditor
              documentKey={document.id}
              content={draft.content}
              onChange={draft.update}
              onSelection={(value) => {
                selection.current = value;
              }}
              onRequestAssistant={({instruction, selection: selected}) => {
                selection.current = selected;
                void openAssistant(instruction);
              }}
              onError={report}
              onImageUpload={async (file) => {
                const asset = await uploadPreparationImage(preparationId, file);
                return {
                  assetId: asset.id,
                  src: asset.url,
                  alt: asset.fileName,
                  width: asset.width,
                  height: asset.height,
                };
              }}
            />
          </Suspense>
          <div className="qs-prep-writing-foot">
            <span>可直接编辑，也可以选中一段让 AI 协助修改。</span>
            <GlassButton onClick={() => void openAssistant()}>
              <MessageSquare size={15} />
              讨论或修改
            </GlassButton>
          </div>
        </main>
        <aside className="qs-prep-materials">
          <PreparationSources
            preparationId={preparationId}
            sources={detail.sources}
            onChanged={refresh}
            onError={report}
            onRead={(source) => {
              setReader(source);
              setReaderPage(1);
            }}
            onImport={importSource}
          />
          {Boolean(detail.preparation.knowledgeIds?.length) && (
            <section className="qs-prep-knowledge-summary">
              <strong>本课涉及的知识</strong>
              <ul>
                {detail.preparation.knowledgeIds?.map((id) => (
                  <li key={id}>
                    {knowledge.find((node) => node.id === id)?.name ??
                      "已关联知识"}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setSettings(true)}>
                调整关联
              </button>
            </section>
          )}
        </aside>
      </div>
      {history && (
        <DocumentHistory
          preparationId={preparationId}
          document={document}
          beforeMutation={draft.flush}
          onRestored={acceptDocument}
          onClose={() => setHistory(false)}
        />
      )}
      {settings && (
        <PreparationSettings
          detail={detail}
          onClose={() => setSettings(false)}
          onSaved={async () => {
            await refresh();
            setSettings(false);
          }}
        />
      )}
      {forking && (
        <ForkDialog
          current={document.title}
          onClose={() => setForking(false)}
          onSubmit={async (title) => {
            if (!(await draft.flush()))
              throw Error("请先解决当前稿的保存问题。");
            const next = await forkPreparationDocument(preparationId, {
              documentId: document.id,
              title,
              operationId: crypto.randomUUID(),
            });
            await refresh();
            setDocumentId(next.id);
            setForking(false);
          }}
        />
      )}
      {reader && (
        <ResponsiveDialog
          title={reader.title}
          subtitle="原件仅供对照，编辑教案不会修改原文件。"
          wide
          compactFull
          onClose={() => setReader(null)}
          footer={
            <a
              href={reader.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="qs-prep-link"
            >
              打开原文件
            </a>
          }
        >
          <div className="qs-prep-source-reader">
            {reader.mimeType.startsWith("image/") ? (
              <img src={reader.sourceUrl} alt={reader.title} />
            ) : /pdf|wordprocessingml|presentationml/.test(reader.mimeType) ? (
              <Suspense fallback={<p>正在准备阅读器…</p>}>
                <PdfPageViewer
                  source={
                    reader.mimeType === "application/pdf"
                      ? reader.sourceUrl
                      : sourcePreview
                  }
                  page={readerPage}
                  onPageChange={setReaderPage}
                  openUrl={reader.sourceUrl}
                />
              </Suspense>
            ) : (
              <p className="qs-prep-empty">
                这种格式暂不支持在线对照，可以打开或下载原文件。资料仍可供助手读取。
              </p>
            )}
          </div>
        </ResponsiveDialog>
      )}
    </div>
  );
}
