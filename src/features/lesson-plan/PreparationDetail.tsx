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
} from "lucide-react";
import { GlassButton } from "../../components/glass/Glass";
import ResponsiveDialog from "../../components/ResponsiveDialog";
import { WorkspaceToolbar } from "../../components/WorkspaceUI";
import type { DocumentRecord } from "../../domain/document";
import type {
  PreparationDetail as Detail,
  PreparationSource,
} from "../../domain/preparation";
import type { DocumentSelection } from "../../components/document/DocumentEditor";
import {
  forkPreparationDocument,
  checkpointPreparationDocument,
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
import { apiFetch } from "../../services/apiClient";
import { getKnowledgeGraph } from "../../services/resourceApi";
import type { KnowledgeEntity } from "../../domain/types";
import PreparationTasks from "./PreparationTasks";

const DocumentEditor = lazy(
  () => import("../../components/document/DocumentEditor"),
);
const PdfPageViewer = lazy(() => import("../../components/PdfPageViewer"));
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
  const [history, setHistory] = useState(false),
    [settings, setSettings] = useState(false),
    [forking, setForking] = useState(false);
  const [more, setMore] = useState(false);
  const [toolsCompact, setToolsCompact] = useState(true);
  const [knowledge, setKnowledge] = useState<KnowledgeEntity[]>([]);
  const surface=useRef<HTMLDivElement>(null), materials=useRef<HTMLDialogElement>(null);
  const [compact,setCompact]=useState(true), [materialsOpen,setMaterialsOpen]=useState(false), [materialsCollapsed,setMaterialsCollapsed]=useState(false);
  useEffect(()=>{
    const node=surface.current!;
    const update=()=>{const width=node.getBoundingClientRect().width;setCompact(width<1120);setToolsCompact(width<1050);};
    const observer=new ResizeObserver(update);observer.observe(node);update();
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const dialog=materials.current!;
    // The same subtree survives drawer/column changes, including a pending source selection.
    if(dialog.open)dialog.close();
    if(compact){if(materialsOpen)dialog.showModal();}
    else if(!materialsCollapsed)dialog.show();
  },[compact,materialsOpen,materialsCollapsed]);
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
  const [pendingLock,setPendingLock]=useState<string|null>(null);
  const releasedLock=useRef(false);
  const aiLocked=pendingLock===document.id||detail.tasks.some(task=>task.documentId===document.id&&["queued","running"].includes(task.status));
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
      void refresh().then(()=>{if(releasedLock.current){setPendingLock(null);releasedLock.current=false;}}).catch(() => {});
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
  useEffect(()=>{
    const clientId=crypto.randomUUID();
    const stream=new EventSource('/api/preparations/'+preparationId+'/editing-events?clientId='+clientId);
    let active=true;
    let recoveryTimer:ReturnType<typeof setTimeout>|undefined;
    stream.onmessage=event=>{
      const value=JSON.parse(event.data);
      if(value.type==='prepare'){
        if(value.documentId===document.id){
          releasedLock.current=false;setPendingLock(document.id);
          clearTimeout(recoveryTimer);
          recoveryTimer=setTimeout(()=>{releasedLock.current=true;void refresh().then(()=>{if(active)setPendingLock(null);}).catch(()=>{});},15000);
        }
        void (async()=>{
          const ok=value.documentId!==document.id||await flushRef.current();
          if(!active)return;
          await apiFetch('/api/preparations/'+preparationId+'/editing-ready',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({documentId:value.documentId,requestId:value.requestId,clientId,ok})});
        })().catch(()=>setError('未能确认 AI 修改前的保存状态。输入仍保留，请核对保存后重试。'));
      } else {
        if(value.type==='released')releasedLock.current=true;
        void refresh().then(()=>{if(active&&value.type==='released')setPendingLock(current=>current===value.documentId?null:current);}).catch(()=>{});
      }
    };
    return()=>{active=false;clearTimeout(recoveryTimer);stream.close();};
  },[preparationId,document.id,refresh]);
  useEffect(() => {
    if (initialDocumentId) setDocumentId(initialDocumentId);
  }, [initialDocumentId]);
  const report = (message: string) => {
    setError(message);
    onShowToast(message);
  };
  const openAssistant = async (instruction?: string, conversation?: {sessionId?: string}) => {
    if (!(await draft.flush())) return false;
    window.dispatchEvent(
      new CustomEvent("qingsong:preparation-assistant", {
        detail: {
          preparationId,
          documentId: document.id,
          revision: draft.getRevision(),
          ...(selection.current.blockIds.length ? { selection: selection.current } : {}),
          ...(instruction ? { instruction } : {}),
          ...conversation,
        },
      }),
    );
    return true;
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
      setMaterialsOpen(false);
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
  const secondaryActions = () => <>
        <GlassButton onClick={() => {setMore(false);setSettings(true);}}>
          <Settings2 size={16} />
          备课信息
        </GlassButton>
        <GlassButton disabled={aiLocked}
          onClick={async () => {
            if (await draft.flush()) {setMore(false);setHistory(true);}
          }}
        >
          <History size={16} />
          历史版本
        </GlassButton>
        <GlassButton disabled={aiLocked} onClick={() => {setMore(false);setForking(true);}}>
          <FilePlus2 size={16} />
          另存教学版本
        </GlassButton>
        <div className="qs-prep-export-actions">
          <GlassButton
            disabled={Boolean(busy)||aiLocked}
            onClick={() => void exportCurrent("docx")}
          >
            <Download size={16} />
            Word
          </GlassButton>
          <GlassButton
            disabled={Boolean(busy)||aiLocked}
            onClick={() => void exportCurrent("pdf")}
          >
            PDF
          </GlassButton>
        </div>
  </>;
  return (
    <div className="qs-prep-detail" ref={surface}>
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
            disabled={Boolean(busy)||aiLocked}
            onClick={() => void (async()=>{if(busy||aiLocked)return;setBusy('保存版本');try{if(!(await draft.flush()))return;await checkpointPreparationDocument(preparationId,document.id,draft.getRevision());setError('');onShowToast('已保存新的编号版本。');}catch(cause){setError((cause as Error).message);}finally{setBusy('');}})()}
          >
            <Save size={16} />
            保存版本
          </GlassButton>
        </div>
      </WorkspaceToolbar>
      <div className="qs-prep-document-actions" role="group" aria-label="教案操作">
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
        <GlassButton
          aria-expanded={compact?materialsOpen:!materialsCollapsed}
          aria-controls="qs-preparation-materials"
          onClick={()=>compact?setMaterialsOpen(true):setMaterialsCollapsed(value=>!value)}
        >
          <BookOpen size={16}/><span>{!compact&&!materialsCollapsed?"收起资料":"本次资料"}</span><span className="qs-prep-count"> · {detail.sources.length}</span>
        </GlassButton>
        <PreparationTasks preparationId={preparationId} documentId={document.id} tasks={detail.tasks} onChanged={refresh} onError={report}/>
        {toolsCompact && <GlassButton aria-expanded={more} onClick={()=>setMore(true)}>更多</GlassButton>}
        {!toolsCompact && <div className="qs-prep-secondary-actions">{secondaryActions()}</div>}
      </div>
      {aiLocked&&<div className="qs-prep-current-task" role="status"><span>AI 正在修改这份教案，正文暂时只读。你仍可查看和停止任务。</span></div>}
      {toolsCompact && more && <ResponsiveDialog title="更多教案操作" onClose={()=>setMore(false)}><div className="qs-prep-secondary-actions">{secondaryActions()}</div></ResponsiveDialog>}
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
      <div className="qs-prep-workspace" data-materials-collapsed={compact||materialsCollapsed}>
        <dialog ref={materials} id="qs-preparation-materials" className="qs-prep-materials" aria-label="本次备课资料"
          onCancel={event=>{event.preventDefault();setMaterialsOpen(false);}}
          onClick={event=>{
            if(!compact||event.target!==event.currentTarget)return;
            const bounds=event.currentTarget.getBoundingClientRect();
            if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)setMaterialsOpen(false);
          }}>
          {compact && <header className="qs-prep-materials-header"><strong>本次备课资料</strong><button type="button" aria-label="收起本次资料" onClick={()=>setMaterialsOpen(false)}><X size={18}/></button></header>}
          <PreparationSources
            preparationId={preparationId}
            sources={detail.sources}
            onChanged={refresh}
            onError={report}
            disabled={aiLocked}
            onRead={(source) => {
              setReader(source);
              setReaderPage(1);
            }}
            onImport={async source=>{if(!aiLocked)await importSource(source);}}
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
              <button type="button" onClick={() => {setMore(false);setSettings(true);}}>
                调整关联
              </button>
            </section>
          )}
        </dialog>
        <main className="qs-prep-writing">
          <PreparationProposals
            preparationId={preparationId}
            document={document}
            proposals={detail.proposals}
            locked={aiLocked}
            onRegenerate={async proposal=>{
              if(aiLocked)return;
              const task=detail.tasks.find(task=>typeof task.result==="object"&&task.result!==null&&"proposalId" in task.result&&task.result.proposalId===proposal.id);
              if(!task?.sessionId){report("原任务会话不可用，原建议保留。请在助手中说明新的修改要求。");return;}
              if(!(await draft.flush()))return;
              window.dispatchEvent(new CustomEvent("qingsong:preparation-assistant",{detail:{preparationId,documentId:document.id,revision:draft.getRevision(),sessionId:task.sessionId,instruction:"请按最新已保存稿重新生成修改建议。原要求："+task.instruction}}));
            }}
            beforeMutation={draft.flush}
            onChanged={refresh}
            onError={report}
          />
          <div className="qs-prep-writing-head">
            <span>
              {document.title}
            </span>
            <button
              type="button"
              disabled={aiLocked}
              onClick={() =>
                void openAssistant(
                  "请完善当前教案。\n修改建议如下：\n",
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
              readOnly={aiLocked}
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
            <GlassButton disabled={aiLocked} onClick={() => void openAssistant()}>
              <MessageSquare size={15} />
              讨论或修改
            </GlassButton>
          </div>
        </main>
      </div>
      {history && !aiLocked && (
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
      {forking && !aiLocked && (
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
