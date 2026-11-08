import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, FileText, RefreshCw, RotateCcw, Save, Shield, Sparkles } from 'lucide-react';
import { GlassButton, GlassSurface } from '../../components/glass/Glass';
import { GlassSegments } from '../../components/glass/Glass';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import { apiFetch } from '../../services/apiClient';

type Node = { id: string; title: string; kind: 'prompt' | 'skill'; editable: boolean; enabled: boolean; content: string; description: string; requires: string[]; version: string; hash: string };
type State = { revision: number; updatedAt: string | null; updatedBy: string | null; nodes: Node[]; history: { revision: number; updatedAt: string | null; updatedBy: string | null }[] };
const endpoint = '/api/admin/assistant/dsh-prompts';
const same = (a: Node[], b: Node[]) => JSON.stringify(a.map(({id,enabled,content})=>({id,enabled,content}))) === JSON.stringify(b.map(({id,enabled,content})=>({id,enabled,content})));

export default function DshPromptManager({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState<Node[]>([]);
  const [selected, setSelected] = useState('teaching-context');
  const [mode, setMode] = useState<'edit' | 'compare'>('edit');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingDiscard, setPendingDiscard] = useState<'reload' | { restore: number } | null>(null);
  const node = draft.find(item => item.id === selected);
  const original = state?.nodes.find(item => item.id === selected);
  const dirty = Boolean(state && !same(state.nodes, draft));
  const editableCount = useMemo(() => draft.filter(item => item.editable).length, [draft]);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const load = async (discard = false) => {
    if (dirty && !discard) { setPendingDiscard('reload'); return; }
    setLoading(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(endpoint);
      const value = await response.json();
      if (!response.ok) throw Error(value.message || '提示词配置未能载入，原配置保留。');
      setState(value); setDraft(value.nodes); setSelected(current => value.nodes.some((item: Node) => item.id === current) ? current : value.nodes[0]?.id ?? '');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '读取失败，原配置保留。'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const update = (id: string, changes: Partial<Node>) => setDraft(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
  const save = async () => {
    if (!state || saving || !dirty) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await apiFetch(endpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision: state.revision, nodes: draft.map(({id,enabled,content}) => ({id,enabled,content})) }) });
      const value = await response.json();
      if (!response.ok) throw Error(value.message || '保存未确认，当前配置保持不变。');
      const check = await apiFetch(endpoint); const verified = await check.json();
      if (!check.ok || verified.revision !== value.revision || !same(verified.nodes, draft)) throw Error('保存回读与草稿不一致，请重新载入核对。');
      setState(verified); setDraft(verified.nodes); setNotice('已保存并回读确认，新一轮对话使用此版本。正在运行的回复保持原上下文。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存结果未确认，请重新载入。'); }
    finally { setSaving(false); }
  };
  const restore = async (revision: number) => {
    if (dirty) { setPendingDiscard({ restore: revision }); return; }
    await loadRestore(revision);
  };
  const loadRestore = async (revision: number) => {
    setError(''); setNotice('');
    try {
      const response = await apiFetch(`${endpoint}/history/${revision}`); const value = await response.json();
      if (!response.ok) throw Error(value.message || '历史版本未能载入。');
      setDraft(value.nodes); setNotice(`已载入版本 ${revision} 的草稿，保存后会生成新版本。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '历史版本未能载入。'); }
  };

  return <section className="qs-admin-settings qs-dsh-prompts" aria-label="DSH 提示词与 Skill 管理">
    <GlassSurface className="qs-admin-section qs-dsh-prompt-heading"><div><h2>DSH 提示词与 Skill</h2><p>管理青松实际注入的教学规则和 Skill 正文。DSH 内部提示词由运行时管理，在此只显示可编辑节点。</p></div><div className="qs-dsh-prompt-meta"><span>版本 {state?.revision ?? '—'}</span><span>{editableCount} 个可编辑节点</span></div></GlassSurface>
    {error && <p role="alert" className="qs-admin-feedback">{error}</p>}
    {notice && <p role="status" className="qs-admin-notice">{notice}</p>}
    {loading ? <p role="status" className="qs-admin-empty">正在读取提示词和 Skill…</p> : state && <div className="qs-dsh-prompt-layout">
      <nav className="qs-dsh-prompt-list qs-admin-section" aria-label="DSH 配置节点">
        <div className="qs-dsh-list-head"><strong>青松运行节点</strong><span>{draft.filter(item => item.enabled).length} 已启用</span></div>
        {draft.map(item => <button key={item.id} type="button" className={`qs-dsh-node ${item.id === selected ? 'is-selected' : ''}`} aria-current={item.id === selected ? 'true' : undefined} onClick={() => setSelected(item.id)}>
          {item.kind === 'skill' ? <Sparkles size={16} /> : <FileText size={16} />}<span><strong>{item.title}</strong><small>{item.description}</small></span><i className={item.enabled ? 'is-enabled' : ''} aria-label={item.enabled ? '已启用' : '已关闭'} />
        </button>)}
        <div className="qs-dsh-readonly"><Shield size={15} /><span>模型身份、工具定义与 DSH 内部规则保持只读，由项目代码和 DSH 运行时控制。</span></div>
      </nav>
      <div className="qs-dsh-prompt-editor">
        {node && <>
          <header className="qs-admin-section qs-dsh-editor-head"><div><div className="qs-dsh-title-row"><h3>{node.title}</h3><span className={node.enabled ? 'qs-dsh-status is-enabled' : 'qs-dsh-status'}>{node.enabled ? '已披露' : '未披露'}</span></div><p>{node.description}</p>{node.kind === 'skill' && <small>版本 {node.version} · SHA256 {node.hash.slice(0, 12)}{node.requires.length ? ` · 能力 ${node.requires.join('、')}` : ''}</small>}</div><div className="qs-dsh-toggle"><span>披露给 Agent</span><button type="button" role="switch" aria-checked={node.enabled} aria-label="披露给 Agent" onClick={() => update(node.id, { enabled: !node.enabled })}><i /></button></div></header>
          <div className="qs-dsh-workspace qs-admin-section">
            <div className="qs-dsh-editor-toolbar"><div><strong>{mode === 'edit' ? '正文编辑' : '当前版本与草稿'}</strong><span>{node.content.length.toLocaleString()} 字符</span></div><GlassSegments label="提示词视图" value={mode} options={[{value:'edit',label:'编辑'},{value:'compare',label:'对照'}]} onChange={value => setMode(value as 'edit'|'compare')} /></div>
            {mode === 'edit' ? <textarea aria-label={`${node.title}正文`} spellCheck={false} value={node.content} onChange={event => update(node.id, { content: event.target.value })} /> : <div className="qs-dsh-compare"><section><h4>当前生效 · {state.revision}</h4><pre>{original?.content}</pre></section><section><h4>本次草稿{dirty ? ' · 未保存' : ''}</h4><pre>{node.content}</pre></section></div>}
          </div>
        </>}
        <div className="qs-admin-save-surface qs-dsh-prompt-actions"><GlassSurface><div className="qs-admin-save"><span>{state.updatedAt ? `最近保存 ${new Date(state.updatedAt).toLocaleString()}` : '尚未另存管理员版本'}{dirty ? ' · 有未保存修改' : ''}</span><label className="qs-dsh-history">历史版本<select aria-label="载入历史版本" defaultValue="" onChange={event => { const revision = Number(event.target.value); if (revision) void restore(revision); event.target.value = ''; }}><option value="">选择版本</option>{state.history.map(item => <option key={item.revision} value={item.revision}>v{item.revision} · {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '时间未记录'}</option>)}</select><RotateCcw size={15} /></label><GlassButton type="button" onClick={() => void load()} disabled={saving}><RefreshCw size={16} />重新载入</GlassButton><GlassButton type="button" onClick={() => { setDraft(state.nodes); setNotice('已恢复为当前保存版本。'); }} disabled={!dirty || saving}><RotateCcw size={16} />撤销草稿</GlassButton><GlassButton type="button" variant="primary" onClick={() => void save()} disabled={!dirty || saving}><Save size={16} />{saving ? '正在保存…' : '保存新版本'}</GlassButton></div></GlassSurface></div>
      </div>
    </div>}
    <div className="qs-dsh-prompt-foot"><Eye size={15} /><span>保存前可对照差异；保存会保留上一版，正在运行的回复继续使用已装载内容。</span><span className="sr-only"><Check /></span></div>
    {pendingDiscard && <ResponsiveDialog title="替换未保存的草稿？" onClose={() => setPendingDiscard(null)}><p>{pendingDiscard === 'reload' ? '重新载入会丢弃当前编辑内容。' : '载入历史版本会替换当前编辑内容，已保存版本不会改变。'}</p><div className="mt-4 flex flex-wrap justify-end gap-2"><GlassButton onClick={() => setPendingDiscard(null)}>继续编辑</GlassButton><GlassButton variant="danger" onClick={() => { const action = pendingDiscard; setPendingDiscard(null); if (action === 'reload') void load(true); else void loadRestore(action.restore); }}>{pendingDiscard === 'reload' ? '重新载入' : '载入历史草稿'}</GlassButton></div></ResponsiveDialog>}
  </section>;
}
