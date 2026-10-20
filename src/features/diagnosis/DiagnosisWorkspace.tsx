/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { BarChart3, Check, ChevronDown, UserSquare2 } from 'lucide-react';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import { CommitteeRole, SchoolClass, Student, TeacherObservation } from '../../domain/types';
import ClassDiagnosis from './ClassDiagnosis';
import StudentProfile from '../students/StudentProfileV2';

interface DiagnosisWorkspaceProps {
  active: boolean;
  students: Student[];
  classes: SchoolClass[];
  committeeRoles: CommitteeRole[];
  selectedClassId: string;
  selectedStudentId: string;
  onSelectClass: (classId: string) => void;
  onSelectStudent: (studentId: string) => void;
  onOpenClassroomTask: (taskId: string, studentId: string) => void;
  onEditStudent: (studentId: string) => void;
  onAddObservation: (studentId: string, note: TeacherObservation) => Promise<void>;
  onUpdateStudent: (student: Student) => Promise<boolean>;
  onNavigate: (pageId: string, subPageId?: string) => void;
  onShowToast: (message: string) => void;
  requestedTab?: DiagnosisTab | null;
  onRequestedTabHandled?: () => void;
}

export type DiagnosisTab = 'class' | 'student';

const tabs: { id: DiagnosisTab; label: string; icon: React.ElementType }[] = [
  { id: 'class', label: '班级诊断', icon: BarChart3 },
  { id: 'student', label: '学生画像', icon: UserSquare2 }
];

export default function DiagnosisWorkspace({
  active,
  students,
  classes,
  committeeRoles,
  selectedClassId,
  selectedStudentId,
  onSelectClass,
  onSelectStudent,
  onOpenClassroomTask,
  onEditStudent,
  onAddObservation,
  onUpdateStudent,
  onNavigate,
  onShowToast,
  requestedTab,
  onRequestedTabHandled
}: DiagnosisWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<DiagnosisTab>('class');
  const [studentDetailTargetId, setStudentDetailTargetId] = useState<string | null>(null);
  const [showClassPicker, setShowClassPicker] = useState(false);
  const activeClasses = classes.filter(item => item.status === 'active');
  const selectedClass = activeClasses.find(item => item.id === selectedClassId) ?? activeClasses[0];

  useEffect(() => {
    if (!requestedTab) return;
    setActiveTab(requestedTab);
    if (requestedTab === 'student' && selectedStudentId) {
      setStudentDetailTargetId(selectedStudentId);
    }
    onRequestedTabHandled?.();
  }, [onRequestedTabHandled, requestedTab, selectedStudentId]);

  if (!classes.some(item => item.status === 'active')) return (
    <section className="grid min-h-[320px] place-items-center rounded-3xl border border-slate-200 bg-white/80 px-4 py-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70" id="diagnosis-workspace-page">
      <div className="max-w-sm">
        <BarChart3 className="mx-auto h-11 w-11 text-emerald-700" />
        <h2 className="mt-4 text-xl font-black text-slate-900 dark:text-slate-100">还没有可诊断的班级</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">先创建班级并导入学生。完成真实批改后，这里才会展示学情结果。</p>
        <button type="button" onClick={() => onNavigate('class-mgmt')} className="mt-5 min-h-11 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white">创建第一个班级</button>
      </div>
    </section>
  );

  return (
    <div className="space-y-5 animate-fade-in" id="diagnosis-workspace-page">
      <div className="glass-panel grid grid-cols-[minmax(0,1fr)_116px] items-center gap-2 rounded-2xl bg-slate-100/60 p-2 dark:bg-zinc-900/60 sm:flex sm:justify-between">
        <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:flex">{tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition-all sm:px-4 ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 dark:bg-zinc-800 dark:text-slate-50 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}</div>
        <div className="flex min-w-0 items-center gap-2 text-xs font-bold text-slate-400 sm:px-2">
          <span className="hidden sm:inline">当前班级</span>
          <button type="button" onClick={() => setShowClassPicker(true)} className="flex min-h-11 w-full min-w-0 items-center justify-between gap-1 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 sm:hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-100">
            <span className="truncate">{selectedClass?.name}</span><ChevronDown className="h-4 w-4 shrink-0" />
          </button>
          <select value={selectedClass?.id ?? ''} onChange={event => onSelectClass(event.target.value)} className="hidden min-h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-600 sm:block sm:w-auto dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-100">
            {activeClasses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
      </div>

      {showClassPicker && <ResponsiveDialog title="选择班级" onClose={() => setShowClassPicker(false)}><div className="grid gap-2">
        {activeClasses.map(item => {
          const selected = item.id === selectedClass?.id;
          return <button key={item.id} type="button" onClick={() => { onSelectClass(item.id); setShowClassPicker(false); }} className={`flex min-h-12 items-center justify-between rounded-xl border px-4 text-left text-base font-bold ${selected ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-zinc-700'}`}><span>{item.name}</span>{selected ? <Check className="h-5 w-5" /> : null}</button>;
        })}
      </div></ResponsiveDialog>}

      {activeTab === 'class' && (
        <ClassDiagnosis
          students={students}
          classes={classes}
          selectedClassId={selectedClassId}
        />
      )}

      {activeTab === 'student' && (
        <StudentProfile
          active={active}
          students={students}
          committeeRoles={committeeRoles}
          selectedClassId={selectedClassId}
          selectedStudentId={selectedStudentId}
          onSelectStudent={onSelectStudent}
          onOpenClassroomTask={onOpenClassroomTask}
          onEditStudent={onEditStudent}
          onAddObservation={onAddObservation}
          onUpdateStudent={onUpdateStudent}
          onShowToast={onShowToast}
          targetStudentId={studentDetailTargetId}
          onTargetStudentHandled={() => setStudentDetailTargetId(null)}
        />
      )}
    </div>
  );
}

