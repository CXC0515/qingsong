import { useEffect, useRef, useState } from "react";
import ResponsiveDialog from "../../components/ResponsiveDialog";
import { GlassButton } from "../../components/glass/Glass";
import type { PreparationDetail } from "../../domain/preparation";
import type { KnowledgeEntity, SchoolClass } from "../../domain/types";
import { getKnowledgeGraph } from "../../services/resourceApi";
import { listRosterClasses } from "../../services/rosterApi";
import { updatePreparation } from "../../services/preparationApi";

export function PreparationSettings({
  detail,
  onClose,
  onSaved,
}: {
  detail: PreparationDetail;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [input, setInput] = useState({
    title: detail.preparation.title,
    subject: detail.preparation.subject,
    grade: detail.preparation.grade,
    edition: detail.preparation.edition,
    requirements: detail.preparation.requirements,
    status: detail.preparation.status,
    classIds: detail.preparation.classIds,
    knowledgeIds: detail.preparation.knowledgeIds ?? [],
  });
  const [classes, setClasses] = useState<SchoolClass[]>([]),
    [nodes, setNodes] = useState<KnowledgeEntity[]>([]);
  const [knowledgeQuery, setKnowledgeQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [catalogError, setCatalogError] = useState("");
  const operation = useRef(crypto.randomUUID());
  const expectedUpdatedAt = useRef(detail.preparation.updatedAt);
  useEffect(() => {
    let active = true;
    void Promise.allSettled([listRosterClasses(), getKnowledgeGraph()]).then(
      ([roster, graph]) => {
        if (!active) return;
        if (roster.status === "fulfilled") setClasses(roster.value);
        if (graph.status === "fulfilled") setNodes(graph.value.nodes);
        if (roster.status === "rejected" || graph.status === "rejected")
          setCatalogError(
            "班级或知识目录暂未读全，已有选择保留，其他信息仍可保存。",
          );
      },
    );
    return () => {
      active = false;
    };
  }, []);
  const field = (
    key: "title" | "subject" | "grade" | "edition" | "requirements" | "status",
    value: string,
  ) => {
    operation.current = crypto.randomUUID();
    setInput((current) => ({ ...current, [key]: value }));
  };
  const toggle = (key: "classIds" | "knowledgeIds", id: string) => {
    operation.current = crypto.randomUUID();
    setInput((current) => ({
      ...current,
      [key]: current[key].includes(id)
        ? current[key].filter((value) => value !== id)
        : [...current[key], id],
    }));
  };
  const matches = nodes.filter(
    (node) =>
      node.status === "active" &&
      (!input.subject || node.subject === input.subject) &&
      `${node.name} ${node.aliases.join(" ")}`
        .toLocaleLowerCase()
        .includes(knowledgeQuery.toLocaleLowerCase()),
  );
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await updatePreparation(detail.preparation.id, {
        ...input,
        operationId: operation.current,
        expectedUpdatedAt: expectedUpdatedAt.current,
      });
      await onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ResponsiveDialog
      title="本课信息与要求"
      wide
      busy={busy}
      onClose={onClose}
      footer={
        <GlassButton
          disabled={busy || !input.title.trim()}
          onClick={() => void save()}
        >
          {busy ? "正在保存…" : "保存要求"}
        </GlassButton>
      }
    >
      <div className="qs-prep-settings-grid">
        {(
          [
            ["title", "备课名称"],
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
            />
          </label>
        ))}
        <label className="qs-prep-field qs-prep-span-all">
          本课要求
          <textarea
            rows={5}
            value={input.requirements}
            onChange={(event) => field("requirements", event.target.value)}
            placeholder="例如：两课时，保留原教案的问题顺序，练习以基础题为主。"
          />
        </label>
        <fieldset className="qs-prep-span-all qs-prep-option-group">
          <legend>适用班级（可多选，也可不选）</legend>
          {classes.length ? (
            <div className="qs-prep-checks">
              {classes.map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={input.classIds.includes(item.id)}
                    onChange={() => toggle("classIds", item.id)}
                  />
                  <span>{item.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p>尚无可选班级，仍可先备通用稿。</p>
          )}
        </fieldset>
        <fieldset className="qs-prep-span-all qs-prep-option-group">
          <legend>本课涉及的知识（选填）</legend>
          <p>关联已有知识，便于查找教材、方法和例题。不要求先建完图谱。</p>
          <input
            className="qs-prep-search"
            value={knowledgeQuery}
            onChange={(event) => setKnowledgeQuery(event.target.value)}
            placeholder="查找知识名称"
            aria-label="查找本课知识"
          />
          {!!input.knowledgeIds.length && (
            <div className="qs-prep-knowledge-selected">
              {input.knowledgeIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle("knowledgeIds", id)}
                  aria-label={`取消关联${nodes.find((node) => node.id === id)?.name ?? "知识"}`}
                >
                  {nodes.find((node) => node.id === id)?.name ?? "已关联知识"} ×
                </button>
              ))}
            </div>
          )}
          <div className="qs-prep-checks qs-prep-knowledge-options">
            {matches.slice(0, 50).map((node) => (
              <label key={node.id}>
                <input
                  type="checkbox"
                  checked={input.knowledgeIds.includes(node.id)}
                  onChange={() => toggle("knowledgeIds", node.id)}
                />
                <span>
                  {node.name}
                  <small>{node.description}</small>
                </span>
              </label>
            ))}
          </div>
          {!matches.length && <p>没有匹配的知识，可以直接依据资料备课。</p>}
          {matches.length > 50 && <p>显示前 50 项，请输入名称缩小范围。</p>}
        </fieldset>
        <label className="qs-prep-field">
          备课状态
          <select
            value={input.status}
            onChange={(event) => field("status", event.target.value)}
          >
            <option value="draft">草稿</option>
            <option value="ready">已选为授课稿</option>
            <option value="archived">已归档</option>
          </select>
        </label>
        {catalogError && (
          <p className="qs-prep-span-all" role="status">
            {catalogError}
          </p>
        )}
        {error && (
          <p className="qs-prep-error qs-prep-span-all" role="alert">
            {error}
          </p>
        )}
      </div>
    </ResponsiveDialog>
  );
}
export function ForkDialog({
  current,
  onClose,
  onSubmit,
}: {
  current: string;
  onClose: () => void;
  onSubmit: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(`${current} · 调整版`),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <ResponsiveDialog
      title="另存教学版本"
      subtitle="用于保留不同的教学安排。以后分别修改，资料仍可共用。"
      busy={busy}
      onClose={onClose}
      footer={
        <GlassButton
          disabled={!title.trim() || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSubmit(title.trim());
            } catch (cause) {
              setError((cause as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          另存并打开
        </GlassButton>
      }
    >
      <label className="qs-prep-field">
        版本名称
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
        />
      </label>
      {error && (
        <p role="alert" className="qs-prep-error">
          {error}
        </p>
      )}
    </ResponsiveDialog>
  );
}
