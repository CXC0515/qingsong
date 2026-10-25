import { GlassButton, GlassSegments } from '../../components/glass/Glass';
import ClassPicker from '../../components/ClassPicker';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import ResponsiveDialog from '../../components/ResponsiveDialog';
import ResponsiveChoiceDialog from '../../components/ResponsiveChoiceDialog';
import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bell, CalendarDays, Camera, Check, ChevronDown, Circle, FileScan, FileUp, GripVertical, Images, LayoutGrid, ListTodo, LoaderCircle, Pencil, Plus, Repeat2, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import { ReminderImportDraft, ScheduleItem, SchedulePeriod, SchoolClass, TimerReminder } from '../../domain/types';
import { createReminderImportDraft, importSchedule, ScheduleImportDraft, ScheduleImportItemDraft } from '../../services/scheduleApi';

interface Props {
  schedule: ScheduleItem[];
  reminders: TimerReminder[];
  classes: SchoolClass[];
  periods: SchedulePeriod[];
  showWeekends: boolean;
  selectedClassId: string;
  section: 'schedule' | 'reminders';
  onSectionChange: (section: 'schedule' | 'reminders') => void;
  toolsRequest: number;
  onSelectClass: (classId: string) => void;
  onOpenPeriodSettings: () => void;
  onAddScheduleItem: (item: ScheduleItem) => void | Promise<void>;
  onUpdateScheduleItem: (item: ScheduleItem) => void | Promise<void>;
  onDeleteScheduleItem: (id: string) => void | Promise<void>;
  onImportSchedule: (items: ScheduleItem[]) => Promise<void>;
  onAddReminder: (item: TimerReminder, scope?: 'single' | 'future') => void | Promise<void>;
  onAddReminderBatch: (items: TimerReminder[]) => Promise<void>;
  onUpdateReminderBatch: (items: TimerReminder[]) => Promise<void>;
  onToggleReminderStatus: (id: string) => void | Promise<void>;
  onDeleteReminder: (id: string) => void | Promise<void>;
}
const defaultPeriods: SchedulePeriod[] = [
  ['第一节', '08:00', '08:45'],
  ['第二节', '08:55', '09:40'],
  ['第三节', '10:00', '10:45'],
  ['第四节', '10:55', '11:40'],
  ['第五节', '13:30', '14:15'],
  ['第六节', '14:25', '15:10'],
  ['第七节', '15:20', '16:05'],
  ['第八节', '16:15', '17:00'],
].map(([label, startTime, endTime], index) => ({
  period: index + 1,
  label,
  startTime,
  endTime,
}));
const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const fieldClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-slate-100';
const periodTime = (period: SchedulePeriod | undefined) => (period ? `${period.startTime} - ${period.endTime}` : '待确认');
const emptySchedule = (scope: 'teacher' | 'class', classId: string, className: string, day: number, period: number, periods: SchedulePeriod[]): ScheduleItem => ({
  id: '',
  day,
  period,
  title: '',
  classId: scope === 'class' ? classId : '',
  className: scope === 'class' ? className : '',
  type: 'class',
  time: periodTime(periods[period - 1]),
  scope,
  teacherName: '',
});
const emptyReminder = (): TimerReminder => ({
  id: '',
  name: '',
  classId: '',
  className: '',
  time: '时间待定',
  repeatRule: '一次性',
  status: 'active',
  important: false,
  urgent: false,
  timeKind: 'none',
  startAt: '',
  endAt: '',
  dueAt: '',
});
const formatReminderTime = (item: Pick<TimerReminder, 'timeKind' | 'startAt' | 'endAt'>) => (item.timeKind === 'none' || !item.startAt ? '时间待定' : item.timeKind === 'range' && item.endAt ? `${item.startAt.replace('T', ' ')} - ${item.endAt.replace('T', ' ')}` : item.startAt.replace('T', ' '));
const isReminderOverdue = (item: TimerReminder, now = new Date()) => item.status === 'active' && Boolean(item.endAt || item.startAt) && new Date(item.endAt || item.startAt || '').getTime() < now.getTime();
const isUntimedReminder = (item: TimerReminder) => (item.timeKind ?? (item.startAt ? 'point' : 'none')) === 'none';
const sortRemindersByTime = (left: TimerReminder, right: TimerReminder) => {
  const leftUntimed = isUntimedReminder(left);
  const rightUntimed = isUntimedReminder(right);
  if (leftUntimed !== rightUntimed) return leftUntimed ? -1 : 1;
  const leftTime = left.startAt ? new Date(left.startAt).getTime() : Number.NEGATIVE_INFINITY;
  const rightTime = right.startAt ? new Date(right.startAt).getTime() : Number.NEGATIVE_INFINITY;
  return leftTime - rightTime || left.name.localeCompare(right.name, 'zh-CN');
};
const reminderQuadrantTone = (item: TimerReminder) => (item.important && item.urgent ? 'border-l-rose-500' : item.important ? 'border-l-amber-500' : item.urgent ? 'border-l-blue-500' : 'border-l-slate-300');
const stableHash = (value: string) => Array.from(value).reduce((hash, character) => ((hash << 5) - hash + character.charCodeAt(0)) | 0, 0);
const createScheduleColorSlots = (keys: string[]) => {
  const slots = new Map<string, number>();
  const used = new Set<number>();
  [...new Set(keys.filter(Boolean))].sort().forEach((key) => {
    let slot = (Math.abs(stableHash(key)) % 12) + 1;
    while (used.has(slot) && used.size < 12) slot = (slot % 12) + 1;
    used.add(slot);
    slots.set(key, slot);
  });
  return slots;
};

export default function ScheduleReminder(props: Props) {
  const activeClasses = props.classes.filter((item) => item.status === 'active');
  const [showTools, setShowTools] = useState(false);
  const [scope, setScope] = useState<'teacher' | 'class'>('teacher');
  const [reminderView, setReminderView] = useState<'list' | 'quadrant'>('quadrant');
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);
  const [editingReminder, setEditingReminder] = useState<TimerReminder | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showReminderImport, setShowReminderImport] = useState(false);
  const effectiveClassId = props.selectedClassId || activeClasses[0]?.id || '';
  const selectedClass = activeClasses.find((item) => item.id === effectiveClassId);
  const periods = props.periods.length ? props.periods : defaultPeriods;
  const visibleDays = props.showWeekends ? 7 : 5;
  const filtered = useMemo(() => props.schedule.filter((item) => (scope === 'teacher' ? (item.scope ?? 'teacher') === 'teacher' : item.scope === 'class' && item.classId === effectiveClassId)), [props.schedule, scope, effectiveClassId]);
  const itemMap = useMemo(() => new Map(filtered.map((item) => [`${item.day}-${item.period}`, item])), [filtered]);
  const colorSlots = useMemo(() => createScheduleColorSlots(filtered.map((item) => (scope === 'teacher' ? item.classId || item.className : item.title.trim().toLocaleLowerCase()))), [filtered, scope]);

  useEffect(() => {
    if (props.toolsRequest > 0) setShowTools(true);
  }, [props.toolsRequest]);

  const saveCourse = async () => {
    if (!editingSchedule) return;
    const selected = activeClasses.find((item) => item.id === editingSchedule.classId);
    const defaultTitle = periods.find((period) => period.period === editingSchedule.period)?.label ?? `第${editingSchedule.period}节`;
    const item = {
      ...editingSchedule,
      title: editingSchedule.title.trim() || defaultTitle,
      className: selected?.name ?? editingSchedule.className,
      id: editingSchedule.id || crypto.randomUUID(),
    };
    await (editingSchedule.id ? props.onUpdateScheduleItem(item) : props.onAddScheduleItem(item));
    setEditingSchedule(null);
  };
  const saveReminderItem = async (seriesScope: 'single' | 'future' = 'single') => {
    if (!editingReminder?.name.trim()) return;
    const selected = activeClasses.find((item) => item.id === editingReminder.classId);
    await props.onAddReminder(
      {
        ...editingReminder,
        className: selected?.name ?? '',
        id: editingReminder.id || crypto.randomUUID(),
      },
      seriesScope,
    );
    setEditingReminder(null);
  };
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 animate-fade-in" id="schedule-page">
      <header className="hidden shrink-0 sm:flex">
        <GlassSegments label="课表与日程子页面" value={props.section} options={[{value:'schedule',label:<><CalendarDays className="h-4 w-4"/>课表</>},{value:'reminders',label:<><Bell className="h-4 w-4"/>日程</>}]} onChange={props.onSectionChange}/>

      </header>
      {props.section === 'schedule' ? (
        <section className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="qs-workspace-toolbar shrink-0">
            <GlassSegments density="compact" label="课表范围" value={scope} options={[{value:'teacher',label:'我的课表'},{value:'class',label:'班级课表'}]} onChange={setScope}/>

            {scope === 'class' && (
              <>
                <ClassPicker classes={activeClasses} value={effectiveClassId} onChange={props.onSelectClass}/>

              </>
            )}
            <span className="hidden text-xs text-slate-400 md:inline">{props.showWeekends ? '显示周一至周日' : '显示周一至周五'}</span>
            <div className="ml-auto hidden items-center gap-2 sm:flex">
              <GlassButton containerClassName="h-9" onClick={props.onOpenPeriodSettings} variant="secondary" className="inline-flex items-center gap-1.5 px-3 text-xs font-bold">
                <Settings2 className="h-4 w-4" />
                设置课节时间
              </GlassButton>
              <GlassButton containerClassName="h-9" onClick={() => setShowImport(true)} variant="primary" className="inline-flex items-center gap-1.5 px-3 text-xs font-bold">
                <FileScan className="h-4 w-4" />
                扫描导入
              </GlassButton>
            </div>
          </div>
          {showTools && <ResponsiveDialog title="课表操作" onClose={() => setShowTools(false)}><div className="grid gap-3">
            <button type="button" onClick={() => { setShowTools(false); props.onOpenPeriodSettings(); }} className="min-h-11 rounded-xl border px-4 text-left">设置课节时间</button>
            <button type="button" onClick={() => { setShowTools(false); setShowImport(true); }} className="min-h-11 rounded-xl border px-4 text-left">扫描导入</button>
          </div></ResponsiveDialog>}
          <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div style={{ '--schedule-days': visibleDays } as React.CSSProperties}>
              <div
                className="schedule-row sticky top-0 z-20 grid border-b border-slate-200 bg-slate-50 text-center text-xs font-bold text-slate-500 dark:border-zinc-800 dark:bg-zinc-950"

              >
                <div className="sticky left-0 z-30 bg-slate-50 px-1 py-3 text-center sm:px-4 sm:text-left dark:bg-zinc-950"><span className="sm:hidden">课节</span><span className="hidden sm:inline">课节 / 时段</span></div>
                {dayNames.slice(0, visibleDays).map((day) => (
                  <div key={day} className="border-l border-slate-200 px-0.5 py-3 sm:px-3 dark:border-zinc-800">
                    {day}
                  </div>
                ))}
              </div>
              {periods.map((period) => (
                <div
                  key={period.period}
                  className="schedule-row grid min-h-[76px] border-b border-slate-100 last:border-b-0 dark:border-zinc-800"

                >
                  <div className="sticky left-0 z-10 flex flex-col justify-center bg-slate-50/95 px-1 sm:px-4 dark:bg-zinc-950/95">
                    <strong className="text-center text-xs sm:text-left"><span className="sm:hidden">{period.period}</span><span className="hidden sm:inline">{period.label}</span></strong>
                    <span className="mt-1 text-center font-mono text-xs text-slate-500 sm:text-left"><span className="block sm:hidden">{period.startTime}<br />{period.endTime}</span><span className="hidden sm:inline">{periodTime(period)}</span></span>
                  </div>
                  {Array.from({ length: visibleDays }, (_, di) => {
                    const item = itemMap.get(`${di + 1}-${period.period}`);
                    const colorKey = item ? (scope === 'teacher' ? item.classId || item.className : item.title.trim().toLocaleLowerCase()) : '';
                    return <ScheduleCell key={di} item={item} scope={scope} colorSlot={colorSlots.get(colorKey)} onClick={() => setEditingSchedule(item ?? emptySchedule(scope, effectiveClassId, selectedClass?.name ?? '', di + 1, period.period, periods))} />;
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <ReminderWorkspace reminders={props.reminders} view={reminderView} onView={setReminderView} onAdd={() => setEditingReminder(emptyReminder())} onBatch={() => setShowReminderImport(true)} onEdit={setEditingReminder} onSave={props.onAddReminder} onSaveBatch={props.onUpdateReminderBatch} onToggle={props.onToggleReminderStatus} onDelete={props.onDeleteReminder} />
      )}
      <style>{`.schedule-row { grid-template-columns: 42px repeat(var(--schedule-days), minmax(0, 1fr)); }
        @media (min-width: 640px) { .schedule-row { grid-template-columns: 96px repeat(var(--schedule-days), minmax(70px, 1fr)); } }
        @media (min-width: 1024px) { .schedule-row { grid-template-columns: 150px repeat(var(--schedule-days), minmax(90px, 1fr)); } }`}</style>
      {editingSchedule && (
        <ScheduleEditor
          item={editingSchedule}
          periods={periods}
          classes={activeClasses}
          onChange={setEditingSchedule}
          onClose={() => setEditingSchedule(null)}
          onSave={() => void saveCourse()}
          onDelete={
            editingSchedule.id
              ? async () => {
                  await props.onDeleteScheduleItem(editingSchedule.id);
                  setEditingSchedule(null);
                }
              : undefined
          }
        />
      )}
      {editingReminder && <ReminderEditor item={editingReminder} classes={activeClasses} onChange={setEditingReminder} onClose={() => setEditingReminder(null)} onSave={(scope) => void saveReminderItem(scope)} />}
      {showImport && (
        <ImportDialog
          scope={scope}
          classId={effectiveClassId}
          classes={activeClasses}
          periods={periods}
          onClose={() => setShowImport(false)}
          onApply={(items) =>
            props.onImportSchedule(
              items.map((item) => ({
                ...item,
                time: periodTime(periods.find((period) => period.period === item.period)),
              })),
            )
          }
        />
      )}
      {showReminderImport && <ReminderImportDialog classes={activeClasses} onClose={() => setShowReminderImport(false)} onApply={props.onAddReminderBatch} />}
    </div>
  );
}

function Tab({ active, onClick, icon: Icon, children, compact = false }: { active: boolean; onClick: () => void; icon: React.ElementType; children: React.ReactNode; compact?: boolean }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 rounded-lg px-2 text-xs font-bold sm:gap-1.5 sm:px-4 ${compact ? 'h-9 py-1.5' : 'min-h-11 py-2'} ${active ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-slate-500'}`}>
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}
function Modal({ title, onClose, children, footer, wide = false, compactFull = false }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean; compactFull?: boolean }) {
  return <ResponsiveDialog title={title} onClose={onClose} wide={wide} compactFull={compactFull} footer={footer}>{children}</ResponsiveDialog>;
}

function ScheduleCell({ item, scope, colorSlot, onClick }: { key?: React.Key; item: ScheduleItem | undefined; scope: 'teacher' | 'class'; colorSlot: number | undefined; onClick: () => void }) {
  if (!item)
    return (
      <button onClick={onClick} className="min-w-0 border-l border-slate-100 p-0.5 sm:p-1.5 text-left hover:bg-emerald-50/50 dark:border-zinc-800 dark:hover:bg-emerald-950/20">
        <span className="flex h-full items-center justify-center text-xs text-slate-400"><span aria-label="安排课程">＋<span className="hidden sm:inline"> 安排</span></span></span>
      </button>
    );
  const hasClass = Boolean(item.classId || item.className);
  const primary = scope === 'teacher' ? (hasClass ? item.className : item.title) : item.title;
  const secondary = scope === 'teacher' ? (hasClass ? item.title : '个人事项') : item.teacherName || '';
  const lowConfidence = item.confidence !== undefined && item.confidence < 0.75;
  const style =
    !lowConfidence && colorSlot
      ? {
          backgroundColor: `hsl(var(--schedule-hue-${colorSlot}) / 0.13)`,
          borderColor: `hsl(var(--schedule-hue-${colorSlot}) / 0.38)`,
          color: `hsl(var(--schedule-hue-${colorSlot}))`,
        }
      : undefined;
  return (
    <button onClick={onClick} className="min-w-0 border-l border-slate-100 p-0.5 sm:p-1.5 text-center hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40">
      <span style={style} className={`flex h-full min-w-0 flex-col items-center justify-center rounded-lg border px-0.5 py-2 text-center sm:px-2.5 ${lowConfidence ? 'border-amber-300 bg-amber-50 text-amber-900' : colorSlot ? '' : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-200'}`}>
        <strong className="w-full break-words text-xs font-bold sm:truncate sm:text-sm">{primary}</strong>
        {secondary ? <span className="mt-1 w-full break-words text-xs opacity-75 sm:truncate">{secondary}</span> : null}
      </span>
    </button>
  );
}

function ScheduleEditor({ item, periods, classes, onChange, onClose, onSave, onDelete }: { item: ScheduleItem; periods: SchedulePeriod[]; classes: SchoolClass[]; onChange: (item: ScheduleItem) => void; onClose: () => void; onSave: () => void; onDelete?: () => void }) {
  const defaultTitle = periods.find((period) => period.period === item.period)?.label ?? `第${item.period}节`;
  return (
    <Modal
      title={item.id ? '编辑课程' : '安排课程'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500">
            取消
          </button>
          {onDelete && (
            <button onClick={onDelete} className="mr-auto rounded-lg px-3 py-2 text-xs font-bold text-red-600">
              删除
            </button>
          )}
          <GlassButton onClick={onSave} variant="primary" className="px-4 py-2 text-xs font-bold">
            保存
          </GlassButton>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-500 sm:col-span-2">
          课程内容
          <input className={'qs-field-input '+(`${fieldClass} mt-1.5`)} value={item.title} placeholder={`留空则使用“${defaultTitle}”`} onChange={(e) => onChange({ ...item, title: e.target.value })} />
        </label>
        <label className="text-xs font-bold text-slate-500">
          星期
          <select className={'qs-field-input '+(`${fieldClass} mt-1.5`)} value={item.day} onChange={(e) => onChange({ ...item, day: Number(e.target.value) })}>
            {dayNames.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-500">
          课节
          <select
            className={'qs-field-input '+(`${fieldClass} mt-1.5`)}
            value={item.period}
            onChange={(e) => {
              const selectedPeriod = periods.find((period) => period.period === Number(e.target.value));
              onChange({
                ...item,
                period: Number(e.target.value),
                time: periodTime(selectedPeriod),
              });
            }}
          >
            {periods.map((period) => (
              <option key={period.period} value={period.period}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-500">
          时间
          <input className={'qs-field-input '+(`${fieldClass} mt-1.5 bg-slate-50 text-slate-500 dark:bg-zinc-800`)} value={periodTime(periods.find((period) => period.period === item.period))} readOnly />
          <span className="mt-1 block text-[10px] font-normal text-slate-400">统一在学校作息设置中调整</span>
        </label>
        {item.scope === 'teacher' ? (
          <label className="text-xs font-bold text-slate-500">
            上课班级
            <select className={'qs-field-input '+(`${fieldClass} mt-1.5`)} value={item.classId} onChange={(e) => onChange({ ...item, classId: e.target.value })}>
              <option value="">无 / 个人事项</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="text-xs font-bold text-slate-500">
            任课教师
            <input className={'qs-field-input '+(`${fieldClass} mt-1.5`)} value={item.teacherName ?? ''} onChange={(e) => onChange({ ...item, teacherName: e.target.value })} />
          </label>
        )}
      </div>
    </Modal>
  );
}

function ReminderWorkspace({ reminders, view, onView, onAdd, onBatch, onEdit, onSave, onSaveBatch, onToggle, onDelete }: { reminders: TimerReminder[]; view: 'list' | 'quadrant'; onView: (v: 'list' | 'quadrant') => void; onAdd: () => void; onBatch: () => void; onEdit: (item: TimerReminder) => void; onSave: (item: TimerReminder) => void | Promise<void>; onSaveBatch: (items: TimerReminder[]) => Promise<void>; onToggle: (id: string) => void | Promise<void>; onDelete: (id: string) => void | Promise<void> }) {
  const [showTools, setShowTools] = useState(false);
  const [showCreateActions, setShowCreateActions] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [hideOverdue, setHideOverdue] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [showOverdueDialog, setShowOverdueDialog] = useState(false);
  const quadrants = [
    ['重要且紧急', true, true, 'border-rose-200'],
    ['重要不紧急', true, false, 'border-amber-200'],
    ['紧急不重要', false, true, 'border-blue-200'],
    ['不重要不紧急', false, false, 'border-slate-200'],
  ] as const;
  const activeItems = reminders.filter((item) => item.status === 'active').sort(sortRemindersByTime);
  const moveToQuadrant = (important: boolean, urgent: boolean) => {
    const item = reminders.find((entry) => entry.id === draggedId);
    if (!item) return;
    const target = activeItems.filter((entry) => Boolean(entry.important) === important && Boolean(entry.urgent) === urgent);
    void onSave({
      ...item,
      important,
      urgent,
      sortOrder: Math.max(-1, ...target.map((entry) => entry.sortOrder ?? 0)) + 1,
    });
    setDraggedId(null);
  };
  const card = (item: TimerReminder, movable: boolean) => <ReminderCard key={item.id} item={item} movable={movable} showQuadrantTone={!movable} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} onDragStart={() => setDraggedId(item.id)} />;
  const untimed = activeItems.filter(isUntimedReminder);
  const timed = activeItems.filter((item) => !isUntimedReminder(item));
  const overdue = timed.filter((item) => isReminderOverdue(item));
  const upcoming = timed.filter((item) => !isReminderOverdue(item));
  const completed = reminders.filter((item) => item.status === 'completed').sort(sortRemindersByTime);
  const inactive = reminders.filter((item) => item.status === 'inactive').sort(sortRemindersByTime);
  const recurring = reminders.filter((item) => item.recurrence?.enabled && item.status !== 'completed').sort(sortRemindersByTime);
  const visibleActiveItems = hideOverdue ? activeItems.filter((item) => !isReminderOverdue(item)) : activeItems;
  const quadrantItems = showCompleted ? [...visibleActiveItems, ...completed] : visibleActiveItems;
  const group = (label: string, items: TimerReminder[], tone = 'text-slate-500') =>
    items.length ? (
      <section>
        <h3 className={`mb-2 text-xs font-black ${tone}`}>
          {label} · {items.length}
        </h3>
        <div className="space-y-2">{items.map((item) => card(item, false))}</div>
      </section>
    ) : null;
  return (
    <section className="min-h-0 flex-1 pb-20 sm:pb-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-zinc-900">
          <Tab active={view === 'quadrant'} onClick={() => onView('quadrant')} icon={LayoutGrid}>
            四象限
          </Tab>
          <Tab active={view === 'list'} onClick={() => onView('list')} icon={ListTodo}>
            清单
          </Tab>
        </div>
        {view === 'quadrant' && completed.length ? (
          <button onClick={() => setShowCompleted((value) => !value)} className={`hidden sm:block h-9 rounded-lg border px-3 text-xs font-bold ${showCompleted ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`}>
            {showCompleted ? '隐藏' : '显示'}已完成 {completed.length}
          </button>
        ) : null}
        <GlassButton containerClassName="hidden sm:inline-grid h-9" onClick={() => setShowRecurring(true)} variant="secondary" className="items-center gap-1.5 px-3 text-xs font-bold">
          <Repeat2 className="h-4 w-4" />
          周期任务 {recurring.length}
        </GlassButton>
        <div className="ml-auto flex items-center gap-2">
          <GlassButton containerClassName="sm:hidden" type="button" onClick={() => setShowTools(true)} variant="secondary" className="min-h-11 px-3 text-sm font-bold">更多</GlassButton>
          <GlassButton containerClassName="hidden sm:inline-grid h-9" onClick={onBatch} variant="primary" className="items-center gap-1.5 px-3 text-xs font-bold">
            <Sparkles className="h-4 w-4" />
            AI 批量创建
          </GlassButton>
          <GlassButton containerClassName="hidden sm:inline-grid" onClick={onAdd} variant="primary" className="min-h-11 items-center gap-1 px-3 text-xs font-bold">
            <Plus className="h-4 w-4" />
            新建日程
          </GlassButton>
        </div>
      </div>
      {showTools && <ResponsiveDialog title="日程操作" onClose={() => setShowTools(false)}><div className="grid gap-3">
        <button type="button" aria-pressed={!showCompleted} onClick={() => setShowCompleted(value => !value)} className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 text-left text-sm font-bold ${!showCompleted ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-zinc-700'}`}><span className={`grid h-5 w-5 place-items-center rounded border ${!showCompleted ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-400 bg-white dark:bg-zinc-900'}`}>{!showCompleted ? <Check className="h-3.5 w-3.5" /> : null}</span>隐藏已完成</button>
        <button type="button" aria-pressed={hideOverdue} onClick={() => setHideOverdue(value => !value)} className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 text-left text-sm font-bold ${hideOverdue ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-zinc-700'}`}><span className={`grid h-5 w-5 place-items-center rounded border ${hideOverdue ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-400 bg-white dark:bg-zinc-900'}`}>{hideOverdue ? <Check className="h-3.5 w-3.5" /> : null}</span>隐藏已过期</button>
        <button type="button" onClick={() => { setShowTools(false); setShowRecurring(true); }} className="min-h-11 rounded-xl border px-4 text-left">周期任务 · {recurring.length}</button>
      </div></ResponsiveDialog>}
      {overdue.length ? (
        <button onClick={() => setShowOverdueDialog(true)} className="mb-3 flex w-full items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-xs text-red-800 transition-colors hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <span className="flex items-center gap-2 font-bold">
            <AlertCircle className="h-4 w-4" />
            当前有 {overdue.length} 个过期日程
          </span>
          <span className="font-black">调整日期 →</span>
        </button>
      ) : null}
      {view === 'list' ? (
        <div className="space-y-5">
          {group('时间待定', untimed, 'text-amber-700')}
          {!hideOverdue && group('已过期', overdue, 'text-red-600')}
          {group('接下来', upcoming)}
          {showCompleted && group('已完成', completed, 'text-emerald-700')}
          {group('已停用', inactive)}
          {!reminders.length && <Empty />}
        </div>
      ) : (
        <div className="grid min-h-0 grid-cols-2 gap-2 sm:gap-3">
          {quadrants.map(([label, important, urgent, color]) => (
            <div key={label} onDragOver={(event) => event.preventDefault()} onDrop={() => moveToQuadrant(important, urgent)} className={`min-h-44 min-w-0 rounded-2xl border bg-white p-2 sm:p-3 transition-colors ${color} ${draggedId ? 'border-dashed' : 'dark:border-zinc-800'} dark:bg-zinc-900/50`}>
              <h3 className="mb-2 text-xs font-black sm:mb-3">{label}</h3>
              <div className="space-y-2">{quadrantItems.filter((item) => Boolean(item.important) === important && Boolean(item.urgent) === urgent).map(item => <React.Fragment key={item.id}><div className={`flex min-h-14 items-start rounded-xl border p-1.5 sm:hidden ${item.status === 'completed' ? 'bg-slate-50 text-slate-500' : 'bg-white text-slate-800'} dark:bg-zinc-900 dark:text-slate-200`}><button type="button" onClick={() => void onToggle(item.id)} className="grid h-11 w-9 shrink-0 place-items-center" aria-label={item.status === 'completed' ? '恢复日程' : '完成日程'}><span className={`grid h-4 w-4 place-items-center rounded-[4px] border-2 ${item.status === 'completed' ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-400 bg-white'}`}>{item.status === 'completed' ? <Check className="h-3 w-3" /> : null}</span></button><button type="button" onClick={() => onEdit(item)} className="min-w-0 flex-1 py-1 pr-1 text-left"><strong className={`block break-words text-[13px] leading-4 ${item.status === 'completed' ? 'line-through' : ''}`}>{item.name}</strong><span className="mt-1 block break-words text-xs leading-4 text-slate-500">{formatReminderTime(item)}{item.className ? ` · ${item.className}` : ''}</span></button></div><div className="hidden sm:block">{card(item, item.status === 'active')}</div></React.Fragment>)}</div>
            </div>
          ))}
        </div>
      )}
      {showCreateActions && <button type="button" tabIndex={-1} aria-label="关闭创建菜单" onClick={() => setShowCreateActions(false)} className="fixed inset-0 z-40 bg-slate-950/10 sm:hidden" />}
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] right-4 z-50 flex flex-col items-end gap-2 sm:hidden">
        {showCreateActions && <>
          <GlassButton type="button" onClick={() => { setShowCreateActions(false); onBatch(); }} variant="primary" className="inline-flex min-h-12 items-center gap-2 px-4 text-sm font-black"><Sparkles className="h-4 w-4" />AI 批量创建</GlassButton>
          <GlassButton type="button" onClick={() => { setShowCreateActions(false); onAdd(); }} variant="secondary" className="inline-flex min-h-11 items-center gap-2 px-4 text-sm font-bold"><Plus className="h-4 w-4" />普通新建</GlassButton>
        </>}
        <GlassButton containerClassName="h-14 w-14" type="button" aria-label={showCreateActions ? '收起创建操作' : '打开创建操作'} aria-expanded={showCreateActions} onClick={() => setShowCreateActions(value => !value)} variant="primary" className="grid place-items-center">
          {showCreateActions ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </GlassButton>
      </div>
      {showRecurring ? (
        <RecurringReminderDialog
          items={recurring}
          onClose={() => setShowRecurring(false)}
          onEdit={(item) => {
            setShowRecurring(false);
            onEdit(item);
          }}
        />
      ) : null}
      {showOverdueDialog ? (
        <OverdueReminderDialog
          items={overdue}
          onClose={() => setShowOverdueDialog(false)}
          onApply={async (items) => {
            await onSaveBatch(items);
            setShowOverdueDialog(false);
          }}
        />
      ) : null}
    </section>
  );
}

function ReminderCard({ item, movable, showQuadrantTone, onEdit, onToggle, onDelete, onDragStart }: { key?: React.Key; item: TimerReminder; movable: boolean; showQuadrantTone: boolean; onEdit: (item: TimerReminder) => void; onToggle: (id: string) => void | Promise<void>; onDelete: (id: string) => void | Promise<void>; onDragStart: () => void }) {
  const overdue = isReminderOverdue(item);
  const untimed = (item.timeKind ?? (item.startAt ? 'point' : 'none')) === 'none';
  const completed = item.status === 'completed';
  const actionClass = 'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors';
  return (
    <article draggable={movable && item.status === 'active'} onDragStart={movable ? onDragStart : undefined} className={`group rounded-xl border p-3 ${showQuadrantTone ? `border-l-4 ${reminderQuadrantTone(item)}` : ''} ${completed ? 'border-slate-200 bg-slate-50 opacity-70 dark:border-zinc-700 dark:bg-zinc-900' : overdue ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/20' : untimed ? 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20' : 'border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-900'}`}>
      <div className="flex items-start gap-2.5">
        <button onClick={() => void onToggle(item.id)} className={`mt-1.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${completed ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-400 bg-white text-transparent hover:border-emerald-700'}`} aria-label={completed ? '恢复日程' : '完成日程'}>
          {completed ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className={`text-sm font-bold ${completed ? 'line-through' : ''}`}>{item.name}</h4>
            {overdue ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-black text-red-700">已过期</span> : null}
            {untimed && item.status === 'active' ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-700">时间待定</span> : null}
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            {item.repeatRule} · {formatReminderTime(item)}
            {item.className ? ` · ${item.className}` : ''}
          </p>
        </div>
        {movable ? (
          <span className={`${actionClass} cursor-grab text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800`} aria-label="拖动日程">
            <GripVertical className="h-4 w-4" />
          </span>
        ) : (
          <span className="h-8 w-8 shrink-0" />
        )}
        <button onClick={() => onEdit(item)} className={`${actionClass} hover:bg-slate-100 dark:hover:bg-zinc-800`} aria-label="编辑日程">
          <Pencil className="h-4 w-4 text-slate-500" />
        </button>
        <button onClick={() => void onDelete(item.id)} className={`${actionClass} hover:bg-red-50 dark:hover:bg-red-950/30`} aria-label="删除日程">
          <Trash2 className="h-4 w-4 text-slate-400" />
        </button>
      </div>
    </article>
  );
}

function RecurringReminderDialog({ items, onClose, onEdit }: { items: TimerReminder[]; onClose: () => void; onEdit: (item: TimerReminder) => void }) {
  return (
    <Modal
      title="周期任务"
      onClose={onClose}
      footer={
        <button onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 dark:bg-zinc-800 dark:text-slate-200">
          关闭
        </button>
      }
    >
      <div className="space-y-2">
        {items.map((item) => (
          <button key={item.id} onClick={() => onEdit(item)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-zinc-700 dark:hover:bg-emerald-950/20">
            <span>
              <strong className="block text-sm">{item.name}</strong>
              <span className="mt-1 block text-xs text-slate-400">
                {item.repeatRule} · 下一次 {formatReminderTime(item)}
              </span>
            </span>
            <Pencil className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        ))}
        {!items.length ? <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">暂无周期任务</p> : null}
      </div>
    </Modal>
  );
}

const dateInputValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const moveReminderToDate = (item: TimerReminder, date: string): TimerReminder => {
  if (!item.startAt) return item;
  const start = new Date(item.startAt);
  const end = item.endAt ? new Date(item.endAt) : null;
  const duration = end ? end.getTime() - start.getTime() : 0;
  const [year, month, day] = date.split('-').map(Number);
  const moved = new Date(year, month - 1, day, start.getHours(), start.getMinutes());
  if (item.recurrence?.enabled && item.recurrence.unit === 'week' && item.recurrence.weekdays?.length) {
    const allowed = item.recurrence.weekdays;
    for (let step = 0; step < 7; step += 1) {
      const weekday = moved.getDay() || 7;
      if (allowed.includes(weekday)) break;
      moved.setDate(moved.getDate() + 1);
    }
  }
  if (item.recurrence?.enabled && item.recurrence.unit === 'month' && item.recurrence.monthDays?.length) {
    const preferred = item.recurrence.monthDays[0];
    if (preferred === 0) moved.setMonth(moved.getMonth() + 1, 0);
    else moved.setDate(Math.min(preferred, new Date(moved.getFullYear(), moved.getMonth() + 1, 0).getDate()));
  }
  const startAt = `${dateInputValue(moved)}T${String(moved.getHours()).padStart(2, '0')}:${String(moved.getMinutes()).padStart(2, '0')}`;
  const endAt = end
    ? (() => {
        const value = new Date(moved.getTime() + duration);
        return `${dateInputValue(value)}T${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
      })()
    : undefined;
  return {
    ...item,
    startAt,
    endAt,
    dueAt: startAt,
    time: formatReminderTime({ ...item, startAt, endAt }),
    assumptionWarning: undefined,
  };
};

function OverdueReminderDialog({ items, onClose, onApply }: { items: TimerReminder[]; onClose: () => void; onApply: (items: TimerReminder[]) => Promise<void> }) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [targetDate, setTargetDate] = useState(dateInputValue(tomorrow));
  const [selected, setSelected] = useState(() => new Set(items.map((item) => item.id)));
  const [saving, setSaving] = useState(false);
  const proposed = items.map((item) => moveReminderToDate(item, targetDate));
  return (
    <Modal
      wide
      title="调整过期日程"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500">
            取消
          </button>
          <GlassButton
            disabled={saving || !selected.size}
            onClick={async () => {
              setSaving(true);
              try {
                await onApply(proposed.filter((item) => selected.has(item.id)));
              } finally {
                setSaving(false);
              }
            }}
            variant="primary" className="px-4 py-2 text-xs font-bold disabled:opacity-40"
          >
            {saving ? '更新中…' : `确认更新 ${selected.size} 项`}
          </GlassButton>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block text-xs font-bold text-slate-600">
          统一顺延到
          <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className={'qs-field-input '+(`${fieldClass} mt-1.5 max-w-xs`)} />
          <span className="mt-1 block font-normal text-slate-400">保留原时间和持续时长；周期任务会顺延到符合规则的日期。</span>
        </label>
        <div className="space-y-2">
          {items.map((item, index) => (
            <label key={item.id} className="grid cursor-pointer gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[24px_1fr_1fr] dark:border-zinc-700">
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })
                }
                className="mt-1 accent-emerald-700"
              />
              <span>
                <strong className="block text-sm">{item.name}</strong>
                <span className="text-xs text-red-600">原：{formatReminderTime(item)}</span>
              </span>
              <span className="text-xs text-emerald-700 sm:text-right">新：{formatReminderTime(proposed[index])}</span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function Empty() {
  return <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-400">还没有日程</div>;
}

function recurrenceLabel(item: TimerReminder) {
  const recurrence = item.recurrence;
  if (!recurrence?.enabled) return '一次性';
  const unit = { day: '天', week: '周', month: '月', year: '年' }[recurrence.unit];
  return `每 ${recurrence.interval > 1 ? recurrence.interval : ''}${unit}`;
}
function ReminderEditor({ item, classes, onChange, onClose, onSave: onSaveScope }: { item: TimerReminder; classes: SchoolClass[]; onChange: (item: TimerReminder) => void; onClose: () => void; onSave: (scope: 'single' | 'future') => void }) {
  const onSave = () => onSaveScope(item.id && item.seriesId && item.recurrence?.enabled && window.confirm('要把这次修改应用到后续周期日程吗？\n\n“确定”更新本次及后续，“取消”只更新本次。') ? 'future' : 'single');
  const change = (patch: Partial<TimerReminder>) => {
    const next = { ...item, ...patch };
    onChange({
      ...next,
      time: formatReminderTime(next),
      dueAt: next.startAt,
      repeatRule: recurrenceLabel(next),
    });
  };
  const recurrence = item.recurrence;
  const updateRecurrence = (patch: Partial<NonNullable<TimerReminder['recurrence']>>) =>
    change({
      recurrence: {
        enabled: true,
        unit: 'week',
        interval: 1,
        ...recurrence,
        ...patch,
      },
    });
  const toggleWeekday = (day: number) => {
    const days = recurrence?.weekdays ?? [];
    updateRecurrence({
      weekdays: days.includes(day) ? days.filter((value) => value !== day) : [...days, day].sort(),
    });
  };
  return (
    <Modal
      title={item.id ? '编辑日程' : '新建日程'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500">
            取消
          </button>
          <GlassButton onClick={onSave} disabled={!item.name.trim() || (item.timeKind === 'point' && !item.startAt) || (item.timeKind === 'range' && (!item.startAt || !item.endAt))} variant="primary" className="px-4 py-2 text-xs font-bold disabled:opacity-40">
            保存日程
          </GlassButton>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-600 sm:col-span-2">
          日程名称
          <input className={'qs-field-input '+(`${fieldClass} mt-1.5`)} value={item.name} onChange={(e) => onChange({ ...item, name: e.target.value })} />
        </label>
        <label className="text-xs font-bold text-slate-600">
          关联班级
          <select className={'qs-field-input '+(`${fieldClass} mt-1.5`)} value={item.classId} onChange={(e) => onChange({ ...item, classId: e.target.value })}>
            <option value="">无</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          时间类型
          <select
            className={'qs-field-input '+(`${fieldClass} mt-1.5`)}
            value={item.timeKind ?? 'none'}
            onChange={(e) =>
              change({
                timeKind: e.target.value as TimerReminder['timeKind'],
                startAt: '',
                endAt: '',
              })
            }
          >
            <option value="none">无时间</option>
            <option value="point">时间点 / 截止时间</option>
            <option value="range">时间段</option>
          </select>
        </label>
        {item.timeKind !== 'none' ? (
          <label className="text-xs font-bold text-slate-600">
            {item.timeKind === 'range' ? '开始时间' : '日程时间'}
            <input type="datetime-local" className={'qs-field-input '+(`${fieldClass} mt-1.5`)} value={item.startAt ?? ''} onChange={(e) => change({ startAt: e.target.value })} />
          </label>
        ) : null}
        {item.timeKind === 'range' ? (
          <label className="text-xs font-bold text-slate-600">
            结束时间
            <input type="datetime-local" className={'qs-field-input '+(`${fieldClass} mt-1.5`)} value={item.endAt ?? ''} onChange={(e) => change({ endAt: e.target.value })} />
          </label>
        ) : null}
        <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2 dark:border-zinc-700">
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={Boolean(recurrence?.enabled)}
              onChange={(e) =>
                change({
                  recurrence: e.target.checked ? { enabled: true, unit: 'week', interval: 1, weekdays: [] } : undefined,
                })
              }
              className="accent-emerald-700"
            />
            <Repeat2 className="h-4 w-4 text-emerald-700" />
            周期日程
          </label>
          {recurrence?.enabled ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-bold text-slate-600">
                每隔
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={recurrence.interval}
                  onChange={(e) =>
                    updateRecurrence({
                      interval: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className={'qs-field-input '+(`${fieldClass} mt-1.5`)}
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                周期
                <select
                  value={recurrence.unit}
                  onChange={(e) =>
                    updateRecurrence({
                      unit: e.target.value as typeof recurrence.unit,
                    })
                  }
                  className={'qs-field-input '+(`${fieldClass} mt-1.5`)}
                >
                  <option value="day">天</option>
                  <option value="week">周</option>
                  <option value="month">月</option>
                  <option value="year">年</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-600">
                最多次数
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={recurrence.maxOccurrences ?? ''}
                  onChange={(e) =>
                    updateRecurrence({
                      maxOccurrences: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="不限"
                  className={'qs-field-input '+(`${fieldClass} mt-1.5`)}
                />
              </label>
              {recurrence.unit === 'week' ? (
                <div className="sm:col-span-3">
                  <span className="text-xs font-bold text-slate-600">重复星期</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {dayNames.map((day, index) => (
                      <button type="button" key={day} onClick={() => toggleWeekday(index + 1)} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${(recurrence.weekdays ?? []).includes(index + 1) ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 dark:bg-zinc-800'}`}>
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {recurrence.unit === 'month' ? (
                <label className="text-xs font-bold text-slate-600 sm:col-span-2">
                  每月日期
                  <input type="number" min="0" max="31" value={recurrence.monthDays?.[0] ?? new Date(item.startAt ?? Date.now()).getDate()} onChange={(e) => updateRecurrence({ monthDays: [Number(e.target.value)] })} className={'qs-field-input '+(`${fieldClass} mt-1.5`)} />
                  <span className="mt-1 block text-[10px] font-normal text-slate-400">0 表示每月最后一天</span>
                </label>
              ) : null}
              <label className="text-xs font-bold text-slate-600">
                截止日期
                <input type="date" value={recurrence.endDate ?? ''} onChange={(e) => updateRecurrence({ endDate: e.target.value || undefined })} className={'qs-field-input '+(`${fieldClass} mt-1.5`)} />
              </label>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-5 sm:col-span-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(item.important)} onChange={(e) => onChange({ ...item, important: e.target.checked })} className="accent-emerald-700" />
            重要
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(item.urgent)} onChange={(e) => onChange({ ...item, urgent: e.target.checked })} className="accent-rose-600" />
            紧急
          </label>
        </div>
      </div>
    </Modal>
  );
}

function ReminderImportDialog({ classes, onClose, onApply }: { classes: SchoolClass[]; onClose: () => void; onApply: (items: TimerReminder[]) => Promise<void> }) {
  const [source, setSource] = useState('');
  const [drafts, setDrafts] = useState<ReminderImportDraft[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedCount = drafts?.filter((item) => item.selected && item.name.trim()).length ?? 0;
  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await createReminderImportDraft(source);
      setDrafts(result.drafts);
      setWarnings(result.warnings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'REMINDER_DRAFT_FAILED');
    } finally {
      setBusy(false);
    }
  };
  const update = (index: number, patch: Partial<ReminderImportDraft>) =>
    setDrafts(
      (current) =>
        current?.map((item, itemIndex) => {
          if (itemIndex !== index) return item;
          const next = { ...item, ...patch };
          return {
            ...next,
            time: formatReminderTime(next),
            dueAt: next.startAt,
          };
        }) ?? current,
    );
  const apply = async () => {
    if (!drafts) return;
    const selected = drafts.filter((item) => item.selected && item.name.trim()).map(({ selected: _, sourceExcerpt: __, confidence: ___, warnings: ____, ...item }) => item);
    setBusy(true);
    setError('');
    try {
      await onApply(selected);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'REMINDER_BATCH_SAVE_FAILED');
      setBusy(false);
    }
  };
  const footer = drafts ? (
    <>
      <button onClick={() => setDrafts(null)} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500">
        返回修改原文
      </button>
      <GlassButton onClick={() => void apply()} disabled={busy || selectedCount === 0} variant="primary" className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold disabled:opacity-40">
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        确认新建 {selectedCount} 条
      </GlassButton>
    </>
  ) : (
    <GlassButton onClick={() => void generate()} disabled={busy || !source.trim()} variant="primary" className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold disabled:opacity-40">
      {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      生成日程草稿
    </GlassButton>
  );
  return (
    <Modal wide title="AI 批量创建日程" onClose={onClose} footer={footer}>
      {!drafts ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            <strong>AI 只生成草稿，不会直接保存。</strong> 粘贴备忘录或聊天消息后，你可以逐条修改、取消勾选，再统一确认。
          </div>
          <label className="block text-xs font-bold text-slate-600">
            待创建文本
            <textarea autoFocus value={source} maxLength={20000} onChange={(event) => setSource(event.target.value)} className={'qs-field-input '+(`${fieldClass} mt-1.5 min-h-56 resize-y leading-6`)} placeholder={'例如：\n明天下午五点前收七年级5班作文\n下午两点到四点开备课组会\n有空整理一下家长会材料'} />
          </label>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>支持时间点、时间段和无时间日程</span>
            <span>{source.length}/20000</span>
          </div>
          {error && (
            <p className="flex items-center gap-1.5 rounded-lg bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
            <div>
              <strong className="text-sm">AI 日程草稿</strong>
              <p className="mt-0.5 text-[10px] text-slate-600">黄色表示需要确认，红色表示已经过期；过期项默认不勾选。</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 dark:bg-zinc-900">AI 生成 · 待人工确认</span>
          </div>
          {warnings.map((warning) => (
            <p key={warning} className="text-xs text-amber-700">
              • {warning}
            </p>
          ))}
          <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
            {drafts.map((item, index) => (
              <ReminderDraftRow key={item.id} item={item} index={index} classes={classes} onUpdate={update} />
            ))}
          </div>
          {!drafts.length && <Empty />}
          {error && (
            <p className="flex items-center gap-1.5 rounded-lg bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function ReminderDraftRow({ item, index, classes, onUpdate }: { key?: React.Key; item: ReminderImportDraft; index: number; classes: SchoolClass[]; onUpdate: (index: number, patch: Partial<ReminderImportDraft>) => void }) {
  const overdue = isReminderOverdue(item);
  const untimed = item.timeKind === 'none';
  const needsReview = untimed;
  const changeTime = (patch: Partial<ReminderImportDraft>) => onUpdate(index, patch);
  return (
    <article className={`rounded-xl border p-3 ${overdue ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/20' : needsReview ? 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20' : 'border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-900'}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-xs font-black">
          <input type="checkbox" checked={item.selected} onChange={(event) => onUpdate(index, { selected: event.target.checked })} className="h-4 w-4 accent-emerald-700" />
          创建这条
        </label>
        <div className="flex gap-1.5">
          {overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-black text-red-700">已过期</span>}
          {untimed && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-700">时间待定</span>}
          {item.recurrence?.enabled && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700">{item.repeatRule}</span>}
          {item.assumptionWarning && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-700">{item.assumptionWarning}</span>}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">置信度 {Math.round(item.confidence * 100)}%</span>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-[10px] font-bold text-slate-600 lg:col-span-2">
          日程名称
          <input value={item.name} onChange={(event) => onUpdate(index, { name: event.target.value })} className={'qs-field-input '+(`${fieldClass} mt-1`)} />
        </label>
        <label className="text-[10px] font-bold text-slate-600">
          关联班级
          <select
            value={item.classId}
            onChange={(event) => {
              const selected = classes.find((itemClass) => itemClass.id === event.target.value);
              onUpdate(index, {
                classId: selected?.id ?? '',
                className: selected?.name ?? '',
              });
            }}
            className={'qs-field-input '+(`${fieldClass} mt-1`)}
          >
            <option value="">无</option>
            {classes.map((itemClass) => (
              <option key={itemClass.id} value={itemClass.id}>
                {itemClass.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold text-slate-600">
          时间类型
          <select
            value={item.timeKind}
            onChange={(event) =>
              changeTime({
                timeKind: event.target.value as ReminderImportDraft['timeKind'],
                startAt: '',
                endAt: '',
              })
            }
            className={'qs-field-input '+(`${fieldClass} mt-1`)}
          >
            <option value="none">无时间</option>
            <option value="point">时间点</option>
            <option value="range">时间段</option>
          </select>
        </label>
        {item.timeKind !== 'none' && (
          <label className="text-[10px] font-bold text-slate-600 lg:col-start-3">
            {item.timeKind === 'range' ? '开始时间' : '日程时间'}
            <input
              type="datetime-local"
              value={item.startAt ?? ''}
              onChange={(event) =>
                changeTime({
                  startAt: event.target.value,
                  assumptionWarning: undefined,
                })
              }
              className={'qs-field-input '+(`${fieldClass} mt-1`)}
            />
          </label>
        )}
        {item.timeKind === 'range' && (
          <label className="text-[10px] font-bold text-slate-600">
            结束时间
            <input
              type="datetime-local"
              value={item.endAt ?? ''}
              onChange={(event) =>
                changeTime({
                  endAt: event.target.value,
                  assumptionWarning: undefined,
                })
              }
              className={'qs-field-input '+(`${fieldClass} mt-1`)}
            />
          </label>
        )}
        <div className="flex items-end gap-4 lg:col-span-2">
          <label className="inline-flex items-center gap-2 pb-2 text-xs">
            <input type="checkbox" checked={Boolean(item.important)} onChange={(event) => onUpdate(index, { important: event.target.checked })} className="accent-emerald-700" />
            重要
          </label>
          <label className="inline-flex items-center gap-2 pb-2 text-xs">
            <input type="checkbox" checked={Boolean(item.urgent)} onChange={(event) => onUpdate(index, { urgent: event.target.checked })} className="accent-red-600" />
            紧急
          </label>
        </div>
      </div>
      <details className="mt-2 text-[10px] text-slate-600">
        <summary className="cursor-pointer font-bold">查看对应原文与判断提示</summary>
        <p className="mt-1 rounded-lg bg-white/70 p-2 dark:bg-zinc-950/60">{item.sourceExcerpt}</p>
        {item.warnings.map((warning) => (
          <p key={warning} className="mt-1 text-amber-700">
            • {warning}
          </p>
        ))}
      </details>
    </article>
  );
}

function ImportDialog({ scope, classId, classes, periods, onClose, onApply }: { scope: 'teacher' | 'class'; classId: string; classes: SchoolClass[]; periods: SchedulePeriod[]; onClose: () => void; onApply: (items: ScheduleItem[]) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [draft, setDraft] = useState<ScheduleImportDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setPreview(null);
    setPreviewFailed(false);
    if (!file || !(file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))) return;
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const selectFile = (selected: File | null) => {
    if (!selected) return;
    const supported = selected.type === 'application/pdf' || /^image\/(jpeg|png|webp|heic|heif)$/i.test(selected.type)
      || /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(selected.name);
    if (!supported || selected.size > 10 * 1024 * 1024) {
      setFile(null);
      setDraft(null);
      setError(supported
        ? '文件超过 10 MiB，尚未上传，课表未改动。请压缩照片或改选较小的文件。'
        : '暂不支持这个文件格式，尚未上传，课表未改动。请选择照片或 PDF。');
      return;
    }
    setFile(selected);
    setDraft(null);
    setError('');
  };
  const recognize = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setDraft(await importSchedule(file, scope, classId));
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'SCHEDULE_IMPORT_FAILED';
      const reason = code === 'PADDLEOCR_QUEUE_FULL' || code === 'PADDLEOCR_RATE_LIMITED'
        ? 'OCR 服务当前排队较多，自动重试后仍未恢复。'
        : code === 'SCHEDULE_CLASS_NOT_FOUND'
          ? '所选班级已经失效，请关闭窗口后重新选择班级。'
        : code === 'SCHEDULE_IMAGE_ENHANCEMENT_FAILED'
          ? '这张照片暂时无法处理，请换用 JPG、PNG 照片或 PDF。'
        : code === 'HTTP_413' || code === 'LIMIT_FILE_SIZE'
          ? '文件超过服务器的 10 MiB 上限，请压缩后重选。'
        : code.startsWith('PADDLEOCR_')
          ? 'OCR 服务暂时无法完成课表识别。'
          : code === 'MODEL_CONNECTION_FAILED' || /^MODEL_REQUEST_FAILED:(502|503|504)$/.test(code)
            ? 'AI 整理服务暂时不可用，自动重试后仍未恢复。'
            : '课表识别未完成。';
      setError(`${reason} 已选文件仍保留，课表尚未写入；请重试或更换文件。`);
    } finally {
      setBusy(false);
    }
  };
  const update = (index: number, patch: Partial<ScheduleImportItemDraft>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
          }
        : current,
    );
  const remove = (index: number) => setDraft((current) => (current ? { ...current, items: current.items.filter((_, i) => i !== index) } : current));
  const orderedItems = (draft?.items ?? []).map((item, index) => ({ item, index })).sort((left, right) => left.item.day - right.item.day || left.item.period - right.item.period);
  const unresolvedItems = scope === 'teacher'
    ? (draft?.items ?? []).filter(item => item.classMatch.status === 'unresolved')
    : [];
  const classById = useMemo(() => new Map(classes.map(item => [item.id, item])), [classes]);
  const classOptionLabels = useMemo(() => {
    const counts = new Map<string, number>();
    classes.forEach(item => counts.set(item.name, (counts.get(item.name) ?? 0) + 1));
    return new Map(classes.map(item => [item.id, counts.get(item.name)! > 1 ? `${item.name} · ${item.term}` : item.name]));
  }, [classes]);
  const unresolvedGroups = useMemo(() => {
    const groups = new Map<string, { label: string; indexes: number[] }>();
    (draft?.items ?? []).forEach((item, index) => {
      if (item.classMatch.status !== 'unresolved') return;
      const normalized = item.recognizedClassText.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('zh-CN');
      const key = normalized || `unrecognized-${item.id}`;
      const current = groups.get(key) ?? { label: item.recognizedClassText || '未识别到班级文字', indexes: [] };
      current.indexes.push(index);
      groups.set(key, current);
    });
    return [...groups.values()];
  }, [draft]);
  const applyClassChoice = (indexes: number[], value: string) => setDraft(current => current ? {
    ...current,
    items: current.items.map((item, index) => {
      if (!indexes.includes(index)) return item;
      if (value === '__unassigned__') return {
        ...item, classId: '', className: '',
        classCorrectionType: 'uncertain', classNeedsReview: false,
        classMatch: { status: 'unassigned', reason: 'teacher-unassigned', candidateClassIds: [] },
      };
      const selectedClass = classById.get(value);
      if (!selectedClass) return {
        ...item, classId: '', className: '',
        classMatch: { ...item.classMatch, status: 'unresolved' },
      };
      return {
        ...item, classId: selectedClass.id, className: selectedClass.name,
        classCorrectionType: 'exact', classNeedsReview: false,
        classMatch: { status: 'matched', reason: 'teacher-selected', candidateClassIds: [selectedClass.id] },
      };
    }),
  } : current);
  const persistedItems = (draft?.items ?? []).map(({ recognizedClassText: _, classCorrectionType: __, classNeedsReview: ___, classMatch: ____, ...item }) => item);
  const footer = draft ? (
    <GlassButton
      onClick={async () => {
        setBusy(true);
        setError('');
        try {
          await onApply(persistedItems);
          onClose();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'SCHEDULE_BATCH_SAVE_FAILED');
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy || !draft.items.length || unresolvedItems.length > 0}
      variant="primary" className="inline-flex min-h-11 items-center gap-1.5 px-4 py-2 text-sm font-bold disabled:opacity-40"
    >
      {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      {unresolvedItems.length ? `还有 ${unresolvedItems.length} 项待确认` : `确认写入 ${draft.items.length} 项`}
    </GlassButton>
  ) : (
    <GlassButton onClick={() => void recognize()} disabled={!file || busy} variant="primary" className="inline-flex min-h-11 items-center gap-1.5 px-4 py-2 text-sm font-bold disabled:opacity-40">
      {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileScan className="h-4 w-4" />}
      开始识别
    </GlassButton>
  );
  return (
    <Modal wide compactFull title="扫描纸质课表" onClose={onClose} footer={footer}>
      {!draft ? (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950">
            <div className="text-center">
              <FileScan className="mx-auto mb-2 h-8 w-8 text-emerald-700" />
              <strong className="text-sm">选择纸质课表</strong>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">单张照片或单个 PDF，最多 10 MiB；上传后生成可核对的草稿</p>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {([
                { label: '拍照', icon: Camera, accept: 'image/*', capture: 'environment' as const },
                { label: '从相册选', icon: Images, accept: 'image/*', capture: undefined },
                { label: '选文件', icon: FileUp, accept: 'image/*,application/pdf,.pdf', capture: undefined },
              ] as const).map(source => <label key={source.label} className={`inline-flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-xl border border-slate-300 px-1 text-sm font-semibold whitespace-nowrap focus-within:ring-2 focus-within:ring-emerald-600 dark:border-zinc-700 ${busy ? 'pointer-events-none opacity-50' : 'hover:border-emerald-600'}`}>
                <source.icon className="h-4 w-4 shrink-0" />{source.label}
                <input type="file" accept={source.accept} capture={source.capture} disabled={busy} className="sr-only" onClick={event => { event.currentTarget.value = ''; }} onChange={event => selectFile(event.currentTarget.files?.[0] ?? null)} />
              </label>)}
            </div>
          </div>
          {file && <div role="status" className="flex min-w-0 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
            {preview?.file === file && !previewFailed ? <img src={preview.url} alt="已选课表照片预览" onError={() => setPreviewFailed(true)} className="h-20 w-20 shrink-0 rounded-lg object-contain bg-white dark:bg-zinc-900" /> : <FileScan className="h-8 w-8 shrink-0 text-emerald-700" />}
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{file.name}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{(file.size / 1024 / 1024).toFixed(1)} MiB · 可重新拍照或更换文件</p></div>
          </div>}
          {error && (
            <p role="alert" className="flex items-center gap-1.5 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 dark:border-zinc-700 dark:bg-zinc-950">
            <span>
              <strong>AI 识别草稿</strong> · 按星期和课节连续排列，黄色项目需要重点检查。
            </span>
            {draft.timings ? (
              <span className="font-mono text-[10px] text-slate-500">
                增强 {(draft.timings.enhanceMs / 1000).toFixed(1)}s · OCR {(draft.timings.paddleMs / 1000).toFixed(1)}s · AI {(draft.timings.aiMs / 1000).toFixed(1)}s
              </span>
            ) : null}
          </div>
          {draft.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-700">
              • {w}
            </p>
          ))}
          {error ? <p className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p> : null}
          {scope === 'teacher' && unresolvedGroups.length ? (
            <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
              <div>
                <strong className="text-sm text-amber-900 dark:text-amber-100">需要确认的班级写法</strong>
                <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200">选择一次会应用到草稿中所有相同识别文字；确实不属于任何班级时请选择“不关联班级”。</p>
              </div>
              {unresolvedGroups.map(group => (
                <label key={`${group.label}-${group.indexes[0]}`} className="grid gap-2 text-xs font-bold text-slate-700 sm:grid-cols-[minmax(150px,1fr)_minmax(220px,1.4fr)] sm:items-center dark:text-slate-200">
                  <span className="break-words">识别到：{group.label} <span className="font-normal text-slate-500">（{group.indexes.length}项）</span></span>
                  <select defaultValue="" onChange={event => applyClassChoice(group.indexes, event.target.value)} className={'qs-field-input '+(`${fieldClass} min-h-11 text-base sm:text-sm`)}>
                    <option value="">请选择已有班级</option>
                    {classes.map(itemClass => <option key={itemClass.id} value={itemClass.id}>{classOptionLabels.get(itemClass.id)}</option>)}
                    <option value="__unassigned__">不关联班级</option>
                  </select>
                </label>
              ))}
            </section>
          ) : null}
          <div className="max-h-[58vh] overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
            <div className="divide-y divide-slate-100 dark:divide-zinc-800">
              {orderedItems.map(({ item, index }) => (
                <ImportDraftRow key={item.id} item={item} index={index} scope={scope} classes={classes} classById={classById} classOptionLabels={classOptionLabels} periods={periods} onUpdate={update} onRemove={remove} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ImportDraftRow({ item, index, scope, classes, classById, classOptionLabels, periods, onUpdate, onRemove }: { key?: React.Key; item: ScheduleImportItemDraft; index: number; scope: 'teacher' | 'class'; classes: SchoolClass[]; classById: Map<string, SchoolClass>; classOptionLabels: Map<string, string>; periods: SchedulePeriod[]; onUpdate: (index: number, patch: Partial<ScheduleImportItemDraft>) => void; onRemove: (index: number) => void }) {
  const lowConfidence = item.confidence !== undefined && item.confidence < 0.75;
  const aiCorrected = item.classCorrectionType === 'noise-removed' || item.classCorrectionType === 'ocr-corrected';
  const matchLabel = item.classMatch.status === 'matched' ? (item.classMatch.reason === 'teacher-selected' ? '教师已确认' : aiCorrected ? 'AI 已清理 OCR 噪声' : '已自动匹配') : item.classMatch.status === 'unassigned' ? '不关联班级' : '需要确认';
  return (
    <div className={`grid gap-3 p-3 md:grid-cols-[190px_minmax(150px,1fr)_minmax(170px,1fr)_32px] ${lowConfidence ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-white dark:bg-zinc-900'}`}>
      <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0 text-xs font-bold text-slate-600">
          星期
          <select value={item.day} onChange={(event) => onUpdate(index, { day: Number(event.target.value) })} className={'qs-field-input '+(`${fieldClass} mt-1 min-w-[82px]`)}>
            {dayNames.map((day, dayIndex) => (
              <option key={day} value={dayIndex + 1}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs font-bold text-slate-600">
          课节
          <select
            value={item.period}
            onChange={(event) => {
              const selectedPeriod = periods.find((period) => period.period === Number(event.target.value));
              onUpdate(index, {
                period: Number(event.target.value),
                time: periodTime(selectedPeriod),
              });
            }}
            className={'qs-field-input '+(`${fieldClass} mt-1 min-w-[96px]`)}
          >
            {periods.map((period) => (
              <option key={period.period} value={period.period}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-xs font-bold text-slate-600">
        课程
        <input value={item.title} onChange={(event) => onUpdate(index, { title: event.target.value })} className={'qs-field-input '+(`${fieldClass} mt-1`)} />
      </label>
      {scope === 'teacher' ? (
        <label className="text-xs font-bold text-slate-600">
          <span className="flex items-center justify-between gap-2"><span>班级</span><span className={item.classMatch.status === 'unresolved' ? 'text-amber-700' : 'text-emerald-700'}>{matchLabel}</span></span>
          <select
            value={item.classMatch.status === 'unassigned' ? '__unassigned__' : item.classId}
            onChange={(event) => {
              const value = event.target.value;
              if (value === '__unassigned__') onUpdate(index, { classId: '', className: '', classCorrectionType: 'uncertain', classNeedsReview: false, classMatch: { status: 'unassigned', reason: 'teacher-unassigned', candidateClassIds: [] } });
              else {
                const selectedClass = classById.get(value);
                onUpdate(index, selectedClass
                  ? { classId: selectedClass.id, className: selectedClass.name, classCorrectionType: 'exact', classNeedsReview: false, classMatch: { status: 'matched', reason: 'teacher-selected', candidateClassIds: [selectedClass.id] } }
                  : { classId: '', className: '', classMatch: { ...item.classMatch, status: 'unresolved' } });
              }
            }}
            className={'qs-field-input '+(`${fieldClass} mt-1 min-h-11 text-base sm:text-sm`)}
          >
            <option value="">请选择已有班级</option>
            {classes.map((itemClass) => (
              <option key={itemClass.id} value={itemClass.id}>
                {classOptionLabels.get(itemClass.id)}
              </option>
            ))}
            <option value="__unassigned__">不关联班级</option>
          </select>
          <span className="mt-1 block break-words font-normal text-slate-500">识别到：{item.recognizedClassText || '未识别到班级文字'}</span>
        </label>
      ) : (
        <label className="text-xs font-bold text-slate-600">
          教师（可空）
          <input value={item.teacherName ?? ''} onChange={(event) => onUpdate(index, { teacherName: event.target.value })} className={'qs-field-input '+(`${fieldClass} mt-1`)} />
        </label>
      )}
      <button onClick={() => onRemove(index)} className="self-end rounded-lg p-2 hover:bg-red-50 dark:hover:bg-red-950/30" aria-label="移除识别项">
        <Trash2 className="h-4 w-4 text-slate-500" />
      </button>
    </div>
  );
}
