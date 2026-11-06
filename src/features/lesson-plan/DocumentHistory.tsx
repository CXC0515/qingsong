import { lazy, Suspense, useEffect, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { GlassButton } from "../../components/glass/Glass";
import ResponsiveDialog from "../../components/ResponsiveDialog";
const DocumentEditor = lazy(() => import("../../components/document/DocumentEditor"));
import type { DocumentRecord, DocumentRevision } from "../../domain/document";
import {
  exportPreparationDocument,
  listDocumentRevisions,
  restoreDocumentRevision,
  type DocumentExport,
} from "../../services/preparationApi";

export async function makeDocumentExport(
  preparationId: string,
  documentId: string,
  revision: number,
  format: "docx" | "pdf",
) {
  return exportPreparationDocument(preparationId, documentId, revision, format);
}
export function ExportResult({ file }: { file: DocumentExport }) {
  return (
    <div className="qs-prep-export-result" role="status">
      <a href={file.url} download={file.fileName}>
        <Download size={16} />
        下载 {file.fileName}
      </a>
      <span>
        版本 {file.revision} · {file.format.toUpperCase()}
      </span>
      {file.format === "docx" && <p>可将此 Word 导入飞书继续编辑。飞书可能调整字体、字号、颜色和编号样式，导入后请核对排版。</p>}
      {file.warnings?.map((warning, index) => (
        <p key={index}>{warning}</p>
      ))}
    </div>
  );
}
export default function DocumentHistory({
  preparationId,
  document,
  beforeMutation,
  onRestored,
  onClose,
}: {
  preparationId: string;
  document: DocumentRecord;
  beforeMutation: () => Promise<boolean>;
  onRestored: (document: DocumentRecord) => void;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<DocumentRevision[]>([]),
    [selected, setSelected] = useState<DocumentRevision | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [file, setFile] = useState<DocumentExport | null>(null);
  useEffect(() => {
    let active = true;
    void listDocumentRevisions(preparationId, document.id)
      .then((items) => {
        if (active) {
          setRevisions(items);
          setSelected(items[0] ?? null);
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [preparationId, document.id]);
  const restore = async () => {
    if (
      !selected ||
      !window.confirm(
        `把版本 ${selected.revision} 恢复为当前稿？现有稿件仍保留在历史中。`,
      )
    )
      return;
    if (!(await beforeMutation())) return;
    setBusy(true);
    setError("");
    try {
      const value = await restoreDocumentRevision(
        preparationId,
        document.id,
        selected.revision,
        document.revision,
        crypto.randomUUID(),
      );
      onRestored(value);
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const exportVersion = async (format: "docx" | "pdf") => {
    if (!selected) return;
    setBusy(true);
    setError("");
    setFile(null);
    try {
      setFile(
        await makeDocumentExport(
          preparationId,
          document.id,
          selected.revision,
          format,
        ),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ResponsiveDialog
      title="历史版本"
      subtitle="自动保存持续保护当前稿；手动保存版本、应用建议和导入记录保留在这里。导出不会改变当前稿。"
      wide
      compactFull
      busy={busy}
      onClose={onClose}
    >
      <div className="qs-prep-history-layout">
        <aside aria-label="选择历史版本">
          {loading ? (
            <p role="status">正在读取版本…</p>
          ) : (
            revisions.map((item) => (
              <button
                type="button"
                key={item.revision}
                aria-pressed={selected?.revision === item.revision}
                onClick={() => {
                  setSelected(item);
                  setFile(null);
                }}
              >
                <strong>{item.reason==='自动保存'?'当前自动保存稿':'保存记录'} · 修订 {item.revision}</strong>
                <span>{new Date(item.updatedAt).toLocaleString("zh-CN")}</span>
                <small>
                  {item.reason} ·{" "}
                  {item.actor === "teacher"
                    ? "教师修改"
                    : item.actor === "import"
                      ? "导入底稿"
                      : "应用 AI 建议"}
                </small>
              </button>
            ))
          )}
        </aside>
        <section className="min-w-0">
          <div className="qs-prep-history-actions">
            <GlassButton
              disabled={!selected || busy}
              onClick={() => void exportVersion("docx")}
            >
              <Download size={16} />
              Word
            </GlassButton>
            <GlassButton
              disabled={!selected || busy}
              onClick={() => void exportVersion("pdf")}
            >
              PDF
            </GlassButton>
            <GlassButton
              disabled={!selected || busy}
              onClick={() => void restore()}
            >
              <RotateCcw size={16} />
              恢复此版本
            </GlassButton>
          </div>
          {file && <ExportResult file={file} />}{" "}
          {error && (
            <p role="alert" className="qs-prep-error">
              {error}
            </p>
          )}
          {selected && (
            <Suspense fallback={<p role="status">正在载入预览…</p>}><DocumentEditor
              documentKey={`${document.id}:history:${selected.revision}`}
              content={selected.content}
              readOnly
            /></Suspense>
          )}
        </section>
      </div>
    </ResponsiveDialog>
  );
}
