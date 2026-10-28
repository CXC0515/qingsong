import {useEffect,useRef,useState} from 'react';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import {GlassButton,GlassSegments} from '../../components/glass/Glass';
import {apiFetch} from '../../services/apiClient';
import type {PersonalEntry,PersonalKind} from '../../domain/personalContext';

const statusLabels = {active:'生效中',candidate:'待确认',disabled:'已停用',expired:'已到期',deleted:'已删除'};
const describeError=(e:unknown)=>e instanceof TypeError||e instanceof SyntaxError?'连接中断或返回内容未能确认。已有记录保留，请刷新列表核对；保存状态未知时可重试原操作。':e instanceof Error?e.message:'个人记录未能确认，请刷新核对后重试。';
export default function PersonalContextPanel({active}:{active:boolean}) {
  const [view,setView]=useState<PersonalKind|'capabilities'>('rule');
  const [nextView,setNextView]=useState<PersonalKind|'capabilities'|null>(null);
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
  const [historyLoading,setHistoryLoading]=useState(false);
  const historyVersion=useRef(0);
  const pending=useRef<{key:string;id:string}|null>(null);
  const mounted=useRef(true);
  const listVersion=useRef(0);
  const list = async (signal?:AbortSignal) => {
    const sequence=++listVersion.current;
    const response=await apiFetch('/api/assistant/personal-context',{signal});
    if(!response.ok)throw Error('个人记录未能载入，已有数据保留。请重新打开或刷新列表。');
    const result=await response.json();
    if(mounted.current&&!signal?.aborted&&sequence===listVersion.current){setEntries(result.entries);setLoaded(true);}
  };
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if(!active){setDeleting(null);setNextView(null);return;}
    const controller=new AbortController();
    setLoading(true);
    void list(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(describeError(e));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[active]);
  const clear = () => {setEditing(null);setContent('');setExpiresAt('');setHistory(null);historyVersion.current++;setHistoryLoading(false);};
  const mutation = async (entry:PersonalEntry|null,fields:Record<string,unknown>) => {
    if(busy)return;setBusy(true);setError('');setNotice('');
    const key=JSON.stringify({id:entry?.id,version:entry?.version,fields});
    if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
    try {
      const response=await apiFetch('/api/assistant/personal-context'+(entry?'/'+entry.id:''),{method:entry?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...fields,...(entry?{expectedVersion:entry.version}:{}),operationId:pending.current.id})});
      const result=await response.json();if(!response.ok)throw Error(result.message||'个人记录未保存，请刷新核对后重试。');
      pending.current=null;clear();setDeleting(null);setNotice(fields.status==='deleted'?'记录已删除，后续助手请求不再召回；原对话与备份保留。':'个人记录已保存。后续助手请求会使用最新生效内容。');await list();
    } catch(e){setError(describeError(e));}
    finally{if(mounted.current)setBusy(false);}
  };
  const edit=(entry:PersonalEntry)=>{clear();setEditing(entry);setKind(entry.kind);setContent(entry.content);setExpiresAt(entry.expiresAt?.slice(0,10)??'');setHistory(null);setError('');};
  const showHistory=async(entry:PersonalEntry)=>{
    const sequence=++historyVersion.current;setError('');setHistory(null);setHistoryLoading(true);
    try{const r=await apiFetch(`/api/assistant/personal-context/${entry.id}/history`);const data=await r.json();if(!r.ok)throw Error(data.message);if(mounted.current&&sequence===historyVersion.current)setHistory(data.entries);}
    catch(e){if(mounted.current&&sequence===historyVersion.current)setError(describeError(e));}
    finally{if(mounted.current&&sequence===historyVersion.current)setHistoryLoading(false);}
  };
  const dirty=content.trim()!==(editing?.content??'')||expiresAt!==(editing?.expiresAt?.slice(0,10)??'');
  useEffect(()=>{
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  const changeView=(value:PersonalKind|'capabilities')=>{
    if(busy || value===view)return false;
    if(dirty){setNextView(value);return false;}
    clear();setKind(value==='memory'?'memory':'rule');setView(value);setError('');setNotice('');
  };
  const visibleEntries=entries.filter(entry=>entry.kind===view);
  return <section className="space-y-4" aria-label="AI 助手设置">
    <div><h3 className="text-lg font-semibold">个人规则与记忆</h3><p className="mt-1 text-sm leading-6 text-slate-500">个人规则决定默认工作方式，记忆提供背景。每人一份，所有聊天工作区共用。</p></div>
    <GlassSegments label="助手设置分类" value={view} options={[{value:'rule',label:'个人规则'+(entries.some(e=>e.kind==='rule'&&e.status==='candidate')?' · 待确认':'')},{value:'memory',label:'长期记忆'+(entries.some(e=>e.kind==='memory'&&e.status==='candidate')?' · 待确认':'')},{value:'capabilities',label:'能力与权限'}]} onChange={changeView}/>
    {view==='capabilities'?<div className="space-y-4 text-sm leading-6 text-slate-600">
      <section><h4 className="font-semibold text-slate-800">当前能做什么</h4><p>查询当前账号有权查看的课表、班级名单、座位、提醒、课堂记录、课堂任务明细及学生已有记录依据。资料检索和作业批改数据尚未接入助手查询。</p></section>
      <section><h4 className="font-semibold text-slate-800">由你控制什么</h4><p>你可以新增、修改、停用或删除个人规则和记忆。聊天中发送“记住：原文”“个人规则：原文”可明确保存；助手自行整理的内容仅作为待确认候选，确认后才生效。教学业务数据仍为只读，不会因保存记忆而修改。</p></section>
      <section><h4 className="font-semibold text-slate-800">什么时候生效</h4><p>保存成功后的后续助手请求使用最新有效内容；已生成的回答不会重写。本次明确要求优先于个人默认规则，个人规则不能改变系统权限。当前班级事实以业务记录查询为准。</p></section>
      <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">记忆的使用与删除范围</summary><p>每次加载全部有效规则，并按关键词相关度和更新时间选择最多6条有效记忆。停用、到期或删除后不再召回；原对话、历史版本和备份仍保留。每条最多600字，有效规则最多10条且合计3000字，有效记忆最多60条。</p></details>
    </div>:<>
    <p className="text-sm leading-6 text-slate-500">{view==='rule'?'填写你希望助手长期遵循的工作方式，例如教案结构、回答语言。':'记录你确认过的个人背景和持续关注事项。助手提出的候选会标为“待确认”。'}</p>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      <section className="min-w-0 space-y-3" aria-label="个人记录列表">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">已保存与待确认</h4><GlassButton disabled={busy||loading} onClick={()=>{setError('');void list().catch(e=>setError(describeError(e)));}}>刷新列表</GlassButton></div>
        {loading?<p role="status">正在读取个人记录…</p>:!loaded?<p className="text-sm text-slate-500">个人记录尚未载入，请刷新重试。</p>:visibleEntries.length===0?<p className="text-sm text-slate-500">还没有{view==='rule'?'个人规则':'长期记忆'}。</p>:visibleEntries.map(entry=><article key={entry.id} className="space-y-2 rounded-xl border border-slate-200 bg-white/60 p-3">
          <div className="flex flex-wrap gap-2 text-xs text-slate-500"><span>{entry.kind==='rule'?'个人规则':'长期记忆'}</span><span>{statusLabels[entry.status]}</span><span>v{entry.version}</span>{entry.expiresAt&&<span>到期：{entry.expiresAt.slice(0,10)}</span>}</div>
          <p className="whitespace-pre-wrap break-words text-sm">{entry.content}</p>
          <details><summary className="min-h-11 cursor-pointer py-2 text-xs text-slate-500">来源与更新时间</summary><p className="break-words text-xs text-slate-500">来源：{entry.source.type==='manual'?'本人手动录入':'聊天提议'} · 更新于 {new Date(entry.updatedAt).toLocaleString('zh-CN')}</p></details>
          <div className="flex flex-wrap gap-2">
            {entry.status!=='active'&&<GlassButton disabled={busy||dirty} onClick={()=>void mutation(entry,{status:'active'})}>{entry.status==='candidate'?'确认生效':'启用'}</GlassButton>}
            {entry.status==='active'&&<GlassButton disabled={busy||dirty} onClick={()=>void mutation(entry,{status:'disabled'})}>停用</GlassButton>}
            <GlassButton disabled={busy} onClick={()=>{if(!dirty)edit(entry);else setError('请先保存当前编辑，或点击取消编辑后再修改其他记录。');}}>编辑</GlassButton><GlassButton disabled={busy} onClick={()=>void showHistory(entry)}>版本与来源</GlassButton><GlassButton disabled={busy||dirty} variant="danger" onClick={()=>setDeleting(entry)}>删除</GlassButton>
          </div>
        </article>)}
      </section>
      <section className="min-w-0 space-y-3" aria-label="编辑个人记录">
        <h4 className="font-semibold">{editing?'编辑记录':'新增个人记录'}</h4>
        <label className="block text-sm">内容<textarea className="qs-field-input mt-1 min-h-32 w-full text-base" disabled={busy} value={content} maxLength={600} onChange={e=>setContent(e.target.value)} placeholder={kind==='rule'?'例如：教案默认先列教学目标，再列教学过程':'例如：这学期重点改善课堂讨论参与度'}/></label>
        <label className="block text-sm">有效至（不填则长期有效）<input type="date" className="qs-field-input mt-1 min-h-11 w-full text-base" disabled={busy} value={expiresAt} onChange={e=>setExpiresAt(e.target.value)}/></label>
        <p className="text-xs leading-5 text-slate-500">日期按北京时间，当天结束后到期。保存成功后用于后续助手请求。</p>
        <div className="flex flex-wrap gap-2"><GlassButton disabled={busy||!content.trim()} variant="primary" onClick={()=>void mutation(editing,{...(!editing?{kind}:{}),content:content.trim(),expiresAt:expiresAt?new Date(expiresAt+'T23:59:59+08:00').toISOString():null,...(editing?.status==='candidate'?{status:'active'}:{})})}>{busy?'正在保存…':editing?.status==='candidate'?'保存并确认生效':'保存'}</GlassButton>{(editing||dirty)&&<GlassButton disabled={busy} onClick={clear}>取消编辑</GlassButton>}</div>
        {historyLoading&&<p role="status" className="text-sm text-slate-500">正在读取历史版本…</p>}
        {history&&<section className="space-y-2 rounded-xl bg-slate-50 p-3" aria-label="历史版本"><h5 className="font-semibold">版本与来源</h5>{history.map(e=><div key={e.version} className="border-b border-slate-200 py-2 text-xs"><p>v{e.version} · {statusLabels[e.status]} · {new Date(e.updatedAt).toLocaleString('zh-CN')}</p><p className="whitespace-pre-wrap break-words">{e.content}</p><p className="break-all text-slate-500">{e.source.type==='manual'?'本人手动录入':`来源会话：${e.source.sessionId??'未知'}`}</p></div>)}</section>}
      </section>
    </div>
    </>}
    {nextView&&<ResponsiveDialog title="放弃未保存的修改？" onClose={()=>setNextView(null)}><p className="text-sm">本次填写尚未保存。</p><div className="flex justify-end gap-2"><GlassButton onClick={()=>setNextView(null)}>继续编辑</GlassButton><GlassButton variant="danger" onClick={()=>{clear();setKind(nextView==='memory'?'memory':'rule');setView(nextView);setNextView(null);setError('');setNotice('');}}>放弃并切换</GlassButton></div></ResponsiveDialog>}
    {deleting&&<ResponsiveDialog title="删除这条个人记录？" onClose={()=>setDeleting(null)} busy={busy} footer={<><GlassButton disabled={busy} onClick={()=>setDeleting(null)}>取消</GlassButton><GlassButton disabled={busy} variant="danger" onClick={()=>void mutation(deleting,{status:'deleted'})}>确认删除</GlassButton></>}><p className="whitespace-pre-wrap break-words">{deleting.content}</p><p className="text-sm text-slate-500">删除后助手不再召回；原对话与备份不会一起删除。</p></ResponsiveDialog>}
  </section>;
}
