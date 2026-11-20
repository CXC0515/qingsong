import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Archive, ArrowLeft, ChevronDown, ChevronRight, FilePlus, FileText, Folder, FolderOpen, FolderPlus, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, X } from 'lucide-react';
import { ConfigEditor, type HarnessDrafts, type HarnessSkill } from './HarnessConfig';

type Skill = HarnessSkill & { archived?: boolean };
type Target = { type: 'skill' | 'folder' | 'file'; path: string; id: string };
type Action = 'skill' | 'folder' | 'file' | 'rename' | 'move' | 'archive' | 'restore';
type Operation = { action: Action; target: Target; name: string; parent: string };
const basename = (path: string) => path.split('/').pop()!;
const parentPath = (path: string) => path.split('/').slice(0, -1).join('/');
function folderPaths(skill: Skill): string[] {
  const paths = new Set(skill.emptyFolders);
  for (const path of [...skill.files.map(f => parentPath(f.name)), ...skill.emptyFolders]) {
    const segments = path.split('/').filter(Boolean);
    segments.forEach((_, i) => paths.add(segments.slice(0, i + 1).join('/')));
  }
  return [...paths].sort();
}
export default function HarnessSkillWorkspace({ drafts, onBack, loadedFiles, skills, onLibraryChange }: { drafts: HarnessDrafts; onBack: () => void; loadedFiles: string[]; skills: Skill[]; onLibraryChange: (skills: Skill[]) => void }) {

  const [skillId, setSkillId] = useState(skills[0].id);
  const [fileId, setFileId] = useState(skills[0].files[0].id);
  const [folder, setFolder] = useState('');
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [level, setLevel] = useState<'skills' | 'files' | 'editor'>('skills');
  const [expanded, setExpanded] = useState(false);
  const [archived, setArchived] = useState(false);
  const [menu, setMenu] = useState<Target | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!menu && !operation) return;
    const previous = document.activeElement as HTMLElement | null;
    const surface = document.querySelector<HTMLElement>(operation ? '.hc-file-dialog' : '.hc-file-menu');
    const controls = () => [...(surface?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select') ?? [])];
    (surface?.querySelector<HTMLElement>('input') ?? controls()[0])?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = controls(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    surface?.addEventListener('keydown', trap);
    return () => { surface?.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus(); };
  }, [menu, operation?.action]);
  const skill = skills.find(s => s.id === skillId) ?? skills[0];
  const visibleSkills = skills.filter(s => !!s.archived === archived);
  const skillVisible = !!skill.archived === archived;
  const file = skill.files.find(f => f.id === fileId) ?? skill.files[0];
  const folders = folderPaths(skill);
  const root: Target = { type: 'skill', path: '', id: skill.id };
  const chooseSkill = (id: string) => { const next = skills.find(s => s.id === id)!; setSkillId(id); setFileId(next.files[0].id); setFolder(''); setLevel('files'); setMenu(null); };
  const start = (action: Action, target = menu ?? root) => {
    setError(''); setMenu(null);
    setOperation({ action, target, name: action === 'rename' ? target.type === 'skill' ? skill.name : basename(target.path) : '', parent: action === 'move' ? parentPath(target.path) : target.type === 'folder' ? target.path : target.type === 'skill' ? '' : parentPath(target.path) });
  };
  const persist = (next: Skill[], message: string) => { onLibraryChange(next); setNotice(message); return true; };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!operation) return;
    const { action, target, parent } = operation;
    const name = operation.name.trim();
    const invalidName = !name || name === '.' || name === '..' || /[/\\\u0000-\u001f]/.test(name);
    if (['skill', 'file', 'folder', 'rename'].includes(action) && invalidName) { setError('请输入有效名称，不包含斜杠或控制字符。'); return; }
    let next = skills;
    let nextFile = fileId;
    let nextSkill = skillId;
    let nextFolder = folder;
    if (action === 'skill') {
      if (skills.some(s => s.name === name)) { setError('已存在同名 Skill，包括已归档项。'); return; }
      const id = crypto.randomUUID();
      const entry = { id: 'skill/' + id + '/entry', name: 'SKILL.md', kind: 'markdown' as const, content: '---\nname: ' + JSON.stringify(id) + '\ndescription: 请填写能力用途\n---\n\n# ' + name + '\n\n## 执行步骤\n' };
      next = [...skills, { id, name, description: '自定义 Skill', files: [entry], emptyFolders: [] }];
      nextSkill = id; nextFile = entry.id; nextFolder = '';
    } else if (action === 'archive' || action === 'restore') {
      next = skills.map(s => s.id === skill.id ? { ...s, archived: action === 'archive' } : s);
    } else if (action === 'rename' && target.type === 'skill') {
      if (skills.some(s => s.id !== skill.id && s.name === name)) { setError('已存在同名 Skill。'); return; }
      next = skills.map(s => s.id === skill.id ? { ...s, name } : s);
    } else {
      if (skill.archived) { setError('请先恢复 Skill，再修改目录。'); return; }
      if (parent && !folders.includes(parent)) { setError('目标文件夹不存在。'); return; }
      const targetPath = parent ? parent + '/' + name : name;
      let files = skill.files;
      let dirs = folders;
      const existing = new Set([...files.map(f => f.name), ...dirs]);
      if (action === 'file' || action === 'folder') {
        if (existing.has(targetPath)) { setError('此位置已有同名文件或文件夹。'); return; }
        if (action === 'file') {
          const added = { id: 'skill/' + skill.id + '/' + crypto.randomUUID(), name: targetPath, kind: name.endsWith('.json') ? 'json' as const : 'markdown' as const, content: name.endsWith('.json') ? '{}' : '# ' + name.replace(/\.md$/, '') + '\n' };
          files = [...files, added]; nextFile = added.id;
        } else { dirs = [...dirs, targetPath]; nextFolder = targetPath; }
      } else {
        if (target.path === 'SKILL.md') { setError('SKILL.md 是入口文件，须保留在根目录。'); return; }
        const destination = action === 'rename' ? (parentPath(target.path) ? parentPath(target.path) + '/' : '') + name : (parent ? parent + '/' : '') + basename(target.path);
        if (destination === target.path) { setOperation(null); return; }
        if (target.type === 'folder' && (parent === target.path || parent.startsWith(target.path + '/'))) { setError('不能把文件夹移入自身或子文件夹。'); return; }
        const affected = (path: string) => path === target.path || (target.type === 'folder' && path.startsWith(target.path + '/'));
        const replace = (path: string) => affected(path) ? destination + path.slice(target.path.length) : path;
        if ([...existing].filter(affected).some(path => existing.has(replace(path)) && !affected(replace(path)))) { setError('目标位置存在同名内容，请更换名称或位置。'); return; }
        files = files.map(f => affected(f.name) ? { ...f, name: replace(f.name), kind: replace(f.name).endsWith('.json') ? 'json' : 'markdown' } : f);
        dirs = dirs.map(replace);
        nextFolder = replace(folder);
      }
      next = skills.map(s => s.id === skill.id ? { ...s, files, emptyFolders: dirs } : s);
    }
    if (!persist(next, action === 'archive' ? '已归档，可在已归档中恢复' : action === 'restore' ? '已恢复 Skill' : '目录已更新，保存新版本后生效')) return;
    setOperation(null); setSkillId(nextSkill); setFileId(nextFile); setFolder(nextFolder);
    if (action === 'skill') { setArchived(false); setLevel('files'); }
    if (action === 'archive' || action === 'restore') {
      const candidate = next.find(s => !!s.archived === archived);
      if (candidate) { setSkillId(candidate.id); setFileId(candidate.files[0].id); }
      setLevel('skills');
    }
    setCollapsed(c => c.filter(p => p !== nextFolder));
  };
  const fileRow = (f: typeof file) => <div key={f.id} className="hc-tree-row" onContextMenu={e => { e.preventDefault(); setMenu({ type: 'file', id: f.id, path: f.name }); }}>
    <button type="button" className={'hc-file-row ' + (file.id === f.id ? 'is-selected' : '')} onClick={() => { setFileId(f.id); setFolder(parentPath(f.name)); setLevel('editor'); }}><FileText size={16}/><span>{basename(f.name)}</span>{loadedFiles.includes(f.id) && <small>已加载</small>}</button>
    <button type="button" className="hc-icon-button" aria-label={'操作 ' + f.name} onClick={() => setMenu({ type: 'file', id: f.id, path: f.name })}><MoreHorizontal size={16}/></button>
  </div>;
  const tree = (parent: string): ReactNode => <>
    {skill.files.filter(f => parentPath(f.name) === parent).map(fileRow)}
    {folders.filter(path => parentPath(path) === parent).map(path => { const closed = collapsed.includes(path); const empty = !skill.files.some(f => parentPath(f.name) === path) && !folders.some(p => parentPath(p) === path); return <div key={path}>
      <div className={'hc-tree-row ' + (folder === path ? 'is-folder-selected' : '')} onContextMenu={e => { e.preventDefault(); setMenu({ type: 'folder', id: path, path }); }}>
        <button type="button" className="hc-folder-row" aria-expanded={!closed} onClick={() => { setFolder(path); setCollapsed(c => closed ? c.filter(p => p !== path) : [...c, path]); }}>{closed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}<Folder size={17}/><span>{basename(path)}</span></button>
        <button type="button" className="hc-icon-button" aria-label={'操作文件夹 ' + path} onClick={() => setMenu({ type: 'folder', id: path, path })}><MoreHorizontal size={16}/></button>
      </div>{!closed && <div className="hc-tree-children">{empty ? <span className="hc-empty-folder">空文件夹</span> : tree(path)}</div>}
    </div>; })}
  </>;
  const labels: Record<Action, string> = { skill: '新建 Skill', folder: '新建文件夹', file: '新建文件', rename: '重命名', move: '移到', archive: '归档 Skill', restore: '恢复 Skill' };
  return <section className={'hc-skill-workspace ' + (expanded ? 'is-expanded' : '')} data-level={level} aria-label="Skill 文件工作区">
    <div className="hc-skill-toolbar"><button type="button" onClick={onBack}><ArrowLeft size={16}/>返回画布</button><h2>Skill 库</h2><select aria-label="切换 Skill" value={skillVisible ? skill.id : ''} onChange={e => chooseSkill(e.target.value)}><option value="" disabled>选择 Skill</option>{visibleSkills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button type="button" onClick={() => start('skill', root)}><Plus size={16}/>新建 Skill</button><button type="button" aria-pressed={archived} onClick={() => { setArchived(v => !v); setLevel('skills'); const next = skills.find(s => !!s.archived === !archived); if (next) { setSkillId(next.id); setFileId(next.files[0].id); } }}><Archive size={15}/>{archived ? '返回可用' : '已归档'}</button></div>
    {notice && <div className="hc-library-notice" role="status">{notice}</div>}
    <div className="hc-skill-panes">
      <nav className="hc-skill-list" aria-label="Skill 文件夹"><div className="hc-pane-title">{archived ? '已归档' : 'SKILLS'}<span>{visibleSkills.length}</span></div>{visibleSkills.map(s => <button type="button" key={s.id} className={s.id === skill.id ? 'is-selected' : ''} onClick={() => chooseSkill(s.id)} onContextMenu={e => { e.preventDefault(); chooseSkill(s.id); setMenu({ type: 'skill', path: '', id: s.id }); }}><Folder size={30} strokeWidth={1}/><span><strong>{s.name}</strong><small>{s.files.length} 个文件</small></span><ChevronRight size={14}/></button>)}{!visibleSkills.length && <p className="hc-empty-folder">暂无{archived ? '归档' : '可用'} Skill</p>}</nav>
      {skillVisible ? <><nav className="hc-file-list" aria-label="Skill 文件目录"><div className="hc-pane-title"><button type="button" className="hc-mobile-back" onClick={() => setLevel('skills')} aria-label="返回 Skill 列表"><ArrowLeft size={16}/></button><FolderOpen size={16}/><strong>{skill.name}</strong><button type="button" className="hc-icon-button" aria-label="Skill 操作" onClick={() => setMenu(root)}><MoreHorizontal size={16}/></button></div><div className="hc-directory-actions">{!skill.archived && <><button type="button" onClick={() => start('folder', { type: 'folder', id: folder, path: folder })} aria-label="新建文件夹"><FolderPlus size={16}/></button><button type="button" onClick={() => start('file', { type: 'folder', id: folder, path: folder })} aria-label="新建文件"><FilePlus size={16}/></button></>}<button type="button" onClick={() => setFolder('')} aria-label="选择 Skill 根目录">根目录</button><span title={folder || '/'}>{folder || '/'}</span></div><div className="hc-tree">{tree('')}</div></nav>
      <div className="hc-file-editor"><div className="hc-file-path"><button type="button" className="hc-mobile-back" aria-label="返回文件目录" onClick={() => setLevel('files')}><ArrowLeft size={16}/></button><button type="button" className="hc-icon-button hc-tree-toggle" aria-label={expanded ? '显示文件目录' : '收起文件目录'} onClick={() => setExpanded(v => !v)}>{expanded ? <PanelLeftOpen size={16}/> : <PanelLeftClose size={16}/>}</button><span>{skill.name} / {file.name}</span>{loadedFiles.includes(file.id) && <small>本轮已加载</small>}</div>{skill.archived ? <><div className="hc-config-context">已归档，恢复后可以编辑</div><pre className="hc-config-readonly">{drafts.value(file)}</pre></> : <ConfigEditor key={file.id} file={file} drafts={drafts}/>}</div></> : <div className="hc-library-empty">选择一个 Skill，或新建 Skill</div>}
    </div>
    {menu && <div className="hc-dialog-layer" onKeyDown={e => { if (e.key === 'Escape') setMenu(null); }}><button className="hc-dialog-scrim" aria-label="关闭操作菜单" onClick={() => setMenu(null)}/><div className="hc-file-menu" role="menu" aria-label="文件操作"><strong>{menu.type === 'skill' ? skill.name : basename(menu.path)}</strong>{skill.archived ? <button type="button" role="menuitem" onClick={() => start('restore')}>恢复 Skill</button> : <>{menu.type !== 'file' && <><button type="button" role="menuitem" onClick={() => start('folder')}>新建文件夹</button><button type="button" role="menuitem" onClick={() => start('file')}>新建文件</button></>}<button type="button" role="menuitem" disabled={menu.path === 'SKILL.md'} onClick={() => start('rename')}>重命名</button>{menu.type !== 'skill' && <button type="button" role="menuitem" disabled={menu.path === 'SKILL.md'} onClick={() => start('move')}>移到…</button>}{menu.type === 'skill' && <button type="button" role="menuitem" onClick={() => start('archive')}>归档 Skill</button>}</>}<button type="button" role="menuitem" onClick={() => setMenu(null)}>关闭</button></div></div>}
    {operation && <div className="hc-dialog-layer" onKeyDown={e => { if (e.key === 'Escape') setOperation(null); }}><button className="hc-dialog-scrim" aria-label="取消文件操作" onClick={() => setOperation(null)}/><form className="hc-file-dialog" role="dialog" aria-modal="true" aria-label={labels[operation.action]} onSubmit={submit}><header><h3>{labels[operation.action]}</h3><button className="hc-icon-button" type="button" aria-label="关闭对话框" onClick={() => setOperation(null)}><X size={16}/></button></header>{['skill', 'folder', 'file', 'rename'].includes(operation.action) && <label>名称<input aria-label="名称" autoFocus value={operation.name} onChange={e => setOperation(o => o && { ...o, name: e.target.value })}/></label>}{['file', 'folder', 'move'].includes(operation.action) && <label>位置<select aria-label="位置" value={operation.parent} onChange={e => setOperation(o => o && { ...o, parent: e.target.value })}><option value="">Skill 根目录</option>{folders.filter(p => operation.action !== 'move' || (p !== operation.target.path && !p.startsWith(operation.target.path + '/'))).map(p => <option key={p} value={p}>{p}</option>)}</select></label>}{operation.action === 'archive' && <p>归档“{skill.name}”后仍保留文件和草稿，可随时恢复。</p>}{operation.action === 'restore' && <p>恢复“{skill.name}”到可用 Skill。</p>}{error && <p className="hc-form-error" role="alert">{error}</p>}<footer><button type="button" onClick={() => setOperation(null)}>取消</button><button type="submit" className="hc-primary">{['archive', 'restore'].includes(operation.action) ? labels[operation.action] : '保存'}</button></footer></form></div>}
  </section>;
}
