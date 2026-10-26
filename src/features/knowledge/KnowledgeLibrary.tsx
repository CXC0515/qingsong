import { GlassSegments } from '../../components/glass/Glass';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Boxes, Network } from "lucide-react";
import {
  KnowledgeGraphSnapshot,
  LibraryResource,
  ResourceDetail,
} from "../../domain/types";
import {
  getLibraryResource,
  listLibraryResources,
} from "../../services/resourceApi";
import KnowledgeGraphWorkspace from "./KnowledgeGraphWorkspace";
import ResourceLibraryEditor from "./ResourceLibraryEditor";

interface KnowledgeLibraryProps {
  mode: "graph" | "editor";
  active: boolean;
  requestedResource?: { id: string; sequence: number } | null;
  graph: KnowledgeGraphSnapshot | null;
  onSwitchMode: (mode: "graph" | "editor") => void;
  onKnowledgeChanged: (force?: boolean) => Promise<KnowledgeGraphSnapshot>;
  onShowToast: (message: string) => void;
}

const emptyGraph: KnowledgeGraphSnapshot = {
  nodes: [],
  relations: [],
  sourceLinks: [],
  resources: [],
  subjects: [],
  stages: [],
  tags: [],
};

export default function KnowledgeLibrary({
  mode,
  active,
  requestedResource,
  graph: graphSnapshot,
  onSwitchMode,
  onKnowledgeChanged,
  onShowToast,
}: KnowledgeLibraryProps) {
  const [resources, setResources] = useState<LibraryResource[]>([]);
  const graph = graphSnapshot ?? emptyGraph;
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [detail, setDetail] = useState<ResourceDetail | null>(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [narrowLayout, setNarrowLayout] = useState(false);
  const [openReaderOnCompact, setOpenReaderOnCompact] = useState(false);
  const loadedRef = useRef(false);
  const selectedResourceIdRef = useRef("");
  const detailRequestRef = useRef(0);
  const lastExternalRequestRef = useRef(0);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setNarrowLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const loadResourceDetail = useCallback(async (resourceId: string) => {
    if (!resourceId) {
      setDetail(null);
      return;
    }
    const requestId = ++detailRequestRef.current;
    const next = await getLibraryResource(resourceId);
    if (
      requestId !== detailRequestRef.current ||
      selectedResourceIdRef.current !== resourceId
    ) return next;
    setDetail(next);
    setSelectedPage((current) =>
      Math.min(Math.max(current, 1), next.pageCount ?? 1),
    );
    return next;
  }, []);

  const loadAll = useCallback(
    async (preferredResourceId?: string, forceGraph = false) => {
      let targetResourceId = "";
      if (!loadedRef.current) setLoading(true);
      try {
        const [nextResources] = await Promise.all([
          listLibraryResources(),
          onKnowledgeChanged(forceGraph),
        ]);
        setResources(nextResources);
        const resourceId =
          preferredResourceId &&
          nextResources.some((item) => item.id === preferredResourceId)
            ? preferredResourceId
            : selectedResourceId &&
                nextResources.some((item) => item.id === selectedResourceId)
              ? selectedResourceId
              : (nextResources[0]?.id ?? "");
        targetResourceId = resourceId;
        selectedResourceIdRef.current = resourceId;
        setSelectedResourceId(resourceId);
        await loadResourceDetail(resourceId);
        loadedRef.current = true;
      } catch (error) {
        onShowToast(
          `资料库加载失败：${error instanceof Error ? error.message : "未知错误"}`,
        );
      } finally {
        if (!targetResourceId || selectedResourceIdRef.current === targetResourceId) {
          setLoading(false);
        }
      }
    },
    [loadResourceDetail, onKnowledgeChanged, onShowToast, selectedResourceId],
  );

  useEffect(() => {
    if (active && !loadedRef.current) void loadAll();
  }, [active, loadAll]);

  useEffect(() => {
    if (!active || !requestedResource || lastExternalRequestRef.current === requestedResource.sequence) return;
    lastExternalRequestRef.current = requestedResource.sequence;
    setOpenReaderOnCompact(true);
    void loadAll(requestedResource.id, true);
  }, [active, requestedResource, loadAll]);

  useEffect(() => {
    if (!active || detail?.status !== "processing") return;
    const timer = window.setInterval(() => {
      if (selectedResourceIdRef.current !== detail.id) return;
      void loadResourceDetail(detail.id)
        .then(async (nextDetail) => {
          if (nextDetail.status === "processing") return;
          const nextResources = await listLibraryResources();
          setResources(nextResources);
          await onKnowledgeChanged(true);
        })
        .catch(() => undefined);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [active, detail?.id, detail?.status, loadResourceDetail, onKnowledgeChanged]);

  const selectResource = (resourceId: string) => {
    selectedResourceIdRef.current = resourceId;
    setSelectedResourceId(resourceId);
    setSelectedPage(1);
    setLoading(true);
    void loadResourceDetail(resourceId)
      .catch((error) =>
        onShowToast(
          `资料加载失败：${error instanceof Error ? error.message : "未知错误"}`,
        ),
      )
      .finally(() => {
        if (selectedResourceIdRef.current === resourceId) setLoading(false);
      });
  };

  const reloadGraph = async () => {
    await onKnowledgeChanged(true);
    if (detail) await loadResourceDetail(detail.id);
  };

  const openSource = (resourceId: string, pageNumber: number) => {
    selectedResourceIdRef.current = resourceId;
    setSelectedResourceId(resourceId);
    setSelectedPage(pageNumber);
    setOpenReaderOnCompact(true);
    onSwitchMode("editor");
    setLoading(true);
    void loadResourceDetail(resourceId).finally(() => {
      if (selectedResourceIdRef.current === resourceId) setLoading(false);
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 sm:gap-4 animate-fade-in" id="knowledge-library-page">
      <div className="adaptive-workspace-topbar hidden flex-none items-end justify-between gap-3 sm:flex">
        <div className="adaptive-workspace-heading">
          <p className="hidden text-xs font-bold text-emerald-700 uppercase sm:block">资料库</p>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-50 sm:mt-1 sm:text-2xl">
            {mode === "graph" ? "知识图谱" : "资料编辑"}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 sm:mt-1 sm:text-sm">
            {mode === "graph"
              ? `${graph.nodes.length} 个节点 · ${graph.relations.length} 条关系 · ${graph.sourceLinks.length} 个已确认来源`
              : `${resources.length} 份资料 · ${resources.filter((item) => item.status === "processing").length} 项正在解析`}
          </p>
        </div>
        <GlassSegments label="资料库模式" value={mode} options={[{value:'graph',label:<><Network className="w-4 h-4"/>知识图谱</>},{value:'editor',label:<><Boxes className="w-4 h-4"/>资料编辑</>}]} onChange={next=>{if(next==='editor')setOpenReaderOnCompact(false);onSwitchMode(next);}}/>
     </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className={mode === "graph" ? "h-full overflow-hidden lg:overflow-y-auto lg:pr-1" : "hidden"}>
          <KnowledgeGraphWorkspace
            graph={graph}
            loading={loading}
            narrowLayout={narrowLayout}
            onDataChanged={reloadGraph}
            onOpenSource={openSource}
            onShowToast={onShowToast}
          />
        </div>
        <div className={mode === "editor" ? "h-full" : "hidden"}>
          <ResourceLibraryEditor
            resources={resources}
            detail={detail}
            selectedResourceId={selectedResourceId}
            nodes={graph.nodes}
            selectedPage={selectedPage}
            loading={loading}
            narrowLayout={narrowLayout}
            openReaderOnCompact={openReaderOnCompact}
            onSelectResource={selectResource}
            onOpenPage={setSelectedPage}
            onDataChanged={(resourceId) => loadAll(resourceId, true)}
            onShowToast={onShowToast}
          />
        </div>
      </div>
    </div>
  );
}
