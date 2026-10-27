import {useEffect,useRef,useState} from 'react';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import {GlassButton} from '../../components/glass/Glass';
import {apiFetch} from '../../services/apiClient';
import type {PersonalEntry,PersonalKind} from '../../domain/personalContext';

const statusLabels = {active:'生效中',candidate:'待确认',disabled:'已停用',expired:'已到期',deleted:'已删除'};
const describeError=(e:unknown)=>e instanceof TypeError||e instanceof SyntaxError?'连接中断或返回内容未能确认。已有记录保留，请刷新列表核对；保存状态未知时可重试原操作。':e instanceof Error?e.message:'个人记录未能确认，请刷新核对后重试。';
export default function PersonalContextPanel({onClose}:{onClose:()=>void}) {
  const [entries,setEntries]=useState<PersonalEntry[]>([]);
  const [editing,setEditing]=useState<PersonalEntry|null>(null);
  const [kind,setKind]=useState<PersonalKind>('rule');
  const [content,setContent]=useState('');
  const [expiresAt,setExpiresAt]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [deleting,setDeleting]=useState<PersonalEntry|null>(null);
  const [history,setHistory]=useState<PersonalEntry[]|null>(null);
  const pending=useRef<{key:string;id:string}|null>(null);
  const mounted=useRef(true);
  const listVersion=useRef(0);
  const list = async (signal?:AbortSignal) => {
    const sequence=++listVersion.current;
    const response=await apiFetch('/api/assistant/personal-context',{signal});
    if(!response.ok)throw Error('个人记录未能载入，已有数据保留。请重新打开或刷新列表。');
    const result=await response.json();
    if(mounted.current&&sequence===listVersion.current){setEntries(result.entries);setLoaded(true);}
  };
  useEffect(()=>{mounted.current=true;const controller=new AbortController();void list(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(describeError(e));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>{mounted.current=false;controller.abort();};},[]);
  const clear = () => {setEditing(null);setContent('');setExpiresAt('');setHistory(null);};
  const mutation = async (entry:PersonalEntry|null,fields:Record<string,unknown>) => {
    if(busy)return;setBusy(true);setError('');setNotice('');
    const key=JSON.stringify({id:entry?.id,version:entry?.version,fields});
    if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
    try {
      const response=await apiFetch('/api/assistant/personal-context'+(entry?'/'+entry.id:''),{method:entry?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...fields,...(entry?{expectedVersion:entry.version}:{}),operationId:pending.current.id})});
      const result=await response.json();if(!response.ok)throw Error(result.message||'个人记录未保存，请刷新核对后重试。');
      pending.current=null;clear();setDeleting(null);setNotice('个人记录已保存。后续助手请求会使用最新生效内容。');await list();
    } catch(e){setError(describeError(e));}
    finally{if(mounted.current)setBusy(false);}
  };
  const edit=(entry:PersonalEntry)=>{setEditing(entry);setKind(entry.kind);setContent(entry.content);setExpiresAt(entry.expiresAt?.slice(0,10)??'');setHistory(null);setError('');};
  const showHistory=async(entry:PersonalEntry)=>{setError('');try{const r=await apiFetch(`/api/assistant/personal-context/${entry.id}/history`);const data=await r.json();if(!r.ok)throw Error(data.message);if(mounted.current)setHistory(data.entries);}catch(e){setError(describeError(e));}};
  const dirty=content.trim()!==(editing?.content??'')||expiresAt!==(editing?.expiresAt?.slice(0,10)??'');
  return <ResponsiveDialog title="个人规则与记忆" subtitle="每人一份，所有聊天工作区共用。只保存个人约定与背景，班级实时事实仍查业务记录。" onClose={onClose} busy={busy} wide compactFull confirmDiscard={dirty}>
    <p className="text-xs leading-5 text-slate-500">规则决定默认工作方式，记忆提供背景。本次明确要求优先于默认规则。聊天可用“记住：原文”“个人规则：原文”“忘记：原文”；助手归纳的候选须在此确认。删除后停止召回，原对话、历史版本及备份仍保留。</p>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="grid min-w-0 gap-5 md:grid-cols-2">
      <section className="min-w-0 space-y-3" aria-label="个人记录列表">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">已保存与待确认</h4><GlassButton disabled={busy||loading} onClick={()=>{setError('');void list().catch(e=>setError(describeError(e)));}}>刷新列表</GlassButton></div>
        {loading?<p role="status">正在读取个人记录…</p>:!loaded?<p className="text-sm text-slate-500">个人记录尚未载入，请刷新重试。</p>:entries.length===0?<p className="text-sm text-slate-500">还没有个人规则或记忆。</p>:entries.map(entry=><article key={entry.id} className="space-y-2 rounded-xl border border-slate-200 bg-white/60 p-3">
          <div className="flex flex-wrap gap-2 text-xs text-slate-500"><span>{entry.kind==='rule'?'个人规则':'长期记忆'}</span><span>{statusLabels[entry.status]}</span><span>v{entry.version}</span>{entry.expiresAt&&<span>到期：{entry.expiresAt.slice(0,10)}</span>}</div>
          <p className="whitespace-pre-wrap break-words text-sm">{entry.content}</p>
          <p className="break-words text-xs text-slate-500">来源：{entry.source.type==='manual'?'本人手动录入':'聊天提议'} · 更新于 {new Date(entry.updatedAt).toLocaleString('zh-CN')}</p>
          <div className="flex flex-wrap gap-2">
            {entry.status!=='active'&&<GlassButton disabled={busy} onClick={()=>void mutation(entry,{status:'active'})}>{entry.status==='candidate'?'确认生效':'启用'}</GlassButton>}
            {entry.status==='active'&&<GlassButton disabled={busy} onClick={()=>void mutation(entry,{status:'disabled'})}>停用</GlassButton>}
            <GlassButton disabled={busy} onClick={()=>edit(entry)}>编辑</GlassButton><GlassButton disabled={busy} onClick={()=>void showHistory(entry)}>版本与来源</GlassButton><GlassButton disabled={busy} variant="danger" onClick={()=>setDeleting(entry)}>删除</GlassButton>
          </div>
        </article>)}
      </section>
      <section className="min-w-0 space-y-3" aria-label="编辑个人记录">
        <h4 className="font-semibold">{editing?'编辑记录':'新增个人记录'}</h4>
        <label className="block text-sm">类型<select className="qs-field-input mt-1 min-h-11 w-full" disabled={busy||Boolean(editing)} value={kind} onChange={e=>setKind(e.target.value as PersonalKind)}><option value="rule">个人规则</option><option value="memory">长期记忆</option></select></label>
        <label className="block text-sm">内容<textarea className="qs-field-input mt-1 min-h-32 w-full text-base" disabled={busy} value={content} maxLength={600} onChange={e=>setContent(e.target.value)} placeholder={kind==='rule'?'例如：教案默认先列教学目标，再列教学过程':'例如：这学期重点改善课堂讨论参与度'}/></label>
        <label className="block text-sm">有效至（不填则长期有效）<input type="date" className="qs-field-input mt-1 min-h-11 w-full" disabled={busy} value={expiresAt} onChange={e=>setExpiresAt(e.target.value)}/></label>
        <p className="text-xs text-slate-500">日期按北京时间，当天结束后到期。规则最多10条、共3000字；记忆最多60条，每次最多召回6条。</p>
        <div className="flex flex-wrap gap-2"><GlassButton disabled={busy||!content.trim()} variant="primary" onClick={()=>void mutation(editing,{...(!editing?{kind}:{}),content:content.trim(),expiresAt:expiresAt?new Date(expiresAt+'T23:59:59+08:00').toISOString():null,...(editing?.status==='candidate'?{status:'active'}:{})})}>{busy?'正在保存…':editing?.status==='candidate'?'保存并确认生效':'保存'}</GlassButton>{editing&&<GlassButton disabled={busy} onClick={clear}>取消编辑</GlassButton>}</div>
        {history&&<section className="space-y-2 rounded-xl bg-slate-50 p-3" aria-label="历史版本"><h5 className="font-semibold">版本与来源</h5>{history.map(e=><div key={e.version} className="border-b border-slate-200 py-2 text-xs"><p>v{e.version} · {statusLabels[e.status]} · {new Date(e.updatedAt).toLocaleString('zh-CN')}</p><p className="whitespace-pre-wrap break-words">{e.content}</p><p className="break-all text-slate-500">{e.source.type==='manual'?'本人手动录入':`来源会话：${e.source.sessionId??'未知'}`}</p></div>)}</section>}
      </section>
    </div>
    {deleting&&<ResponsiveDialog title="删除这条个人记录？" onClose={()=>setDeleting(null)} busy={busy} footer={<><GlassButton disabled={busy} onClick={()=>setDeleting(null)}>取消</GlassButton><GlassButton disabled={busy} variant="danger" onClick={()=>void mutation(deleting,{status:'deleted'})}>确认删除</GlassButton></>}><p className="whitespace-pre-wrap break-words">{deleting.content}</p><p className="text-sm text-slate-500">删除后助手不再召回；原对话与备份不会一起删除。</p></ResponsiveDialog>}
  </ResponsiveDialog>;
}
