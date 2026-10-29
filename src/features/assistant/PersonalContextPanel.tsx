import {assistantObjects} from '../../domain/assistantCapabilities';
import {useEffect,useRef,useState} from 'react';
import {ChevronRight,Plus,Settings} from 'lucide-react';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import {GlassButton,GlassSegments} from '../../components/glass/Glass';
import {apiFetch} from '../../services/apiClient';
import type {PersonalEntry} from '../../domain/personalContext';
import {usePersonalContext} from './usePersonalContext';
const labels={active:'已启用',candidate:'待确认',disabled:'已停用',expired:'已到期',deleted:'已删除'};
export default function PersonalContextPanel({active,onClose,onDirtyChange,onBusyChange}:{active:boolean;onClose?:()=>void;onDirtyChange?:(value:boolean)=>void;onBusyChange?:(value:boolean)=>void}){
  const store=usePersonalContext(active);
  const [page,setPage]=useState<'instructions'|'memory'>('instructions'),[category,setCategory]=useState<'work'|'background'>('work'),[filter,setFilter]=useState<'saved'|'pending'>('saved');
  const [writing,setWriting]=useState(false),[draft,setDraft]=useState(''),[base,setBase]=useState(''),[query,setQuery]=useState('');
  const [entry,setEntry]=useState<PersonalEntry|null>(null),[dialog,setDialog]=useState(false),[text,setText]=useState(''),[expiry,setExpiry]=useState(''),[history,setHistory]=useState<PersonalEntry[]|null>(null),[historyBusy,setHistoryBusy]=useState(false),[confirm,setConfirm]=useState<'discard'|'delete'|null>(null);
  const editor=useRef<HTMLTextAreaElement>(null),historySeq=useRef(0);
  const dirty=(writing&&draft!==store.document.content)||(dialog&&(text!==(entry?.content??'')||expiry!==(entry?.expiresAt?.slice(0,10)??'')));
  useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
  useEffect(()=>{onBusyChange?.(store.busy);},[store.busy,onBusyChange]);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  useEffect(()=>{if(writing)editor.current?.focus();},[writing]);
  useEffect(()=>{if(!active){setConfirm(null);historySeq.current++;setHistoryBusy(false);}},[active]);
  const closeEntry=()=>{if(store.busy)return;setDialog(false);setHistory(null);historySeq.current++;setHistoryBusy(false);};
  const edit=(item:PersonalEntry|null)=>{setEntry(item);setText(item?.content??'');setExpiry(item?.expiresAt?.slice(0,10)??'');setHistory(null);historySeq.current++;setHistoryBusy(false);setDialog(true);store.setError('');};
  const changeEntry=async(fields:Record<string,unknown>)=>{if(await store.mutate(entry?'/'+entry.id:'',entry?'PATCH':'POST',{...fields,...(entry?{expectedVersion:entry.version}:{kind:'memory'})})){closeEntry();setConfirm(null);}};
  const showHistory=async()=>{if(!entry)return;const seq=++historySeq.current;setHistoryBusy(true);try{const r=await apiFetch(`/api/assistant/personal-context/${entry.id}/history`);const data=await r.json();if(!r.ok)throw Error(data.message);if(seq===historySeq.current)setHistory(data.entries);}catch(e){if(seq===historySeq.current)store.setError(e instanceof Error?e.message:'版本记录未载入，请重试。');}finally{if(seq===historySeq.current)setHistoryBusy(false);}};
  const pending=store.entries.filter(e=>e.kind==='memory'&&e.status==='candidate').length;
  const records=store.entries.filter(e=>e.kind==='memory'&&(filter==='pending'?e.status==='candidate':e.status!=='candidate')&&e.content.includes(query));
  const otherRules=store.entries.filter(e=>e.kind==='rule'&&(e.expiresAt||e.status!=='active'));
  return <section className="qs-context-settings" hidden={!active} aria-label="会话设置">
    <header className="qs-context-header"><Settings size={21} aria-hidden/><h2>会话设置</h2><div className="qs-context-navigation"><GlassSegments label="会话设置分类" value={page} options={[{value:'instructions',label:'个人指令'},{value:'memory',label:'记忆与事项'}]} onChange={setPage}/></div>{onClose&&<GlassButton variant="ghost" onClick={onClose} aria-label="返回助手">返回</GlassButton>}</header>
    {store.error&&<p role="alert" className="qs-context-error">{store.error}</p>}{store.notice&&<p role="status" className="qs-context-notice">{store.notice}</p>}
    <main className={'qs-context-main '+(page==='instructions'?'qs-instruction-page':'')}>
      {store.loading&&!store.loaded?<p role="status">正在读取个人记录…</p>:!store.loaded?<GlassButton onClick={()=>void store.refresh().catch(e=>store.setError(String(e)))}>重新载入</GlassButton>:page==='instructions'?<>
        <section className="qs-instruction-document"><div className="qs-document-toolbar"><span>个人指令.md</span><div>{writing?<><span role="status">{draft!==store.document.content?'未保存':'编辑中'}</span><GlassButton disabled={store.busy} onClick={()=>draft!==store.document.content?setConfirm('discard'):setWriting(false)}>取消</GlassButton><GlassButton variant="primary" disabled={store.busy} onClick={async()=>{if(await store.mutate('/instructions','PUT',{expectedRevision:base,content:draft}))setWriting(false);}}>{store.busy?'保存中…':'保存'}</GlassButton></>:<GlassButton onClick={()=>{setBase(store.document.revision);setDraft(store.document.content);setWriting(true);}}>编辑</GlassButton>}</div></div>
        {writing?<textarea ref={editor} className="qs-instruction-editor" aria-label="个人指令 Markdown 原文" value={draft} maxLength={3000} disabled={store.busy} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!store.busy)void store.mutate('/instructions','PUT',{expectedRevision:base,content:draft}).then(ok=>{if(ok)setWriting(false);});}}}/>:<pre className="qs-instruction-reading" tabIndex={0}>{store.document.content||'尚未填写个人指令。'}</pre>}
        </section>
        {otherRules.length>0&&<details className="qs-context-disclosure"><summary>限期规则、候选与历史规则 · {otherRules.length}</summary>{otherRules.map(e=><button className="qs-context-row" key={e.id} onClick={()=>edit(e)}><span>{e.content}<small>{labels[e.status]}{e.expiresAt?' · '+e.expiresAt.slice(0,10):''}</small></span><ChevronRight size={16}/></button>)}</details>}
      </>:<>
        <div className="qs-context-tools"><GlassSegments label="记忆分类" value={category} options={[{value:'work',label:'协作事项'},{value:'background',label:'长期背景'}]} onChange={setCategory}/><div hidden={category!=='background'} className="qs-context-status"><GlassSegments density="compact" label="长期背景状态" value={filter} options={[{value:'saved',label:'已保存'},{value:'pending',label:'待确认'+(pending?' · '+pending:'')}]} onChange={setFilter}/></div></div>
        {category==='work'?<p className="qs-context-empty">协作事项尚未接入。当前不会自动保存工作进度或执行后续跟进。</p>:<>
          {filter==='saved'&&<div className="qs-context-search"><input type="search" className="qs-field-input" aria-label="搜索长期背景" placeholder="搜索长期背景" value={query} onChange={e=>setQuery(e.target.value)}/><GlassButton disabled={store.busy} onClick={()=>edit(null)}><Plus size={16}/>新增</GlassButton></div>}
          <div>{records.length?records.map(e=><button className="qs-context-row" key={e.id} onClick={()=>edit(e)}><span>{e.content}<small>{labels[e.status]} · {new Date(e.updatedAt).toLocaleDateString('zh-CN')}</small></span><ChevronRight size={16}/></button>):<p className="qs-context-empty">{filter==='pending'?'暂无待确认背景。':'暂无匹配的长期背景。'}</p>}</div>
        </>}
      </>}
      <details className="qs-context-disclosure"><summary>能力与权限</summary><p>可查找并读取{Object.values(assistantObjects).map(object=>object.label.split('（')[0]).join('、')}，也可读取已保存的座位安排。内容限当前账号有权访问的已有记录；会话附件及材料池资料仍需上传或明确选用。学生主体由教师手动维护，业务写入尚未开放。个人指令与背景按本人跨会话生效，不扩大权限。</p><p>指令合计最多3000字；有期限的规则单独保留。记忆停用、到期或删除后不再召回，历史对话与备份仍保留。</p><GlassButton disabled={store.busy} onClick={()=>void store.refresh().catch(e=>store.setError(String(e)))}>刷新记录</GlassButton></details>
    </main>
    {active&&dialog&&<ResponsiveDialog title={entry?.kind==='rule'?'个人规则':entry?.status==='candidate'?'确认长期背景':entry?'编辑长期背景':'新增长期背景'} onClose={()=>{if(!store.busy){if(dirty)setConfirm('discard');else closeEntry();}}}>
      <div className="space-y-4"><label className="block">内容<textarea className="qs-field-input mt-2 min-h-40 w-full text-base" value={text} maxLength={600} disabled={store.busy||Boolean(entry?.kind==='rule'&&entry.content.length>600)} onChange={e=>setText(e.target.value)}/></label><label className="block">有效至<input type="date" className="qs-field-input mt-2 w-full" value={expiry} disabled={store.busy} onChange={e=>setExpiry(e.target.value)}/></label>
      {entry&&<details><summary className="min-h-11 cursor-pointer py-3">来源与版本</summary><p>{entry.source.type==='manual'?'本人添加':'聊天提议'} · v{entry.version}</p><GlassButton disabled={historyBusy} onClick={()=>void showHistory()}>{historyBusy?'读取中…':'查看历史'}</GlassButton>{history?.map(h=><p className="my-3 whitespace-pre-wrap text-sm" key={h.version}>v{h.version} · {h.content}</p>)}</details>}
      {store.error&&<p role="alert" className="qs-context-error">{store.error}</p>}
      <div className="flex flex-wrap gap-2"><GlassButton variant="primary" disabled={store.busy||!text.trim()||Boolean(entry?.kind==='rule'&&entry.content.length>600)} onClick={()=>void changeEntry({content:text,expiresAt:expiry?new Date(expiry+'T23:59:59+08:00').toISOString():null,...(entry?.status==='candidate'?{status:'active'}:{})})}>{store.busy?'保存中…':entry?.status==='candidate'?'确认保存':'保存'}</GlassButton>{entry&&<><GlassButton disabled={store.busy||dirty} onClick={()=>void changeEntry({status:entry.status==='active'?'disabled':'active'})}>{entry.status==='active'?'停用':'启用'}</GlassButton><GlassButton variant="danger" disabled={store.busy} onClick={()=>setConfirm('delete')}>删除</GlassButton></>}</div></div>
    </ResponsiveDialog>}
    {active&&confirm!==null&&<ResponsiveDialog title={confirm==='delete'?'删除这条记录？':'放弃未保存的修改？'} onClose={()=>{if(!store.busy)setConfirm(null);}}><p className="mb-4">{confirm==='delete'?'后续不再召回，原对话和历史版本仍保留。':'本次填写尚未保存。'}</p><div className="flex justify-end gap-3"><GlassButton disabled={store.busy} onClick={()=>setConfirm(null)}>取消</GlassButton><GlassButton disabled={store.busy} onClick={()=>{if(confirm==='delete')void changeEntry({status:'deleted'});else{if(dialog)closeEntry();else setWriting(false);setConfirm(null);}}}>确认</GlassButton></div></ResponsiveDialog>}
  </section>;
}
