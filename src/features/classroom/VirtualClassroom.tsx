/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { MutableRefObject, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Award,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  GraduationCap,
  LoaderCircle,
  LogOut,
  Maximize2,
  Minimize2,
  Minus,
  MoveLeft,
  MoveRight,
  MoveUp,
  MoveDown,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  X
} from 'lucide-react';
import { useAuth } from '../auth/AuthGate';
import { readClassroomExportStudentNo } from '../../domain/userPreferences';
import { ClassroomLayout, CommitteeRole, SchoolClass, Student } from '../../domain/types';
import { exportClassroomLayout, getClassroomLayout, saveClassroomLayout } from '../../services/classroomApi';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import BehaviorTagEditor from '../students/BehaviorTagEditor';

interface VirtualClassroomProps {
  students: Student[];
  classes: SchoolClass[];
  committeeRoles: CommitteeRole[];
  layoutCache: MutableRefObject<Map<string, ClassroomLayout>>;
  selectedClassId: string;
  onSelectClass: (classId: string) => void;
  onCreateClass: () => void;
  onOpenClassroomTasks: (classId: string) => void;
  onManageStudent: (studentId: string) => void;
  onViewStudentProfile: (studentId: string) => void;
  onAddObservation: (studentId: string, text: string) => Promise<void>;
  onUpdateStudent: (student: Student) => Promise<boolean>;
}

const statusMeta: Record<Student['status'], { label: string; dot: string; badge: string }> = {
  outstanding: { label: '表现突出', dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  good: { label: '状态良好', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  warning: { label: '需要关注', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  risk: { label: '近期风险', dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-200' }
};

const cloneLayout = (layout: ClassroomLayout): ClassroomLayout => ({
  ...layout,
  seats: layout.seats.map(seat => ({ ...seat }))
});

export default function VirtualClassroom({
  students,
  classes,
  committeeRoles,
  layoutCache,
  selectedClassId,
  onSelectClass,
  onCreateClass,
  onOpenClassroomTasks,
  onManageStudent,
  onViewStudentProfile,
  onAddObservation,
  onUpdateStudent
}: VirtualClassroomProps) {
  const { user } = useAuth();
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [showPlacement, setShowPlacement] = useState(false);
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);
  const [showArrangeMore, setShowArrangeMore] = useState(false);
  const [expandedSeats, setExpandedSeats] = useState(false);
  const [portraitViewport, setPortraitViewport] = useState(false);
  const [swapAxis, setSwapAxis] = useState<'row' | 'column'>('column');
  const [swapFrom, setSwapFrom] = useState(0);
  const [swapTo, setSwapTo] = useState(1);
  const [undoLayout, setUndoLayout] = useState<ClassroomLayout | null>(null);
  const [layout, setLayout] = useState<ClassroomLayout | null>(null);
  const [draft, setDraft] = useState<ClassroomLayout | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [placementStudentId, setPlacementStudentId] = useState<string | null>(null);
  const [observationText, setObservationText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [submittingObservation, setSubmittingObservation] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const activeClass = classes.find(schoolClass => schoolClass.id === selectedClassId && schoolClass.status === 'active')
    ?? classes.find(schoolClass => schoolClass.status === 'active');
  const effectiveClassId = activeClass?.id ?? '';
  const classStudents = useMemo(
    () => students
      .filter(student => student.classId === effectiveClassId)
      .sort((left, right) => left.studentNo.localeCompare(right.studentNo, 'zh-CN', { numeric: true })),
    [effectiveClassId, students]
  );
  const studentById = useMemo(() => new Map(classStudents.map(student => [student.id, student])), [classStudents]);
  const activeLayout = draft ?? layout;
  const editMode = Boolean(draft);
  const studentIdBySeatIndex = useMemo(
    () => new Map((activeLayout?.seats ?? []).map(seat => [seat.seatIndex, seat.studentId])),
    [activeLayout]
  );
  const seatedStudentIds = useMemo(
    () => new Set((activeLayout?.seats ?? []).map(seat => seat.studentId)),
    [activeLayout]
  );
  const unassignedStudents = classStudents.filter(student => !seatedStudentIds.has(student.id));
  const selectedStudent = selectedStudentId ? studentById.get(selectedStudentId) : undefined;
  const committeeRoleById = useMemo(() => new Map(committeeRoles.map(role => [role.id, role.name])), [committeeRoles]);

  useEffect(() => {
    let active = true;
    const cachedLayout = layoutCache.current.get(effectiveClassId);
    setLoading(!cachedLayout);
    setLayout(cachedLayout ?? null);
    setDraft(null);
    setUndoLayout(null);
    setShowPlacement(false);
    setShowLayoutSettings(false);
    setShowArrangeMore(false);
    setSelectedStudentId(null);
    setPlacementStudentId(null);
    setMessage(null);
    if (!effectiveClassId) {
      setLoading(false);
      return;
    }
    getClassroomLayout(effectiveClassId)
      .then(nextLayout => {
        if (active) {
          layoutCache.current.set(effectiveClassId, nextLayout);
          setLayout(nextLayout);
        }
      })
      .catch(error => {
        if (active) setMessage({
          type: 'error',
          text: cachedLayout
            ? `座位表刷新失败，当前仍显示上次结果：${error instanceof Error ? error.message : '未知错误'}`
            : `座位表读取失败：${error instanceof Error ? error.message : '未知错误'}`,
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [effectiveClassId, layoutCache]);

  useEffect(() => {
    if (!expandedSeats) return;
    const updateOrientation = () => setPortraitViewport(window.innerHeight > window.innerWidth);
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) setExpandedSeats(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedSeats(false);
    };
    const previousOverflow = document.body.style.overflow;
    updateOrientation();
    document.body.style.overflow = 'hidden';
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      const orientation = screen.orientation as (ScreenOrientation & { unlock?: () => void }) | undefined;
      orientation?.unlock?.();
    };
  }, [expandedSeats]);

  useEffect(() => {
    if (!selectedStudent || editMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedStudentId(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [editMode, selectedStudent]);

  const updateDraftSeats = (seats: ClassroomLayout['seats']) => {
    setDraft(current => current ? { ...current, seats } : current);
  };

  // Remap occupied seats as a permutation; empty positions rotate with their row or column.
  const shiftSeats = (axis: 'row' | 'column', direction: -1 | 1) => {
    if (!draft || saving) return;
    setUndoLayout(cloneLayout(draft));
    updateDraftSeats(draft.seats.map(seat => {
      const row = Math.floor(seat.seatIndex / draft.columnCount);
      const column = seat.seatIndex % draft.columnCount;
      const nextRow = axis === 'row' ? (row + direction + draft.rowCount) % draft.rowCount : row;
      const nextColumn = axis === 'column' ? (column + direction + draft.columnCount) % draft.columnCount : column;
      return { ...seat, seatIndex: nextRow * draft.columnCount + nextColumn };
    }));
    setPlacementStudentId(null);
    const label = axis === 'column' ? (direction === -1 ? '向左' : '向右') : (direction === -1 ? '向下' : '向上');
    setMessage({ type: 'success', text: `${label}轮换已预览，尚未保存。` });
  };
  const swapLines = () => {
    if (!draft || saving) return;
    const count = swapAxis === 'row' ? draft.rowCount : draft.columnCount;
    if (swapFrom === swapTo || swapFrom >= count || swapTo >= count) return;
    setUndoLayout(cloneLayout(draft));
    updateDraftSeats(draft.seats.map(seat => {
      let row = Math.floor(seat.seatIndex / draft.columnCount);
      let column = seat.seatIndex % draft.columnCount;
      const exchange = (value: number) => value === swapFrom ? swapTo : value === swapTo ? swapFrom : value;
      if (swapAxis === 'row') row = exchange(row); else column = exchange(column);
      return { ...seat, seatIndex: row * draft.columnCount + column };
    }));
    setPlacementStudentId(null);
    setMessage({ type: 'success', text: `第 ${swapFrom + 1} ${swapAxis === 'row' ? '行' : '列'}与第 ${swapTo + 1} ${swapAxis === 'row' ? '行' : '列'}已交换，尚未保存。` });
  };

  const handleSeatClick = (seatIndex: number) => {
    if (!activeLayout || saving) return;
    if (editMode) setUndoLayout(null);
    const occupantId = activeLayout.seats.find(seat => seat.seatIndex === seatIndex)?.studentId;
    if (!editMode) {
      if (occupantId) setSelectedStudentId(occupantId);
      return;
    }
    if (!placementStudentId) {
      if (occupantId) {
        setPlacementStudentId(occupantId);
        setSelectedStudentId(occupantId);
      }
      return;
    }
    if (occupantId === placementStudentId) {
      setPlacementStudentId(null);
      return;
    }

    const sourceSeat = activeLayout.seats.find(seat => seat.studentId === placementStudentId);
    const nextSeats = activeLayout.seats
      .filter(seat => seat.studentId !== placementStudentId && seat.seatIndex !== seatIndex)
      .map(seat => ({ ...seat }));
    if (sourceSeat && occupantId) nextSeats.push({ seatIndex: sourceSeat.seatIndex, studentId: occupantId });
    nextSeats.push({ seatIndex, studentId: placementStudentId });
    updateDraftSeats(nextSeats.sort((left, right) => left.seatIndex - right.seatIndex));
    setSelectedStudentId(placementStudentId);
    setPlacementStudentId(null);
    setMessage(null);
  };

  const removePlacementStudent = () => {
    if (saving || !activeLayout || !placementStudentId) return;
    setUndoLayout(null);
    updateDraftSeats(activeLayout.seats.filter(seat => seat.studentId !== placementStudentId));
    setPlacementStudentId(null);
  };

  const resizeLayout = (nextRows: number, nextColumns: number) => {
    if (saving || !draft || nextRows < 1 || nextRows > 10 || nextColumns < 1 || nextColumns > 12) return;
    setUndoLayout(null);
    const converted = draft.seats.map(seat => {
      const row = Math.floor(seat.seatIndex / draft.columnCount);
      const column = seat.seatIndex % draft.columnCount;
      return { ...seat, row, column };
    });
    if (converted.some(seat => seat.row >= nextRows || seat.column >= nextColumns)) {
      setMessage({ type: 'error', text: '缩小布局前请先移出边界位置上的学生。' });
      return;
    }
    setDraft({
      ...draft,
      rowCount: nextRows,
      columnCount: nextColumns,
      seats: converted.map(({ row, column, studentId }) => ({ seatIndex: row * nextColumns + column, studentId }))
    });
    setMessage(null);
  };

  const autoArrange = () => {
    if (!draft || saving) return;
    if (!window.confirm('按学号排列会覆盖当前座位草稿。确认重新排列吗？')) return;
    setUndoLayout(null);
    updateDraftSeats(classStudents
      .slice(0, draft.rowCount * draft.columnCount)
      .map((student, seatIndex) => ({ seatIndex, studentId: student.id })));
    setPlacementStudentId(null);
    setShowArrangeMore(false);
    if (classStudents.length > draft.rowCount * draft.columnCount) {
      setMessage({ type: 'error', text: '座位数量不足，部分学生仍在待安排列表中。' });
    } else {
      setMessage(null);
    }
  };

  const saveDraft = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveClassroomLayout(draft);
      layoutCache.current.set(saved.classId, saved);
      setLayout(saved);
      setDraft(null);
      setShowLayoutSettings(false);
      setShowArrangeMore(false);
      setSelectedStudentId(null);
      setPlacementStudentId(null);
      setMessage({ type: 'success', text: '座位表已保存。' });
    } catch (error) {
      setMessage({ type: 'error', text: '座位保存失败，当前草稿仍保留在页面中。请检查网络后重试；刷新前请先保留本次安排。' });
    } finally {
      setSaving(false);
    }
  };

  const submitObservation = async () => {
    if (!selectedStudent || !observationText.trim()) return;
    setSubmittingObservation(true);
    setMessage(null);
    try {
      await onAddObservation(selectedStudent.id, observationText.trim());
      setObservationText('');
      setMessage({ type: 'success', text: `已保存 ${selectedStudent.name} 的课堂观察。` });
    } catch (error) {
      setMessage({ type: 'error', text: `观察记录保存失败：${error instanceof Error ? error.message : '未知错误'}` });
    } finally {
      setSubmittingObservation(false);
    }
  };

  const exportLayout = async () => {
    setExporting(true);
    setMessage(null);
    try {
      await exportClassroomLayout(effectiveClassId, activeClass.name, readClassroomExportStudentNo(user.id));
      setMessage({ type: 'success', text: '座位表已导出。' });
    } catch (error) {
      setMessage({ type: 'error', text: `导出失败：${error instanceof Error ? error.message : '未知错误'}` });
    } finally {
      setExporting(false);
    }
  };

  const openExpandedSeats = () => {
    setPortraitViewport(window.innerHeight > window.innerWidth);
    setExpandedSeats(true);
    const fullscreen = document.documentElement.requestFullscreen?.().catch(() => undefined);
    if (fullscreen && window.matchMedia('(max-width: 639px)').matches) {
      void fullscreen.then(async () => {
        const orientation = screen.orientation as (ScreenOrientation & { lock?: (value: 'landscape') => Promise<void> }) | undefined;
        try {
          await orientation?.lock?.('landscape');
        } catch {
          // Fullscreen remains useful when this browser does not support orientation locking.
        }
      }).catch(() => undefined);
    }
  };

  const closeExpandedSeats = () => {
    setExpandedSeats(false);
    const orientation = screen.orientation as (ScreenOrientation & { unlock?: () => void }) | undefined;
    orientation?.unlock?.();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };

  const rotationControls = draft && <div className="grid grid-cols-2 gap-2">
    {([
      { label: '向上轮换', icon: MoveUp, axis: 'row', direction: 1, disabled: draft.rowCount < 2 },
      { label: '向下轮换', icon: MoveDown, axis: 'row', direction: -1, disabled: draft.rowCount < 2 },
      { label: '向左轮换', icon: MoveLeft, axis: 'column', direction: -1, disabled: draft.columnCount < 2 },
      { label: '向右轮换', icon: MoveRight, axis: 'column', direction: 1, disabled: draft.columnCount < 2 }
    ] as const).map(action => <button key={action.label} type="button" disabled={saving || action.disabled} onClick={() => shiftSeats(action.axis, action.direction)} className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-2 text-sm font-semibold whitespace-nowrap text-slate-700 disabled:opacity-40 dark:bg-zinc-800 dark:text-slate-200">
      <action.icon className="h-4 w-4 shrink-0" />{action.label}
    </button>)}
  </div>;

  const undoQuickAction = undoLayout && <button type="button" disabled={saving} onClick={() => { setDraft(undoLayout); setUndoLayout(null); setPlacementStudentId(null); setMessage(null); }} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-emerald-700 disabled:opacity-40 dark:text-emerald-300">撤销上一步</button>;

  const quickActions = draft && <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-zinc-700">
    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">轮换座位</h3>
    {rotationControls}
    <p className="text-xs leading-5 text-slate-500">向下：首行到末行；向上：末行到首行。空位一起轮换，保存前可预览。</p>
    {undoQuickAction}
    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 dark:border-zinc-700">
      <button type="button" onClick={() => setShowLayoutSettings(true)} className="min-h-11 rounded-lg border border-slate-200 text-sm font-semibold dark:border-zinc-700">行列设置</button>
      <button type="button" onClick={() => setShowArrangeMore(true)} className="min-h-11 rounded-lg border border-slate-200 text-sm font-semibold dark:border-zinc-700">更多</button>
    </div>
  </div>;

  const layoutSizeControls = draft && (
    <div className="grid gap-3 sm:grid-cols-2">
      {([
        { label: '行', value: draft.rowCount, decrease: () => resizeLayout(draft.rowCount - 1, draft.columnCount), increase: () => resizeLayout(draft.rowCount + 1, draft.columnCount) },
        { label: '列', value: draft.columnCount, decrease: () => resizeLayout(draft.rowCount, draft.columnCount - 1), increase: () => resizeLayout(draft.rowCount, draft.columnCount + 1) }
      ] as const).map(control => (
        <div key={control.label} className="flex min-w-0 items-center justify-between gap-1.5 rounded-xl border border-slate-200 bg-white p-1 pl-3 dark:border-zinc-700 dark:bg-zinc-900">
          <span className="shrink-0 text-xs font-bold text-slate-500">{control.label}</span>
          <div className="inline-grid shrink-0 grid-cols-[44px_28px_44px] items-stretch overflow-hidden rounded-lg bg-slate-50 dark:bg-zinc-800">
            <button type="button" aria-label={`减少一${control.label}`} onClick={control.decrease} className="grid min-h-11 min-w-11 place-items-center text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-700"><Minus className="h-4 w-4" /></button>
            <span className="grid place-items-center border-x border-slate-200 text-center text-sm font-black tabular-nums dark:border-zinc-700">{control.value}</span>
            <button type="button" aria-label={`增加一${control.label}`} onClick={control.increase} className="grid min-h-11 min-w-11 place-items-center text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-zinc-700"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
      ))}
    </div>
  );

  const mobileArrangeActions = draft && <div className="space-y-2 sm:max-w-[520px] xl:hidden">
    {rotationControls}
    <div className="grid grid-cols-3 gap-1 text-sm">
      <button type="button" onClick={() => setShowLayoutSettings(true)} className="min-h-11 min-w-0 rounded-lg px-1 font-semibold whitespace-nowrap">行列设置</button>
      <button type="button" onClick={() => setShowArrangeMore(true)} className="min-h-11 min-w-0 rounded-lg px-1 font-semibold whitespace-nowrap">更多</button>
      <button type="button" onClick={() => setShowPlacement(true)} className="min-h-11 min-w-0 rounded-lg px-1 font-semibold whitespace-nowrap text-emerald-800 dark:text-emerald-300">待安排 {unassignedStudents.length}</button>
    </div>
    {undoQuickAction}
  </div>;

  const unassignedPanel = (
    <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">待安排学生</h3>
        <span className="text-xs text-slate-400">{unassignedStudents.length}</span>
      </div>
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {unassignedStudents.map(student => (
          <button
            type="button"
            key={student.id}
            onClick={() => { setPlacementStudentId(student.id); setShowPlacement(false); }}
            className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left ${placementStudentId === student.id ? 'border-amber-400 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}
          >
            <span className="truncate text-sm font-semibold text-slate-700">{student.name}</span>
            <span className="ml-2 text-xs text-slate-400">{student.studentNo}</span>
          </button>
        ))}
        {!unassignedStudents.length && <p className="py-4 text-center text-xs text-slate-400">全部学生已安排</p>}
      </div>
      {placementStudentId && seatedStudentIds.has(placementStudentId) && (
        <button type="button" onClick={removePlacementStudent} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">
          <LogOut className="h-4 w-4" />移出座位
        </button>
      )}
      {placementStudentId && (
        <button type="button" onClick={() => setPlacementStudentId(null)} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-slate-500">
          <RotateCcw className="h-4 w-4" />取消选择
        </button>
      )}
    </section>
  );

  const renderSeatBoard = (expanded = false) => {
    if (!activeLayout) return null;
    const rowHeight = expanded ? 44 : 64;
    const columnWidth = expanded ? 76 : 82;
    return (
      <div className={`relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950/40 ${expanded ? 'p-2 sm:p-3' : 'p-3 sm:p-4'}`}>
        {!expanded && (
          <button type="button" onClick={openExpandedSeats} aria-label="放大座位图" title="放大座位图" className="absolute right-2 top-2 z-10 grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-sm backdrop-blur hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-slate-200">
            <Maximize2 className="h-5 w-5" />
          </button>
        )}
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <div
            className="grid h-full"
            style={{
              gridTemplateColumns: '38px minmax(0, 1fr)',
              gridTemplateRows: 'minmax(0, 1fr) 24px',
              columnGap: '8px',
              rowGap: '5px',
              minWidth: `${activeLayout.columnCount * columnWidth + 46}px`,
              minHeight: `${activeLayout.rowCount * rowHeight + 29}px`
            }}
          >
            <div
              className="grid min-h-0 text-xs font-bold tabular-nums text-slate-500"
              style={{ gridTemplateRows: `repeat(${activeLayout.rowCount}, minmax(0, 1fr))`, rowGap: '6px' }}
              aria-hidden="true"
            >
              {Array.from({ length: activeLayout.rowCount }, (_, visualRow) => (
                <span key={visualRow} className="flex items-center justify-end whitespace-nowrap">{activeLayout.rowCount - visualRow}行</span>
              ))}
            </div>
            <div
              className="grid min-h-0"
              style={{
                gridTemplateColumns: `repeat(${activeLayout.columnCount}, minmax(74px, 1fr))`,
                gridTemplateRows: `repeat(${activeLayout.rowCount}, minmax(0, 1fr))`,
                columnGap: '8px',
                rowGap: '6px'
              }}
            >
              {Array.from({ length: activeLayout.rowCount * activeLayout.columnCount }, (_, visualIndex) => {
                const visualRow = Math.floor(visualIndex / activeLayout.columnCount);
                const column = visualIndex % activeLayout.columnCount;
                const logicalRow = activeLayout.rowCount - 1 - visualRow;
                const seatIndex = logicalRow * activeLayout.columnCount + column;
                const studentId = studentIdBySeatIndex.get(seatIndex);
                const student = studentId ? studentById.get(studentId) : undefined;
                const isPlacement = student?.id === placementStudentId;
                return (
                  <button
                    type="button"
                    key={seatIndex}
                    onClick={() => handleSeatClick(seatIndex)}
                    className={`relative flex min-h-0 overflow-hidden rounded-md border p-1.5 text-center transition-colors ${
                      student
                        ? isPlacement
                          ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200'
                          : 'border-slate-200 bg-white hover:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900'
                        : editMode
                          ? 'border-dashed border-slate-300 bg-white/60 hover:border-emerald-400 hover:bg-emerald-50/50'
                          : 'cursor-default border-dashed border-slate-200 bg-transparent'
                    }`}
                    aria-label={student ? `第${logicalRow + 1}行第${column + 1}列，${student.name}，${student.studentNo}` : `第${logicalRow + 1}行第${column + 1}列，空位`}
                  >
                    {student ? (
                      <span className="m-auto flex min-w-0 flex-col items-center justify-center leading-tight">
                        <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${statusMeta[student.status].dot}`} />
                        <span className="max-w-full truncate text-xs font-bold text-slate-800 dark:text-slate-100">{student.name}</span>
                        <span className="mt-0.5 text-[10px] text-slate-400">{student.studentNo}</span>
                        {student.committeeRoleIds.length > 0 && <Award className="absolute bottom-1 right-1.5 h-3.5 w-3.5 text-amber-500" aria-label="班委" />}
                      </span>
                    ) : (
                      <span className="m-auto text-[11px] text-slate-400">空位</span>
                    )}
                  </button>
                );
              })}
            </div>
            <span aria-hidden="true" />
            <div
              className="grid text-xs font-bold tabular-nums text-slate-500"
              style={{ gridTemplateColumns: `repeat(${activeLayout.columnCount}, minmax(74px, 1fr))`, columnGap: '8px' }}
              aria-hidden="true"
            >
              {Array.from({ length: activeLayout.columnCount }, (_, column) => (
                <span key={column} className="text-center whitespace-nowrap">{column + 1}列</span>
              ))}
            </div>
          </div>
        </div>
        {!expanded && <div className="mx-auto my-3 flex min-h-11 w-36 shrink-0 items-center justify-center rounded-sm border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-900">讲台</div>}
        {!expanded && <div className="mx-auto flex h-11 w-full max-w-3xl shrink-0 items-center justify-center rounded-sm bg-slate-800 text-xs font-semibold text-white">黑板</div>}
      </div>
    );
  };

  if (!activeClass) return (
    <section className="grid min-h-[320px] place-items-center rounded-3xl border border-slate-200 bg-white/80 px-4 py-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70" id="classroom-page">
      <div className="max-w-sm">
        <GraduationCap className="mx-auto h-11 w-11 text-emerald-700" />
        <h2 className="mt-4 text-xl font-black text-slate-900 dark:text-slate-100">还没有可以排座位的班级</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">先建立班级并导入学生，再回来安排座位和记录课堂观察。</p>
        <button type="button" onClick={onCreateClass} className="mt-5 min-h-11 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white">创建第一个班级</button>
      </div>
    </section>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 animate-fade-in max-xl:h-auto" id="classroom-page">
      <header className="flex shrink-0 flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
            <GraduationCap className="h-5 w-5 text-emerald-700" />
            {activeClass.name}座位图
          </h2>
          <p className="mt-1 text-xs text-slate-500">已安排 {activeLayout?.seats.length ?? 0} 人 · 待安排 {unassignedStudents.length} 人</p>
          {!editMode && <button type="button" onClick={() => onOpenClassroomTasks(effectiveClassId)} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><BookOpen className="h-4 w-4" />记录本班课堂任务</button>}
        </div>
        <div className={`grid w-full items-center gap-2 md:flex md:w-auto ${editMode ? 'grid-cols-2' : 'grid-cols-[minmax(0,1fr)_44px_auto]'}`}>
          <button
            type="button"
            disabled={saving}
            onClick={() => setShowClassPicker(true)}
            className={`flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-slate-700 md:hidden dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200 ${editMode ? 'col-span-2' : ''}`}
          >
            <span className="truncate">{activeClass.name}</span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </button>
          <select
            value={effectiveClassId}
            disabled={saving}
            onChange={event => { if (!editMode || window.confirm('座位修改尚未保存，切换班级将放弃修改。继续切换吗？')) onSelectClass(event.target.value); }}
            className="hidden min-h-11 min-w-32 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 md:block dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200"
            aria-label="切换班级"
          >
            {classes.filter(schoolClass => schoolClass.status === 'active').map(schoolClass => (
              <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>
            ))}
          </select>
          {editMode ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => { setDraft(null); setShowLayoutSettings(false); setShowArrangeMore(false); setSelectedStudentId(null); setPlacementStudentId(null); setMessage(null); }}
                className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold whitespace-nowrap text-slate-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300"
              >
                <X className="h-4 w-4" />取消
              </button>
              <button
                type="button"
                onClick={() => void saveDraft()}
                disabled={saving}
                className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md bg-emerald-700 px-3 text-sm font-semibold whitespace-nowrap text-white disabled:opacity-60"
              >
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存座位
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void exportLayout()}
                disabled={!layout || exporting}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:opacity-50 md:w-auto md:gap-1.5 md:px-3 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200"
              >
                {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="sr-only md:not-sr-only">导出 Excel</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!layout) return;
                  setSelectedStudentId(null);
                  setDraft(cloneLayout(layout));
                  setShowLayoutSettings(false);
                  setShowArrangeMore(false);
                  setUndoLayout(null);
                }}
                disabled={!layout}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                <BookOpen className="h-4 w-4" />编辑座位
              </button>
            </>
          )}
        </div>
      </header>

      {message && (
        <div className={`flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm ${message.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {message.type === 'error' ? <AlertCircle className="h-4 w-4 shrink-0" /> : <Check className="h-4 w-4 shrink-0" />}
          {message.text}
        </div>
      )}

      {loading || !activeLayout ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-slate-500">
          <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />读取座位表
        </div>
      ) : (
        <div className={`grid min-h-0 flex-1 gap-5 ${editMode ? 'overflow-y-auto xl:grid-cols-[minmax(0,1fr)_320px] xl:overflow-hidden' : 'max-xl:overflow-visible xl:overflow-hidden'}`}>
          <section className="flex min-h-0 min-w-0 flex-col gap-3 max-xl:shrink-0">
            {editMode && (
              <div className="shrink-0 space-y-2 border-b border-slate-200 pb-3 dark:border-zinc-800">
                {mobileArrangeActions}
                {placementStudentId && (
                  <div role="status" className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <span className="mr-auto font-semibold">已选 {studentById.get(placementStudentId)?.name}，点击目标座位</span>
                    <button type="button" onClick={() => setPlacementStudentId(null)} className="min-h-9 rounded-lg px-2 font-bold">取消</button>
                    {seatedStudentIds.has(placementStudentId) && <button type="button" onClick={removePlacementStudent} className="min-h-9 rounded-lg px-2 font-bold text-red-700 dark:text-red-300">移出座位</button>}
                  </div>
                )}
              </div>
            )}

            {renderSeatBoard()}

            <div className="flex shrink-0 flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
              {(Object.keys(statusMeta) as Student['status'][]).map(status => (
                <span key={status} className="inline-flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${statusMeta[status].dot}`} />
                  {statusMeta[status].label} {classStudents.filter(student => student.status === status).length}
                </span>
              ))}
            </div>
          </section>

          {editMode && <aside className="hidden min-w-0 space-y-4 overflow-y-auto xl:block">{quickActions}{unassignedPanel}</aside>}
        </div>
      )}

      {expandedSeats && createPortal(
        <section role="dialog" aria-modal="true" aria-label={`${activeClass.name}座位图放大预览`} className="fixed inset-0 z-[70] flex min-h-0 flex-col bg-white p-[env(safe-area-inset-top)_env(safe-area-inset-right)_env(safe-area-inset-bottom)_env(safe-area-inset-left)] dark:bg-zinc-950">
          <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-slate-200 px-3 dark:border-zinc-800 sm:px-5">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-black text-slate-900 dark:text-slate-100 sm:text-base">{activeClass.name}座位图</h2>
              <p className="text-xs text-slate-500">讲台视角 · {editMode ? '排座草稿，点击座位继续换位' : `已安排 ${activeLayout.seats.length} 人`}</p>
            </div>
            <button type="button" autoFocus onClick={closeExpandedSeats} aria-label="退出放大预览" className="ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-700 dark:text-slate-200">
              <Minimize2 className="h-5 w-5" />
            </button>
          </header>
          {portraitViewport && (
            <p role="status" className="shrink-0 bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">旋转手机以横屏查看完整座位图</p>
          )}
          <div className="min-h-0 flex-1 p-1 sm:p-3">{renderSeatBoard(true)}</div>
        </section>,
        document.body
      )}
      {showClassPicker && <ResponsiveDialog title="选择班级" onClose={() => setShowClassPicker(false)}><div className="grid gap-2">
        {classes.filter(schoolClass => schoolClass.status === 'active').map(schoolClass => {
          const selected = schoolClass.id === effectiveClassId;
          return <button key={schoolClass.id} type="button" onClick={() => {
            if (!editMode || window.confirm('座位修改尚未保存，切换班级将放弃修改。继续切换吗？')) {
              onSelectClass(schoolClass.id);
              setShowClassPicker(false);
            }
          }} className={`flex min-h-12 items-center justify-between rounded-xl border px-4 text-left text-base font-bold ${selected ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-zinc-700'}`}>
            <span>{schoolClass.name}</span>{selected ? <Check className="h-5 w-5" /> : null}
          </button>;
        })}
      </div></ResponsiveDialog>}
      {showPlacement && editMode && <ResponsiveDialog title="选择待安排学生" onClose={() => setShowPlacement(false)}>{unassignedPanel}</ResponsiveDialog>}
      {showLayoutSettings && draft && <ResponsiveDialog title="行列设置" onClose={() => setShowLayoutSettings(false)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">调整座位图的行数和列数。第 1 行靠近讲台；更改会先显示在草稿中，保存座位后才生效。</p>
          {layoutSizeControls}
          {message?.type === 'error' && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message.text}</p>}
        </div>
      </ResponsiveDialog>}
      {showArrangeMore && draft && <ResponsiveDialog title="更多排座操作" onClose={() => setShowArrangeMore(false)}>
        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">自动排列</h3>
            <button type="button" disabled={saving} onClick={autoArrange} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold disabled:opacity-40 dark:border-zinc-700">
              <Sparkles className="h-4 w-4 text-amber-500" />按学号排列
            </button>
            <p className="text-xs text-slate-500">将覆盖当前草稿，执行前会再次确认。</p>
          </section>
          <section className="space-y-2 border-t border-slate-200 pt-4 dark:border-zinc-700">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">交换两行或两列</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <select aria-label="交换行或列" value={swapAxis} onChange={event => { setSwapAxis(event.target.value as 'row' | 'column'); setSwapFrom(0); setSwapTo(1); }} className="min-h-11 rounded-lg border px-2 text-base dark:bg-zinc-900"><option value="column">交换两列</option><option value="row">交换两行</option></select>
              {[swapFrom, swapTo].map((value, index) => <select key={index} aria-label={index === 0 ? '交换起点' : '交换终点'} value={value} onChange={event => (index === 0 ? setSwapFrom : setSwapTo)(Number(event.target.value))} className="min-h-11 rounded-lg border px-2 text-base dark:bg-zinc-900">
                {Array.from({ length: swapAxis === 'row' ? draft.rowCount : draft.columnCount }, (_, i) => <option key={i} value={i}>第 {i + 1} {swapAxis === 'row' ? '行' : '列'}</option>)}
              </select>)}
            </div>
            <button type="button" disabled={saving || swapFrom === swapTo || Math.max(swapFrom, swapTo) >= (swapAxis === 'row' ? draft.rowCount : draft.columnCount)} onClick={() => { swapLines(); setShowArrangeMore(false); }} className="min-h-11 w-full rounded-lg bg-slate-100 px-3 text-sm font-semibold disabled:opacity-40 dark:bg-zinc-800">预览交换</button>
          </section>
        </div>
      </ResponsiveDialog>}
      {selectedStudent && !editMode && createPortal(
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px]"
            onClick={() => setSelectedStudentId(null)}
            aria-label="关闭学生画像"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedStudent.name}的学生画像`}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-2xl sm:max-w-md dark:bg-zinc-900"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-zinc-800">
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-bold text-slate-900 dark:text-slate-100">{selectedStudent.name}</h3>
                    {selectedStudent.committeeRoleIds.map(roleId => committeeRoleById.get(roleId)).filter(Boolean).map(roleName => (
                      <span key={roleName} className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        <Award className="h-3 w-3" />{roleName}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-xs font-mono text-slate-400">{selectedStudent.studentNo} · {selectedStudent.className}</p>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedStudentId(null)} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800" aria-label="关闭">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3 text-xs dark:bg-zinc-800/40">
                <div><span className="text-slate-400">学情状态</span><p className="mt-1"><span className={`inline-flex rounded border px-2 py-1 font-semibold ${statusMeta[selectedStudent.status].badge}`}>{statusMeta[selectedStudent.status].label}</span></p></div>
                <div><span className="text-slate-400">在班状态</span><p className="mt-2 font-semibold text-slate-700 dark:text-slate-200">{selectedStudent.enrollmentStatus === 'active' ? '在班' : selectedStudent.enrollmentStatus === 'suspended' ? '暂缓' : '已离班'}</p></div>
              </div>

              <section>
                <h4 className="mb-2 text-xs font-bold text-slate-500">日常表现</h4>
                <BehaviorTagEditor compact selectedTags={selectedStudent.behaviorTags} onChange={behaviorTags => onUpdateStudent({ ...selectedStudent, behaviorTags })} />
              </section>

              <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-md bg-emerald-50/70 p-3 text-xs dark:bg-emerald-950/20">
                  <h4 className="font-bold text-emerald-800 dark:text-emerald-300">学科优势</h4>
                  <p className="mt-2 text-slate-600 dark:text-slate-300">{selectedStudent.strongKnowledge.join('、') || '暂无记录'}</p>
                </div>
                <div className="rounded-md bg-rose-50/70 p-3 text-xs dark:bg-rose-950/20">
                  <h4 className="font-bold text-rose-800 dark:text-rose-300">学科短板</h4>
                  <p className="mt-2 text-slate-600 dark:text-slate-300">{selectedStudent.weakKnowledge.join('、') || '暂无记录'}</p>
                </div>
              </section>

              <section>
                <h4 className="mb-2 text-xs font-bold text-slate-500">最新课堂观察</h4>
                {selectedStudent.observationHistory[0] ? (
                  <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600 dark:bg-zinc-800/40 dark:text-slate-300">
                    <p>{selectedStudent.observationHistory[0].content}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{selectedStudent.observationHistory[0].date} · {selectedStudent.observationHistory[0].author}</p>
                  </div>
                ) : <p className="text-xs text-slate-400">暂无观察记录</p>}
              </section>

              <section className="space-y-2 border-t border-slate-100 pt-4 dark:border-zinc-800">
                <label htmlFor="classroom-observation" className="text-xs font-bold text-slate-500">新增课堂观察</label>
                <textarea
                  id="classroom-observation"
                  value={observationText}
                  onChange={event => setObservationText(event.target.value)}
                  placeholder="课堂观察"
                  className="h-24 w-full resize-none rounded-md border border-slate-200 p-2.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
                />
                <button
                  type="button"
                  onClick={() => void submitObservation()}
                  disabled={!observationText.trim() || submittingObservation}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submittingObservation && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  保存观察
                </button>
              </section>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => { setSelectedStudentId(null); onManageStudent(selectedStudent.id); }}
                className="rounded-md border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 dark:border-zinc-700 dark:text-slate-200"
              >
                学生管理
              </button>
              <button
                type="button"
                onClick={() => { setSelectedStudentId(null); onViewStudentProfile(selectedStudent.id); }}
                className="rounded-md bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white dark:bg-emerald-700"
              >
                查看完整画像
              </button>
            </div>
          </aside>
        </>,
        document.body
      )}
    </div>
  );
}
