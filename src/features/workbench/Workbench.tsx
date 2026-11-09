import React from 'react';
import { GlassButton, GlassSurface } from '../../components/glass/Glass';
import { BookOpen, Calendar, Clock } from 'lucide-react';
import type { SchoolClass, ScheduleItem, TimerReminder } from '../../domain/types';
import { apiFetch } from '../../services/apiClient';
import { createNavGroups } from '../../app/navigation';
import { workbenchShortcutDestinations } from '../../domain/userPreferences';

interface WorkbenchProps {
  classes:SchoolClass[];
  schedule:ScheduleItem[];
  reminders:TimerReminder[];
  selectedClassId:string;
  userId:string;
  onNavigate:(pageId:string,subPageId?:string)=>void;
  onEnterClass:(classId:string)=>void;
  onRecordLesson:(item:ScheduleItem,date:string)=>void;
}

const fallbackShortcuts=['classroom-tasks','grading-workspace','lesson-plan','classroom'];
const shortcutNavigation=createNavGroups(0).flatMap(group=>group.items);
export default function Workbench({classes,schedule,reminders,selectedClassId,userId,onNavigate,onEnterClass,onRecordLesson}:WorkbenchProps){
  const [shortcuts,setShortcuts]=React.useState(fallbackShortcuts);
  React.useEffect(()=>{const controller=new AbortController();setShortcuts(fallbackShortcuts);void apiFetch('/api/account/workbench-shortcuts',{signal:controller.signal}).then(async response=>{if(!response.ok)throw Error('Unable to load shortcuts');return response.json();}).then(value=>{const destinations=value?.destinations;if(!controller.signal.aborted&&Array.isArray(destinations)&&destinations.length===4&&destinations.every((id:unknown)=>typeof id==='string'&&workbenchShortcutDestinations.includes(id as typeof workbenchShortcutDestinations[number]))&&new Set(destinations).size===4)setShortcuts(destinations);}).catch(()=>{});return()=>controller.abort();},[userId]);
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
        {shortcuts.map((destination,index)=>{const navItem=shortcutNavigation.find(item=>item.id===destination);const Icon=destination==='schedule:reminders'?Clock:navItem?.icon??BookOpen;const label=destination==='schedule:reminders'?'提醒日程':navItem?.label??'工作入口';return <GlassButton key={destination} containerClassName="qs-workbench-tile" id={destination==='classroom'?'wb-enter-classroom':undefined} onClick={()=>destination==='classroom'?onEnterClass(selectedClassId):destination==='schedule:reminders'?onNavigate('schedule','reminders'):onNavigate(destination)}><Icon className="h-5 w-5"/>{label}</GlassButton>;})}
      </div>
    </GlassSurface>
    <div className="qs-workbench-daily">
<div className="glass-panel qs-workbench-daily-card rounded-2xl"><div className="flex items-center justify-between"><h3 className="flex items-center gap-1.5 text-sm font-bold"><Calendar className="h-4 w-4 text-emerald-600"/>今日课表</h3><span className="text-xs font-semibold text-slate-500">{todayLabel} · {todaySchedule.length} 节</span></div><div className="qs-workbench-daily-list qs-workbench-schedule-list">{todaySchedule.map(item=><div key={item.id} className="qs-workbench-schedule-item rounded-xl bg-white/50 p-3 dark:bg-zinc-800/60"><div><p className="text-sm font-semibold">{item.time.split(' - ')[0]} · {item.title}</p><p className="text-xs text-slate-500">{item.className} · {item.time}</p></div>{item.type==='class'&&<GlassButton disabled={!item.classId||!classes.some(c=>c.id===item.classId&&c.status==='active')} onClick={()=>onRecordLesson(item,localDateKey)}>去记录</GlassButton>}</div>)}{!todaySchedule.length&&<p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">今天没有课程</p>}</div></div>
          <div className="glass-panel qs-workbench-daily-card rounded-2xl"><div className="flex items-center justify-between"><h3 className="flex items-center gap-1.5 text-sm font-bold"><Clock className="h-4 w-4 text-amber-600"/>提醒日程</h3><button onClick={()=>onNavigate('schedule','reminders')} className="min-h-11 px-2 text-sm font-semibold text-emerald-700 hover:underline">查看全部</button></div><div className="qs-workbench-daily-list qs-workbench-reminder-list">{activeReminders.slice(0,6).map(item=><div key={item.id} className={`qs-workbench-reminder-item rounded-xl border-l-4 p-3 ${reminderIsOverdue(item)?'border-l-red-500 bg-red-50/70':'border-l-amber-500 bg-amber-50/70'}`}><div className="flex items-start justify-between gap-2"><p className="min-w-0 text-sm font-semibold">{item.name}</p><span className="shrink-0 text-xs font-semibold text-slate-600">{item.timeKind==='none'?(item.time&&item.time!=='时间待定'?item.time:'时间待定'):item.startAt?.slice(11,16)||item.time}</span></div><p className="mt-1 text-xs text-slate-500">{reminderIsOverdue(item)?'已过期':'待处理'}{item.className?` · ${item.className}`:''}</p></div>)}{!activeReminders.length&&<p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">暂无待处理提醒</p>}</div></div>
    </div>

  </div>;
}
