import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Edge,
  Handle,
  MarkerType,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ChevronDown,
  ChevronRight,
  Focus,
  Filter,
  Maximize2,
  Network,
  Rows3,
  Search,
  X,
} from "lucide-react";
import { KnowledgeEntity, KnowledgeStage } from "../../domain/types";
import { entityLabels } from "./knowledgeUi";
import ResponsiveChoiceDialog from "../../components/ResponsiveChoiceDialog";

const NODE_WIDTH = 210;
const NODE_HEIGHT = 76;

const nodePalette: Record<"domain" | "topic" | "knowledge", { accent: string; fill: string; text: string }> = {
  domain: { accent: "#334155", fill: "#f1f5f9", text: "#1e293b" },
  topic: { accent: "#0f766e", fill: "#f0fdfa", text: "#115e59" },
  knowledge: { accent: "#15803d", fill: "#f0fdf4", text: "#166534" },
};

type TreeEntity = KnowledgeEntity & { type: "domain" | "topic" | "knowledge" };

type TreeNodeData = {
  entity: TreeEntity;
  selected: boolean;
  collapsed: boolean;
  childCount: number;
  onToggle: (nodeId: string) => void;
};

type TreeNode = Node<TreeNodeData, "tree-node">;

const KnowledgeTreeNode = memo(({ data }: NodeProps<TreeNode>) => {
  const palette = nodePalette[data.entity.type];
  return (
    <div
      className={`relative h-[76px] w-[210px] rounded-lg border bg-white shadow-sm transition-shadow dark:bg-zinc-900 ${data.selected ? "ring-2 ring-emerald-600 ring-offset-2 dark:ring-offset-zinc-950" : "hover:shadow-md"}`}
      style={{ borderColor: data.selected ? palette.accent : "#cbd5e1" }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-2 !border-white !bg-slate-400" />
      <div className="flex h-full min-w-0 items-center gap-3 px-3.5">
        <span className="h-11 w-1 shrink-0 rounded-full" style={{ background: palette.accent }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-flex rounded px-1.5 py-0.5 text-xs font-black"
              style={{ background: palette.fill, color: palette.text }}
            >
              {entityLabels[data.entity.type]}
            </span>
            {data.entity.trainable ? <span className="text-xs font-bold text-slate-400">可训练</span> : null}
          </div>
          <p className="mt-1.5 truncate text-sm font-black text-slate-800 dark:text-zinc-100">
            {data.entity.name}
          </p>
        </div>
        {data.childCount ? (
          <button
            type="button"
            title={data.collapsed ? `展开 ${data.childCount} 个子节点` : "收起子节点"}
            aria-label={data.collapsed ? `展开“${data.entity.name}”` : `收起“${data.entity.name}”`}
            onClick={(event) => {
              event.stopPropagation();
              data.onToggle(data.entity.id);
            }}
            className="nodrag nopan grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-emerald-700 dark:hover:bg-zinc-800"
          >
            {data.collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-2 !border-white !bg-slate-400" />
    </div>
  );
});

KnowledgeTreeNode.displayName = "KnowledgeTreeNode";
const nodeTypes = { "tree-node": KnowledgeTreeNode };

const layoutTree = (nodes: TreeNode[], edges: Edge[]) => {
  const layout = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  layout.setGraph({ rankdir: "LR", ranksep: 92, nodesep: 30, marginx: 42, marginy: 42 });
  nodes.forEach((node) => layout.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((edge) => layout.setEdge(edge.source, edge.target));
  dagre.layout(layout);
  return nodes.map((node) => {
    const position = layout.node(node.id);
    return {
      ...node,
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
    };
  });
};

interface CanvasProps {
  compact: boolean;
  subject: string;
  nodes: KnowledgeEntity[];
  stages: KnowledgeStage[];
  availableTags: string[];
  selectedId: string;
  onSelect: (nodeId: string) => void;
  onShowDetails: () => void;
}

const KnowledgeTreeCanvasInner = ({ compact, subject, nodes, stages, availableTags, selectedId, onSelect, onShowDetails }: CanvasProps) => {
  const { fitView, setCenter } = useReactFlow<TreeNode, Edge>();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterPicker, setFilterPicker] = useState<"stage" | "type" | "tag" | null>(null);
  const [query, setQuery] = useState("");
  const [stageId, setStageId] = useState("");
  const [tag, setTag] = useState("");
  const [nodeType, setNodeType] = useState<"" | TreeEntity["type"]>("");
  const lastSelectedId = useRef(selectedId);
  const allStructuralNodes = useMemo(
    () =>
      nodes.filter(
        (node): node is TreeEntity =>
          node.type === "domain" || node.type === "topic" || node.type === "knowledge",
      ),
    [nodes],
  );
  const allNodeById = useMemo(() => new Map(allStructuralNodes.map((node) => [node.id, node])), [allStructuralNodes]);
  const filterActive = Boolean(query.trim() || stageId || tag || nodeType);
  const structuralNodes = useMemo(() => {
    if (!filterActive) return allStructuralNodes;
    const normalizedQuery = query.trim().toLowerCase();
    const matches = allStructuralNodes.filter((node) =>
      (!normalizedQuery || `${node.name}${node.description}${node.aliases.join("")}`.toLowerCase().includes(normalizedQuery)) &&
      (!stageId || node.stageIds.includes(stageId)) &&
      (!tag || node.tags.includes(tag)) &&
      (!nodeType || node.type === nodeType),
    );
    const visible = new Set(matches.map((node) => node.id));
    matches.forEach((node) => {
      let cursor = node;
      while (cursor.primaryMotherId) {
        visible.add(cursor.primaryMotherId);
        const mother = allNodeById.get(cursor.primaryMotherId);
        if (!mother) break;
        cursor = mother;
      }
    });
    return allStructuralNodes.filter((node) => visible.has(node.id));
  }, [allStructuralNodes, allNodeById, filterActive, nodeType, query, stageId, tag]);
  const nodeById = useMemo(
    () => new Map(structuralNodes.map((node) => [node.id, node])),
    [structuralNodes],
  );
  const childrenByMother = useMemo(() => {
    const children = new Map<string, TreeEntity[]>();
    structuralNodes.forEach((node) => {
      if (!node.primaryMotherId || !nodeById.has(node.primaryMotherId)) return;
      const siblings = children.get(node.primaryMotherId) ?? [];
      siblings.push(node);
      children.set(node.primaryMotherId, siblings);
    });
    children.forEach((siblings) =>
      siblings.sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name)),
    );
    return children;
  }, [structuralNodes, nodeById]);

  const visibleIds = useMemo(() => {
    const visible = new Set<string>();
    const visit = (node: TreeEntity) => {
      visible.add(node.id);
      if (collapsedIds.has(node.id)) return;
      childrenByMother.get(node.id)?.forEach(visit);
    };
    structuralNodes
      .filter((node) => !node.primaryMotherId || !nodeById.has(node.primaryMotherId))
      .sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name))
      .forEach(visit);
    return visible;
  }, [structuralNodes, nodeById, childrenByMother, collapsedIds]);

  const toggleCollapsed = useCallback((nodeId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const clearFilters = () => {
    setQuery("");
    setStageId("");
    setTag("");
    setNodeType("");
  };
  const activeFilterCount = [stageId, tag, nodeType].filter(Boolean).length;
  const allExpanded = collapsedIds.size === 0;

  useEffect(() => {
    if (!selectedId) return;
    setCollapsedIds((current) => {
      const next = new Set(current);
      let cursor = nodeById.get(selectedId);
      let changed = false;
      while (cursor?.primaryMotherId) {
        if (next.delete(cursor.primaryMotherId)) changed = true;
        cursor = nodeById.get(cursor.primaryMotherId);
      }
      return changed ? next : current;
    });
  }, [selectedId, nodeById]);

  const edges = useMemo<Edge[]>(
    () =>
      structuralNodes
        .filter(
          (node) =>
            node.primaryMotherId &&
            visibleIds.has(node.id) &&
            visibleIds.has(node.primaryMotherId),
        )
        .map((node) => ({
          id: `mother:${node.primaryMotherId}:${node.id}`,
          source: node.primaryMotherId!,
          target: node.id,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 13, height: 13 },
          style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        })),
    [structuralNodes, visibleIds],
  );

  const projectedNodes = useMemo(() => {
    const projected: TreeNode[] = structuralNodes
      .filter((node) => visibleIds.has(node.id))
      .map((entity) => ({
        id: entity.id,
        type: "tree-node",
        position: { x: 0, y: 0 },
        data: {
          entity,
          selected: entity.id === selectedId,
          collapsed: collapsedIds.has(entity.id),
          childCount: childrenByMother.get(entity.id)?.length ?? 0,
          onToggle: toggleCollapsed,
        },
      }));
    return layoutTree(projected, edges);
  }, [structuralNodes, visibleIds, selectedId, collapsedIds, childrenByMother, toggleCollapsed, edges]);
  const [renderNodes, setRenderNodes, onNodesChange] = useNodesState<TreeNode>(projectedNodes);

  useEffect(() => setRenderNodes(projectedNodes), [projectedNodes, setRenderNodes]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const selectedNode = projectedNodes.find((node) => node.id === selectedId) ?? projectedNodes[0];
      if (compact && selectedNode) {
        setCenter(selectedNode.position.x + NODE_WIDTH / 2, selectedNode.position.y + NODE_HEIGHT / 2, { zoom: 1, duration: 0 });
        return;
      }
      fitView({ padding: 0.16, duration: 300, maxZoom: 1.05 });
    }, 30);
    return () => window.clearTimeout(timer);
  }, [compact, visibleIds, fitView, setCenter]);

  useEffect(() => {
    if (!selectedId || lastSelectedId.current === selectedId) return;
    lastSelectedId.current = selectedId;
    const selectedNode = renderNodes.find((node) => node.id === selectedId);
    if (!selectedNode) return;
    setCenter(selectedNode.position.x + NODE_WIDTH / 2, selectedNode.position.y + NODE_HEIGHT / 2, {
      zoom: 1,
      duration: 280,
    });
  }, [selectedId, renderNodes, setCenter]);

  return (
    <div className="relative h-full min-h-0 bg-slate-50/70 lg:h-[clamp(560px,72dvh,840px)] dark:bg-zinc-950/40">
      <div className="knowledge-canvas-toolbar absolute left-3 right-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="knowledge-canvas-title flex min-w-0 items-center gap-2 pr-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-emerald-700 text-white">
            <Network className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-700 dark:text-zinc-100">{subject}知识主干</p>
            <p className="hidden whitespace-nowrap text-xs text-slate-400 sm:block">仅显示母子结构</p>
          </div>
        </div>
        <span className="knowledge-canvas-separator h-6 w-px shrink-0 bg-slate-200 dark:bg-zinc-700" />
        {!compact ? <button
          type="button"
          onClick={() => setCollapsedIds(allExpanded ? new Set(allStructuralNodes.filter((node) => node.type === "domain").map((node) => node.id)) : new Set())}
          className="flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"
        >
          <Rows3 className="h-3.5 w-3.5" />
          {allExpanded ? "收起到板块" : "展开全部"}
        </button> : null}
        <button
          type="button"
          title="筛选知识点"
          aria-label="筛选知识点"
          onClick={() => { setFilterOpen((open) => !open); setSearchOpen(false); }}
          className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-md ${filterOpen || activeFilterCount ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"}`}
        >
          <Filter className="h-3.5 w-3.5" />
          {activeFilterCount ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-emerald-700 px-1 text-[8px] font-black text-white">{activeFilterCount}</span> : null}
        </button>
        <button type="button" title="搜索知识点" aria-label="搜索知识点" onClick={() => { setSearchOpen((open) => !open); setFilterOpen(false); }} className={`grid h-11 w-11 shrink-0 place-items-center rounded-md ${searchOpen || query ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"}`}>
          <Search className="h-3.5 w-3.5" />
        </button>
        <button type="button" disabled={!selectedId} onClick={onShowDetails} className="btn-primary ml-auto flex h-11 shrink-0 items-center gap-1.5 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40">
          <span className="hidden min-[360px]:inline">详情</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      {searchOpen ? (
        <div className="absolute left-3 top-[70px] z-20 flex w-[min(360px,calc(100%-1.5rem))] items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或别名" className="qs-field-input min-w-0 flex-1 bg-transparent text-sm outline-none" />
          {query ? <button type="button" title="清除搜索" onClick={() => setQuery("")} className="grid h-7 w-7 place-items-center rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800"><X className="h-3.5 w-3.5" /></button> : null}
        </div>
      ) : null}
      {filterOpen ? (
        <div className="absolute left-3 top-[70px] z-20 grid w-[min(420px,calc(100%-1.5rem))] gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-lg sm:grid-cols-3 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="space-y-1"><span className="text-xs font-bold text-slate-400">学习阶段</span><button type="button" onClick={() => setFilterPicker("stage")} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-200 px-3 text-sm font-bold sm:hidden dark:border-zinc-700"><span>{stages.find(stage => stage.id === stageId)?.name ?? "全部"}</span><ChevronDown className="h-4 w-4 text-slate-400" /></button><select value={stageId} onChange={(event) => setStageId(event.target.value)} className="qs-field-input hidden w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm sm:block dark:border-zinc-700 dark:bg-zinc-900"><option value="">全部</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></div>
          <div className="space-y-1"><span className="text-xs font-bold text-slate-400">节点类型</span><button type="button" onClick={() => setFilterPicker("type")} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-200 px-3 text-sm font-bold sm:hidden dark:border-zinc-700"><span>{nodeType ? entityLabels[nodeType] : "全部"}</span><ChevronDown className="h-4 w-4 text-slate-400" /></button><select value={nodeType} onChange={(event) => setNodeType(event.target.value as "" | TreeEntity["type"])} className="qs-field-input hidden w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm sm:block dark:border-zinc-700 dark:bg-zinc-900"><option value="">全部</option><option value="domain">板块</option><option value="topic">主题</option><option value="knowledge">知识点</option></select></div>
          <div className="space-y-1"><span className="text-xs font-bold text-slate-400">标签</span><button type="button" onClick={() => setFilterPicker("tag")} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-200 px-3 text-sm font-bold sm:hidden dark:border-zinc-700"><span>{tag || "全部"}</span><ChevronDown className="h-4 w-4 text-slate-400" /></button><select value={tag} onChange={(event) => setTag(event.target.value)} className="qs-field-input hidden w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm sm:block dark:border-zinc-700 dark:bg-zinc-900"><option value="">全部</option>{availableTags.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          {activeFilterCount ? <button type="button" onClick={clearFilters} className="min-h-10 text-left text-xs font-bold text-emerald-700 sm:col-span-3">清除筛选</button> : null}
        </div>
      ) : null}
      {filterPicker === "stage" ? <ResponsiveChoiceDialog title="选择学习阶段" value={stageId} options={[{ value: "", label: "全部" }, ...stages.map(stage => ({ value: stage.id, label: stage.name }))]} onChange={setStageId} onClose={() => setFilterPicker(null)} /> : null}
      {filterPicker === "type" ? <ResponsiveChoiceDialog title="选择节点类型" value={nodeType} options={[{ value: "", label: "全部" }, { value: "domain", label: "板块" }, { value: "topic", label: "主题" }, { value: "knowledge", label: "知识点" }]} onChange={value => setNodeType(value as "" | TreeEntity["type"])} onClose={() => setFilterPicker(null)} /> : null}
      {filterPicker === "tag" ? <ResponsiveChoiceDialog title="选择标签" value={tag} options={[{ value: "", label: "全部" }, ...availableTags.map(value => ({ value, label: value }))]} onChange={setTag} onClose={() => setFilterPicker(null)} /> : null}
      <ReactFlow<TreeNode, Edge>
        className="h-full"
        nodes={renderNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => onSelect(node.id)}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.2}
        maxZoom={2.2}
        fitView={!compact}
        fitViewOptions={{ padding: 0.16, maxZoom: 1.05 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#cbd5e1" gap={24} size={1} />
        {!compact ? <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor={(node) => nodePalette[(node.data as TreeNodeData).entity.type].accent}
          maskColor="rgba(241, 245, 249, 0.72)"
          className="!border !border-slate-200 !bg-white dark:!border-zinc-700 dark:!bg-zinc-900"
        /> : null}
        <Controls position="bottom-left" showInteractive={false} />
        <div className="absolute bottom-3 left-14 z-10 flex gap-1">
          <button
            type="button"
            title="定位当前节点"
            aria-label="定位当前节点"
            onClick={() => {
              const selectedNode = renderNodes.find((node) => node.id === selectedId);
              if (selectedNode) setCenter(selectedNode.position.x + NODE_WIDTH / 2, selectedNode.position.y + NODE_HEIGHT / 2, { zoom: 1, duration: 280 });
            }}
            className="grid h-11 w-11 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm hover:text-emerald-700 lg:h-8 lg:w-8 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <Focus className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="适应全部节点"
            aria-label="适应全部节点"
            onClick={() => fitView({ padding: 0.16, duration: 280, maxZoom: 1.05 })}
            className="grid h-11 w-11 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm hover:text-emerald-700 lg:h-8 lg:w-8 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </ReactFlow>
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-md bg-white/90 px-2 py-1 text-xs font-bold text-slate-400 shadow-sm dark:bg-zinc-900/90">
        {renderNodes.length} / {allStructuralNodes.length} 个主干节点
      </div>
    </div>
  );
};

export default function KnowledgeGraphCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <KnowledgeTreeCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
