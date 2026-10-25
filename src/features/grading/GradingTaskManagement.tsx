import { GlassButton, GlassSegments  } from '../../components/glass/Glass';
import { EmptyState } from '../../components/WorkspaceUI';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import ClassPicker from '../../components/ClassPicker';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertTriangle, Archive, ArchiveRestore, ArrowRight, CalendarClock, CheckCircle2, FilePlus2, Plus, Trash2, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatCollectionDeadline, getDefaultCollectionDeadline, getNextDailyTaskName, toDateTimeInputValue } from '../../domain/gradingTask';
import { ReviewItem, SchoolClass, WorkbenchTask } from '../../domain/types';

interface GradingTaskManagementProps {
  tasks: WorkbenchTask[];
  classes: SchoolClass[];
  defaultClassId: string;
  reviewQueue: ReviewItem[];
  onCreateTask: (task: WorkbenchTask) => void;
  onEnterWorkflow: (task: WorkbenchTask) => void;
  onArchiveTask: (task: WorkbenchTask, archived: boolean) => Promise<void>;
  onDeleteTask: (task: WorkbenchTask) => Promise<void>;
}

type TaskFilter = 'active' | 'completed' | 'archived';

const statusLabel: Record<WorkbenchTask['status'], string> = {
  pending: '待处理',
  running: '进行中',
  completed: '已完成',
  error: '需关注'
};

export default function GradingTaskManagement({ tasks, classes, defaultClassId, reviewQueue, onCreateTask, onEnterWorkflow, onArchiveTask, onDeleteTask }: GradingTaskManagementProps) {
  const [filter, setFilter] = useState<TaskFilter>('active');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [classId, setClassId] = useState(defaultClassId);
  const [deadline, setDeadline] = useState(() => toDateTimeInputValue(getDefaultCollectionDeadline()));
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set());

  const visibleTasks = useMemo(() => tasks.filter(task => {
    if (filter === 'archived') return Boolean(task.archivedAt);
    if (task.archivedAt) return false;
    return filter === 'completed' ? task.status === 'completed' : task.status !== 'completed';
  }), [filter, tasks]);

  const defaultTaskName = getNextDailyTaskName(tasks);
  const selectedVisibleTasks = visibleTasks.filter(task => selectedTaskIds.has(task.id));
  const selectableVisibleTasks = visibleTasks.filter(task => filter === 'archived' ? Boolean(task.archivedAt) : !task.archivedAt);
  const toggleTask = (taskId: string) => setSelectedTaskIds(current => { const next = new Set(current); if (next.has(taskId)) next.delete(taskId); else next.add(taskId); return next; });
  const toggleAll = () => setSelectedTaskIds(current => selectableVisibleTasks.every(task => current.has(task.id)) ? new Set() : new Set(selectableVisibleTasks.map(task => task.id)));
  const archiveSelected = async () => { const archived = filter !== 'archived'; await Promise.all(selectedVisibleTasks.map(task => onArchiveTask(task, archived))); setSelectedTaskIds(new Set()); };

  const openCreateDialog = () => {
    setName('');
    setClassId(defaultClassId);
    setDeadline(toDateTimeInputValue(getDefaultCollectionDeadline()));
    setShowCreate(true);
  };

  useEffect(() => {
    if (!showCreate) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [showCreate]);

  const createTask = () => {
    const schoolClass = classes.find(item => item.id === classId) ?? classes[0];
    const createdAt = new Date();
    const fallbackDeadline = getDefaultCollectionDeadline(createdAt);
    const parsedDeadline = deadline ? new Date(deadline) : fallbackDeadline;
    const collectionDeadline = Number.isNaN(parsedDeadline.getTime()) ? fallbackDeadline : parsedDeadline;
    const task: WorkbenchTask = {
      id: `task-${Date.now()}`,
      name: name.trim() || getNextDailyTaskName(tasks, createdAt),
      classId: schoolClass.id,
      className: schoolClass.name,
      node: 'setup',
      nodeName: '待准备作业',
      deadline: formatCollectionDeadline(collectionDeadline.toISOString()),
      createdAt: createdAt.toISOString(),
      collectionDeadlineAt: collectionDeadline.toISOString(),
      status: 'pending'
    };
    onCreateTask(task);
    setShowCreate(false);
    onEnterWorkflow(task);
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <GlassSegments density="compact" label="批改任务状态" value={filter} options={[{value:'active',label:'进行中'},{value:'completed',label:'已完成'},{value:'archived',label:'已归档'}]} onChange={next=>{setFilter(next);setSelectedTaskIds(new Set());}}/>
        <GlassButton type="button" onClick={openCreateDialog} variant="primary" className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-all"><Plus className="h-4 w-4" />新建批改任务</GlassButton>
      </div>

      {visibleTasks.length ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/70"><label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" checked={selectableVisibleTasks.length > 0 && selectableVisibleTasks.every(task => selectedTaskIds.has(task.id))} onChange={toggleAll} className="h-5 w-5 accent-emerald-700" />全选当前列表</label><div className="flex items-center gap-3"><span className="text-xs text-slate-500">已选 {selectedVisibleTasks.length} 项</span><GlassButton type="button" disabled={!selectedVisibleTasks.length} onClick={() => void archiveSelected()} variant="primary" className="min-h-11 px-4 text-sm font-bold disabled:opacity-40">{filter === 'archived' ? '批量恢复' : '批量归档'}</GlassButton></div></div> : null}

      <section className="glass-panel overflow-hidden rounded-[24px]">
        <div className="hidden grid-cols-[minmax(240px,1.5fr)_140px_130px_100px_200px] border-b border-slate-200/70 px-5 py-3 text-xs font-bold text-slate-400 md:grid dark:border-zinc-800">
          <span>任务</span><span>班级</span><span>当前环节</span><span>异常</span><span />
        </div>
        {!visibleTasks.length&&<EmptyState title={filter==='active'?'暂无进行中的批改任务':filter==='completed'?'暂无已完成的批改任务':'暂无已归档的批改任务'} description={filter==='active'?'点击新建批改任务，开始收集和批改作业。':undefined}/>}
        {visibleTasks.map(task => {
          const exceptionCount = reviewQueue.filter(item => item.status === 'pending' && (item.taskId === task.id || item.taskName === task.name)).length;
          return (
            <article key={task.id} className="grid grid-cols-[minmax(0,1fr)_112px] gap-x-3 gap-y-2 border-b border-slate-200/60 px-3 py-4 last:border-0 md:grid-cols-[minmax(240px,1.5fr)_140px_130px_100px_200px] md:items-center md:gap-3 md:px-5 dark:border-zinc-800/70">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><input type="checkbox" checked={selectedTaskIds.has(task.id)} onChange={() => toggleTask(task.id)} aria-label={`选择任务 ${task.name}`} className="h-5 w-5 flex-none accent-emerald-700" /><FilePlus2 className="h-4 w-4 flex-none text-emerald-700" /><h2 className="truncate text-sm font-black text-slate-900 dark:text-white">{task.name}</h2></div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />收作业：{task.deadline}</span>{typeof task.progress === 'number' ? <span>{task.progress}%</span> : null}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 md:hidden"><span className="max-w-full truncate text-xs font-bold text-slate-600 dark:text-slate-300">{task.className}</span><span className={`rounded-lg px-2 py-1 text-xs font-bold ${task.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : task.status === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-slate-200'}`}>{statusLabel[task.status]} · {task.nodeName}</span><span className={`text-xs font-bold ${exceptionCount ? 'text-rose-700' : 'text-slate-400'}`}>{exceptionCount ? `${exceptionCount} 项待处理` : '无异常'}</span></div>
              </div>
              <span className="hidden items-center gap-1.5 text-sm font-bold text-slate-600 md:flex dark:text-slate-300"><Users className="h-4 w-4 text-slate-400" />{task.className}</span>
              <span className={`hidden w-fit rounded-xl px-2.5 py-1.5 text-xs font-bold md:block ${task.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : task.status === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-slate-200'}`}>{statusLabel[task.status]} · {task.nodeName}</span>
              <span className={`hidden w-fit items-center gap-1.5 text-xs font-bold md:flex ${exceptionCount ? 'text-rose-700' : 'text-slate-400'}`}>{exceptionCount ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{exceptionCount ? `${exceptionCount} 项` : '无待处理'}</span>
              <div className="col-start-2 row-start-1 flex flex-col items-stretch justify-center gap-2 md:col-start-auto md:row-start-auto md:flex-row md:flex-wrap md:justify-end">{task.archivedAt ? <><GlassButton type="button" onClick={() => void onArchiveTask(task, false)} variant="secondary" className="flex min-h-11 items-center justify-center gap-1 px-2 text-xs font-bold"><ArchiveRestore className="h-4 w-4" />恢复</GlassButton><GlassButton type="button" onClick={() => { if (window.confirm(`永久删除“${task.name}”及其材料、识别和批改记录？此操作不可恢复。`)) void onDeleteTask(task); }} variant="danger" className="flex min-h-11 items-center justify-center gap-1 px-2 text-xs font-bold"><Trash2 className="h-4 w-4" />删除</GlassButton></> : <><GlassButton containerClassName="h-11 md:w-11 order-2 md:order-none" type="button" title="归档任务" onClick={() => void onArchiveTask(task, true)} variant="secondary" className="flex items-center justify-center"><Archive className="h-4 w-4" /><span className="ml-1 text-xs md:hidden">归档</span></GlassButton><GlassButton type="button" onClick={() => onEnterWorkflow(task)} variant="primary" className="flex min-h-11 items-center justify-center gap-1 px-2 text-xs font-bold">进入任务<ArrowRight className="h-3.5 w-3.5" /></GlassButton></>}</div>
            </article>
          );
        })}
      </section>

      {showCreate ? <ResponsiveDialog title="新建批改任务" onClose={()=>setShowCreate(false)}>
            <div className="mt-5 space-y-4">
              <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-500">任务名称</span><input value={name} onChange={event => setName(event.target.value)} placeholder={defaultTaskName} className="qs-field-input w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 dark:border-zinc-800 dark:bg-zinc-900" /><span className="block text-[11px] text-slate-400">留空将使用 {defaultTaskName}</span></label>
              <div className="space-y-1.5"><span className="text-xs font-bold text-slate-500">任务班级</span><ClassPicker classes={classes.filter(item=>item.status==='active')} value={classId} onChange={setClassId} label="选择任务班级"/></div>
              <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-500">收作业时间</span><input type="datetime-local" value={deadline} onChange={event => setDeadline(event.target.value)} className="qs-field-input w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 dark:border-zinc-800 dark:bg-zinc-900" /><span className="block text-[11px] text-slate-400">用于提醒教师收作业；默认是创建任务的 3 小时后，可输入或打开时间选择器。</span></label>
            </div>
            <div className="mt-6 flex justify-end gap-2"><GlassButton type="button" onClick={() => setShowCreate(false)} variant="secondary" className="px-4 py-2.5 text-sm font-bold">取消</GlassButton><GlassButton type="button" onClick={createTask} variant="primary" className="px-4 py-2.5 text-sm font-bold">创建任务</GlassButton></div>
      </ResponsiveDialog> : null}
    </div>
  );
}
