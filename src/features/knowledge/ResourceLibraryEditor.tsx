import ResponsiveDialog from '../../components/ResponsiveDialog';
import { GlassButton, GlassSegments } from '../../components/glass/Glass';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Eye,
  ExternalLink,
  FileText,
  Filter,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  DiscoverySuggestion,
  KnowledgeEntity,
  KnowledgeRelationType,
  LibraryResource,
  ResourceChunk,
  ResourceDetail,
  ResourceKind,
  ResourceProcessingMetrics,
} from "../../domain/types";
import {
  analyzeLibraryResource,
  batchReviewSuggestions,
  deleteLibraryResource,
  getResourceErrorMessage,
  ResourceMetadataInput,
  reviewSuggestion,
  retrieveLibraryResource,
  setLibraryResourcePageIncluded,
  updateLibraryResource,
  uploadLibraryResource,
  usePoolPdfAsResource,
} from "../../services/resourceApi";
import type { PoolItem } from '../../domain/materialPool';
import { listPoolItems } from '../../services/materialPoolApi';
import { formatFileSize, RESOURCE_UPLOAD_LIMIT_BYTES, RESOURCE_UPLOAD_LIMIT_LABEL } from "../../domain/uploadPolicy";
import {
  entityLabels,
  entityTones,
  relationLabels,
  resourceKindLabels,
  resourceStatusLabels,
  resourceStatusTones,
} from "./knowledgeUi";
import PdfPageViewer from "../../components/PdfPageViewer";
import ResponsiveChoiceDialog from "../../components/ResponsiveChoiceDialog";

interface ResourceLibraryEditorProps {
  resources: LibraryResource[];
  detail: ResourceDetail | null;
  selectedResourceId: string;
  nodes: KnowledgeEntity[];
  selectedPage: number;
  loading: boolean;
  narrowLayout: boolean;
  openReaderOnCompact: boolean;
  onSelectResource: (id: string) => void;
  onOpenPage: (page: number) => void;
  onDataChanged: (resourceId?: string) => Promise<void>;
  onShowToast: (message: string) => void;
}

const emptyMetadata: ResourceMetadataInput = {
  title: "",
  kind: "supplement",
  subject: "语文",
  grade: "七年级",
  publisher: "",
  edition: "",
  isPrimary: false,
};

const fieldClass =
  "w-full px-3 py-2 rounded-xl bg-white/80 dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 text-base sm:text-sm outline-none focus:border-emerald-600";

const describeParseError = (code?: string) =>
  ({
    PADDLEOCR_NOT_CONFIGURED:
      "尚未配置文档识别服务，请先在系统环境中配置 PaddleOCR。",
    PADDLEOCR_AUTH_FAILED: "文档识别服务鉴权失败，请检查访问令牌。",
    PADDLEOCR_RATE_LIMITED: "文档识别服务当前繁忙，请稍后重试。",
    PADDLEOCR_TIMEOUT: "本次文档识别超时，可缩小页码范围后重试。",
    PADDLEOCR_PARSE_FAILED: "文档识别失败，请稍后重试或更换页码范围。",
    MODEL_REQUEST_FAILED: "内容分析服务暂时不可用，已保留 OCR 内容。",
  })[code ?? ""] ?? "解析未完成，请重试。";

const compactPageRanges = (pages: number[]) => {
  if (!pages.length) return "暂无";
  const ranges: string[] = [];
  let start = pages[0];
  let end = pages[0];
  pages.slice(1).forEach((page) => {
    if (page === end + 1) end = page;
    else {
      ranges.push(start === end ? `${start}` : `${start}–${end}`);
      start = end = page;
    }
  });
  ranges.push(start === end ? `${start}` : `${start}–${end}`);
  return ranges.join("、");
};

const processingStageLabels = {
  queued: "已排队", preparing: "准备页码", ocr: "识别文字", analyzing: "分析内容",
  saving: "保存结果", completed: "已完成", failed: "失败", interrupted: "已中断",
} as const;

const processingPhaseLabels = {
  "pdf-extraction": "正在裁取页码",
  uploading: "正在提交文件",
  recognizing: "云端排队与识别",
  downloading: "正在下载识别结果",
  enhancing: "正在增强页面图片",
  "ocr-saving": "正在保存 OCR 内容",
  "rag-indexing": "正在写入 RAG",
  "knowledge-analysis": "OCR 已可查看，正在分析知识内容",
} as const;

const metricLabels: Array<[keyof ResourceProcessingMetrics, string]> = [
  ["pdfExtractionMs", "裁取 PDF"],
  ["uploadingMs", "提交文件"],
  ["recognizingMs", "云端识别"],
  ["downloadingMs", "下载结果"],
  ["enhancingMs", "图片增强"],
  ["ocrSavingMs", "保存 OCR"],
  ["ragIndexingMs", "RAG 入库"],
  ["analyzingMs", "知识分析"],
];

const formatDuration = (milliseconds: number) =>
  milliseconds < 1000 ? `${milliseconds}ms` : `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`;

let katexModulePromise: Promise<typeof import("katex")> | undefined;
const OcrFormula = ({ expression }: { expression: string }) => {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let active = true;
    katexModulePromise ??= import("katex");
    void katexModulePromise.then(({ default: katex }) => {
      if (active) setHtml(katex.renderToString(expression, { throwOnError: false, strict: "ignore", output: "html" }));
    });
    return () => { active = false; };
  }, [expression]);
  return html
    ? <span className="ocr-formula inline-block max-w-full overflow-x-auto align-middle" dangerouslySetInnerHTML={{ __html: html }} />
    : <span>{expression}</span>;
};

const OcrRichText = ({ text, className = "" }: { text: string; className?: string }) => {
  const formulaPattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+\$)/g;
  const parts = text.split(formulaPattern).filter(Boolean);
  return (
    <span className={className}>
      {parts.map((part, index) => {
        const delimiters = part.startsWith("$$") || part.startsWith("\\(") || part.startsWith("\\[") ? 2 : 1;
        const isFormula = (part.startsWith("$$") && part.endsWith("$$"))
          || (part.startsWith("$") && part.endsWith("$"))
          || (part.startsWith("\\(") && part.endsWith("\\)"))
          || (part.startsWith("\\[") && part.endsWith("\\]"));
        if (!isFormula) return <React.Fragment key={index}>{part}</React.Fragment>;
        const expression = part.slice(delimiters, -delimiters).trim();
        if (!expression) return null;
        return <React.Fragment key={index}><OcrFormula expression={expression} /></React.Fragment>;
      })}
    </span>
  );
};

interface OcrTableCell {
  text: string;
  header: boolean;
  colSpan: number;
  rowSpan: number;
}

const parseOcrTable = (markup: string): OcrTableCell[][] => {
  if (typeof DOMParser === "undefined") return [];
  const document = new DOMParser().parseFromString(markup, "text/html");
  const table = document.querySelector("table");
  if (!table) return [];
  return Array.from(table.rows).slice(0, 200).map((row) =>
    Array.from(row.cells).slice(0, 40).map((cell) => ({
      text: cell.textContent?.trim() ?? "",
      header: cell.tagName.toLowerCase() === "th",
      colSpan: Math.min(Math.max(cell.colSpan || 1, 1), 20),
      rowSpan: Math.min(Math.max(cell.rowSpan || 1, 1), 100),
    })),
  );
};

const OcrContentBlock = ({ chunk }: { chunk: ResourceChunk }) => {
  if (chunk.contentType === "table") {
    const rows = parseOcrTable(chunk.markdown ?? chunk.text);
    if (rows.length) return (
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-zinc-700">
        <table className="min-w-full border-collapse text-left text-xs">
          <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-slate-200 last:border-0 dark:border-zinc-700">{row.map((cell, cellIndex) => {
            const Cell = cell.header ? "th" : "td";
            return <Cell key={cellIndex} colSpan={cell.colSpan} rowSpan={cell.rowSpan} className={`border-r border-slate-200 px-2 py-1.5 align-top last:border-r-0 dark:border-zinc-700 ${cell.header ? "bg-slate-100 font-bold dark:bg-zinc-800" : "bg-white dark:bg-zinc-900"}`}><OcrRichText text={cell.text} /></Cell>;
          })}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  if (chunk.contentType === "image") return (
    <figure className="space-y-2">
      {chunk.resourceUrls?.length
        ? chunk.resourceUrls.map((url) => <img key={url} loading="lazy" src={url} alt="OCR 提取图片" className="max-h-80 max-w-full rounded-lg border border-slate-200 object-contain dark:border-zinc-700" />)
        : <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">识别到图片区域，但没有可用的本地图片文件；可查看上方页面底图。</p>}
    </figure>
  );
  const content = chunk.markdown ?? chunk.text;
  if (chunk.contentType === "heading") return <h4 className="text-sm font-black text-slate-700 dark:text-slate-200"><OcrRichText text={content} /></h4>;
  return <p className="whitespace-pre-wrap"><OcrRichText text={content} /></p>;
};

const OcrPageImage = ({ src, pageNumber }: { src: string; pageNumber: number }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return <div role="status" className="grid aspect-[210/297] place-items-center bg-slate-50 px-6 text-center text-sm text-slate-500"><span><strong className="block text-slate-700">第 {pageNumber} 页图片暂不可用</strong><span className="mt-1 block">文字结果仍然保留，可重新解析这一页以恢复底图。</span></span></div>;
  return <img loading="lazy" src={src} alt={`第 ${pageNumber} 页 OCR 识别底图`} onError={() => setFailed(true)} className="w-full object-contain" />;
};

const MetadataDialog = ({
  resource,
  onClose,
  onSaved,
  onShowToast,
}: {
  resource?: LibraryResource;
  onClose: () => void;
  onSaved: (resourceId: string) => Promise<void>;
  onShowToast: (message: string) => void;
}) => {
  const formId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [metadata, setMetadata] = useState<ResourceMetadataInput>(
    resource
      ? {
          title: resource.title,
          kind: resource.kind,
          subject: resource.subject,
          grade: resource.grade,
          publisher: resource.publisher,
          edition: resource.edition,
          isPrimary: resource.isPrimary,
        }
      : emptyMetadata,
  );
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<'upload' | 'pool'>('upload');
  const [poolItemId, setPoolItemId] = useState('');
  const [poolQuery, setPoolQuery] = useState('');
  const [poolItems, setPoolItems] = useState<PoolItem[]>([]);
  const [poolNextOffset, setPoolNextOffset] = useState<number | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  useEffect(() => {
    if (resource || source !== 'pool') return;
    let cancelled = false;
    setPoolLoading(true);
    void listPoolItems({ q: poolQuery, mime: 'application/pdf' }).then(result => {
      if (!cancelled) { setPoolItems(result.items); setPoolNextOffset(result.nextOffset); }
    }).catch(error => {
      if (!cancelled) setFormError(error instanceof Error ? error.message : '材料池加载失败');
    }).finally(() => { if (!cancelled) setPoolLoading(false); });
    return () => { cancelled = true; };
  }, [resource, source, poolQuery]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resource && (source === 'pool' ? !poolItemId : !file)) {
      setFormError(source === 'pool' ? '请选择材料池中的 PDF' : '请选择 PDF 文件');
      return;
    }
    if (file && file.size > RESOURCE_UPLOAD_LIMIT_BYTES) {
      setFormError(`这个文件为 ${formatFileSize(file.size)}，超过 ${RESOURCE_UPLOAD_LIMIT_LABEL} 上限。请压缩或拆分 PDF，也可以联系管理员在 MacBook 本地导入。`);
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const poolResult = !resource && source === 'pool' ? await usePoolPdfAsResource(poolItemId, metadata) : null;
      const saved = resource
        ? await updateLibraryResource(resource.id, metadata)
        : poolResult?.resource ?? await uploadLibraryResource(file!, metadata);
      await onSaved(saved.id);
      onShowToast(resource ? "资料信息已更新" : poolResult ? (poolResult.reused ? '这份材料已在资料编辑中，已打开已有资料' : '已从材料池选用 PDF，原件仍在材料池') : "资料已上传");
      onClose();
    } catch (error) {
      const message = getResourceErrorMessage(error);
      setFormError(message);
      onShowToast(message);
    } finally {
      setSaving(false);
    }
  };
  const update = <K extends keyof ResourceMetadataInput>(
    key: K,
    value: ResourceMetadataInput[K],
  ) => setMetadata((current) => ({ ...current, [key]: value }));
  return (
    <ResponsiveDialog title={resource ? '编辑资料' : '上传资料'}
      subtitle={resource ? resource.fileName : `仅支持 PDF，单个文件不超过 ${RESOURCE_UPLOAD_LIMIT_LABEL}`}
      busy={saving} compactFull onClose={onClose}
      footer={<>
        <GlassButton type="button" disabled={saving} onClick={onClose} variant="secondary">取消</GlassButton>
        <GlassButton type="submit" form={formId} disabled={saving} variant="primary" className="flex items-center gap-2">
          {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {resource ? '保存' : source === 'pool' ? '选用材料' : '上传'}
        </GlassButton>
      </>}
    >
      <form id={formId} onSubmit={submit}>
        <fieldset disabled={saving} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          {!resource && <div className="min-w-0 sm:col-span-2"><GlassSegments label="资料来源" value={source} options={[{ value: 'upload', label: '上传新 PDF' }, { value: 'pool', label: '从材料池选择' }]} onChange={value => { setSource(value); if (value === 'upload') setPoolItemId(''); else setFile(null); }} /></div>}
          {!resource && source === 'pool' && <div className="space-y-2 sm:col-span-2"><input aria-label="搜索材料池 PDF" value={poolQuery} onChange={event => setPoolQuery(event.target.value)} placeholder="搜索材料池 PDF" className={'qs-field-input '+(fieldClass)} />{poolLoading ? <p className="text-sm text-slate-500">正在查找材料…</p> : poolItems.length ? <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-zinc-700">{poolItems.map(item => <button key={item.id} type="button" onClick={() => { setPoolItemId(item.id); if (!metadata.title) update('title', item.originalName.replace(/\.pdf$/i, '')); }} className={`min-h-11 w-full rounded-lg px-3 text-left text-sm ${poolItemId === item.id ? 'bg-emerald-100 font-bold text-emerald-900' : 'hover:bg-slate-100 dark:hover:bg-zinc-800'}`}>{item.originalName}{item.resourceId ? ' · 已用于资料编辑' : ''}</button>)}</div> : <p className="text-sm text-slate-500">未找到 PDF。可以在材料池上传后再选择。</p>}{poolNextOffset !== null && <GlassButton type="button" variant="secondary" containerClassName="w-full" className="min-h-11 text-sm" onClick={async () => { try { const result = await listPoolItems({ q: poolQuery, mime: 'application/pdf', offset: poolNextOffset }); setPoolItems(current => [...current, ...result.items]); setPoolNextOffset(result.nextOffset); } catch (error) { setFormError(error instanceof Error ? error.message : '加载更多材料失败'); } }}>加载更多 PDF</GlassButton>}</div>}
          {!resource && source === 'upload' && (
            <GlassButton containerClassName="h-28 sm:col-span-2"
              type="button"
              onClick={() => {
                if (inputRef.current) inputRef.current.value = "";
                inputRef.current?.click();
              }}
              variant="secondary" className="transition-colors grid place-items-center text-center sm:col-span-2"
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setFormError("");
                  if (selected && selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
                    setFile(null);
                    setFormError("请选择 PDF 文件，其他文件类型暂不支持");
                    return;
                  }
                  setFile(selected);
                  setShowPreview(false);
                  if (selected && !metadata.title)
                    update("title", selected.name.replace(/\.pdf$/i, ""));
                }}
              />
              <span>
                <Upload className="w-6 h-6 mx-auto text-emerald-700 mb-2" />
                <span className="block text-sm font-bold text-slate-700 dark:text-slate-200">
                  {file?.name ?? "选择 PDF"}
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  {file ? `${formatFileSize(file.size)} · ${file.size > RESOURCE_UPLOAD_LIMIT_BYTES ? `超过 ${RESOURCE_UPLOAD_LIMIT_LABEL} 上限` : '可以上传'}` : `单个文件不超过 ${RESOURCE_UPLOAD_LIMIT_LABEL}`}
                </span>
              </span>
            </GlassButton>
          )}
          {!resource && source === 'upload' && file && (
            <div className="sm:col-span-2">
              <GlassButton type="button" onClick={() => setShowPreview(value => !value)} variant="secondary" className="min-h-11 px-4 text-sm font-bold">
                {showPreview ? "收起预览" : "预览首页"}
              </GlassButton>
              {showPreview ? <PdfPageViewer source={file} page={1} navigation={false} className="mt-3 h-[min(52dvh,420px)]" /> : null}
            </div>
          )}
          {formError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 sm:col-span-2 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{formError}</p>}
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-bold text-slate-500">资料名称</span>
            <input
              required
              value={metadata.title}
              onChange={(event) => update("title", event.target.value)}
              className={'qs-field-input '+(fieldClass)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-500">资料类型</span>
            <select
              value={metadata.kind}
              onChange={(event) =>
                update("kind", event.target.value as ResourceKind)
              }
              className={'qs-field-input '+(fieldClass)}
            >
              {Object.entries(resourceKindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-500">学科</span>
            <input
              value={metadata.subject}
              onChange={(event) => update("subject", event.target.value)}
              className={'qs-field-input '+(fieldClass)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-500">年级</span>
            <input
              value={metadata.grade}
              onChange={(event) => update("grade", event.target.value)}
              className={'qs-field-input '+(fieldClass)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-500">出版社</span>
            <input
              value={metadata.publisher}
              onChange={(event) => update("publisher", event.target.value)}
              className={'qs-field-input '+(fieldClass)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-500">版本</span>
            <input
              value={metadata.edition}
              onChange={(event) => update("edition", event.target.value)}
              className={'qs-field-input '+(fieldClass)}
            />
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm font-bold text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={metadata.isPrimary}
              onChange={(event) => update("isPrimary", event.target.checked)}
              className="accent-emerald-700"
            />
            设为主要来源
          </label>

        </fieldset>
      </form>
    </ResponsiveDialog>
  );
};

const SuggestionItem = ({
  item,
  nodes,
  subject,
  onReview,
  selected,
  onToggle,
}: {
  item: DiscoverySuggestion;
  nodes: KnowledgeEntity[];
  subject: string;
  onReview: (
    decision: "accepted" | "ignored" | "merged",
    options?: { mergeTargetId?: string; primaryMotherId?: string | null },
  ) => void;
  selected: boolean;
  onToggle: () => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [primaryMotherId, setPrimaryMotherId] = useState(
    item.primaryMotherId ?? "",
  );
  const possibleMothers = nodes.filter(
    (node) =>
      node.subject === subject &&
      ["domain", "topic", "knowledge"].includes(node.type),
  );
  const relationTarget = item.targetNodeId
    ? nodes.find((node) => node.id === item.targetNodeId)
    : undefined;
  const relationSource = item.existingNodeId
    ? nodes.find((node) => node.id === item.existingNodeId)
    : undefined;
  const entityType = [
    "knowledge",
    "question-type",
    "method",
    "example",
    "ability",
    "error",
  ].includes(item.proposedType)
    ? (item.proposedType as KnowledgeEntity["type"])
    : "knowledge";
  return (
    <div className="border-b border-slate-200/70 dark:border-zinc-800 last:border-0 py-3">
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1 accent-emerald-700"
        />
        <button
          onClick={() => setExpanded((value) => !value)}
          className="min-w-0 flex-1 text-left"
        >
          <span
            className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${entityTones[entityType]}`}
          >
            {item.kind === "source-link"
              ? "已有匹配"
              : item.kind === "relation"
                ? relationLabels[item.proposedType as KnowledgeRelationType]
              : entityLabels[entityType]}
          </span>
          <span className="block text-sm font-bold text-slate-800 dark:text-slate-100 mt-1 truncate">
            {item.proposedName}
          </span>
          <span className="block text-xs text-slate-400 mt-0.5">
            可信度 {Math.round(item.confidence * 100)}%
          </span>
        </button>
        <button
          onClick={() =>
            onReview(
              "accepted",
              item.kind === "node" && item.proposedType === "knowledge"
                ? { primaryMotherId: primaryMotherId || null }
                : undefined,
            )
          }
          className="w-8 h-8 rounded-lg grid place-items-center text-emerald-700 hover:bg-emerald-50"
          title="同意"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          onClick={() => onReview("ignored")}
          className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100"
          title="忽略"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {expanded && (
        <div className="ml-6 mt-3 p-3 rounded-lg bg-slate-50 dark:bg-zinc-900/60 text-xs text-slate-600 dark:text-slate-300 space-y-2">
          <p>{item.description || "暂无说明"}</p>
          <p className="text-slate-400">{item.rationale}</p>
          {item.kind === "relation" && item.proposedType === "parent" && (
            <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 font-bold text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200">
              子节点：{relationSource?.name ?? "待确认"} → 主要母节点：
              {relationTarget?.name ?? "待确认"}
            </p>
          )}
          {item.kind === "node" && item.proposedType === "knowledge" && (
            <label className="block space-y-1.5">
              <span className="font-bold text-slate-500 dark:text-zinc-300">
                建议主要母节点
              </span>
              <select
                value={primaryMotherId}
                onChange={(event) => setPrimaryMotherId(event.target.value)}
                className="qs-field-input min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">主要母节点待确认</option>
                {possibleMothers.map((node) => (
                  <option key={node.id} value={node.id}>
                    {entityLabels[node.type]} · {node.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(item.kind === "node" || item.kind === "source-link") && (
            <div className="flex gap-2">
              <select
                value={mergeTarget}
                onChange={(event) => setMergeTarget(event.target.value)}
                className="qs-field-input min-w-0 flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              >
                <option value="">合并到已有节点...</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {entityLabels[node.type]} · {node.name}
                  </option>
                ))}
              </select>
              <GlassButton
                disabled={!mergeTarget}
                onClick={() =>
                  onReview("merged", { mergeTargetId: mergeTarget })
                }
                variant="secondary" className="px-3 disabled:opacity-40"
              >
                合并
              </GlassButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const OcrPageReader = ({
  resourceId,
  pages,
  chunks,
  selectedPage,
  onSelectPage,
}: {
  resourceId: string;
  pages: ResourceDetail["pages"];
  chunks: ResourceChunk[];
  selectedPage: number;
  onSelectPage: (page: number) => void;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const suppressScrollSelectionRef = useRef(false);
  const [showRecognitionBoxes, setShowRecognitionBoxes] = useState(false);
  const visiblePages = pages.filter((page) => page.included && page.parseStatus === "ready");
  useEffect(() => {
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-resource-page="${selectedPage}"]`);
    if (target && Math.abs(target.getBoundingClientRect().top - (scrollRef.current?.getBoundingClientRect().top ?? 0)) > 120) {
      suppressScrollSelectionRef.current = true;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      const timer = window.setTimeout(() => { suppressScrollSelectionRef.current = false; }, 600);
      return () => window.clearTimeout(timer);
    }
  }, [resourceId, selectedPage]);
  const updateCurrentPage = () => {
    if (suppressScrollSelectionRef.current) return;
    const container = scrollRef.current;
    if (!container) return;
    const top = container.getBoundingClientRect().top + 90;
    const candidates = Array.from(container.querySelectorAll("[data-resource-page]")) as HTMLElement[];
    let closest: HTMLElement | null = null;
    candidates.forEach((item) => {
      if (!closest || Math.abs(item.getBoundingClientRect().top - top) < Math.abs(closest.getBoundingClientRect().top - top)) closest = item;
    });
    const page = Number(closest?.dataset.resourcePage);
    if (page && page !== selectedPage) onSelectPage(page);
  };
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-slate-200/50 dark:bg-zinc-950">
      <div className="z-20 flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-1.5 backdrop-blur sm:px-4 dark:border-zinc-800 dark:bg-zinc-900/95">
        <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-200"><Eye className="h-4 w-4 shrink-0" /><span className="truncate">OCR 第 {selectedPage} 页</span></span>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-xs text-slate-400 md:inline">仅显示已解析且未排除的页面 · 共 {visiblePages.length} 页</span>
          <button type="button" onClick={() => setShowRecognitionBoxes((value) => !value)} className={`min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 text-xs font-bold ${showRecognitionBoxes ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500 dark:bg-zinc-800"}`}>{showRecognitionBoxes ? "隐藏识别框" : "显示识别框"}</button>
        </div>
      </div>
      <div ref={scrollRef} onScroll={updateCurrentPage} className="min-h-0 flex-1 scroll-smooth overflow-y-auto p-3">
        <div className="mx-auto max-w-5xl space-y-4">
          {visiblePages.map((page) => {
            const pageChunks = chunks.filter((chunk) => chunk.level === "content" && chunk.pageStart <= page.pageNumber && chunk.pageEnd >= page.pageNumber);
            const imageUrl = `/api/resources/${resourceId}/pages/${page.pageNumber}/image`;
            return (
              <article key={page.pageNumber} data-resource-page={page.pageNumber} className={`scroll-mt-3 overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-zinc-900 ${page.included ? "border-slate-200 dark:border-zinc-800" : "border-dashed border-rose-300 opacity-60"}`}>
                <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-zinc-800">
                  <div className="flex items-center gap-2"><strong className="text-xs">第 {page.pageNumber} 页</strong>{!page.included && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">已排除</span>}</div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400"><span>{page.parseStatus === "ready" ? "已解析" : page.parseStatus === "processing" ? "解析中" : page.parseStatus === "failed" ? "解析失败" : "未解析"}</span><span>·</span><span>{page.ragStatus === "indexed" ? `RAG 已入库 ${page.ragChunkCount} 块` : page.ragStatus === "indexing" ? "RAG 入库中" : page.ragStatus === "excluded" ? "不参与 RAG" : "RAG 未入库"}</span></div>
                </header>
                <div className="p-3">
                    <figure className="mx-auto max-w-3xl">
                      <figcaption className="mb-2 text-[10px] font-black uppercase tracking-wide text-emerald-700">OCR 识别版</figcaption>
                      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <OcrPageImage src={imageUrl} pageNumber={page.pageNumber} />
                        {pageChunks.filter((chunk) => chunk.boundingBox).slice(0, 80).map((chunk) => (
                          <span key={chunk.id} title={chunk.text.slice(0, 180)} className={`absolute overflow-hidden text-[7px] leading-tight ${showRecognitionBoxes ? "border border-emerald-500 bg-emerald-100/80 text-emerald-950" : "border border-transparent bg-transparent text-transparent selection:bg-blue-200/70"}`} style={{ left: `${chunk.boundingBox!.x * 100}%`, top: `${chunk.boundingBox!.y * 100}%`, width: `${chunk.boundingBox!.width * 100}%`, height: `${chunk.boundingBox!.height * 100}%` }}>{chunk.contentType === "table" ? "表格" : chunk.contentType === "image" ? "图片" : <OcrRichText text={chunk.text} />}</span>
                        ))}
                      </div>
                      <details className="mt-2 rounded-lg bg-slate-50 p-2 text-xs dark:bg-zinc-950"><summary className="cursor-pointer font-bold text-slate-600 dark:text-slate-300">查看结构化识别内容（{pageChunks.length} 块）</summary><div className="mt-2 max-h-80 space-y-3 overflow-y-auto text-slate-500">{pageChunks.map((chunk) => <section key={chunk.id} className="space-y-1"><span className="inline-flex rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-zinc-800 dark:text-slate-300">{chunk.sourceType || chunk.contentType || "text"}</span><OcrContentBlock chunk={chunk} /></section>)}</div></details>
                    </figure>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default function ResourceLibraryEditor({
  resources,
  detail,
  selectedResourceId,
  nodes,
  selectedPage,
  loading,
  narrowLayout,
  openReaderOnCompact,
  onSelectResource,
  onOpenPage,
  onDataChanged,
  onShowToast,
}: ResourceLibraryEditorProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | ResourceKind>("all");
  const [showKindPicker, setShowKindPicker] = useState(false);
  const [dialog, setDialog] = useState<"upload" | "edit" | null>(null);
  const [inspectorTab, setInspectorTab] = useState<
    "overview" | "pages" | "rag" | "review"
  >("overview");
  const [readingMode, setReadingMode] = useState<"pdf" | "ocr">("pdf");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [compactSurface, setCompactSurface] = useState<"library" | "reader">("library");
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(20);
  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([]);
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<Array<ResourceChunk & { retrievalRank: number }>>([]);
  const [ragSearching, setRagSearching] = useState(false);
  const [pdfReaderCache, setPdfReaderCache] = useState<Array<{
    id: string;
    source: string;
    title: string;
  }>>([]);
  const pdfReaderOrderRef = useRef<string[]>([]);
  const filtered = useMemo(
    () =>
      resources.filter(
        (resource) =>
          (kind === "all" || resource.kind === kind) &&
          `${resource.title}${resource.fileName}${resource.tags.join("")}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [kind, query, resources],
  );
  const pending =
    detail?.suggestions.filter((item) => item.status === "pending") ?? [];
  const readyPages = detail?.pages.filter((page) => page.parseStatus === "ready").map((page) => page.pageNumber) ?? [];
  const currentPageState = detail?.pages.find((page) => page.pageNumber === selectedPage);
  const latestJob = detail?.processingJobs[0];
  const pageWindowStart = Math.floor(Math.max(0, selectedPage - 1) / 50) * 50;
  const visiblePages = detail?.pages.slice(pageWindowStart, pageWindowStart + 50) ?? [];
  const selectedResource = resources.find((resource) => resource.id === selectedResourceId);
  const displayedResource = selectedResource ?? detail;
  const detailPending = Boolean(selectedResourceId && detail?.id !== selectedResourceId);
  const pdfSourceUrl = displayedResource?.publicUrl ?? detail?.publicUrl ?? "";
  useEffect(() => {
    if (!selectedResourceId || !pdfSourceUrl) return;
    const title = displayedResource?.title ?? detail?.title ?? "PDF 原文";
    const nextOrder = [
      ...pdfReaderOrderRef.current.filter((id) => id !== selectedResourceId),
      selectedResourceId,
    ].slice(-3);
    pdfReaderOrderRef.current = nextOrder;
    setPdfReaderCache((current) => {
      if (current.some((entry) => entry.id === selectedResourceId)) return current;
      return [
        ...current.filter((entry) => nextOrder.includes(entry.id)),
        { id: selectedResourceId, source: pdfSourceUrl, title },
      ];
    });
  }, [detail?.title, displayedResource?.title, pdfSourceUrl, selectedResourceId]);
  useEffect(() => {
    if (narrowLayout && openReaderOnCompact && detail) setCompactSurface("reader");
  }, [detail?.id, narrowLayout, openReaderOnCompact]);
  const selectResource = (resourceId: string) => {
    setCompactSurface("reader");
    onSelectResource(resourceId);
  };
  const navigatePage = (page: number) => {
    onOpenPage(page);
  };
  const runAnalysis = async () => {
    if (!detail) return;
    try {
      await analyzeLibraryResource(detail.id, pageStart, pageEnd);
      await onDataChanged(detail.id);
      onShowToast(`正在解析第 ${pageStart}–${pageEnd} 页`);
    } catch (error) {
      onShowToast(
        `无法开始解析：${error instanceof Error ? error.message : "未知错误"}`,
      );
    }
  };
  const review = async (
    id: string,
    decision: "accepted" | "ignored" | "merged",
    options?: { mergeTargetId?: string; primaryMotherId?: string | null },
  ) => {
    try {
      await reviewSuggestion(id, decision, options);
      await onDataChanged(detail?.id);
      onShowToast(
        decision === "accepted"
          ? "已加入知识图谱"
          : decision === "merged"
            ? "已合并到已有节点"
            : "已忽略",
      );
    } catch (error) {
      onShowToast(
        `审核失败：${error instanceof Error ? error.message : "未知错误"}`,
      );
    }
  };
  const batchReview = async (decision: "accepted" | "ignored") => {
    if (!selectedSuggestions.length) return;
    try {
      await batchReviewSuggestions(selectedSuggestions, decision);
      setSelectedSuggestions([]);
      await onDataChanged(detail?.id);
      onShowToast(`已处理 ${selectedSuggestions.length} 项`);
    } catch (error) {
      onShowToast(
        `批量审核失败：${error instanceof Error ? error.message : "未知错误"}`,
      );
    }
  };
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className={`glass-panel min-h-0 flex-col overflow-hidden rounded-2xl ${compactSurface === "reader" ? "hidden lg:flex" : "flex"}`}>
        <div className="p-3 border-b border-slate-200/70 dark:border-zinc-800 space-y-3">
          <GlassButton
            onClick={() => setDialog("upload")}
            variant="primary" containerClassName="w-full" className="flex min-h-11 items-center justify-center gap-2 py-2.5 text-sm"
          >
            <Plus className="w-4 h-4" />
            上传资料
          </GlassButton>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索资料"
              className="qs-field-input min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-base outline-none sm:text-sm dark:border-zinc-800 dark:bg-zinc-900/60"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <GlassButton type="button" onClick={() => setShowKindPicker(true)} variant="secondary" containerClassName="flex-1 sm:hidden" className="flex min-h-11 items-center justify-between px-3 text-sm font-bold">
              <span>{kind === "all" ? "全部资料" : resourceKindLabels[kind]}</span><ChevronDown className="h-4 w-4 text-slate-400" />
            </GlassButton>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
              className="qs-field-input hidden flex-1 bg-transparent text-sm text-slate-500 outline-none sm:block"
            >
              <option value="all">全部资料</option>
              {Object.entries(resourceKindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-400">{filtered.length}</span>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-slate-200/60 dark:divide-zinc-800/70">
          {filtered.map((resource) => (
            <button
              key={resource.id}
              onClick={() => selectResource(resource.id)}
              className={`min-h-16 w-full p-3.5 text-left transition-colors ${selectedResourceId === resource.id ? "bg-emerald-700/10 border-l-2 border-emerald-700" : "hover:bg-slate-50 dark:hover:bg-zinc-900/50 border-l-2 border-transparent"}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-zinc-800 grid place-items-center shrink-0">
                  <FileText className="w-4 h-4 text-slate-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-2">
                    {resource.title}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-slate-400">
                      {resourceKindLabels[resource.kind]}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-bold ${resourceStatusTones[resource.status]}`}
                    >
                      {resourceStatusLabels[resource.status]}
                    </span>
                    {resource.isPrimary && (
                      <span className="text-xs font-bold text-emerald-700">
                        主要来源
                      </span>
                    )}
                  </div>
                </div>
                {loading && selectedResourceId === resource.id ? <LoaderCircle className="mt-1 h-4 w-4 animate-spin text-emerald-700" /> : <ChevronRight className="w-4 h-4 text-slate-300 mt-1" />}
              </div>
            </button>
          ))}
          {!filtered.length && (
            <div className="py-16 text-center text-sm text-slate-400">
              <BookOpen className="w-7 h-7 mx-auto mb-2 opacity-50" />
              暂无资料
            </div>
          )}
        </div>
      </aside>

      <section className={`glass-panel h-full min-h-0 min-w-0 overflow-hidden rounded-2xl ${compactSurface === "library" ? "hidden lg:block" : "block"}`}>
        {loading && !detail ? (
          <div className="h-full grid place-items-center text-slate-400">
            <LoaderCircle className="w-6 h-6 animate-spin" />
          </div>
        ) : !detail ? (
          <div className="grid h-full min-h-80 place-items-center text-center">
            <div>
              <FileText className="w-10 h-10 mx-auto text-slate-300" />
              <p className="font-bold text-slate-600 dark:text-slate-300 mt-3">
                选择或上传一份资料
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <header className="flex min-h-14 items-center gap-2 border-b border-slate-200/70 px-2 py-2 sm:gap-3 sm:px-4 sm:py-3 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setCompactSurface("library")}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-zinc-800"
                aria-label="返回资料列表"
                title="返回资料列表"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-slate-900 dark:text-slate-50 truncate">
                    {displayedResource?.title ?? detail.title}
                  </h3>
                  <span
                    className={`hidden shrink-0 rounded-md px-2 py-0.5 text-xs font-bold sm:inline-flex ${resourceStatusTones[displayedResource?.status ?? detail.status]}`}
                  >
                    {resourceStatusLabels[displayedResource?.status ?? detail.status]}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  {displayedResource?.subject || "未分类"} · {displayedResource?.grade || "全年级"} ·{" "}
                  {displayedResource?.pageCount ?? 0} 页
                </p>
              </div>
              <button
                onClick={() => setDialog("edit")}
                disabled={detailPending}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-slate-100 disabled:opacity-35 dark:hover:bg-zinc-800"
                title="编辑资料"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={async () => {
                  if (detailPending) return;
                  if (!window.confirm(`删除“${detail.title}”？`)) return;
                  try {
                    await deleteLibraryResource(detail.id);
                    await onDataChanged();
                    if (narrowLayout) setCompactSurface("library");
                    onShowToast("资料已删除");
                  } catch (error) {
                    onShowToast(
                      `删除失败：${error instanceof Error ? error.message : "未知错误"}`,
                    );
                  }
                }}
                disabled={detailPending}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-rose-500 hover:bg-rose-50 disabled:opacity-35"
                title="删除资料"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex min-h-0 flex-col bg-slate-200/50 dark:bg-zinc-950">
                <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-zinc-800">
                    <button onClick={() => setReadingMode("pdf")} className={`min-h-10 rounded-md px-3 py-1.5 text-xs font-bold sm:min-h-0 ${readingMode === "pdf" ? "bg-white text-slate-900 shadow-sm dark:bg-zinc-700 dark:text-white" : "text-slate-500"}`}>PDF 原文</button>
                    <button onClick={() => {
                      setReadingMode("ocr");
                      const current = detail.pages.find((page) => page.pageNumber === selectedPage);
                      if (!current?.included || current.parseStatus !== "ready") {
                        const firstReady = detail.pages.find((page) => page.included && page.parseStatus === "ready");
                        if (firstReady) onOpenPage(firstReady.pageNumber);
                      }
                    }} className={`min-h-10 rounded-md px-3 py-1.5 text-xs font-bold sm:min-h-0 ${readingMode === "ocr" ? "bg-white text-emerald-800 shadow-sm dark:bg-zinc-700 dark:text-emerald-300" : "text-slate-500"}`}>OCR 识别</button>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    {readingMode === "pdf" ? <a href={displayedResource?.publicUrl ?? detail.publicUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 sm:px-3 dark:text-emerald-300 dark:hover:bg-emerald-950/30" title="在新页面打开 PDF"><ExternalLink className="h-4 w-4" /><span className="hidden sm:inline">在新页面打开 PDF</span><span className="sm:hidden">新页面打开</span></a> : <span className="whitespace-nowrap text-xs font-bold text-slate-500">第 {selectedPage} 页</span>}
                    <GlassButton containerClassName="lg:hidden" onClick={() => setInspectorOpen(true)} variant="secondary" className="min-h-11 px-3 py-1.5 text-xs">解析</GlassButton>
                  </div>
                </div>
                <div className="relative flex min-h-0 flex-1 flex-col p-2 sm:p-3">
                  {readingMode === "pdf" && <p className="mb-2 shrink-0 px-1 text-xs leading-5 text-slate-500 sm:hidden dark:text-slate-400">PDF 由浏览器加载，首次打开可能需要几秒，具体取决于文件大小。</p>}
                  <div className={readingMode === "pdf" ? "relative min-h-0 flex-1" : "invisible pointer-events-none absolute inset-2 h-auto sm:inset-3"}>
                    {pdfReaderCache.map((entry) => (
                      <iframe
                        key={entry.id}
                        src={entry.source}
                        title={`${entry.title} PDF 原文`}
                        aria-hidden={entry.id !== selectedResourceId}
                        className={`${entry.id === selectedResourceId ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"} absolute inset-0 h-full min-h-0 w-full rounded-lg border border-slate-200 bg-white dark:border-zinc-800`}
                      />
                    ))}
                  </div>
                  <div className={readingMode === "ocr" ? "min-h-0 flex-1" : "invisible pointer-events-none absolute inset-2 h-auto sm:inset-3"}>
                    <OcrPageReader resourceId={detail.id} pages={detail.pages} chunks={detail.chunks} selectedPage={selectedPage} onSelectPage={onOpenPage} />
                  </div>
                  {detailPending ? <div className="absolute inset-2 z-20 grid place-items-center rounded-lg bg-slate-100/95 px-5 text-center backdrop-blur-sm sm:inset-3 dark:bg-zinc-950/95" role="status" aria-live="polite"><div><LoaderCircle className="mx-auto h-7 w-7 animate-spin text-emerald-700" /><p className="mt-3 text-sm font-black text-slate-700 dark:text-slate-200">正在切换资料</p></div></div> : null}
                </div>
              </div>
              {inspectorOpen && <button aria-label="关闭详情" onClick={() => setInspectorOpen(false)} className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px] lg:hidden" />}
              <aside className={`${inspectorOpen ? "fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] rounded-t-3xl bg-white shadow-2xl dark:bg-zinc-900" : "hidden"} min-h-0 flex-col overflow-hidden border-l border-slate-200/70 dark:border-zinc-800 lg:static lg:z-auto lg:flex lg:max-h-none lg:w-auto lg:rounded-none lg:bg-transparent lg:shadow-none`}>
                <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-2 lg:hidden dark:border-zinc-800">
                  <span className="text-sm font-black text-slate-700 dark:text-slate-100">资料解析</span>
                  <button onClick={() => setInspectorOpen(false)} className="grid h-11 w-11 place-items-center rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800" aria-label="关闭详情面板"><X className="h-5 w-5" /></button>
                </div>
                <div className="grid grid-cols-4 border-b border-slate-200/70 dark:border-zinc-800">
                  {(
                    [
                      ["overview", "概览"],
                      ["pages", "页面"],
                      ["rag", "RAG"],
                      ["review", `待审核 ${pending.length}`],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setInspectorTab(value)}
                      className={`min-h-11 border-b-2 py-3 text-xs font-bold ${inspectorTab === value ? "border-emerald-700 text-emerald-700" : "border-transparent text-slate-400"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {inspectorTab === "overview" && (
                    <div className="space-y-5">
                      <div>
                        <p className="text-xs font-black text-slate-400 mb-2">
                          AI 摘要
                        </p>
                        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                          {detail.summary || "尚未解析"}
                        </p>
                      </div>
                      {!!detail.tags.length && (
                        <div className="flex flex-wrap gap-1.5">
                          {detail.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-1 rounded-md bg-slate-100 dark:bg-zinc-800 text-xs text-slate-500"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="border-t border-slate-200/70 dark:border-zinc-800 pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-slate-400">
                            解析页码
                          </p>
                          {detail.status === "processing" && (
                            <span className="text-xs text-blue-600 flex items-center gap-1">
                              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                              处理中
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          已解析：{compactPageRanges(readyPages)}
                        </p>
                        {latestJob && (
                          <div className="space-y-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-zinc-900">
                            <p>最近任务：第 {latestJob.pageStart}–{latestJob.pageEnd} 页 · {latestJob.phase ? processingPhaseLabels[latestJob.phase] : processingStageLabels[latestJob.stage]}</p>
                            {metricLabels.some(([key]) => latestJob.metrics[key] !== undefined) && (
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                                {metricLabels.flatMap(([key, label]) => latestJob.metrics[key] === undefined ? [] : [
                                  <span key={key} className="flex items-center justify-between gap-2"><span>{label}</span><strong className="font-bold text-slate-700 dark:text-slate-200">{formatDuration(latestJob.metrics[key]!)}</strong></span>,
                                ])}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={detail.pageCount ?? 1}
                            value={pageStart}
                            onChange={(event) =>
                              setPageStart(Number(event.target.value))
                            }
                            className={'qs-field-input '+(fieldClass)}
                          />
                          <span className="text-slate-400">至</span>
                          <input
                            type="number"
                            min={1}
                            max={Math.min(
                              detail.pageCount ?? 1,
                              pageStart + 39,
                            )}
                            value={pageEnd}
                            onChange={(event) =>
                              setPageEnd(Number(event.target.value))
                            }
                            className={'qs-field-input '+(fieldClass)}
                          />
                        </div>
                        <GlassButton
                          onClick={runAnalysis}
                          disabled={detail.status === "processing"}
                          variant="primary" containerClassName="w-full" className="py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Sparkles className="w-4 h-4" />
                          {detail.chunks.length ? "重新解析所选页" : "开始解析"}
                        </GlassButton>
                        <p className="text-[11px] text-slate-400">
                          单次最多 40 页
                        </p>
                      </div>
                      {detail.status === "failed" && (
                        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-xs text-rose-700 flex gap-2">
                          <CircleAlert className="w-4 h-4 shrink-0" />
                          {describeParseError(detail.parseErrorCode)}
                        </div>
                      )}
                    </div>
                  )}
                  {inspectorTab === "pages" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <GlassButton disabled={pageWindowStart === 0} onClick={() => navigatePage(Math.max(1, pageWindowStart - 49))} variant="secondary" className="px-2.5 py-1.5 text-xs disabled:opacity-40">上一组</GlassButton>
                        <label className="flex flex-1 items-center gap-2 text-xs text-slate-500">跳到
                          <input type="number" min={1} max={detail.pageCount ?? 1} value={selectedPage} onChange={(event) => navigatePage(Math.max(1, Math.min(detail.pageCount ?? 1, Number(event.target.value))))} className={'qs-field-input '+(`${fieldClass} min-w-0 py-1.5`)} />
                        </label>
                        <GlassButton disabled={pageWindowStart + 50 >= detail.pages.length} onClick={() => navigatePage(pageWindowStart + 51)} variant="secondary" className="px-2.5 py-1.5 text-xs disabled:opacity-40">下一组</GlassButton>
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {visiblePages.map((page) => (
                          <button
                            key={page.pageNumber}
                            onClick={() => navigatePage(page.pageNumber)}
                            className={`relative rounded-lg border px-1 py-2 text-xs font-bold ${selectedPage === page.pageNumber ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 dark:border-zinc-800 text-slate-500"} ${page.included ? "" : "opacity-45 line-through"}`}
                            title={`${page.included ? "纳入" : "已排除"} · ${page.parseStatus}`}
                          >
                            {page.pageNumber}
                            <span className={`absolute right-1 top-1 w-1.5 h-1.5 rounded-full ${page.parseStatus === "ready" ? "bg-emerald-500" : page.parseStatus === "processing" ? "bg-blue-500 animate-pulse" : page.parseStatus === "failed" ? "bg-rose-500" : "bg-slate-300"}`} />
                          </button>
                        ))}
                      </div>
                      {currentPageState && (
                        <div className="rounded-xl border border-slate-200 dark:border-zinc-800 p-3 space-y-3">
                          <div>
                            <p className="text-sm font-bold">第 {selectedPage} 页</p>
                            <p className="text-xs text-slate-400 mt-1">原文件保留；排除后不进入检索、RAG 与知识发现。</p>
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                await setLibraryResourcePageIncluded(detail.id, selectedPage, !currentPageState.included);
                                await onDataChanged(detail.id);
                                onShowToast(currentPageState.included ? "该页已从 AI 资料范围排除，可随时恢复" : "该页已恢复使用");
                              } catch (error) {
                                onShowToast(`页面更新失败：${error instanceof Error ? error.message : "未知错误"}`);
                              }
                            }}
                            className={currentPageState.included ? "btn-secondary w-full py-2 text-sm text-rose-600" : "btn-primary w-full py-2 text-sm"}
                          >
                            {currentPageState.included ? "从 AI 资料中排除此页" : "恢复此页"}
                          </button>
                        </div>
                      )}
                      <div className="text-[11px] text-slate-400 leading-5">
                        <p><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />已解析　<span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />处理中　<span className="inline-block w-2 h-2 rounded-full bg-slate-300 mr-1" />未解析</p>
                        <p>上传原件保存在服务端原件目录；解析文本与引用索引保存在资料库数据库中。未来在线版可增加桌面同步目录。</p>
                      </div>
                    </div>
                  )}
                  {inspectorTab === "rag" && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-black text-slate-800 dark:text-slate-100">检索测试</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">直接查询已经进入 RAG 语料库的文本块，并保留原资料页码。</p>
                      </div>
                      <form onSubmit={async (event) => {
                        event.preventDefault();
                        if (!ragQuery.trim()) return;
                        setRagSearching(true);
                        try {
                          setRagResults(await retrieveLibraryResource(detail.id, ragQuery.trim()));
                        } catch (error) {
                          onShowToast(`检索失败：${error instanceof Error ? error.message : "未知错误"}`);
                        } finally {
                          setRagSearching(false);
                        }
                      }} className="space-y-2">
                        <input value={ragQuery} onChange={(event) => setRagQuery(event.target.value)} placeholder="输入知识点、题型或原文关键词" className={'qs-field-input '+(fieldClass)} />
                        <button disabled={ragSearching || !ragQuery.trim()} className="btn-primary flex w-full items-center justify-center gap-2 py-2 text-sm disabled:opacity-40">{ragSearching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}检索 RAG 语料</button>
                      </form>
                      <div className="space-y-2">
                        {ragResults.map((result) => (
                          <button key={result.id} onClick={() => navigatePage(result.pageStart)} className="w-full rounded-xl border border-slate-200 p-3 text-left hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-zinc-800 dark:hover:bg-emerald-950/20">
                            <span className="flex items-center justify-between gap-2"><strong className="truncate text-xs text-slate-700 dark:text-slate-200">{result.title}</strong><span className="shrink-0 text-[10px] font-bold text-emerald-700">第 {result.pageStart} 页</span></span>
                            <span className="mt-1.5 line-clamp-4 block text-xs leading-5 text-slate-500">{result.text}</span>
                          </button>
                        ))}
                        {!ragSearching && ragQuery && !ragResults.length && <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-xs text-slate-400">没有命中已入库内容</div>}
                      </div>
                    </div>
                  )}
                  {inspectorTab === "review" && (
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200/70 dark:border-zinc-800">
                        <button
                          onClick={() =>
                            setSelectedSuggestions(
                              selectedSuggestions.length === pending.length
                                ? []
                                : pending.map((item) => item.id),
                            )
                          }
                          className="text-xs text-slate-500 flex items-center gap-1.5"
                        >
                          <CheckCheck className="w-4 h-4" />
                          {selectedSuggestions.length === pending.length &&
                          pending.length
                            ? "取消全选"
                            : "全选"}
                        </button>
                        <div className="flex gap-1">
                          <GlassButton
                            disabled={!selectedSuggestions.length}
                            onClick={() => batchReview("ignored")}
                            variant="secondary" className="px-2.5 py-1.5 text-xs disabled:opacity-40"
                          >
                            忽略
                          </GlassButton>
                          <GlassButton
                            disabled={!selectedSuggestions.length}
                            onClick={() => batchReview("accepted")}
                            variant="primary" className="px-2.5 py-1.5 text-xs disabled:opacity-40"
                          >
                            批量同意
                          </GlassButton>
                        </div>
                      </div>
                      {pending.map((item) => (
                        <React.Fragment key={item.id}>
                          <SuggestionItem
                            item={item}
                            nodes={nodes}
                            subject={detail?.subject ?? ""}
                            selected={selectedSuggestions.includes(item.id)}
                            onToggle={() =>
                              setSelectedSuggestions((current) =>
                                current.includes(item.id)
                                  ? current.filter((id) => id !== item.id)
                                  : [...current, item.id],
                              )
                            }
                            onReview={(decision, options) =>
                              void review(item.id, decision, options)
                            }
                          />
                        </React.Fragment>
                      ))}
                      {!pending.length && (
                        <div className="py-16 text-center text-sm text-slate-400">
                          <Check className="w-7 h-7 mx-auto mb-2 text-emerald-600" />
                          暂无待审核内容
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        )}
      </section>
      {showKindPicker && <ResponsiveChoiceDialog title="筛选资料类型" value={kind} options={[{ value: "all", label: "全部资料" }, ...Object.entries(resourceKindLabels).map(([value, label]) => ({ value, label }))]} onChange={value => setKind(value as typeof kind)} onClose={() => setShowKindPicker(false)} />}
      {dialog && (
        <MetadataDialog
          resource={dialog === "edit" ? (detail ?? undefined) : undefined}
          onClose={() => setDialog(null)}
          onSaved={onDataChanged}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}
