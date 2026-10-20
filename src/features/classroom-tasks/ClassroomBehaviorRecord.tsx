import { useCallback, useEffect, useRef, useState } from 'react';
import { behaviorKinds, type BehaviorEvent, type BehaviorInput, type BehaviorKind } from '../../domain/classroomBehavior';
import type { RosterStudent } from '../../domain/types';
import { behaviorApi } from '../../services/classroomBehaviorApi';
import { ClassroomTaskError } from '../../services/classroomTaskApi';
import { listRosterStudents } from '../../services/rosterApi';
import { action, control, primary, today } from './ClassroomTaskDialogs';
export default function ClassroomBehaviorRecord({classId,identityKey}:{classId:string;identityKey:string}){
  const [students,setStudents]=useState<RosterStudent[]>([]);const [events,setEvents]=useState<BehaviorEvent[]>([]);
  const [kind,setKind]=useState<BehaviorKind>('participation');const [date,setDate]=useState(today);const [note,setNote]=useState('');const [query,setQuery]=useState('');
  const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);const [total,setTotal]=useState(0);
  const [notFound,setNotFound]=useState(false);
  const lock=useRef(false);const seq=useRef(0);const retry=useRef<BehaviorInput|null>(null);
  const key='qingsong:behavior-pending:'+identityKey;
  const [pending,setPending]=useState<string|null>(()=>{try{return sessionStorage.getItem(key);}catch{return null;}});
  const load=useCallback(async()=>{if(!classId)return;const n=++seq.current;setLoading(true);try{const [roster,history]=await Promise.all([listRosterStudents(classId),behaviorApi.list({classId,from:date,to:date,limit:500})]);if(n===seq.current){setStudents(roster.filter(p=>p.enrollmentStatus==='active').sort((a,b)=>a.studentNo.localeCompare(b.studentNo,'zh-CN',{numeric:true})));setEvents(history.events);setTotal(history.total);}}catch(e){if(n===seq.current)setError(e instanceof Error?e.message:'读取失败，请重试。');}finally{if(n===seq.current)setLoading(false);}},[classId,date]);
  useEffect(()=>{setStudents([]);setEvents([]);setError('');setNotice('');void load();return()=>{seq.current++;};},[load]);
  useEffect(()=>{const refresh=()=>void load();window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[load]);
  useEffect(()=>{const leave=(e:Event)=>{if((pending||lock.current)&&!window.confirm('有一笔表现未确认保存，离开后请返回核对。确定离开吗？'))e.preventDefault();};const unload=(e:BeforeUnloadEvent)=>{if(pending||lock.current){e.preventDefault();e.returnValue='';}};window.addEventListener('classroom-task-before-leave',leave);window.addEventListener('beforeunload',unload);return()=>{window.removeEventListener('classroom-task-before-leave',leave);window.removeEventListener('beforeunload',unload);};},[pending]);
  const save=async(input:BehaviorInput)=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{sessionStorage.setItem(key,input.operationId);setPending(input.operationId);}catch{setError('浏览器不能保留核对标识，本次尚未发送。');lock.current=false;setBusy(false);return;}
    retry.current=input;
    try{const saved=await behaviorApi.record(input);sessionStorage.removeItem(key);setPending(null);retry.current=null;setNotice(saved.targetId?'已撤销，原记录保留在历史中。':'已记录 '+saved.studentName+' · '+behaviorKinds.find(k=>k.key===saved.kind)?.label);}
    catch(e){if(e instanceof ClassroomTaskError&&[400,404,409,422].includes(e.status)){sessionStorage.removeItem(key);setPending(null);retry.current=null;}setError(e instanceof Error?e.message:'尚未确认是否保存，请核对。');}
    finally{lock.current=false;setBusy(false);void load();}
  };
  const check=async()=>{if(!pending||lock.current)return;setBusy(true);lock.current=true;setNotFound(false);try{await behaviorApi.operation(pending);sessionStorage.removeItem(key);setPending(null);retry.current=null;setNotice('已核对：这笔已经保存。');void load();}catch(e){setNotFound(e instanceof ClassroomTaskError&&e.status===404);setError(e instanceof ClassroomTaskError&&e.status===404?'查询时尚未找到这笔，请稍后再查，或使用原操作重试。':e instanceof Error?e.message:'核对失败，请重试。');}finally{lock.current=false;setBusy(false);}};
  const disabled=busy||Boolean(pending)||loading;
  return <div className="space-y-4">
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">课堂表现 · 选表现，再点学生</h3><input type="date" className={control+' max-w-44'} aria-label="表现发生日期" value={date} disabled={disabled} onChange={e=>setDate(e.target.value)}/></div><div className="mt-3 flex flex-wrap gap-2">{behaviorKinds.map(k=><button className={kind===k.key?primary:action} key={k.key} aria-pressed={kind===k.key} disabled={disabled} onClick={()=>setKind(k.key)}>{k.label}</button>)}</div><input className={control+' mt-3'} aria-label="表现说明" placeholder="可选：补一句具体发生了什么" maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} disabled={disabled}/><p className="mt-2 text-sm text-slate-500">每次点击记一笔；同一学生可多次发生。没有记录不代表没有表现。</p></div>
    {pending&&<div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">有一笔结果待确认。<button className={action+' ml-2'} disabled={busy} onClick={()=>void check()}>核对保存状态</button>{retry.current&&<button className={action+' ml-2'} disabled={busy} onClick={()=>{if(retry.current)void save(retry.current);}}>原操作重试</button>}{notFound&&!retry.current&&<button className={action+' ml-2'} onClick={()=>{if(window.confirm('查询时未找到不代表请求绝不会保存。请先核对表现历史，仅确认未保存后清除核对标识。确定清除吗？')){sessionStorage.removeItem(key);setPending(null);setNotFound(false);}}}>核对后清除标识</button>}</div>}
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}<button className={action+' ml-2'} onClick={()=>void load()}>重新读取</button></p>}
    <input className={control} aria-label="搜索表现记录学生" placeholder="搜索姓名或学号" value={query} onChange={e=>setQuery(e.target.value)}/>
    {loading&&<p role="status" className="text-sm text-slate-500">正在读取学生与表现…</p>}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">{students.filter(p=>!query||(p.name+' '+p.studentNo).includes(query)).map(p=>{const n=events.filter(e=>e.studentId===p.id&&e.kind===kind&&!e.retracted).length;return <button key={p.id} className={action+' min-h-24 bg-white text-left dark:bg-zinc-900'} disabled={disabled} onClick={()=>void save({operationId:crypto.randomUUID(),studentId:p.id,classId,kind,note,occurredDate:date})}><span className="block break-words text-base font-bold">{p.studentNo} {p.name}</span><span className="mt-2 block text-xs text-slate-500">{n?'已记录 '+n+'笔 · 再记一笔':behaviorKinds.find(k=>k.key===kind)?.label+' · 记一笔'}</span></button>;})}</div>
    <div role="status" className="sticky bottom-0 rounded-xl border bg-white/95 p-3 text-sm dark:bg-zinc-900/95">{busy?'正在保存，请稍候…':notice||'每笔保存后可在下方撤销，也会进入学生画像。'}</div>
    <section className="space-y-2"><h3 className="font-bold">{date} 的表现记录</h3>{total>events.length&&<p className="text-sm text-amber-800">共{total}笔，下方显示最近{events.length}笔；单人次数仅基于当前显示范围，完整统计请查看画像。</p>}{events.slice(0,30).map(e=><div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3 text-sm dark:bg-zinc-900"><div><strong>{e.studentName} · {behaviorKinds.find(k=>k.key===e.kind)?.label}</strong><p className="mt-1 break-words text-slate-500">{e.note||'未填写说明'} · {new Date(e.recordedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}{e.retracted?' · 已撤销':''}</p></div>{!e.retracted&&<button className={action} disabled={disabled} onClick={()=>void save({operationId:crypto.randomUUID(),studentId:e.studentId,classId:e.classId,kind:e.kind,note:'教师撤销误记',occurredDate:e.occurredDate,targetId:e.id})}>撤销</button>}</div>)}{!events.length&&!loading&&<p className="text-sm text-slate-500">当天还没有已记录的表现。</p>}</section>
  </div>;
}
