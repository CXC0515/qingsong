import {useEffect, useRef, useState} from 'react';
import {X, Sparkles} from 'lucide-react';
import AssistantPanel from '../assistant/AssistantPanel';
import { GlassButton, GlassSurface } from '../../components/glass/Glass';
import { BookOpen, Calendar, Clock, FileText, Workflow, ClipboardCheck } from 'lucide-react';
import type { SchoolClass, ScheduleItem, TimerReminder } from '../../domain/types';

interface WorkbenchProps {
  classes:SchoolClass[];
  schedule:ScheduleItem[];
  reminders:TimerReminder[];
  selectedClassId:string;
  onNavigate:(pageId:string,subPageId?:string)=>void;
  onEnterClass:(classId:string)=>void;
  onRecordLesson:(item:ScheduleItem,date:string)=>void;
}

export default function Workbench({classes,schedule,reminders,selectedClassId,onNavigate,onEnterClass,onRecordLesson}:WorkbenchProps){
  const [assistantOpen,setAssistantOpen]=useState(false);
  const assistantDialog=useRef<HTMLDialogElement>(null);
  const assistantButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const media=window.matchMedia('(max-width:767px)');
    const sync=()=>{const d=assistantDialog.current;if(!d)return;d.close();if(!media.matches)d.show();else if(assistantOpen)d.showModal();};
    sync();media.addEventListener('change',sync);
    return()=>media.removeEventListener('change',sync);
  },[assistantOpen]);
  const closeAssistant=()=>{setAssistantOpen(false);assistantButton.current?.focus();};
  const today = new Date();
  const weekday = today.getDay() === 0 ? 7 : today.getDay();
  const localDateKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const todayLabel = new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'short'}).format(today).replace('星期','周');
  const todaySchedule = schedule.filter(item => item.day === weekday && (item.scope ?? 'teacher') === 'teacher').sort((a,b)=>a.period-b.period);
  const reminderTimestamp = (item:TimerReminder) => item.endAt || item.startAt || item.dueAt || '';
  const reminderIsOverdue = (item:TimerReminder) => Boolean(reminderTimestamp(item)) && new Date(reminderTimestamp(item)).getTime() < today.getTime();
  const activeReminders = reminders.filter(item => {
    if (item.status !== 'active') return false;
    const timestamp = reminderTimestamp(item);
    if (!item.timeKind && !item.startAt) return true;
    return item.timeKind === 'none' || reminderIsOverdue(item) || timestamp.slice(0,10) === localDateKey;
  }).sort((left,right) => Number(reminderIsOverdue(right))-Number(reminderIsOverdue(left)) || reminderTimestamp(left).localeCompare(reminderTimestamp(right)));


  return <div id="workbench-page" className="qs-workbench-grid">
    <GlassSurface className="qs-workbench-quick" aria-labelledby="workbench-quick-heading">
      <h2 id="workbench-quick-heading" className="text-sm font-semibold">常用工作</h2>
      <div className="qs-workbench-shortcuts">
        <GlassButton containerClassName="qs-workbench-tile" onClick={()=>onNavigate('classroom-tasks')}><ClipboardCheck className="h-5 w-5"/>课堂任务</GlassButton>
        <GlassButton containerClassName="qs-workbench-tile" onClick={()=>onNavigate('grading-flow')}><Workflow className="h-5 w-5"/>作业批改</GlassButton>
        <GlassButton containerClassName="qs-workbench-tile" onClick={()=>onNavigate('lesson-plan')}><FileText className="h-5 w-5"/>备课</GlassButton>
        <GlassButton containerClassName="qs-workbench-tile" id="wb-enter-classroom" onClick={()=>onEnterClass(selectedClassId)}><BookOpen className="h-5 w-5"/>虚拟教室</GlassButton>
      </div>
    </GlassSurface>
    <div className="qs-workbench-daily">
<div className="glass-panel qs-workbench-daily-card rounded-2xl"><div className="flex items-center justify-between"><h3 className="flex items-center gap-1.5 text-sm font-bold"><Calendar className="h-4 w-4 text-emerald-600"/>今日课表</h3><span className="text-[11px] font-bold text-slate-400">{todayLabel} · {todaySchedule.length} 节</span></div><div className="qs-workbench-daily-list">{todaySchedule.map(item=><div key={item.id} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-white/50 p-3 dark:bg-zinc-800/60"><span className="font-mono text-[11px] font-bold text-slate-500">{item.time.split(' - ')[0]}</span><div><p className="text-sm font-semibold">{item.title}</p><p className="text-[10px] text-slate-400">{item.className} · {item.time}</p></div>{item.type==='class'&&<GlassButton disabled={!item.classId||!classes.some(c=>c.id===item.classId&&c.status==='active')} onClick={()=>onRecordLesson(item,localDateKey)}>去记录</GlassButton>}</div>)}{!todaySchedule.length&&<p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">今天没有课程</p>}</div></div>
          <div className="glass-panel qs-workbench-daily-card rounded-2xl"><div className="flex items-center justify-between"><h3 className="flex items-center gap-1.5 text-sm font-bold"><Clock className="h-4 w-4 text-amber-600"/>提醒日程</h3><button onClick={()=>onNavigate('schedule')} className="text-[11px] font-bold text-emerald-700 hover:underline">查看全部</button></div><div className="qs-workbench-daily-list">{activeReminders.slice(0,3).map(item=><div key={item.id} className={`rounded-xl border-l-4 p-3 ${reminderIsOverdue(item)?'border-l-red-500 bg-red-50/70':'border-l-amber-500 bg-amber-50/70'}`}><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{item.name}</p><span className="text-[10px] font-bold text-slate-500">{item.timeKind==='none'?'时间待定':item.startAt?.slice(11,16)||item.time}</span></div><p className="mt-1 text-[10px] text-slate-400">{reminderIsOverdue(item)?'已过期':'待处理'}{item.className?` · ${item.className}`:''}</p></div>)}{!activeReminders.length&&<p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">暂无待处理提醒</p>}</div></div>
    </div>
    <button ref={assistantButton} className="qs-mobile-ai-launch" type="button" onClick={()=>setAssistantOpen(true)} aria-haspopup="dialog"><Sparkles size={20}/>AI助手</button>
    <dialog ref={assistantDialog} className="qs-assistant-space qs-assistant-dialog" aria-label="AI助手" onCancel={e=>{e.preventDefault();closeAssistant();}}>
      <header className="qs-mobile-ai-header"><strong>AI助手</strong><button type="button" onClick={closeAssistant} aria-label="返回工作台"><X size={22}/></button></header>
      <AssistantPanel/>
    </dialog>
  </div>;
}
