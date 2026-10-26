import { GlassButton } from '../../components/glass/Glass';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, ArrowRight, Check, ChevronDown, FileText, Folder, FolderPlus, Image, Pencil, Search, SkipForward, Trash2, Upload } from 'lucide-react';
import type { PoolFolder, PoolItem } from '../../domain/materialPool';
import { archivePoolFolder, createPoolFolder, listPoolFolders, listPoolItems, renamePoolFolder, restorePoolFolder, restorePoolItem, trashPoolItem, updatePoolItem, uploadPoolItem } from '../../services/materialPoolApi';
import ResponsiveChoiceDialog from '../../components/ResponsiveChoiceDialog';
import ResponsiveDialog from '../../components/ResponsiveDialog';

interface Props {
  presetKey?: string;
  onOpenResource: (resourceId: string) => void;
  onShowToast: (message: string) => void;
}

const acceptedFiles = '.pdf,.jpg,.jpeg,.png,.webp,.docx,.pptx,.xlsx,.txt';
const formatSize = (bytes: number) => bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '大小未记录';
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请稍后重试';
type PoolView = { kind: 'all' | 'unfiled' | 'trash' } | { kind: 'folder'; id: string };
type FolderPicker = 'browse' | 'batch' | 'item';
type FolderDialog = { mode: 'create'; parentId: string | null } | { mode: 'rename'; folder: PoolFolder };
type QuickStep = { kind: 'skip'; index: number } | { kind: 'move'; index: number; id: string; folderId: string | null };

export default function MaterialPool({ presetKey, onOpenResource, onShowToast }: Props) {
  const [folders, setFolders] = useState<PoolFolder[]>([]);
  const [items, setItems] = useState<PoolItem[]>([]);
  const [view, setView] = useState<PoolView>({ kind: 'all' });
  const folderId = view.kind === 'folder' ? view.id : view.kind === 'unfiled' ? null : undefined;
  const state: 'saved' | 'trashed' = view.kind === 'trash' ? 'trashed' : 'saved';
  const [query, setQuery] = useState('');
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [quickMode, setQuickMode] = useState(false);
  const [quickIndex, setQuickIndex] = useState(0);
  const [quickHistory, setQuickHistory] = useState<QuickStep[]>([]);
  const [quickBusy, setQuickBusy] = useState(false);
  const [folderPicker, setFolderPicker] = useState<FolderPicker | null>(null);
  const [folderDialog, setFolderDialog] = useState<FolderDialog | null>(null);
  const [folderToArchive, setFolderToArchive] = useState<PoolFolder | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [folderDraft, setFolderDraft] = useState('');
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderError, setFolderError] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const loadRequest = useRef(0);
  const appliedPreset = useRef<string | undefined>(undefined);

  const refresh = useCallback(async (currentFolder = folderId, currentQuery = query, currentState = state) => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    try {
      const [nextFolders, result] = await Promise.all([
        listPoolFolders(), listPoolItems({ folderId: currentFolder, q: currentQuery.trim(), state: currentState }),
      ]);
      if (requestId !== loadRequest.current) return;
      setFolders(nextFolders);
      setItems(result.items);
      setNextOffset(result.nextOffset);
      setView(current => current.kind === 'folder' && !nextFolders.some(folder => folder.id === current.id && !folder.archivedAt) ? { kind: 'all' } : current);
    } catch (error) { if (requestId === loadRequest.current) onShowToast(`材料池加载失败：${errorText(error)}`); }
    finally { if (requestId === loadRequest.current) setLoading(false); }
  }, [folderId, query, state, onShowToast]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!presetKey) { appliedPreset.current = undefined; return; }
    if (appliedPreset.current === presetKey || !folders.length) return;
    const target = folders.find(folder => folder.presetKey === presetKey && !folder.archivedAt);
    if (target) { appliedPreset.current = presetKey; setView({ kind: 'folder', id: target.id }); }
  }, [presetKey, folders]);

  const folderById = useMemo(() => new Map(folders.map(folder => [folder.id, folder])), [folders]);
  const activeFolders = folders.filter(folder => !folder.archivedAt);
  const archivedFolders = folders.filter(folder => folder.archivedAt);
  const currentFolder = view.kind === 'folder' ? folderById.get(view.id) : null;
  const visibleFolders = view.kind === 'all' || view.kind === 'folder'
    ? activeFolders.filter(folder => folder.parentId === (currentFolder?.id ?? null)) : [];
  const folderPath = (id: string | null) => {
    if (!id) return '未整理';
    const names: string[] = [];
    let folder = folderById.get(id);
    while (folder) { names.unshift(folder.name); folder = folder.parentId ? folderById.get(folder.parentId) : undefined; }
    return names.join(' / ') || '文件夹不存在';
  };
  const breadcrumb = useMemo(() => {
    const result: PoolFolder[] = [];
    let next = currentFolder;
    while (next) { result.unshift(next); next = next.parentId ? folderById.get(next.parentId) : undefined; }
    return result;
  }, [currentFolder, folderById]);
  const quickItems = items.filter(item => !item.folderId && item.state === 'saved');
  const quickItem = quickItems[quickIndex] ?? null;
  const activeItem = items.find(item => item.id === activeItemId) ?? null;

  const openFolder = (id: string | null | undefined) => {
    setView(id === undefined ? { kind: 'all' } : id === null ? { kind: 'unfiled' } : { kind: 'folder', id });
    setQuickMode(false); setQuickHistory([]); setActiveItemId(null); setSelectedIds([]);
  };
  const openTrash = () => { setView({ kind: 'trash' }); setQuickMode(false); setQuickHistory([]); setActiveItemId(null); setSelectedIds([]); };
  const saveMove = async (id: string, target: string | null, quick = false) => {
    const original = items.find(item => item.id === id);
    if (!original || (quick && quickBusy)) return;
    if (quick) setQuickBusy(true);
    try {
      const next = await updatePoolItem(id, { folderId: target });
      setItems(current => current.map(item => item.id === id ? next : item));
      if (quick) setQuickHistory(current => [...current, { kind: 'move', id, folderId: original.folderId, index: quickIndex }]);
      if (!quick && folderId !== undefined && original.folderId !== target) { setActiveItemId(null); await refresh(); }
      onShowToast(target ? `已放入 ${folders.find(folder => folder.id === target)?.name ?? '文件夹'}；可点「上一份」返回并恢复原位置` : '已移到未整理');
    } catch (error) { onShowToast(errorText(error)); }
    finally { if (quick) setQuickBusy(false); }
  };
  const previousQuickItem = async () => {
    const step = quickHistory.at(-1);
    if (!step || quickBusy) return;
    if (step.kind === 'skip') {
      setQuickIndex(step.index);
      setQuickHistory(current => current.slice(0, -1));
      return;
    }
    setQuickBusy(true);
    try {
      const restored = await updatePoolItem(step.id, { folderId: step.folderId });
      setItems(current => current.map(item => item.id === step.id ? restored : item));
      setQuickIndex(step.index);
      setQuickHistory(current => current.slice(0, -1));
      onShowToast('已返回上一份，材料已恢复到原位置');
    } catch (error) { onShowToast(`返回失败：${errorText(error)}；材料仍在已归类位置`); }
    finally { setQuickBusy(false); }
  };
  const skipQuickItem = () => {
    if (!quickItem || quickBusy) return;
    setQuickHistory(current => [...current, { kind: 'skip', index: quickIndex }]);
    setQuickIndex(current => current + 1);
  };
  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    let saved = 0;
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      try { await uploadPoolItem(file); saved += 1; }
      catch (error) { errors.push(`${file.name}：${errorText(error)}`); if (errorText(error).includes('上传次数已达上限')) break; }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
    await refresh();
    onShowToast(`已保存 ${saved} 份材料${errors.length ? `；${errors.length} 份失败：${errors.slice(0, 2).join('；')}` : ''}`);
  };
  const openCreateFolder = (parentId: string | null) => {
    setFolderDraft(''); setFolderError(''); setFolderDialog({ mode: 'create', parentId });
  };
  const openRenameFolder = (folder: PoolFolder) => {
    setFolderDraft(folder.name); setFolderError(''); setFolderDialog({ mode: 'rename', folder });
  };
  const saveFolder = async () => {
    if (!folderDialog || folderSaving) return;
    const name = folderDraft.trim();
    if (!name) { setFolderError('请填写文件夹名称，尚未保存'); return; }
    const parentId = folderDialog.mode === 'create' ? folderDialog.parentId : folderDialog.folder.parentId;
    if (folders.some(folder => folder.parentId === parentId && folder.name === name && (folderDialog.mode === 'create' || folder.id !== folderDialog.folder.id))) {
      setFolderError('此位置已有同名文件夹，尚未保存；请换个名称'); return;
    }
    setFolderSaving(true); setFolderError('');
    try {
      if (folderDialog.mode === 'create') {
        const created = await createPoolFolder(name, folderDialog.parentId);
        await refresh();
        openFolder(created.id);
        onShowToast(`已创建文件夹「${name}」`);
      } else {
        await renamePoolFolder(folderDialog.folder.id, name);
        await refresh();
        onShowToast(`文件夹已改名为「${name}」`);
      }
      setFolderDialog(null);
    } catch (error) { setFolderError(`${errorText(error)}；原文件夹没有改变，请修改后重试`); }
    finally { setFolderSaving(false); }
  };
  const archiveFolder = async () => {
    if (!folderToArchive || folderSaving) return;
    setFolderSaving(true);
    try {
      await archivePoolFolder(folderToArchive.id);
      if (view.kind === 'folder' && view.id === folderToArchive.id) openFolder(folderToArchive.parentId ?? undefined);
      await refresh(folderToArchive.parentId ?? undefined);
      onShowToast(`「${folderToArchive.name}」已归档，可从归档盒恢复`);
      setFolderToArchive(null);
    } catch (error) { onShowToast(`归档失败：${errorText(error)}`); }
    finally { setFolderSaving(false); }
  };
  const restoreFolder = async (folder: PoolFolder) => {
    try {
      await restorePoolFolder(folder.id);
      await refresh();
      onShowToast(`「${folder.name}」已恢复`);
    } catch (error) { onShowToast(`恢复失败：${errorText(error)}`); }
  };
  const applyTags = async () => {
    if (!activeItem) return;
    const tags = tagDraft.split(/[，,]/).map(tag => tag.trim()).filter(Boolean);
    try {
      const next = await updatePoolItem(activeItem.id, { tags });
      setItems(current => current.map(item => item.id === next.id ? next : item));
      onShowToast('标签已保存');
    } catch (error) { onShowToast(errorText(error)); }
  };
  const batchMove = async (target: string | null) => {
    let moved = 0;
    for (const id of selectedIds) {
      try { await updatePoolItem(id, { folderId: target }); moved += 1; }
      catch (error) { onShowToast(`${moved} 份已移动，其余未改动：${errorText(error)}`); break; }
    }
    setSelectedIds([]); await refresh();
    if (moved) onShowToast(`已移动 ${moved} 份材料`);
  };
  const chooseFolder = (value: string) => {
    if (folderPicker === 'browse') {
      if (value === 'trash') openTrash();
      else openFolder(value === 'all' ? undefined : value === 'unfiled' ? null : value);
    } else if (folderPicker === 'batch') {
      void batchMove(value === 'unfiled' ? null : value);
    } else if (folderPicker === 'item' && activeItem) {
      void saveMove(activeItem.id, value === 'unfiled' ? null : value);
    }
  };

  const itemPreview = (item: PoolItem) => item.detectedMime === 'application/pdf'
    ? <iframe title={`${item.originalName} 预览`} src={item.contentUrl} className="h-full w-full rounded-xl border border-slate-200 dark:border-zinc-700" />
    : item.detectedMime.startsWith('image/')
      ? <img src={item.contentUrl} alt={item.originalName} className="max-h-full max-w-full rounded-xl object-contain" />
      : <div className="grid h-full place-items-center rounded-xl bg-slate-50 text-center text-sm text-slate-500 dark:bg-zinc-900"><div><FileText className="mx-auto mb-3 h-10 w-10" />此格式暂不支持在线预览<br />可以下载原件</div></div>;
  const folderActions = (folder: PoolFolder) => <div className="flex shrink-0 gap-1">
    <button type="button" onClick={() => openRenameFolder(folder)} aria-label={`重命名 ${folder.name}`} title="重命名" className="grid h-11 w-11 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800"><Pencil className="h-4 w-4" /></button>
    <button type="button" onClick={() => setFolderToArchive(folder)} aria-label={`归档 ${folder.name}`} title="归档空文件夹" className="grid h-11 w-11 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800"><Archive className="h-4 w-4" /></button>
  </div>;

  return <div className="flex h-full min-h-0 flex-col gap-3 animate-fade-in" id="material-pool-page">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-bold text-emerald-700">资料库</p><h2 className="text-xl font-black sm:text-2xl">材料池</h2><p className="text-sm text-slate-500">先保存与整理原件，需要时再选入资料编辑。</p></div>
      <div className="flex flex-wrap gap-2">
        <GlassButton type="button" onClick={() => { setQuery(''); openFolder(null); setQuickIndex(0); setQuickHistory([]); setQuickMode(true); }} variant="secondary" className="min-h-11 px-3 text-sm">快速整理</GlassButton>
        <GlassButton type="button" onClick={() => fileInput.current?.click()} disabled={uploading} variant="primary" className="flex min-h-11 items-center gap-2 px-3 text-sm"><Upload className="h-4 w-4" />{uploading ? '正在上传' : '上传文件'}</GlassButton>
        <input ref={fileInput} type="file" multiple accept={acceptedFiles} className="sr-only" onChange={event => void uploadFiles(event.target.files)} />
      </div>
    </header>
    {quickMode ? <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="font-bold">整理未归类材料</h3><p className="text-xs text-slate-500">选一个文件夹归类；跳过后也能返回上一份。</p></div><GlassButton variant="secondary" className="min-h-11 px-3 text-sm" onClick={() => openFolder(null)}>返回列表</GlassButton></div>
      {quickItem ? <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-h-0 flex-col gap-3"><div className="h-[min(28dvh,220px)] shrink-0 overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1" onTouchStart={event => { touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }} onTouchEnd={event => {
        if (!touchStart.current) return;
        const dx = event.changedTouches[0].clientX - touchStart.current.x;
        const dy = event.changedTouches[0].clientY - touchStart.current.y;
        touchStart.current = null;
        if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (dx < 0) skipQuickItem();
        else void previousQuickItem();
      }}>{itemPreview(quickItem)}</div><div><p className="break-all font-bold">{quickItem.originalName}</p><p className="text-xs text-slate-500">{formatSize(quickItem.sizeBytes)} · 第 {quickIndex + 1} 份</p></div></div>
        <aside className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto" aria-label="整理操作">
          <div className="flex gap-2"><GlassButton variant="secondary" containerClassName="flex-1" className="flex min-h-11 items-center justify-center gap-1 text-sm" onClick={() => void previousQuickItem()} disabled={!quickHistory.length || quickBusy}><ArrowLeft className="h-4 w-4" />上一份</GlassButton><GlassButton variant="secondary" containerClassName="flex-1" className="flex min-h-11 items-center justify-center gap-1 text-sm" onClick={skipQuickItem} disabled={quickBusy}><SkipForward className="h-4 w-4" />跳过</GlassButton></div>
          <div><p className="mb-2 text-sm font-bold">放入文件夹</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">{activeFolders.map(folder => <button key={folder.id} type="button" className="btn-primary min-h-12 w-full px-3 text-left text-sm" onClick={() => void saveMove(quickItem.id, folder.id, true)} disabled={quickBusy}>{folderPath(folder.id)}</button>)}</div></div>
        </aside>
      </div> : <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-slate-500"><p>这轮已看完。跳过的材料仍留在「未整理」。</p><div className="flex gap-2"><GlassButton variant="secondary" className="min-h-11 px-4" onClick={() => void previousQuickItem()} disabled={!quickHistory.length || quickBusy}>上一份</GlassButton><GlassButton variant="secondary" className="min-h-11 px-4" onClick={() => { setQuickIndex(0); setQuickHistory([]); }}>再看一遍</GlassButton></div></div>}
    </div> : <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="glass-panel hidden min-h-0 overflow-y-auto rounded-2xl p-3 lg:block">
        <div className="space-y-1">
          <button className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm ${view.kind === 'all' ? 'bg-emerald-100 font-bold text-emerald-900' : ''}`} onClick={() => openFolder(undefined)}>全部材料</button>
          <button className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm ${view.kind === 'unfiled' ? 'bg-emerald-100 font-bold text-emerald-900' : ''}`} onClick={() => openFolder(null)}>未整理</button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 px-3">
          <h3 className="text-sm font-bold">文件夹</h3>
          <GlassButton type="button" variant="primary" className="flex min-h-11 items-center gap-1.5 px-3 text-sm" onClick={() => openCreateFolder(null)}><FolderPlus className="h-4 w-4" />新建文件夹</GlassButton>
        </div>
        <div className="space-y-1">
          {activeFolders.filter(folder => !folder.parentId).map(folder => <div key={folder.id} className="flex min-h-11 items-center gap-1">
            <button className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 text-left text-sm ${view.kind === 'folder' && view.id === folder.id ? 'bg-emerald-100 font-bold text-emerald-900' : ''}`} onClick={() => openFolder(folder.id)}><Folder className="h-4 w-4 shrink-0" /><span className="truncate">{folder.name}</span></button>
            {folderActions(folder)}
          </div>)}
        </div>
        <button type="button" className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm" onClick={() => setShowArchived(true)}><Archive className="h-4 w-4" />文件夹归档盒{archivedFolders.length ? ` · ${archivedFolders.length}` : ''}</button>
        <button className={`mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm ${view.kind === 'trash' ? 'bg-emerald-100 font-bold text-emerald-900' : ''}`} onClick={openTrash}><Trash2 className="h-4 w-4" />回收站</button>
      </aside>
      <section className="glass-panel flex min-h-0 flex-col rounded-2xl p-3 sm:p-4">
        <button type="button" className="btn-secondary mb-3 flex min-h-12 w-full items-center justify-between gap-2 px-3 text-left text-base lg:hidden" onClick={() => setFolderPicker('browse')}>
          <span className="min-w-0 truncate">浏览：{view.kind === 'all' ? '全部材料' : view.kind === 'unfiled' ? '未整理' : view.kind === 'trash' ? '回收站' : folderPath(view.id)}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </button>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {view.kind === 'folder' ? <div className="flex flex-wrap items-center text-sm"><button type="button" className="min-h-11 px-2 text-emerald-700" onClick={() => openFolder(undefined)}>全部材料</button>{breadcrumb.map(folder => <button key={folder.id} type="button" className="min-h-11 px-2 font-bold" onClick={() => openFolder(folder.id)}> / {folder.name}</button>)}</div>
              : <h3 className="text-base font-bold">{view.kind === 'all' ? '全部材料' : view.kind === 'unfiled' ? '未整理' : '回收站'}</h3>}
          </div>
          <div className="flex flex-wrap gap-2">
            {currentFolder && folderActions(currentFolder)}
            {(view.kind === 'all' || view.kind === 'folder') && (view.kind === 'all' || breadcrumb.length < 3) && <button type="button" className={`btn-primary flex min-h-11 items-center gap-1.5 px-3 text-sm ${view.kind === 'all' ? 'lg:hidden' : ''}`} onClick={() => openCreateFolder(currentFolder?.id ?? null)}><FolderPlus className="h-4 w-4" />{currentFolder ? '新建子文件夹' : '新建文件夹'}</button>}
            <GlassButton containerClassName="lg:hidden" type="button" variant="secondary" className="min-h-11 px-3 text-sm" onClick={() => setShowArchived(true)}><Archive className="mr-1 inline h-4 w-4" />归档盒{archivedFolders.length ? ` ${archivedFolders.length}` : ''}</GlassButton>
          </div>
        </div>
        {visibleFolders.length > 0 && <div className={`mb-3 grid gap-2 sm:grid-cols-2 ${view.kind === 'all' ? 'lg:hidden' : ''}`}>
          {visibleFolders.map(folder => <div key={folder.id} className="flex min-h-12 items-center gap-1 rounded-xl border border-slate-200 dark:border-zinc-700">
            <button type="button" onClick={() => openFolder(folder.id)} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm font-bold"><Folder className="h-4 w-4 shrink-0" /><span className="truncate">{folder.name}</span><ArrowRight className="ml-auto h-4 w-4 shrink-0" /></button>
            {folderActions(folder)}
          </div>)}
        </div>}
        <div className="mb-3 flex flex-wrap gap-2">
          <label className="relative min-w-[160px] flex-1"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input aria-label="搜索材料" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索文件名或标签" className="qs-field-input min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-base sm:text-sm dark:bg-zinc-900" /></label>
          {selectedIds.length > 0 && <>
            <GlassButton containerClassName="sm:hidden" type="button" variant="secondary" className="min-h-11 px-3 text-sm" onClick={() => setFolderPicker('batch')}>移动 {selectedIds.length} 份材料</GlassButton>
            <select aria-label="批量移动到" className="qs-field-input hidden min-h-11 rounded-xl border border-slate-200 px-3 text-sm sm:block dark:bg-zinc-900" value="" onChange={event => { void batchMove(event.target.value === 'unfiled' ? null : event.target.value); }}><option value="">移动 {selectedIds.length} 份到…</option><option value="unfiled">未整理</option>{activeFolders.map(folder => <option key={folder.id} value={folder.id}>{folderPath(folder.id)}</option>)}</select>
          </>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? <p className="p-4 text-sm text-slate-500">正在加载材料…</p>
            : items.length === 0 ? <p className="p-4 text-sm text-slate-500">{view.kind === 'folder' ? '这个文件夹还没有材料。上传的文件先进入「未整理」，再从材料详情移动到这里。' : view.kind === 'trash' ? '回收站里没有材料。' : '这里还没有材料。可以上传文件，或切换文件夹查看。'}</p>
              : <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{items.map(item => <div key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-zinc-700">
                <div className="flex items-start gap-2">
                  <label className="flex h-11 w-11 shrink-0 items-center justify-center" aria-label={`选择 ${item.originalName}`}><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={event => setSelectedIds(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} className="h-5 w-5 accent-emerald-700" /></label>
                  <button className="min-w-0 flex-1 text-left" onClick={() => { setActiveItemId(item.id); setTagDraft(item.tags.join('，')); }}>
                    <div className="flex items-center gap-2">{item.detectedMime.startsWith('image/') ? <Image className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}<span className="truncate text-sm font-bold">{item.originalName}</span></div>
                    <p className="mt-2 text-xs text-slate-500">{formatSize(item.sizeBytes)} · {item.resourceId ? '已用于资料编辑' : '仅保存原件'}</p>
                    {view.kind === 'all' && <p className="mt-1 truncate text-xs text-slate-600" title={folderPath(item.folderId)}>位置：{folderPath(item.folderId)}</p>}
                    {item.tags.length > 0 && <p className="mt-1 truncate text-xs text-emerald-700">{item.tags.join(' · ')}</p>}
                  </button>
                </div>
              </div>)}</div>}
          {nextOffset !== null && <GlassButton variant="secondary" containerClassName="mt-3 w-full" className="min-h-11 text-sm" onClick={async () => { try { const result = await listPoolItems({ folderId, q: query.trim(), state, offset: nextOffset }); setItems(current => [...current, ...result.items]); setNextOffset(result.nextOffset); } catch (error) { onShowToast(errorText(error)); } }}>加载更多</GlassButton>}
        </div>
        {activeItem && <div className="fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-white p-4 dark:bg-zinc-950 lg:static lg:mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:border-t lg:border-slate-200 lg:bg-transparent lg:pt-3 lg:dark:border-zinc-700"><div className="flex min-h-11 items-center justify-between lg:hidden"><p className="font-bold">材料详情</p><GlassButton variant="secondary" className="min-h-11 px-3 text-sm" onClick={() => setActiveItemId(null)}>关闭</GlassButton></div><div className="h-[min(38dvh,320px)] min-h-[180px] overflow-hidden">{state === 'trashed' ? <div className="grid h-full place-items-center rounded-xl bg-slate-50 text-sm text-slate-500">恢复后可查看原件</div> : itemPreview(activeItem)}</div><div className="space-y-2"><p className="break-all text-sm font-bold">{activeItem.originalName}</p>{state === 'saved' && <a href={activeItem.contentUrl} download={activeItem.originalName} className="btn-secondary flex min-h-11 items-center justify-center text-sm">下载原件</a>}{activeItem.resourceId && <GlassButton variant="secondary" containerClassName="w-full" className="min-h-11 text-sm" onClick={() => onOpenResource(activeItem.resourceId!)}>在资料编辑打开</GlassButton>}{state === 'saved' && <><button type="button" className="btn-secondary min-h-12 w-full px-3 text-left text-base sm:hidden" onClick={() => setFolderPicker('item')}>移动到：{folderPath(activeItem.folderId)}</button><select aria-label="移动材料到文件夹" value={activeItem.folderId ?? ''} onChange={event => void saveMove(activeItem.id, event.target.value || null)} className="qs-field-input hidden min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm sm:block dark:bg-zinc-900"><option value="">未整理</option>{activeFolders.map(folder => <option key={folder.id} value={folder.id}>{folderPath(folder.id)}</option>)}</select><div className="flex gap-2"><input aria-label="材料标签，用逗号分隔" value={tagDraft} onChange={event => setTagDraft(event.target.value)} placeholder="标签，用逗号分隔" className="qs-field-input min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-base sm:text-sm dark:bg-zinc-900" /><GlassButton onClick={() => void applyTags()} variant="secondary" className="min-h-11 px-3" title="保存标签"><Check className="h-4 w-4" /></GlassButton></div><button onClick={async () => { try { await trashPoolItem(activeItem.id); setActiveItemId(null); await refresh(); onShowToast('已移到回收站，原件仍可恢复'); } catch (error) { onShowToast(errorText(error)); } }} className="min-h-11 text-sm text-rose-600">移到回收站</button></>}{state === 'trashed' && <GlassButton variant="secondary" containerClassName="w-full" className="min-h-11 text-sm" onClick={async () => { try { await restorePoolItem(activeItem.id); setActiveItemId(null); await refresh(); } catch (error) { onShowToast(errorText(error)); } }}>恢复材料</GlassButton>}<button className="min-h-11 w-full text-sm text-slate-500" onClick={() => setActiveItemId(null)}>关闭详情</button></div></div>}
      </section>
    </div>}
    {folderPicker && <ResponsiveChoiceDialog
      title={folderPicker === 'browse' ? '浏览材料位置' : '移动到文件夹'}
      value={folderPicker === 'browse' ? view.kind === 'folder' ? view.id : view.kind : folderPicker === 'item' ? activeItem?.folderId ?? 'unfiled' : ''}
      options={[
        ...(folderPicker === 'browse' ? [{ value: 'all', label: '全部材料' }, { value: 'unfiled', label: '未整理' }] : [{ value: 'unfiled', label: '未整理' }]),
        ...activeFolders.map(folder => ({ value: folder.id, label: folder.name, description: folder.parentId ? folderPath(folder.parentId) : '根目录' })),
        ...(folderPicker === 'browse' ? [{ value: 'trash', label: '回收站' }] : []),
      ]}
      onChange={chooseFolder}
      onClose={() => setFolderPicker(null)}
    />}
    {showArchived && <ResponsiveDialog title={`文件夹归档盒 · ${archivedFolders.length}`} onClose={() => setShowArchived(false)}>
      <div className="space-y-2">{archivedFolders.map(folder => <div key={folder.id} className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-zinc-700"><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{folder.name}</strong><span className="block truncate text-xs text-slate-500">原位置：{folder.parentId ? folderPath(folder.parentId) : '根目录'}</span></span><GlassButton containerClassName="shrink-0" type="button" onClick={() => void restoreFolder(folder)} variant="secondary" className="flex min-h-11 items-center gap-1.5 px-3 text-sm"><ArchiveRestore className="h-4 w-4" />恢复</GlassButton></div>)}{!archivedFolders.length && <p className="py-8 text-center text-sm text-slate-500">暂无已归档文件夹</p>}</div>
    </ResponsiveDialog>}
    {folderToArchive && <ResponsiveDialog title="归档空文件夹" busy={folderSaving} onClose={() => setFolderToArchive(null)}>
      <div className="space-y-4"><p className="text-sm">归档「{folderToArchive.name}」后，它会从浏览和整理目标中隐藏，可在文件夹归档盒恢复。文件夹内有材料或子文件夹时不会归档。</p><div className="flex justify-end gap-2"><GlassButton type="button" variant="secondary" className="min-h-11 px-4 text-sm" disabled={folderSaving} onClick={() => setFolderToArchive(null)}>取消</GlassButton><GlassButton type="button" variant="primary" className="min-h-11 px-4 text-sm" disabled={folderSaving} onClick={() => void archiveFolder()}>{folderSaving ? '归档中…' : '确认归档'}</GlassButton></div></div>
    </ResponsiveDialog>}
    {folderDialog && <ResponsiveDialog title={folderDialog.mode === 'create' ? '新建文件夹' : '重命名文件夹'} busy={folderSaving} onClose={() => setFolderDialog(null)}>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void saveFolder(); }}>
        <p className="text-sm text-slate-600 dark:text-slate-300">{folderDialog.mode === 'create' ? '创建于' : '所在位置'}：{(folderDialog.mode === 'create' ? folderDialog.parentId : folderDialog.folder.parentId) ? folderPath(folderDialog.mode === 'create' ? folderDialog.parentId : folderDialog.folder.parentId) : '根目录'}</p>
        <label className="block space-y-2 text-sm font-bold">文件夹名称<input autoFocus value={folderDraft} maxLength={80} onChange={event => { setFolderDraft(event.target.value); setFolderError(''); }} className="qs-field-input min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-normal dark:border-zinc-700 dark:bg-zinc-900" /></label>
        {folderError && <p role="alert" className="text-sm text-rose-700">{folderError}</p>}
        <div className="flex justify-end gap-2"><GlassButton type="button" variant="secondary" className="min-h-11 px-4 text-sm" disabled={folderSaving} onClick={() => setFolderDialog(null)}>取消</GlassButton><GlassButton type="submit" variant="primary" className="min-h-11 px-4 text-sm" disabled={folderSaving}>{folderSaving ? '保存中…' : folderDialog.mode === 'create' ? '创建文件夹' : '保存名称'}</GlassButton></div>
      </form>
    </ResponsiveDialog>}
  </div>;
}
