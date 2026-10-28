import { useEffect, useRef, useState } from 'react';
import { Check, FileText, FolderOpen, Search } from 'lucide-react';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import { GlassButton } from '../../components/glass/Glass';
import type { PoolFolder, PoolItem } from '../../domain/materialPool';
import { listPoolFolders, listPoolItems } from '../../services/materialPoolApi';

const MAX_SELECTION = 20;
const displayBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function MaterialPoolPicker({ onConfirm, onClose }: {
  key?: string;
  onConfirm: (itemIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [folders, setFolders] = useState<PoolFolder[]>([]);
  const [folderId, setFolderId] = useState('all');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PoolItem[]>([]);
  const [selected, setSelected] = useState<Map<string, PoolItem>>(() => new Map());
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [folderError, setFolderError] = useState('');
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void listPoolFolders().then(result => {
      if (active) setFolders(result.filter(folder => !folder.archivedAt));
    }).catch(() => {
      if (active) setFolderError('文件夹暂未载入，可搜索全部材料；原有资料未改变。');
    });
    return () => { active = false; mounted.current = false; generation.current++; };
  }, []);

  useEffect(() => {
    const current = ++generation.current;
    setLoading(true); setLoadingMore(false); setError('');
    const timer = setTimeout(() => {
      void listPoolItems({ q: query.trim(), folderId: folderId === 'all' ? undefined : folderId === 'unfiled' ? null : folderId, state: 'saved' }).then(result => {
        if (current !== generation.current || !mounted.current) return;
        setItems(result.items.filter(item => item.state === 'saved'));
        setNextOffset(result.nextOffset);
      }).catch(() => {
        if (current !== generation.current || !mounted.current) return;
        setItems([]); setNextOffset(null);
        setError('材料列表未能载入，当前选择仍保留，尚未引用；请重试。');
      }).finally(() => {
        if (current === generation.current && mounted.current) setLoading(false);
      });
    }, query.trim() ? 200 : 0);
    return () => { clearTimeout(timer); generation.current++; };
  }, [folderId, query, revision]);

  const loadMore = async () => {
    if (loading || loadingMore || nextOffset === null) return;
    const current = generation.current;
    setLoadingMore(true); setError('');
    try {
      const result = await listPoolItems({ q: query.trim(), folderId: folderId === 'all' ? undefined : folderId === 'unfiled' ? null : folderId, state: 'saved', offset: nextOffset });
      if (current !== generation.current || !mounted.current) return;
      setItems(previous => [...new Map([...previous, ...result.items.filter(item => item.state === 'saved')].map(item => [item.id, item])).values()]);
      setNextOffset(result.nextOffset);
    } catch {
      if (current === generation.current && mounted.current) setError('更多材料未能载入，当前选择仍保留；请再试一次。');
    } finally {
      if (current === generation.current && mounted.current) setLoadingMore(false);
    }
  };
  const toggle = (item: PoolItem) => {
    setError('');
    setSelected(previous => {
      const next = new Map(previous);
      if (next.has(item.id)) next.delete(item.id);
      else if (next.size < MAX_SELECTION) next.set(item.id, item);
      return next;
    });
  };
  const confirm = async () => {
    if (busy || !selected.size) return;
    setBusy(true); setError('');
    try { await onConfirm([...selected.keys()]); }
    catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '材料引用未能确认，原件没有改变；请重试。');
    } finally { if (mounted.current) setBusy(false); }
  };
  const folderName = (folder: PoolFolder) => {
    const parts = [folder.name];
    let parentId = folder.parentId;
    const visited = new Set([folder.id]);
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = folders.find(candidate => candidate.id === parentId);
      if (!parent) break;
      parts.unshift(parent.name); parentId = parent.parentId;
    }
    return parts.join(' / ');
  };

  return <ResponsiveDialog title="从材料池选择" compactFull busy={busy} onClose={onClose} footer={<>
    <span className="mr-auto self-center text-sm text-slate-600 dark:text-slate-300" aria-live="polite">已选 {selected.size} / {MAX_SELECTION}</span>
    <GlassButton type="button" variant="secondary" disabled={busy} className="min-h-11 px-4 text-sm" onClick={onClose}>取消</GlassButton>
    <GlassButton type="button" disabled={busy || selected.size === 0} className="min-h-11 px-4 text-sm" onClick={() => void confirm()}>{busy ? '正在引用…' : '引用所选'}</GlassButton>
  </>}>
    <div className="flex flex-wrap gap-2">
      <label className="relative min-w-0 flex-1 basis-44"><Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" aria-hidden="true" /><input type="search" aria-label="搜索材料池" placeholder="搜索材料名称或标签" value={query} maxLength={200} disabled={busy} onChange={event => setQuery(event.target.value)} className="qs-field-input min-h-11 w-full rounded-xl border border-slate-200 py-2 pl-10 pr-3 text-base dark:border-zinc-700 dark:bg-zinc-900" /></label>
      <label className="flex min-h-11 min-w-0 flex-1 basis-40 items-center gap-2"><FolderOpen className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" /><select aria-label="筛选材料文件夹" value={folderId} disabled={busy} onChange={event => setFolderId(event.target.value)} className="qs-field-input min-h-11 min-w-0 w-full rounded-xl border border-slate-200 px-3 text-base dark:border-zinc-700 dark:bg-zinc-900"><option value="all">全部材料</option><option value="unfiled">未整理</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folderName(folder)}</option>)}</select></label>
    </div>
    {folderError && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{folderError}</p>}
    {selected.size > 0 && <div className="flex flex-wrap gap-2" aria-label="已选材料">{[...selected.values()].map(item => <button key={item.id} type="button" disabled={busy} onClick={() => toggle(item)} aria-label={`移除所选材料：${item.originalName}`} className="min-h-11 max-w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"><span className="break-all">{item.originalName}</span><span className="ml-2 whitespace-nowrap text-xs">移除</span></button>)}</div>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700 dark:text-red-300"><p className="min-w-0 flex-1 basis-52">{error}</p><GlassButton type="button" variant="secondary" disabled={busy || loading} className="min-h-11 px-3 text-sm" onClick={() => setRevision(value => value + 1)}>重新载入</GlassButton></div>}
    <div aria-busy={loading} className="space-y-2">
      {loading ? <p role="status" className="py-5 text-sm text-slate-500">正在查找材料…</p> : items.length ? items.map(item => {
        const checked = selected.has(item.id);
        return <button key={item.id} type="button" role="checkbox" aria-checked={checked} disabled={busy || (!checked && selected.size >= MAX_SELECTION)} onClick={() => toggle(item)} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-3 text-left disabled:opacity-50 ${checked ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40' : 'border-slate-200 bg-white/70 dark:border-zinc-700 dark:bg-zinc-900/70'}`}><FileText className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" /><span className="min-w-0 flex-1"><strong className="block break-all text-sm font-medium">{item.originalName}</strong><span className="mt-1 block text-xs text-slate-500">{item.originalName.split('.').pop()?.toUpperCase()} · {displayBytes(item.sizeBytes)} · 材料池</span></span>{checked ? <Check className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" /> : <span className="h-5 w-5 shrink-0 rounded border border-slate-300 dark:border-zinc-600" aria-hidden="true" />}</button>;
      }) : !error && <p role="status" className="py-5 text-sm text-slate-500">没有找到材料，可以换个关键词或文件夹。</p>}
    </div>
    {nextOffset !== null && !loading && <GlassButton type="button" variant="secondary" disabled={loadingMore || busy} containerClassName="w-full" className="min-h-11 text-sm" onClick={() => void loadMore()}>{loadingMore ? '正在加载…' : '加载更多'}</GlassButton>}
  </ResponsiveDialog>;
}
