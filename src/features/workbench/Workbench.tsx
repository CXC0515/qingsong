import { GlassButton } from '../../components/glass/Glass';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { 
  Upload, FileSearch, Sparkles, CheckSquare, FileText, AlertTriangle, 
  Clock, ArrowRight, BookOpen, Calendar, UserMinus, ShieldAlert, Award, MessageSquare 
} from 'lucide-react';
import { Student, SchoolClass, WorkbenchTask, ScheduleItem, TimerReminder } from '../../domain/types';
import { taskApi, type TaskSummary } from '../../services/classroomTaskApi';

interface WorkbenchProps {
  active: boolean;
  onRecordLesson:(item:ScheduleItem,date:string)=>void;
  onOpenClassroomTask: (taskId: string, classId: string) => void;
  tasks: WorkbenchTask[];
  classes: SchoolClass[];
  students: Student[];
  schedule: ScheduleItem[];
  reminders: TimerReminder[];
  selectedClassId: string;
  onNavigate: (pageId: string, subPageId?: string) => void;
  onEnterClass: (classId: string) => void;
  onSelectTask: (taskId: string) => void;
  onTriggerTask: (task: WorkbenchTask) => void;
}

export default function Workbench({
  active,
  onRecordLesson,
  onOpenClassroomTask,
  tasks,
  classes,
  students,
  schedule,
  reminders,
  selectedClassId,
  onNavigate,
  onEnterClass,
  onSelectTask,
  onTriggerTask
}: WorkbenchProps) {
  const [classroomTasks, setClassroomTasks] = useState<TaskSummary[] | null>(null);
  const [classroomTaskError, setClassroomTaskError] = useState(false);
  const [summaryRetry, setSummaryRetry] = useState(0);
  useEffect(() => {
    if (!active) return;
    let current = true;
    let request = 0;
    const refresh = async () => {
      const latest = ++request;
      try {
        const result = await taskApi.summary();
        if (!current || latest !== request) return;
        setClassroomTasks(result);
        setClassroomTaskError(false);
      } catch {
        if (current && latest === request) setClassroomTaskError(true);
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { current = false; window.removeEventListener('focus', refresh); };
  }, [active, summaryRetry]);
  const followUpTasks = classroomTasks?.filter(task => task.lifecycle === 'active' && (task.counts.negative > 0 || task.counts.unrecorded > 0)) ?? [];
  // Group tasks by node
  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  // Filter student risks/abnormalities
  const riskStudents = students.filter(s => s.status === 'risk');
  const warningStudents = students.filter(s => s.status === 'warning');
  const outstandingStudents = students.filter(s => s.status === 'outstanding');

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

  const getNodeIcon = (node: string) => {
    switch (node) {
      case 'upload': return <Upload className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case 'ocr': return <FileSearch className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case 'grading': return <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
      case 'verify': return <CheckSquare className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
      case 'report': return <FileText className="w-5 h-5 text-teal-600 dark:text-teal-400" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 animate-pulse">进行中</span>;
      case 'error':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">异常</span>;
      default:
        return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">待处理</span>;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:space-y-0 lg:gap-4" id="workbench-page">
      <div className="qs-workbench-quick"><div className="flex flex-wrap items-center gap-2 p-3"><strong className="mr-auto text-sm">常用工作</strong><GlassButton onClick={()=>onNavigate('classroom-tasks')}>课堂任务</GlassButton><GlassButton onClick={()=>onNavigate('grading-flow')}>作业批改</GlassButton><GlassButton onClick={()=>onNavigate('lesson-plan')}>备课</GlassButton><GlassButton onClick={()=>onNavigate('schedule')}>课表与日程</GlassButton></div></div>
      <div className="qs-workbench-body">
      <section className="glass-panel qs-workbench-followup rounded-2xl p-4" aria-labelledby="classroom-followup-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="classroom-followup-heading" className="text-base font-bold">课堂任务 · 待跟进</h2>
          <button type="button" onClick={() => onNavigate('classroom-tasks')} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">全部课堂任务 →</button>
        </div>
        {classroomTaskError && <div role="status" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">课堂任务摘要暂时读取失败，已保存记录未改变。{classroomTasks !== null ? '下方保留上次结果，请刷新核对。' : '请重新读取后再核对待跟进名单。'}<button type="button" onClick={() => setSummaryRetry(value => value + 1)} className="ml-2 min-h-11 px-2 font-bold underline">重试</button></div>}
        {classroomTasks === null && !classroomTaskError && <p className="py-3 text-sm text-slate-500">正在读取课堂任务…</p>}
        {classroomTasks !== null && !followUpTasks.length && <p className="py-3 text-sm text-slate-500">当前活动任务暂无待跟进或未记录学生。</p>}
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {followUpTasks.map(task => <button key={task.id} type="button" onClick={() => onOpenClassroomTask(task.id, task.classId)} className="min-h-11 min-w-0 rounded-xl border border-slate-200 p-3 text-left hover:border-emerald-400 dark:border-zinc-700">
            <span className="block break-words text-sm font-bold">{task.name}</span>
            <span className="mt-1 block text-xs text-slate-500">{task.className} · {task.currentProjectLabel&&task.currentProjectLabel+' · '}{task.mode === 'pass' ? '过关检查' : '完成检查'} · {task.checkDate}</span>
            <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm"><span className="font-semibold text-amber-700 dark:text-amber-300">待跟进 {task.counts.negative} 人</span><span className="text-slate-500">未记录 {task.counts.unrecorded} 人</span></span>
          </button>)}
        </div>
      </section>
      {/* Main Grid: Pending Tasks VS Alerts Sidebar */}
      <div className="qs-workbench-main">
        
        {/* Pending Tasks Panel */}
        <div className="qs-workbench-tasks min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">
                <span className="h-4 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-500"></span>
                待处理教学任务
              </h2>
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                当前进行中：{pendingTasks.length} 项
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <GlassButton
                id="wb-config-btn"
                onClick={() => onNavigate('settings')}
                variant="secondary" className="px-3.5 py-2 text-sm font-medium transition-all"
              >
                配置批改策略
              </GlassButton>
              <GlassButton
                id="wb-quick-action"
                onClick={() => onNavigate('grading-flow')}
                variant="primary" className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-all"
              >
                <Sparkles className="h-4 w-4" />
                开启新作业批改
              </GlassButton>
            </div>
          </div>

          <div className="space-y-3">
            {pendingTasks.map(task => {
              const nodeIcon = getNodeIcon(task.node);
              return (
              <div
                key={task.id}
                id={`task-card-${task.id}`}
                className="glass-panel glass-panel-hover flex flex-col items-start justify-between gap-3 rounded-2xl border-l-4 border-l-emerald-600 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-4 dark:border-l-emerald-500"
              >
                <div className="flex w-full min-w-0 flex-1 items-start gap-3">
                  {nodeIcon ? <div className="mt-0.5 hidden shrink-0 rounded-xl bg-slate-100 p-2.5 sm:block dark:bg-zinc-800/60">{nodeIcon}</div> : null}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-slate-800 sm:text-base dark:text-slate-100">
                          {task.name}
                        </h4>
                        <span className="mt-1 inline-flex max-w-full truncate rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-zinc-800 dark:text-slate-400">
                          {task.className}
                        </span>
                      </div>
                      <span className="shrink-0 sm:hidden">{getStatusBadge(task.status)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>截止：{task.deadline}</span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        当前节点：<span className="font-medium text-emerald-700 dark:text-emerald-400">{task.nodeName}</span>
                      </span>
                    </div>
                    {task.progress !== undefined && (
                      <div className="mt-1 w-full max-w-xs">
                        <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                          <span>处理进度</span>
                          <span>{task.progress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${task.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
                  <span className="hidden sm:inline">{getStatusBadge(task.status)}</span>
                  <GlassButton
                    onClick={() => onTriggerTask(task)}
                    variant="primary" className="min-h-11 whitespace-nowrap px-4 text-xs font-semibold transition-all"
                  >
                    去处理
                  </GlassButton>
                </div>
              </div>
              );
            })}

            {pendingTasks.length === 0 && (
              <div className="glass-panel rounded-2xl p-8 text-center text-slate-500">
                <p>今日暂无待处理任务，您可以合理安排备课时间。</p>
              </div>
            )}
          </div>

          {/* Recently Completed Tasks */}
          {completedTasks.length > 0 && (
            <div className="pt-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">最近完成任务</h3>
              {completedTasks.map(task => (
                <div 
                  key={task.id}
                  className="glass-panel rounded-2xl p-4 flex items-center justify-between opacity-70 border-l-4 border-l-slate-300 dark:border-l-zinc-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-zinc-800/40">
                      <FileText className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">{task.name}</h4>
                      <p className="text-[11px] text-slate-400">{task.className} · 已同步至学情分析</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-xs bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded-md font-medium">已归档</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Alerts & Daily schedule */}
        <div className="qs-workbench-daily min-w-0 space-y-4">
          
          <div className="glass-panel space-y-3 rounded-2xl p-5"><div className="flex items-center justify-between"><h3 className="flex items-center gap-1.5 text-sm font-bold"><Calendar className="h-4 w-4 text-emerald-600"/>今日课表</h3><span className="text-[11px] font-bold text-slate-400">{todayLabel} · {todaySchedule.length} 节</span></div><div className="space-y-2">{todaySchedule.map(item=><div key={item.id} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-white/50 p-3 dark:bg-zinc-800/60"><span className="font-mono text-[11px] font-bold text-slate-500">{item.time.split(' - ')[0]}</span><div><p className="text-sm font-semibold">{item.title}</p><p className="text-[10px] text-slate-400">{item.className} · {item.time}</p></div>{item.type==='class'&&<GlassButton disabled={!item.classId||!classes.some(c=>c.id===item.classId&&c.status==='active')} onClick={()=>onRecordLesson(item,localDateKey)}>去记录</GlassButton>}</div>)}{!todaySchedule.length&&<p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">今天没有课程</p>}</div></div>
          <div className="glass-panel space-y-3 rounded-2xl p-5"><div className="flex items-center justify-between"><h3 className="flex items-center gap-1.5 text-sm font-bold"><Clock className="h-4 w-4 text-amber-600"/>提醒日程</h3><button onClick={()=>onNavigate('schedule')} className="text-[11px] font-bold text-emerald-700 hover:underline">查看全部</button></div><div className="space-y-2">{activeReminders.slice(0,3).map(item=><div key={item.id} className={`rounded-xl border-l-4 p-3 ${reminderIsOverdue(item)?'border-l-red-500 bg-red-50/70':'border-l-amber-500 bg-amber-50/70'}`}><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{item.name}</p><span className="text-[10px] font-bold text-slate-500">{item.timeKind==='none'?'时间待定':item.startAt?.slice(11,16)||item.time}</span></div><p className="mt-1 text-[10px] text-slate-400">{reminderIsOverdue(item)?'已过期':'待处理'}{item.className?` · ${item.className}`:''}</p></div>)}{!activeReminders.length&&<p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">暂无待处理提醒</p>}</div></div>

          <div className="glass-panel rounded-2xl border-emerald-500/20 bg-gradient-to-br from-emerald-600/10 via-transparent to-transparent p-5 dark:border-emerald-500/10">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-emerald-100 p-2 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                <BookOpen className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">虚拟教室</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">查看座位安排、学生状态和课堂观察。</p>
              </div>
            </div>
            <GlassButton
              id="wb-enter-classroom"
              onClick={() => onEnterClass(selectedClassId)}
              variant="primary" containerClassName="mt-4 w-full" className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-all"
            >
              进入教室
              <ArrowRight className="h-4 w-4" />
            </GlassButton>
          </div>

          {/* Student Alerts & Risks */}
          <div className="glass-panel rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400" />
              学情异常与关注
            </h3>

            <div className="space-y-3">
              {/* Critical Risks */}
              {riskStudents.map(student => (
                <div 
                  key={student.id} 
                  onClick={() => onNavigate('diagnosis', 'profile')}
                  className="p-3 rounded-xl bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 cursor-pointer transition-all flex items-start gap-2.5"
                >
                  <UserMinus className="w-4 h-4 text-red-600 dark:text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="space-y-0.5 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{student.name}</span>
                      <span className="px-1.5 py-0.5 text-[9px] bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 rounded-md font-medium">近期风险</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      最近作业：连续三次下降 ({student.recentHomeworkTrend[student.recentHomeworkTrend.length - 1]}分)
                    </p>
                    {student.familyStatusTag && (
                      <span className="inline-block text-[9px] bg-slate-100 dark:bg-zinc-800 text-slate-500 px-1.5 py-0.2 rounded mt-1">
                        家校标签：{student.familyStatusTag}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Warnings */}
              {warningStudents.slice(0, 1).map(student => (
                <div 
                  key={student.id} 
                  onClick={() => onNavigate('diagnosis', 'profile')}
                  className="p-3 rounded-xl bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/10 cursor-pointer transition-all flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="space-y-0.5 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{student.name}</span>
                      <span className="px-1.5 py-0.5 text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 rounded-md font-medium">需要关注</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      薄弱环节：{student.weakKnowledge.join('、')}
                    </p>
                  </div>
                </div>
              ))}

              {/* Outstanding students to balance the mood */}
              {outstandingStudents.slice(0, 1).map(student => (
                <div 
                  key={student.id} 
                  onClick={() => onNavigate('diagnosis', 'profile')}
                  className="p-3 rounded-xl bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 cursor-pointer transition-all flex items-start gap-2.5"
                >
                  <Award className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="space-y-0.5 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{student.name}</span>
                      <span className="px-1.5 py-0.5 text-[9px] bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 rounded-md font-medium">表现突出</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      课堂观察：{student.behaviorTags.slice(0, 2).join('、')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
      <aside className="qs-assistant-space glass-panel rounded-2xl p-4"><h3 className="text-sm font-semibold">教学助手</h3><p className="mt-2 text-sm text-slate-500">会话空间预留</p></aside>
      </div>
    </div>
  );
}

