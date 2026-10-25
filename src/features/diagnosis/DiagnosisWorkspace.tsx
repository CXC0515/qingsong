import { GlassButton, GlassSegments  } from '../../components/glass/Glass';
import { WorkspaceToolbar } from '../../components/WorkspaceUI';
import ClassPicker from '../../components/ClassPicker';
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
        <GlassButton type="button" onClick={() => onNavigate('class-mgmt')} variant="primary" containerClassName="mt-5" className="min-h-11 px-5 text-sm font-bold">创建第一个班级</GlassButton>
      </div>
    </section>
  );

  return (
    <div className="space-y-5 animate-fade-in" id="diagnosis-workspace-page">
      <WorkspaceToolbar label="诊断工作区">
        <GlassSegments label="诊断页面" value={activeTab} options={tabs.map(tab=>({value:tab.id,label:<><tab.icon className="w-4 h-4"/>{tab.label}</>}))} onChange={setActiveTab}/>
        <ClassPicker classes={activeClasses} value={selectedClass?.id??''} onChange={onSelectClass} label="诊断班级"/>
      </WorkspaceToolbar>

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

