import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, FileText, Plus, Search } from "lucide-react";
import { GlassButton } from "../../components/glass/Glass";
import {
  EmptyState,
  SearchField,
  WorkspaceToolbar,
} from "../../components/WorkspaceUI";
import ResponsiveDialog from "../../components/ResponsiveDialog";
import type {
  Preparation,
  PreparationDetail as Detail,
} from "../../domain/preparation";
import {
  createPreparation,
  getPreparation,
  listPreparations,
} from "../../services/preparationApi";
const PreparationDetail = lazy(() => import("./PreparationDetail"));
import "./preparation.css";

export default function LessonPlanWorkspace({
  onShowToast,
}: {
  onShowToast: (message: string) => void;
}) {
  const [items, setItems] = useState<Preparation[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [documentId, setDocumentId] = useState<string | undefined>();
  const [query, setQuery] = useState(""),
    [subject, setSubject] = useState(""),
    [creating, setCreating] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const sequence = useRef(0);
  const loadList = useCallback(async () => {
    const next = await listPreparations();
    setItems(next);
  }, []);
  const open = useCallback(async (id: string, selectedDocumentId?: string) => {
    const serial = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const next = await getPreparation(id);
      if (serial === sequence.current) {
        setDocumentId(selectedDocumentId);
        setDetail(next);
      }
    } catch (cause) {
      if (serial === sequence.current) {
        setError((cause as Error).message);
        window.dispatchEvent(new CustomEvent('qingsong:preparation-navigation-failed',{detail:{message:(cause as Error).message}}));
      }
    } finally {
      if (serial === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search),
      id = params.get("preparationId");
    if (id) void open(id, params.get("documentId") ?? undefined);
    else
      void loadList()
        .catch((cause) => {
          if (active) setError(cause.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    const requested = (event: Event) => {
      const value = (
        event as CustomEvent<{ preparationId?: string; documentId?: string }>
      ).detail;
      if (!value?.preparationId) return;
      if (
        !window.dispatchEvent(
          new Event("qingsong:preparation-before-leave", { cancelable: true }),
        )
      )
        return;
      void open(value.preparationId, value.documentId);
    };
    window.addEventListener("qingsong:open-preparation", requested);
    return () => {
      active = false;
      sequence.current++;
      window.removeEventListener("qingsong:open-preparation", requested);
    };
  }, [loadList, open]);
  useEffect(() => {
    if (!detail)
      window.dispatchEvent(
        new CustomEvent("qingsong:preparation-context", { detail: {} }),
      );
  }, [Boolean(detail)]);
  const back = async () => {
    sequence.current++;
    setDetail(null);
    setError("");
    const url = new URL(window.location.href);
    url.searchParams.delete("preparationId");
    url.searchParams.delete("documentId");
    window.history.replaceState(null, "", url);
    setLoading(true);
    try {
      await loadList();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const subjects = [
    ...new Set(items.map((item) => item.subject).filter(Boolean)),
  ];
  const visible = items.filter(
    (item) =>
      (!subject || item.subject === subject) &&
      `${item.title} ${item.subject} ${item.grade}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  if (detail)
    return (
      <div key={detail.preparation.id} className="contents">
        <Suspense fallback={<p role="status">正在载入教案编辑器…</p>}>
        <PreparationDetail
          initial={detail}
          initialDocumentId={documentId}
          onBack={() => void back()}
          onShowToast={onShowToast}
        />
        </Suspense>
      </div>
    );
  return (
    <div className="qs-preparations" id="lesson-plan-workspace-page">
      <WorkspaceToolbar label="备课列表操作">
        <SearchField
          className="qs-prep-list-search"
          placeholder="查找课题或备课"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="qs-prep-subject-filter"
          value={subject}
          aria-label="筛选学科"
          onChange={(event) => setSubject(event.target.value)}
        >
          <option value="">全部学科</option>
          {subjects.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <GlassButton onClick={() => setCreating(true)}>
          <Plus size={17} />
          新建备课
        </GlassButton>
      </WorkspaceToolbar>
      {error && (
        <p className="qs-prep-error" role="alert">
          {error}
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void loadList()
                .then(() => setError(""))
                .catch((cause) => setError(cause.message))
                .finally(() => setLoading(false));
            }}
          >
            重新读取
          </button>
        </p>
      )}
      {loading && !items.length ? (
        <p className="qs-prep-empty" role="status">
          正在读取备课…
        </p>
      ) : visible.length ? (
        <div className="qs-prep-list">
          {visible.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => void open(item.id)}
              className="qs-prep-list-item"
            >
              <FileText size={23} />
              <span className="qs-prep-list-title">
                <strong>{item.title}</strong>
                <small>
                  {[item.subject, item.grade, item.edition]
                    .filter(Boolean)
                    .join(" · ") || "本课信息待补充"}
                </small>
              </span>
              <span className="qs-prep-list-meta">
                <small>
                  {item.status === "ready"
                    ? "已选授课稿"
                    : item.status === "archived"
                      ? "已归档"
                      : "草稿"}
                </small>
                <time dateTime={item.updatedAt}>
                  {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                </time>
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title={items.length ? "没有找到这份备课" : "开始备一课"}
          description={
            items.length
              ? "可以换个课题名称或学科。"
              : "可以从已有教案、PPT 开始，也可以根据教材和教辅编写。"
          }
          action={
            !items.length ? (
              <GlassButton onClick={() => setCreating(true)}>
                <Plus size={17} />
                新建备课
              </GlassButton>
            ) : undefined
          }
        />
      )}
      {creating && (
        <NewPreparation
          onClose={() => setCreating(false)}
          onCreated={(value) => {
            setDetail(value);
            setCreating(false);
            setDocumentId(value.documents[0]?.id);
          }}
        />
      )}
    </div>
  );
}
function NewPreparation({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (detail: Detail) => void;
}) {
  const [input, setInput] = useState({
      title: "",
      subject: "",
      grade: "",
      edition: "",
      requirements: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const operation = useRef(crypto.randomUUID());
  const field = (key: keyof typeof input, value: string) => {
    setInput((current) => ({ ...current, [key]: value }));
    operation.current = crypto.randomUUID();
  };
  const submit = async () => {
    if (!input.title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      onCreated(
        await createPreparation({
          ...input,
          title: input.title.trim(),
          operationId: operation.current,
        }),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ResponsiveDialog
      title="新建备课"
      busy={busy}
      wide
      onClose={onClose}
      footer={
        <GlassButton
          disabled={!input.title.trim() || busy}
          onClick={() => void submit()}
        >
          {busy ? "正在创建…" : "创建并加入资料"}
        </GlassButton>
      }
    >
      <div className="qs-prep-settings-grid">
        <label className="qs-prep-field qs-prep-span-all">
          备课名称
          <input
            autoFocus
            value={input.title}
            onChange={(event) => field("title", event.target.value)}
            placeholder="课题、单元或教学内容"
            maxLength={200}
          />
        </label>
        {(
          [
            ["subject", "学科"],
            ["grade", "年级／册次"],
            ["edition", "教材版本"],
          ] as const
        ).map(([key, label]) => (
          <label className="qs-prep-field" key={key}>
            {label}
            <input
              value={input[key]}
              onChange={(event) => field(key, event.target.value)}
              placeholder="可稍后补充"
            />
          </label>
        ))}
        <label className="qs-prep-field qs-prep-span-all">
          这次怎么备
          <textarea
            rows={4}
            value={input.requirements}
            onChange={(event) => field("requirements", event.target.value)}
            placeholder="例如：两课时，以已有教案为底稿，删去拓展阅读，补充练习。"
          />
        </label>
        {error && (
          <p role="alert" className="qs-prep-error">
            {error}
          </p>
        )}
      </div>
    </ResponsiveDialog>
  );
}
