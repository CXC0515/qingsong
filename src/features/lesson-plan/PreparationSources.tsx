import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  FilePlus2,
  FileText,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { GlassButton, GlassSegments } from "../../components/glass/Glass";
import ResponsiveDialog from "../../components/ResponsiveDialog";
import type { PreparationSource } from "../../domain/preparation";
import type { PoolItem } from "../../domain/materialPool";
import type { LibraryResource } from "../../domain/types";
import { listPoolItems, uploadPoolItem } from "../../services/materialPoolApi";
import { listLibraryResources } from "../../services/resourceApi";
import {
  attachPreparationSource,
  detachPreparationSource,
} from "../../services/preparationApi";

export const sourceRoleLabel = {
  base: "底稿",
  textbook: "教材依据",
  reference: "参考资料",
};
interface Props {
  preparationId: string;
  sources: PreparationSource[];
  onChanged: () => Promise<void>;
  onRead: (source: PreparationSource) => void;
  onImport: (source: PreparationSource) => Promise<void>;
  onError: (message: string) => void;
  disabled?: boolean;
}
export default function PreparationSources({
  preparationId,
  sources,
  onChanged,
  onRead,
  onImport,
  onError,
  disabled=false,
}: Props) {
  const [adding, setAdding] = useState(false),
    [busyId, setBusyId] = useState("");
  const detach = async (source: PreparationSource) => {
    if (
      !window.confirm(
        `从这次备课移除“${source.title}”？原文件和已写入的正文都会保留。`,
      )
    )
      return;
    setBusyId(source.id);
    try {
      await detachPreparationSource(preparationId, source.id);
      await onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : "资料未移除，请重试。");
    } finally {
      setBusyId("");
    }
  };
  return (
    <section className="qs-prep-sources" aria-label="本次备课资料">
      <div className="qs-prep-section-head">
        <strong>本次资料 · {sources.length}</strong>
        <GlassButton onClick={() => setAdding(true)}>
          <Plus size={16} />
          添加资料
        </GlassButton>
      </div>
      {!sources.length && (
        <p className="qs-prep-empty">
          添加已有教案、课件，或直接选择教材和教辅。资料选入后可反复对照，不需要重新上传。
        </p>
      )}
      <div className="qs-prep-source-list">
        {sources.map((source) => (
          <article key={source.id} className="qs-prep-source-card">
            <button
              type="button"
              className="qs-prep-source-name"
              onClick={() => onRead(source)}
            >
              <FileText size={18} />
              <span>
                {source.title}
                <small>{sourceRoleLabel[source.role]}</small>
              </span>
            </button>
            <div className="qs-prep-source-actions">
              <button type="button" onClick={() => onRead(source)}>
                对照阅读
              </button>
              {source.mimeType.includes("wordprocessingml") && (
                <button
                  type="button"
                  disabled={Boolean(busyId) || disabled}
                  onClick={async () => {
                    setBusyId(source.id);
                    try {
                      await onImport(source);
                    } finally {
                      setBusyId("");
                    }
                  }}
                >
                  <FilePlus2 size={15} />
                  用作底稿
                </button>
              )}
              <button
                type="button"
                aria-label={`从本次备课移除${source.title}`}
                disabled={Boolean(busyId)}
                onClick={() => void detach(source)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {adding && (
        <SourcePicker
          preparationId={preparationId}
          onClose={() => setAdding(false)}
          onChanged={onChanged}
          onError={onError}
        />
      )}
    </section>
  );
}
function SourcePicker({
  preparationId,
  onClose,
  onChanged,
  onError,
}: Pick<Props, "preparationId" | "onChanged" | "onError"> & {
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"upload" | "pool" | "resource">("upload"),
    [role, setRole] = useState<PreparationSource["role"]>("reference");
  const [query, setQuery] = useState(""),
    [pool, setPool] = useState<PoolItem[]>([]),
    [resources, setResources] = useState<LibraryResource[]>([]),
    [next, setNext] = useState<number | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null),
    request = useRef(0);
  const operation = useRef(new Map<string, string>());
  useEffect(() => {
    const id = ++request.current;
    if (mode === "upload") return;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      const load =
        mode === "pool"
          ? listPoolItems({ q: query }).then((result) => {
              if (id === request.current) {
                setPool(result.items);
                setNext(result.nextOffset);
              }
            })
          : listLibraryResources().then((result) => {
              if (id === request.current) setResources(result);
            });
      void load
        .catch((cause) => {
          if (id === request.current) setError(cause.message);
        })
        .finally(() => {
          if (id === request.current) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      request.current++;
    };
  }, [mode, query]);
  const attach = async (kind: "pool" | "resource", id: string) => {
    const key = `${kind}:${id}:${role}`;
    if (!operation.current.has(key))
      operation.current.set(key, crypto.randomUUID());
    await attachPreparationSource(preparationId, {
      kind,
      id,
      role,
      operationId: operation.current.get(key)!,
    });
    await onChanged();
  };
  const select = async (kind: "pool" | "resource", id: string) => {
    setBusy(true);
    setError("");
    try {
      await attach(kind, id);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "未能选用资料，原件没有改变。",
      );
    } finally {
      setBusy(false);
    }
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    let completed = 0;
    try {
      for (const file of Array.from(files)) {
        const item = await uploadPoolItem(file);
        await attach("pool", item.id);
        completed++;
      }
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "上传失败";
      setError(
        `${completed ? `已选入 ${completed} 份，成功的文件已保留。` : ""}${message}`,
      );
      onError(message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const visibleResources = resources.filter((item) =>
    `${item.title} ${item.subject} ${item.fileName}`.includes(query),
  );
  return (
    <ResponsiveDialog title="添加备课资料" wide busy={busy} onClose={onClose}>
      <div className="qs-prep-source-picker">
        <label className="qs-prep-field">
          这份资料的用途
          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as PreparationSource["role"])
            }
          >
            <option value="reference">参考资料</option>
            <option value="textbook">教材依据</option>
            <option value="base">准备作为底稿</option>
          </select>
        </label>
        <GlassSegments
          label="选择资料来源"
          value={mode}
          onChange={setMode}
          options={[
            { value: "upload", label: "上传文件" },
            { value: "pool", label: "材料池" },
            { value: "resource", label: "资料库" },
          ]}
        />
        {mode === "upload" ? (
          <div className="qs-prep-upload">
            <Upload size={26} />
            <p>可以一次选择几份教案、PPT、教材或教辅。</p>
            <GlassButton onClick={() => input.current?.click()} disabled={busy}>
              {busy ? "正在上传并选入…" : "选择文件"}
            </GlassButton>
            <input
              ref={input}
              type="file"
              multiple
              className="sr-only"
              accept=".docx,.pptx,.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.txt"
              onChange={(event) => void upload(event.target.files)}
            />
            <small>文件保存在材料池；从本次备课移除不会删除原件。</small>
          </div>
        ) : (
          <>
            <input
              className="qs-prep-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                mode === "pool" ? "按文件名或标签查找" : "按资料名或学科查找"
              }
              aria-label="查找备课资料"
            />
            {loading ? (
              <p role="status">正在读取资料列表…</p>
            ) : (
              <div className="qs-prep-pick-results">
                {mode === "pool"
                  ? pool.map((item) => (
                      <button
                        key={item.id}
                        disabled={busy}
                        type="button"
                        onClick={() => void select("pool", item.id)}
                      >
                        <FileText size={18} />
                        <span>
                          {item.originalName}
                          <small>{item.tags.join(" · ")}</small>
                        </span>
                        <Plus size={17} />
                      </button>
                    ))
                  : visibleResources.map((item) => (
                      <button
                        key={item.id}
                        disabled={busy}
                        type="button"
                        onClick={() => void select("resource", item.id)}
                      >
                        <BookOpen size={18} />
                        <span>
                          {item.title}
                          <small>
                            {[item.subject, item.grade, item.edition]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </span>
                        <Plus size={17} />
                      </button>
                    ))}
                {!(mode === "pool" ? pool.length : visibleResources.length) && (
                  <p className="qs-prep-empty">
                    没有找到资料，可以换个名称或上传文件。
                  </p>
                )}
              </div>
            )}
            {mode === "pool" && next !== null && (
              <GlassButton
                disabled={busy || loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const result = await listPoolItems({
                      q: query,
                      offset: next,
                    });
                    setPool((current) => [...current, ...result.items]);
                    setNext(result.nextOffset);
                  } catch (cause) {
                    setError((cause as Error).message);
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                加载更多
              </GlassButton>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="qs-prep-error">
            {error}
          </p>
        )}
      </div>
    </ResponsiveDialog>
  );
}
