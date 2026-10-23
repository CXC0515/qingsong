/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import AppLayout from './app/AppLayout';
import { createNavGroups, PageId } from './app/navigation';

// Import Types and Mock Data
import {
  Student, SchoolClass, WorkbenchTask, ScheduleItem, SchedulePeriod,
  TimerReminder, ReviewItem, WorkflowState, TeacherObservation, RosterStudent, KnowledgeNode, CommitteeRole, CommitteeAssignment, TeacherProfile, ClassroomLayout, KnowledgeGraphSnapshot
} from './domain/types';
import { createEmptyWorkflowState } from './domain/gradingTask';
import { deleteGradingTask, listGradingTasks, saveGradingTask } from './services/gradingTaskApi';
import {
  createRosterClass,
  createRosterCommitteeRole,
  createRosterStudent,
  deleteRosterStudent,
  deleteRosterCommitteeRole,
  getRoster,
  importRosterStudents,
  previewRosterStudentsImport,
  saveClassCommitteeAssignments,
  toggleRosterClassArchive,
  updateRosterClass, updateRosterCommitteeRole,
  updateRosterStudent
} from './services/rosterApi';

// Import Custom Sub-Components
import Workbench from './features/workbench/Workbench';
import ClassroomTasksWorkspace from './features/classroom-tasks/ClassroomTasksWorkspace';
import VirtualClassroom from './features/classroom/VirtualClassroom';
import ClassManagement from './features/classes/ClassManagement';
import StudentManagement from './features/students/StudentManagement';
import ScheduleReminder from './features/schedule/ScheduleReminder';
import SystemSettings from './features/settings/SystemSettingsPanel';
import AdminConsole from './features/admin/AdminConsole';
import KnowledgeLibrary from './features/knowledge/KnowledgeLibrary';
import MaterialPool from './features/knowledge/MaterialPool';
import { getKnowledgeGraph } from './services/resourceApi';
import { getScheduleWorkspace, removeReminder, removeScheduleItem, saveReminder, saveReminderBatch, saveReminderSeries, saveScheduleBatch, saveScheduleItem, saveSchedulePeriods } from './services/scheduleApi';
import TagManagement from './features/tags/TagManagement';
import LessonPlanWorkspace from './features/lesson-plan/LessonPlanWorkspace';
import GradingWorkspace from './features/grading/GradingWorkspace';
import DiagnosisWorkspace, { DiagnosisTab } from './features/diagnosis/DiagnosisWorkspace';
import { useAuth } from './features/auth/AuthGate';
import { apiFetch } from './services/apiClient';

const describeRosterError = (error: unknown) => {
  const code = error instanceof Error ? error.message : '未知错误';
  if (code === 'DUPLICATE_STUDENT_NO') return '该班级中已存在相同学号';
  if (code === 'DUPLICATE_CLASS') return '同一学期已存在同名班级';
  if (code === 'CLASS_NOT_FOUND') return '目标班级不存在';
  return code;
};

const getLocalDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createInitialWorkflowState = (task: WorkbenchTask) => {
  return createEmptyWorkflowState(task);
};

type TaskSourcePage = 'workbench' | 'classroom' | 'diagnosis-workspace';
interface TaskNavigationContext {
  sourcePage: TaskSourcePage;
  classId: string;
  studentId: string;
  scrollTop: number;
}
const readTaskRoute = () => {
  const url = new URL(window.location.href);
  return url.pathname === '/' && url.searchParams.get('page') === 'classroom-tasks'
    ? { taskId: url.searchParams.get('taskId') || undefined }
    : null;
};

type LessonRoute = { scheduleItemId:string; classId:string; date:string };
const readLessonRoute = (userId:string):LessonRoute|null => {
  const query=new URLSearchParams(window.location.search);
  const scheduleItemId=query.get('lesson'),classId=query.get('lessonClass'),date=query.get('lessonDate');
  return query.get('page')==='classroom-tasks'&&query.get('lessonTeacher')===userId&&scheduleItemId&&classId&&date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?{scheduleItemId,classId,date}:null;
};

export default function App() {
  const authState = useAuth();
  const [adminRoute, setAdminRoute] = useState(() => window.location.pathname.startsWith('/admin'));
  const teacherReturnPage = useRef<PageId>('workbench');
  // Navigation & View State
  const [activePage, setActivePageState] = useState<PageId>(() => readTaskRoute() ? 'classroom-tasks' : 'workbench');
  const [lessonRoute,setLessonRoute]=useState<LessonRoute|null>(()=>readLessonRoute(authState.user.id));
  const [classroomHeaderTarget,setClassroomHeaderTarget]=useState<HTMLDivElement|null>(null);
  const [classroomTaskId, setClassroomTaskId] = useState<string | undefined>(() => readTaskRoute()?.taskId);
  const [classroomTaskStudentId, setClassroomTaskStudentId] = useState<string | undefined>();
  const [taskNavigation, setTaskNavigation] = useState<TaskNavigationContext | null>(null);
  const lastTeacherUrl = useRef(window.location.href);
  const taskSourceFocus = useRef<HTMLElement | null>(null);
  const [libraryResourceRequest, setLibraryResourceRequest] = useState<{ id: string; sequence: number } | null>(null);
  const [scheduleSection, setScheduleSection] = useState<'schedule' | 'reminders'>('schedule');
  const [scheduleToolsRequest, setScheduleToolsRequest] = useState(0);
  const [selectedClassId, setSelectedClassId] = useState<string>(()=>readLessonRoute(authState.user.id)?.classId??'');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [studentManagementTargetId, setStudentManagementTargetId] = useState<string | null>(null);
  const [diagnosisRequestedTab, setDiagnosisRequestedTab] = useState<DiagnosisTab | null>(null);
  const [lowConfidenceThreshold, setLowConfidenceThreshold] = useState<number>(0.75);
  const [ocrHumanReviewThreshold, setOcrHumanReviewThreshold] = useState<number>(0.70);
  const [ocrAutoPassThreshold, setOcrAutoPassThreshold] = useState<number>(0.90);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    teaching: true,
    homeSchool: true,
    career: false,
    library: true
  });

  // Class and student state is hydrated from the authoritative roster service.
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [committeeRoles, setCommitteeRoles] = useState<CommitteeRole[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<WorkbenchTask[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const classroomLayoutCache = useRef(new Map<string, ClassroomLayout>());
  const [reminders, setReminders] = useState<TimerReminder[]>([]);
  const [schedulePeriods, setSchedulePeriods] = useState<SchedulePeriod[]>([]);
  const [showWeekends, setShowWeekends] = useState(() => localStorage.getItem(`schedule-show-weekends:${authState.user.id}`) === 'true');
  const [settingsRequestedSection, setSettingsRequestedSection] = useState<'schedule-periods' | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [workflowStates, setWorkflowStates] = useState<Record<string, WorkflowState>>({});
  const [knowledgeNodes, setKnowledgeNodes] = useState<KnowledgeNode[]>([]);
  const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeGraphSnapshot | null>(null);
  const knowledgeGraphCacheRef = useRef<KnowledgeGraphSnapshot | null>(null);
  const knowledgeGraphRequestRef = useRef<Promise<KnowledgeGraphSnapshot> | null>(null);
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile>(authState.profile);

  const canLeaveTask = () => activePage !== 'classroom-tasks'
    || window.dispatchEvent(new Event('classroom-task-before-leave', { cancelable: true }));

  const signOut = () => {
    if (!canLeaveTask()) return;
    try {
      sessionStorage.removeItem('qingsong:classroom-pending:' + authState.user.id);
      sessionStorage.removeItem('qingsong:quick-pending:' + authState.user.id);
      sessionStorage.removeItem('qingsong:behavior-pending:' + authState.user.id);
    } catch {
      // Storage can be unavailable; server-confirmed records remain saved.
    }
    void authState.signOut();
  };

  const writeTaskUrl = (taskId?: string, replace = false) => {
    const url = new URL(window.location.href);
    if (url.pathname !== '/') return;
    url.searchParams.set('page', 'classroom-tasks');
    if (taskId) url.searchParams.set('taskId', taskId);
    else url.searchParams.delete('taskId');
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
    lastTeacherUrl.current = url.href;
  };

  const clearLessonRoute = () => {
    setLessonRoute(null);
    const url=new URL(window.location.href);
    for(const name of ['lesson','lessonClass','lessonDate','lessonTeacher'])url.searchParams.delete(name);
    window.history.replaceState({},'',url);lastTeacherUrl.current=url.href;
  };
  const selectRecordingClass=(id:string)=>{
    if(!canLeaveTask())return;
    if(lessonRoute&&id!==lessonRoute.classId)clearLessonRoute();
    setSelectedClassId(id);
  };

  const setActivePage = (pageId: PageId) => {
    if (pageId === activePage || !canLeaveTask()) return;
    clearLessonRoute();
    if (pageId === 'classroom-tasks') {
      setTaskNavigation(null);
      setClassroomTaskId(undefined);
      setClassroomTaskStudentId(undefined);
      writeTaskUrl();
    } else if (window.location.pathname === '/') {
      const url = new URL(window.location.href);
      url.searchParams.delete('page');
      url.searchParams.delete('taskId');
      window.history.replaceState({}, '', url);
      lastTeacherUrl.current = url.href;
      setTaskNavigation(null);
    }
    setActivePageState(pageId);
  };

  const openClassroomTask = (taskId?: string, classId = selectedClassId, studentId = '') => {
    if (!canLeaveTask()) return;
    if (activePage !== 'classroom-tasks') {
      taskSourceFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const sourcePage = activePage === 'workbench' || activePage === 'classroom' || activePage === 'diagnosis-workspace' ? activePage : null;
      setTaskNavigation(sourcePage ? { sourcePage, classId: selectedClassId, studentId: selectedStudentId, scrollTop: document.querySelector<HTMLElement>('.app-shell-main')?.scrollTop ?? 0 } : null);
    }
    if (taskId===undefined) clearLessonRoute();
    if (classId) setSelectedClassId(classId);
    if (studentId) setSelectedStudentId(studentId);
    if (activePage !== 'classroom-tasks') setClassroomTaskStudentId(studentId || undefined);
    setClassroomTaskId(taskId);
    writeTaskUrl(taskId);
    setActivePageState('classroom-tasks');
  };

  const openLessonRecord = (item:ScheduleItem,date:string) => {
    if(!canLeaveTask()||!item.classId||item.type!=='class')return;
    openClassroomTask(undefined,item.classId);
    const route={scheduleItemId:item.id,classId:item.classId,date};setLessonRoute(route);
    const url=new URL(window.location.href);url.searchParams.set('lesson',item.id);url.searchParams.set('lessonClass',item.classId);url.searchParams.set('lessonDate',date);url.searchParams.set('lessonTeacher',authState.user.id);
    window.history.replaceState({},'',url);lastTeacherUrl.current=url.href;
  };

  const returnFromClassroomTask = () => {
    if (!canLeaveTask()) return;
    if (!taskNavigation) {
      setClassroomTaskId(undefined);
      writeTaskUrl(undefined, true);
      return;
    }
    setSelectedClassId(taskNavigation.classId);
    setSelectedStudentId(taskNavigation.studentId);
    const url = new URL(window.location.href);
    url.searchParams.delete('page');
    url.searchParams.delete('taskId');
    window.history.replaceState({}, '', url);
    lastTeacherUrl.current = url.href;
    setActivePageState(taskNavigation.sourcePage);
    const scrollTop = taskNavigation.scrollTop;
    requestAnimationFrame(() => {
      const main = document.querySelector<HTMLElement>('.app-shell-main');
      if (main) main.scrollTop = scrollTop;
      taskSourceFocus.current?.focus({ preventScroll: true });
    });
  };

  useEffect(() => {
    const syncRoute = () => {
      if (activePage === 'classroom-tasks' && !window.dispatchEvent(new Event('classroom-task-before-leave', { cancelable: true }))) {
        window.history.pushState({}, '', lastTeacherUrl.current);
        return;
      }
      setAdminRoute(window.location.pathname.startsWith('/admin'));
      if (window.location.pathname.startsWith('/admin')) return;
      const route = readTaskRoute();
      const lesson=readLessonRoute(authState.user.id);setLessonRoute(lesson);if(lesson)setSelectedClassId(lesson.classId);
      setClassroomTaskId(route?.taskId);
      setActivePageState(route ? 'classroom-tasks' : taskNavigation?.sourcePage ?? 'workbench');
      if (!route && taskNavigation) {
        setSelectedClassId(taskNavigation.classId);
        setSelectedStudentId(taskNavigation.studentId);
        requestAnimationFrame(() => {
          const main = document.querySelector<HTMLElement>('.app-shell-main');
          if (main) main.scrollTop = taskNavigation.scrollTop;
          taskSourceFocus.current?.focus({ preventScroll: true });
        });
      }
      lastTeacherUrl.current = window.location.href;
    };
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, [activePage, taskNavigation]);

  const enterAdmin = () => {
    if (authState.role !== 'owner' || !canLeaveTask()) return;
    teacherReturnPage.current = activePage;
    window.history.pushState({}, '', '/admin/accounts');
    setAdminRoute(true);
  };

  const returnToTeacher = () => {
    window.history.replaceState({}, '', '/');
    if (teacherReturnPage.current === 'classroom-tasks') writeTaskUrl(classroomTaskId, true);
    setActivePageState(teacherReturnPage.current);
    setAdminRoute(false);
  };

  const loadKnowledgeCatalog = useCallback(async (force = false) => {
    if (!force && knowledgeGraphCacheRef.current) return knowledgeGraphCacheRef.current;
    knowledgeGraphRequestRef.current ??= getKnowledgeGraph().finally(() => {
      knowledgeGraphRequestRef.current = null;
    });
    const graph = await knowledgeGraphRequestRef.current;
    knowledgeGraphCacheRef.current = graph;
    setKnowledgeGraph(graph);
    setKnowledgeNodes(graph.nodes
      .filter(node => node.type === 'knowledge' || node.type === 'ability')
      .map(node => ({
        id: node.id,
        name: node.name,
        type: node.type === 'ability' ? 'capability' : 'knowledge',
        typeName: node.type === 'ability' ? '能力点' : '知识点',
        desc: node.description,
        weight: 3
      })));
    return graph;
  }, []);

  // Toast notifications state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  const loadRoster = async () => {
    setRosterLoading(true);
    setRosterError(null);
    try {
      const snapshot = await getRoster();
      setClasses(snapshot.classes);
      setStudents(snapshot.students);
      setCommitteeRoles(snapshot.committeeRoles);
      const route=readLessonRoute(authState.user.id);
      const preferredClass = snapshot.classes.find(item => item.status === 'active'&&item.id===route?.classId)??snapshot.classes.find(item=>item.status==='active');
      if (preferredClass) setSelectedClassId(preferredClass.id);
      if (snapshot.students.length) setSelectedStudentId(snapshot.students[0].id);
    } catch (error) {
      setRosterError(error instanceof Error ? error.message : 'ROSTER_LOAD_FAILED');
    } finally {
      setRosterLoading(false);
    }
  };

  useEffect(() => {
    void loadRoster();
    void loadKnowledgeCatalog().catch(() => undefined);
    void listGradingTasks().then(loadedTasks => {
      setTasks(loadedTasks);
      setWorkflowStates(Object.fromEntries(loadedTasks.map(task => [task.id, createInitialWorkflowState(task)])));
    }).catch(() => undefined);
    void getScheduleWorkspace().then(workspace => {
      setSchedule(workspace.schedule);
      setReminders(workspace.reminders);
      setSchedulePeriods(workspace.periods);
    }).catch(() => undefined);
  }, [loadKnowledgeCatalog]);

  // Trigger Toast helper
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 4000);
  };

  // State Handlers
  // 1. Task Completed toggle in Workbench
  const handleToggleTask = (taskId: string) => {
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' } : t));
    triggerToast('任务状态更新成功！');
  };

  // 2. Schedule Item edit/addition
  const handleAddScheduleItem = async (item: ScheduleItem) => {
    const saved = await saveScheduleItem(item);
    setSchedule(current => [...current.filter(existing => existing.id !== saved.id), saved]);
    triggerToast('课表已保存');
  };

  const handleUpdateScheduleItem = async (updated: ScheduleItem) => {
    const saved = await saveScheduleItem(updated);
    setSchedule(current => current.map(item => item.id === saved.id ? saved : item));
    triggerToast('课表已更新');
  };

  const handleDeleteScheduleItem = async (itemId: string) => {
    await removeScheduleItem(itemId);
    setSchedule(current => current.filter(item => item.id !== itemId));
    triggerToast('课程已删除');
  };

  // 3. Reminders list toggles
  const handleAddReminder = async (reminder: TimerReminder, scope: 'single' | 'future' = 'single') => {
    const saved = scope === 'future' ? await saveReminderSeries(reminder) : [await saveReminder(reminder)];
    const workspace = await getScheduleWorkspace();
    setReminders(workspace.reminders);
    triggerToast(scope === 'future' ? `已更新“${reminder.name}”及后续日程` : `日程“${saved[0].name}”已保存`);
  };

  const handleAddReminderBatch = async (items: TimerReminder[]) => {
    const saved = await saveReminderBatch(items);
    setReminders(current => [...current.filter(item => !saved.some(next => next.id === item.id)), ...saved]);
    triggerToast(`已批量新建 ${saved.length} 条日程`);
  };

  const handleUpdateReminderBatch = async (items: TimerReminder[]) => {
    const saved = await saveReminderBatch(items);
    const workspace = await getScheduleWorkspace();
    setReminders(workspace.reminders);
    triggerToast(`已更新 ${saved.length} 条日程`);
  };

  const handleToggleReminderStatus = async (reminderId: string) => {
    const current = reminders.find(item => item.id === reminderId);
    if (!current) return;
    await saveReminder({ ...current, status: current.status === 'completed' ? 'active' : current.status === 'inactive' ? 'active' : 'completed' });
    const workspace = await getScheduleWorkspace();
    setReminders(workspace.reminders);
    triggerToast(current.status === 'active' ? '日程已完成' : '日程已恢复');
  };

  const handleDeleteReminder = async (reminderId: string) => {
    await removeReminder(reminderId);
    setReminders(current => current.filter(item => item.id !== reminderId));
    triggerToast('日程已删除');
  };

  // 4. Class actions
  const handleAddClass = async (newClass: Omit<SchoolClass, 'id' | 'studentCount'>) => {
    try {
      const created = await createRosterClass(newClass);
      setClasses(current => [...current, created]);
      setSelectedClassId(created.id);
      triggerToast(`成功新建了班级 [${created.name}]！`);
      return true;
    } catch (error) {
      triggerToast(`班级创建失败：${error instanceof Error ? error.message : '未知错误'}`);
      return false;
    }
  };

  const handleUpdateClass = async (updated: SchoolClass) => {
    try {
      await updateRosterClass(updated);
      const snapshot = await getRoster();
      setClasses(snapshot.classes);
      setStudents(snapshot.students);
      triggerToast('班级基础信息已成功更新！');
      return true;
    } catch (error) {
      triggerToast(`班级保存失败：${error instanceof Error ? error.message : '未知错误'}`);
      return false;
    }
  };

  const handleArchiveClass = async (classId: string) => {
    try {
      const saved = await toggleRosterClassArchive(classId);
      setClasses(current => current.map(item => item.id === saved.id ? saved : item));
      if (saved.status === 'archived' && selectedClassId === saved.id) {
        const fallback = classes.find(item => item.id !== saved.id && item.status === 'active');
        setSelectedClassId(fallback?.id ?? '');
      }
      triggerToast(saved.status === 'archived' ? '该班级已归档。' : '该班级已取消归档。');
    } catch (error) {
      triggerToast(`班级状态更新失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 5. Student actions
  const handleAddStudent = async (newStudent: Student) => {
    try {
      const created = await createRosterStudent(newStudent);
      setStudents(current => [created, ...current]);
      setClasses(current => current.map(item => item.id === created.classId
        ? {
            ...item,
            studentCount: item.studentCount + 1
          }
        : item));
      setSelectedStudentId(created.id);
      triggerToast(`已成功新建 [${created.name}] 的学生档案。`);
      return true;
    } catch (error) {
      triggerToast(`学生保存失败：${describeRosterError(error)}`);
      return false;
    }
  };

  const handleUpdateStudent = async (updated: Student) => {
    try {
      await updateRosterStudent(updated);
      const snapshot = await getRoster();
      setClasses(snapshot.classes);
      setStudents(snapshot.students);
      triggerToast(`学生 [${updated.name}] 的档案资料修改保存成功！`);
      return true;
    } catch (error) {
      triggerToast(`学生保存失败：${describeRosterError(error)}`);
      return false;
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    try {
      await deleteRosterStudent(studentId);
      const snapshot = await getRoster();
      setClasses(snapshot.classes);
      setStudents(snapshot.students);
      triggerToast('学生已从当前班级名册移出。');
    } catch (error) {
      triggerToast(`学生移出失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleBulkImport = async (classId: string, grid: Parameters<typeof importRosterStudents>[1]) => {
    try {
      const result = await importRosterStudents(classId, grid);
      const snapshot = await getRoster();
      setClasses(snapshot.classes);
      setStudents(snapshot.students);
      if (snapshot.classes.some(item => item.id === classId && item.status === 'active')) setSelectedClassId(classId);
      return result;
    } catch (error) {
      try {
        const snapshot = await getRoster();
        setClasses(snapshot.classes);
        setStudents(snapshot.students);
      } catch {
        // Preserve the import error. The dialog explains that the result must be checked before retrying.
      }
      throw error;
    }
  };

  const handleBulkMoveClass = async (studentIds: string[], targetClassId: string) => {
    const targetClass = classes.find(c => c.id === targetClassId);
    if (!targetClass) return;
    try {
      const selected = students.filter(item => studentIds.includes(item.id));
      await Promise.all(selected.map(student => updateRosterStudent({
        ...student,
        classId: targetClassId,
        className: targetClass.name,
        committeeRoleIds: []
      })));
      const snapshot = await getRoster();
      setClasses(snapshot.classes);
      setStudents(snapshot.students);
      triggerToast(`成功将选中的 ${studentIds.length} 名学生批量调入到 [${targetClass.name}]！`);
    } catch (error) {
      triggerToast(`批量调班失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleSaveCommitteeAssignments = async (classId: string, assignments: Omit<CommitteeAssignment, 'classId'>[]) => {
    const saved = await saveClassCommitteeAssignments(classId, assignments);
    const savedById = new Map(saved.map(item => [item.id, item]));
    setStudents(current => current.map(item => savedById.get(item.id) ?? item));
    triggerToast('班委任职已保存');
  };

  const handleCreateCommitteeRole = async (name: string) => {
    const role = await createRosterCommitteeRole(name);
    setCommitteeRoles(current => [...current, role]);
    triggerToast(`已添加班委职位“${role.name}”`);
  };

  const handleUpdateCommitteeRole = async (roleId: string, name: string) => {
    const role = await updateRosterCommitteeRole(roleId, name);
    setCommitteeRoles(current => current.map(item => item.id === role.id ? role : item));
    triggerToast('班委职位已更新');
  };

  const handleDeleteCommitteeRole = async (roleId: string) => {
    await deleteRosterCommitteeRole(roleId);
    setCommitteeRoles(current => current.filter(item => item.id !== roleId));
    triggerToast('班委职位已删除');
  };

  const handleBulkAddTags = async (studentIds: string[], newTags: string[]) => {
    try {
      const selected = students.filter(item => studentIds.includes(item.id));
      const saved = await Promise.all(selected.map(student => updateRosterStudent({
        ...student,
        behaviorTags: Array.from(new Set([...student.behaviorTags, ...newTags]))
      })));
      const savedById = new Map(saved.map(item => [item.id, item]));
      setStudents(current => current.map(item => savedById.get(item.id) ?? item));
      triggerToast(`成功为 ${studentIds.length} 名学生批量添加了标签：${newTags.join(', ')}`);
    } catch (error) {
      triggerToast(`批量标签保存失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 6. Observation Note addition
  const persistObservation = async (studentId: string, note: TeacherObservation) => {
    const student = students.find(item => item.id === studentId);
    if (!student) throw new Error('STUDENT_NOT_FOUND');
    const saved = await updateRosterStudent({
      ...student,
      observationHistory: [note, ...student.observationHistory]
    });
    setStudents(current => current.map(item => item.id === studentId ? saved : item));
  };

  const handleAddObservation = async (studentId: string, note: TeacherObservation) => {
    await persistObservation(studentId,{...note,date:getLocalDate(),author:teacherProfile.nickname||teacherProfile.realName||authState.user.email});
  };

  // 7. Review Queue Actions
  const handleConfirmReview = (reviewId: string, finalScore: number, changeReason: string) => {
    setReviewQueue(reviewQueue.map(r => {
      if (r.id === reviewId) {
        return {
          ...r,
          status: 'completed' as any,
          teacherFinalScore: finalScore,
          discrepancyReason: changeReason
        };
      }
      return r;
    }));
  };

  const handleBounceToOcr = (reviewId: string) => {
    setReviewQueue(reviewQueue.filter(r => r.id !== reviewId));
    // Bounce simulation
  };

  const handleMarkAsSample = (studentName: string) => {
    // Simulated logic: add a behavior tag or status for demonstration
    setStudents(students.map(s => {
      if (s.name === studentName) {
        return {
          ...s,
          behaviorTags: Array.from(new Set([...s.behaviorTags, '优秀讲评样例']))
        };
      }
      return s;
    }));
  };

  // Sync Profiles action from Grading step 10
  const handleSyncToProfiles = (aiResults: WorkflowState['aiResults']) => {
    // Simulate updating students' recent scores & diagnostic status
    setStudents(students.map(s => {
      const match = aiResults.find(r => r.studentName === s.name);
      if (match) {
        const updatedScores = [...s.recentHomeworkTrend.slice(1), match.score];
        const updatedStatus = match.score < 80 ? ('warning' as const) : (match.score >= 90 ? ('outstanding' as const) : ('good' as const));
        return {
          ...s,
          recentHomeworkTrend: updatedScores,
          status: updatedStatus,
          behaviorTags: Array.from(new Set([...s.behaviorTags, match.score >= 90 ? '现代文拔尖' : '标题考点需精进']))
        };
      }
      return s;
    }));
  };

  // Page Routing Navigation
  const handleNavigate = (pageId: string, subPageId?: string) => {
    if (pageId === 'grading-flow' || pageId === 'grading-tasks' || pageId === 'review-queue') {
      setActivePage('grading-workspace');
      return;
    }
    if (pageId === 'diagnosis' || pageId === 'profile') {
      if (subPageId === 'profile' || pageId === 'profile') {
        const riskStudent = students.find(s => s.status === 'risk');
        if (riskStudent) {
          setSelectedStudentId(riskStudent.id);
        }
      }
      setActivePage('diagnosis-workspace');
      return;
    }
    if (pageId === 'library' && subPageId === 'editor') {
      setActivePage('library-editor');
      return;
    }
    if (pageId === 'library' && subPageId === 'graph') {
      setActivePage('knowledge-graph');
      return;
    }
    setActivePage(pageId as PageId);
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  if (adminRoute) {
    if (authState.role !== 'owner' || window.location.pathname !== '/admin/accounts') {
      return <main className="grid min-h-dvh place-items-center bg-slate-50 px-4 text-center"><div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6"><h1 className="text-xl font-black">{authState.role === 'owner' ? '管理页面不存在' : '无权访问管理后台'}</h1><p className="mt-2 text-sm text-slate-500">{authState.role === 'owner' ? '请从教师工作台重新进入管理后台。' : '此页面仅供管理员使用，你的工作区数据没有改变。'}</p><button type="button" onClick={returnToTeacher} className="mt-5 min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white">返回教师工作台</button></div></main>;
    }
    return <AdminConsole accountEmail={authState.user.email} onReturn={returnToTeacher} onSignOut={signOut} />;
  }

  if (rosterLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-500">
        正在加载班级与学生名册...
      </div>
    );
  }

  if (rosterError) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-3 text-slate-600">
        <p className="text-sm font-semibold">名册服务暂时不可用（{rosterError}）</p>
        <button
          type="button"
          onClick={() => void loadRoster()}
          className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold"
        >
          重新连接
        </button>
      </div>
    );
  }

  const selectedClass = classes.find(c => c.id === selectedClassId && c.status === 'active')
    ?? classes.find(c => c.status === 'active')
    ?? classes[0];
  const pendingReviewCount = reviewQueue.filter(r => r.status === 'pending').length
    + Object.keys(workflowStates).flatMap(taskId => workflowStates[taskId].questionGradingStates ?? []).flatMap(state => state.calibrationSamples).filter(sample => sample.status !== 'confirmed' && ((sample.reviewTriggers ?? []).some(trigger => trigger === 'answer-missing' || trigger === 'rubric-insufficient') || sample.aiScore === null || (!sample.ocrText.trim() && !sample.lunaReviewText?.trim()))).length;
  const activeGradingTaskCount = tasks.filter(task => task.status !== 'completed').length;
  const navGroups = createNavGroups(activeGradingTaskCount);

  return (
    <AppLayout
      headerContextRef={setClassroomHeaderTarget}
      activePage={activePage}
      classes={classes}
      expandedGroups={expandedGroups}
      navGroups={navGroups}
      pendingReviewCount={pendingReviewCount}
      selectedClass={selectedClass}
      selectedClassId={selectedClassId}
      showToast={showToast}
      toastMessage={toastMessage}
      teacherProfile={teacherProfile}
      accountEmail={authState.user.email}
      scheduleSection={scheduleSection}
      isOwner={authState.role === 'owner'}
      onEnterAdmin={enterAdmin}
      onSignOut={signOut}
      onSelectClass={selectRecordingClass}
      onSelectPage={setActivePage}
      onSelectScheduleSection={setScheduleSection}
      onOpenScheduleTools={() => setScheduleToolsRequest((request) => request + 1)}
      onToggleGroup={toggleGroup}
    >
      {/* Page Router */}
          {activePage === 'classroom-tasks' && (
            <ClassroomTasksWorkspace
              students={students}
              classes={classes}
              initialClassId={selectedClassId}
              scheduleItemId={lessonRoute?.scheduleItemId}
              lessonDate={lessonRoute?.date}
              headerContextTarget={classroomHeaderTarget}
              lessonLabel={(()=>{const lesson=schedule.find(s=>s.id===lessonRoute?.scheduleItemId);return lesson?'第'+lesson.period+'节 · '+lesson.title:undefined;})()}
              onClearLesson={clearLessonRoute}
              onSelectClass={selectRecordingClass}
              initialTaskId={classroomTaskId}
              initialStudentId={classroomTaskStudentId}
              identityKey={authState.user.id}
              onOpenTask={taskId => openClassroomTask(taskId)}
              onBack={returnFromClassroomTask}
              onNavigate={handleNavigate}
            />
          )}
          {(activePage === 'workbench' || (activePage === 'classroom-tasks' && taskNavigation?.sourcePage === 'workbench')) && (
            <div className={activePage === 'workbench' ? 'contents' : 'hidden'} aria-hidden={activePage !== 'workbench'}>
            <Workbench
              active={activePage === 'workbench'}
              tasks={tasks}
              classes={classes}
              students={students}
              schedule={schedule}
              reminders={reminders}
              selectedClassId={selectedClassId}
              onNavigate={handleNavigate}
              onRecordLesson={openLessonRecord}
              onOpenClassroomTask={(taskId, classId) => openClassroomTask(taskId, classId)}
              onEnterClass={(classId) => {
                setSelectedClassId(classId);
                handleNavigate('classroom');
              }}
              onSelectTask={(taskId) => {
                handleToggleTask(taskId);
              }}
              onTriggerTask={(task) => {
                handleNavigate('grading-workspace');
              }}
            />
            </div>
          )}

          {activePage === 'lesson-plan' && (
            <LessonPlanWorkspace onShowToast={triggerToast} />
          )}

          {(activePage === 'classroom' || (activePage === 'classroom-tasks' && taskNavigation?.sourcePage === 'classroom')) && (
            <div className={activePage === 'classroom' ? 'contents' : 'hidden'} aria-hidden={activePage !== 'classroom'}>
            <VirtualClassroom
              students={students}
              classes={classes}
              committeeRoles={committeeRoles}
              layoutCache={classroomLayoutCache}
              selectedClassId={selectedClassId}
              onSelectClass={setSelectedClassId}
              onOpenClassroomTasks={classId => openClassroomTask(undefined, classId)}
              onCreateClass={() => setActivePage('class-mgmt')}
              onManageStudent={(studentId) => {
                setSelectedStudentId(studentId);
                setStudentManagementTargetId(studentId);
                setActivePage('student-mgmt');
              }}
              onViewStudentProfile={(studentId) => {
                setSelectedStudentId(studentId);
                setDiagnosisRequestedTab('student');
                setActivePage('diagnosis-workspace');
              }}
              onAddObservation={(studentId, text) => {
                return persistObservation(studentId, {
                  date: getLocalDate(),
                  type: 'neutral',
                  category: 'behavior',
                  content: text,
                  author: teacherProfile.nickname||teacherProfile.realName||authState.user.email
                });
              }}
              onUpdateStudent={handleUpdateStudent}
            />
            </div>
          )}

          {activePage === 'class-mgmt' && (
            <ClassManagement
              classes={classes}
              students={students}
              committeeRoles={committeeRoles}
              onAddClass={handleAddClass}
              onUpdateClass={handleUpdateClass}
              onArchiveClass={handleArchiveClass}
              onSaveCommitteeAssignments={handleSaveCommitteeAssignments}
              onEnterClassroom={(classId) => {
                setSelectedClassId(classId);
                handleNavigate('classroom');
              }}
            />
          )}

          {activePage === 'student-mgmt' && (
            <StudentManagement
              students={students}
              classes={classes}
              committeeRoles={committeeRoles}
              onAddStudent={handleAddStudent}
              onUpdateStudent={handleUpdateStudent}
              onDeleteStudent={handleDeleteStudent}
              onBulkImport={handleBulkImport}
              onPreviewBulkImport={previewRosterStudentsImport}
              onBulkMoveClass={handleBulkMoveClass}
              onBulkAddTags={handleBulkAddTags}
              onViewStudentProfile={(studentId) => {
                const student = students.find(item => item.id === studentId);
                if (student) setSelectedClassId(student.classId);
                setSelectedStudentId(studentId);
                setDiagnosisRequestedTab('student');
                setActivePage('diagnosis-workspace');
              }}
              targetStudentId={studentManagementTargetId}
              onTargetStudentHandled={() => setStudentManagementTargetId(null)}
            />
          )}

          {activePage === 'schedule' && (
            <ScheduleReminder
              schedule={schedule}
              reminders={reminders}
              classes={classes}
              selectedClassId={selectedClassId}
              section={scheduleSection}
              onSectionChange={setScheduleSection}
              toolsRequest={scheduleToolsRequest}
              onSelectClass={setSelectedClassId}
              periods={schedulePeriods}
              showWeekends={showWeekends}
              onOpenPeriodSettings={() => {
                setSettingsRequestedSection('schedule-periods');
                setActivePage('settings');
              }}
              onAddScheduleItem={handleAddScheduleItem}
              onUpdateScheduleItem={handleUpdateScheduleItem}
              onDeleteScheduleItem={handleDeleteScheduleItem}
              onImportSchedule={async items => {
                const saved = await saveScheduleBatch(items);
                setSchedule(current => [...current.filter(item => !saved.some(next => next.id === item.id)), ...saved]);
                triggerToast(`已导入 ${saved.length} 项课程`);
              }}
              onAddReminder={handleAddReminder}
              onAddReminderBatch={handleAddReminderBatch}
              onUpdateReminderBatch={handleUpdateReminderBatch}
              onToggleReminderStatus={handleToggleReminderStatus}
              onDeleteReminder={handleDeleteReminder}
            />
          )}

          {activePage === 'grading-workspace' && (
            <GradingWorkspace
              tasks={tasks}
              classes={classes}
              defaultClassId={selectedClassId}
              workflowStates={workflowStates}
              knowledgeNodes={knowledgeNodes}
              reviewQueue={reviewQueue}
              lowConfidenceThreshold={lowConfidenceThreshold}
              ocrHumanReviewThreshold={ocrHumanReviewThreshold}
              ocrAutoPassThreshold={ocrAutoPassThreshold}
              onCreateTask={(task) => {
                setTasks(current => [task, ...current]);
                setWorkflowStates(current => ({ ...current, [task.id]: createEmptyWorkflowState(task) }));
                void saveGradingTask(task).catch(() => triggerToast('任务保存失败，请稍后重试'));
                triggerToast('批改任务已创建，可进入作业工作流继续配置');
              }}
              onEnterWorkflow={(task) => {
                setSelectedClassId(task.classId);
              }}
              onSelectTask={(task) => {
                setSelectedClassId(task.classId);
              }}
              onUpdateTask={async (updatedTask) => {
                const saved = await saveGradingTask(updatedTask);
                setTasks(current => current.map(task => task.id === saved.id ? saved : task));
              }}
              onArchiveTask={async (task, archived) => {
                const saved = await saveGradingTask({ ...task, archivedAt: archived ? new Date().toISOString() : undefined });
                setTasks(current => current.map(item => item.id === saved.id ? saved : item));
                triggerToast(archived ? '任务已归档' : '任务已恢复');
              }}
              onDeleteTask={async task => {
                await deleteGradingTask(task.id);
                setTasks(current => current.filter(item => item.id !== task.id));
                setWorkflowStates(current => { const next = { ...current }; delete next[task.id]; return next; });
                triggerToast('任务已永久删除');
              }}
              onUpdateState={(taskId, updated) => setWorkflowStates(current => ({
                ...current,
                [taskId]: { ...current[taskId], ...updated }
              }))}
              onSyncToProfiles={handleSyncToProfiles}
              onConfirmReview={handleConfirmReview}
              onBounceToOcr={handleBounceToOcr}
              onMarkAsSample={handleMarkAsSample}
              onShowToast={triggerToast}
            />
          )}

          {(activePage === 'diagnosis-workspace' || (activePage === 'classroom-tasks' && taskNavigation?.sourcePage === 'diagnosis-workspace')) && (
            <div className={activePage === 'diagnosis-workspace' ? 'contents' : 'hidden'} aria-hidden={activePage !== 'diagnosis-workspace'}>
            <DiagnosisWorkspace
              active={activePage === 'diagnosis-workspace'}
              students={students}
              classes={classes}
              committeeRoles={committeeRoles}
              selectedClassId={selectedClassId}
              selectedStudentId={selectedStudentId}
              onSelectClass={setSelectedClassId}
              onSelectStudent={setSelectedStudentId}
              onOpenClassroomTask={(taskId, studentId) => openClassroomTask(taskId, selectedClassId, studentId)}
              onEditStudent={(studentId) => {
                setSelectedStudentId(studentId);
                setStudentManagementTargetId(studentId);
                setActivePage('student-mgmt');
                triggerToast('已打开该学生档案');
              }}
              onAddObservation={handleAddObservation}
              onUpdateStudent={handleUpdateStudent}
              onNavigate={handleNavigate}
              onShowToast={triggerToast}
              requestedTab={diagnosisRequestedTab}
              onRequestedTabHandled={() => setDiagnosisRequestedTab(null)}
            />
            </div>
          )}

          <div className={activePage === 'knowledge-graph' || activePage === 'library-editor' ? 'contents' : 'hidden'} aria-hidden={activePage !== 'knowledge-graph' && activePage !== 'library-editor'}>
            <KnowledgeLibrary
              mode={activePage === 'knowledge-graph' ? 'graph' : 'editor'}
              active={activePage === 'knowledge-graph' || activePage === 'library-editor'}
              requestedResource={libraryResourceRequest}
              graph={knowledgeGraph}
              onSwitchMode={(mode) => {
                setActivePage(mode === 'graph' ? 'knowledge-graph' : 'library-editor');
              }}
              onKnowledgeChanged={loadKnowledgeCatalog}
              onShowToast={triggerToast}
            />
          </div>

          {(activePage === 'material-pool' || activePage.startsWith('career-')) && (
            <MaterialPool
              presetKey={activePage === 'career-open-class' ? 'open-class' : activePage === 'career-competition' ? 'competition' : activePage === 'career-paper' ? 'paper' : activePage === 'career-title' ? 'title' : undefined}
              onOpenResource={(id) => { setLibraryResourceRequest(current => ({ id, sequence: (current?.sequence ?? 0) + 1 })); setActivePage('library-editor'); }}
              onShowToast={triggerToast}
            />
          )}

          {activePage === 'tag-mgmt' && (
            <TagManagement onShowToast={triggerToast} />
          )}

          {activePage === 'settings' && (
            <SystemSettings
              lowConfidenceThreshold={lowConfidenceThreshold}
              onUpdateThreshold={setLowConfidenceThreshold}
              ocrHumanReviewThreshold={ocrHumanReviewThreshold}
              ocrAutoPassThreshold={ocrAutoPassThreshold}
              onUpdateOcrThresholds={(humanReview, autoPass) => {
                setOcrHumanReviewThreshold(humanReview);
                setOcrAutoPassThreshold(autoPass);
              }}
              showWeekends={showWeekends}
              onShowWeekendsChange={value => {
                setShowWeekends(value);
                localStorage.setItem(`schedule-show-weekends:${authState.user.id}`, String(value));
              }}
              schedulePeriods={schedulePeriods}
              schedule={schedule}
              onSaveSchedulePeriods={async periods => {
                const saved = await saveSchedulePeriods(periods);
                setSchedulePeriods(saved);
              }}
              requestedSection={settingsRequestedSection}
              onRequestedSectionHandled={() => setSettingsRequestedSection(null)}
              classes={classes}
              committeeRoles={committeeRoles}
              selectedClassId={selectedClassId}
              onSelectClass={setSelectedClassId}
              onShowToast={triggerToast}
              onCreateCommitteeRole={handleCreateCommitteeRole}
              onUpdateCommitteeRole={handleUpdateCommitteeRole}
              onDeleteCommitteeRole={handleDeleteCommitteeRole}
              teacherProfile={teacherProfile}
              onSaveTeacherProfile={profile => {
                setTeacherProfile(profile);
                void apiFetch('/api/account/profile', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(profile),
                }).then(response => {
                  if (!response.ok) triggerToast('教师信息保存失败');
                });
              }}
            />
          )}


    </AppLayout>
  );
}

