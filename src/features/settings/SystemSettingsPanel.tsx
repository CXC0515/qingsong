import { GlassButton, GlassSegments  } from '../../components/glass/Glass';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { BookOpen, Database, Palette, Pencil, Plus, Save, Settings2, Sliders, Trash2, UserRound } from 'lucide-react';
import { CommitteeRole, ScheduleItem, SchedulePeriod, SchoolClass, TeacherProfile } from '../../domain/types';
import ScheduleTimeInput from '../../components/ScheduleTimeInput';
import { isScheduleTime } from '../../domain/scheduleTime';
import { useAuth } from '../auth/AuthGate';
import { readClassroomExportStudentNo, writeClassroomExportStudentNo } from '../../domain/userPreferences';

interface SystemSettingsPanelProps {
  lowConfidenceThreshold: number;
  onUpdateThreshold: (val: number) => void;
  ocrHumanReviewThreshold: number;
  ocrAutoPassThreshold: number;
  onUpdateOcrThresholds: (humanReview: number, autoPass: number) => void;
  showWeekends: boolean;
  onShowWeekendsChange: (value: boolean) => void;
  schedulePeriods: SchedulePeriod[];
  schedule: ScheduleItem[];
  onSaveSchedulePeriods: (periods: SchedulePeriod[]) => Promise<void>;
  requestedSection: 'schedule-periods' | null;
  onRequestedSectionHandled: () => void;
  classes: SchoolClass[];
  committeeRoles: CommitteeRole[];
  selectedClassId: string;
  onSelectClass: (classId: string) => void;
  onShowToast: (message: string) => void;
  onCreateCommitteeRole: (name: string) => Promise<void>;
  onUpdateCommitteeRole: (roleId: string, name: string) => Promise<void>;
  onDeleteCommitteeRole: (roleId: string) => Promise<void>;
  teacherProfile: TeacherProfile;
  onSaveTeacherProfile: (profile: TeacherProfile) => void;
}

type SettingsTab = 'teacher' | 'teaching' | 'ai' | 'storage' | 'appearance';

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'teacher', label: '教师信息', icon: UserRound },
  { id: 'teaching', label: '教学设置', icon: BookOpen },
  { id: 'ai', label: 'AI 参数', icon: Sliders },
  { id: 'storage', label: '数据与存储', icon: Database },
  { id: 'appearance', label: '外观', icon: Palette }
];

const themeOptions = [
  { value: 'song-porcelain-green', label: '宋瓷青绿', swatches: ['#2E6A67', '#5E8C87', '#A9C8BE', '#D7E6DB', '#F1F0E8'] },
  { value: 'bianjing-twilight', label: '汴京暮色', swatches: ['#4F6072', '#B56A58', '#D9B07C', '#8DB8A7', '#F1EADF'] },
  { value: 'rouge-warm-gray', label: '燕脂暖灰', swatches: ['#A45668', '#D59BA8', '#C7C1B5', '#E7DDD3', '#F5F0EA'] },
  { value: 'green-tile-bamboo', label: '青瓦竹影', swatches: ['#4A6460', '#7A9387', '#BFD0B8', '#DDE6D6', '#F3F1E6'] },
  { value: 'tea-smoke-beige', label: '茶烟米褐', swatches: ['#7E6554', '#A78A73', '#D4B79D', '#E9D6BE', '#F5EEE4'] },
  { value: 'sophora-yellow-stone-green', label: '槐黄石绿', swatches: ['#6C7F4F', '#C6A348', '#D9C89A', '#C6D0B0', '#F0EADB'] },
  { value: 'ink-red-gold-sand', label: '墨红金砂', swatches: ['#8C2F2D', '#3E3A39', '#9B8778', '#D1BB93', '#F0E8DC'] },
  { value: 'mist-blue-silver-gray', label: '雾蓝银灰', swatches: ['#607E95', '#A8C3D6', '#B8AEA6', '#E2D0BC', '#F3EEE8'] }
];
const defaultTheme = 'song-porcelain-green';
const themeValues = new Set(themeOptions.map(option => option.value));
const readStoredTheme = (userId: string) => {
  if (typeof window === 'undefined') return defaultTheme;
  const storedTheme = localStorage.getItem(`app-theme:${userId}`);
  return storedTheme && themeValues.has(storedTheme) ? storedTheme : defaultTheme;
};
const applyTheme = (theme: string) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-theme-forced', 'true');
  root.classList.remove('dark-theme-active');
};
const periodLabels = ['第一节', '第二节', '第三节', '第四节', '第五节', '第六节', '第七节', '第八节', '第九节', '第十节', '第十一节', '第十二节'];
const addMinutes = (time: string, minutes: number) => {
  const [hour, minute] = time.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export default function SystemSettingsPanel({
  lowConfidenceThreshold,
  onUpdateThreshold,
  ocrHumanReviewThreshold,
  ocrAutoPassThreshold,
  onUpdateOcrThresholds,
  showWeekends,
  onShowWeekendsChange,
  schedulePeriods,
  schedule,
  onSaveSchedulePeriods,
  requestedSection,
  onRequestedSectionHandled,
  classes,
  committeeRoles,
  selectedClassId,
  onSelectClass,
  onShowToast,
  onCreateCommitteeRole,
  onUpdateCommitteeRole,
  onDeleteCommitteeRole,
  teacherProfile,
  onSaveTeacherProfile
}: SystemSettingsPanelProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('teacher');
  const [nickname, setNickname] = useState(teacherProfile.nickname);
  const [realName, setRealName] = useState(teacherProfile.realName);
  const [schoolName, setSchoolName] = useState(teacherProfile.schoolName);
  const [title, setTitle] = useState(teacherProfile.title);
  const [term, setTerm] = useState('2026 春季学期');
  const [subject, setSubject] = useState('初中语文');
  const [grade, setGrade] = useState('七年级');
  const [textbook, setTextbook] = useState('统编版七年级下册');
  const [localThreshold, setLocalThreshold] = useState(lowConfidenceThreshold);
  const [localOcrHumanThreshold, setLocalOcrHumanThreshold] = useState(ocrHumanReviewThreshold);
  const [localOcrAutoThreshold, setLocalOcrAutoThreshold] = useState(ocrAutoPassThreshold);
  const [scoreGapThreshold, setScoreGapThreshold] = useState(1);
  const [resourceSource, setResourceSource] = useState('国家中小学智慧教育平台');
  const [lessonReferenceSite, setLessonReferenceSite] = useState('学科网 / 语文报教研资源');
  const [imageSavePolicy, setImageSavePolicy] = useState('保存原图与裁剪图');
  const [archivePolicy, setArchivePolicy] = useState('按学期归档');
  const [exportFormat, setExportFormat] = useState('PDF + Excel');
  const [classroomExportStudentNo, setClassroomExportStudentNo] = useState(() => readClassroomExportStudentNo(user.id));
  const [theme, setTheme] = useState(() => readStoredTheme(user.id));
  const [localSchedulePeriods, setLocalSchedulePeriods] = useState(schedulePeriods);
  const [isScheduleSaving, setIsScheduleSaving] = useState(false);
  const [scheduleSaveError, setScheduleSaveError] = useState('');
  const [newCommitteeRole,setNewCommitteeRole]=useState('');
  const [roleDrafts,setRoleDrafts]=useState<Record<string,string>>({});
  const lastPeriod = localSchedulePeriods.at(-1);
  const lastPeriodInUse = lastPeriod ? schedule.some(item => item.period === lastPeriod.period) : false;
  const hasUnsavedScheduleChanges = JSON.stringify(localSchedulePeriods) !== JSON.stringify(schedulePeriods);

  useEffect(() => setLocalSchedulePeriods(schedulePeriods), [schedulePeriods]);

  useEffect(() => {
    if (requestedSection !== 'schedule-periods') return;
    setActiveTab('teaching');
    const timeout = window.setTimeout(() => {
      document.getElementById('schedule-period-settings')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onRequestedSectionHandled();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [onRequestedSectionHandled, requestedSection]);

  useEffect(() => {
    localStorage.setItem(`app-theme:${user.id}`, theme);
    applyTheme(theme);
  }, [theme, user.id]);

  const saveSchedulePeriodSettings = async (announce = true) => {
    if (!hasUnsavedScheduleChanges) return true;
    const invalidPeriod = localSchedulePeriods.find(period => !period.label.trim() || !isScheduleTime(period.startTime) || !isScheduleTime(period.endTime) || period.startTime >= period.endTime);
    if (invalidPeriod) {
      const message = `${invalidPeriod.label.trim() || `第 ${invalidPeriod.period} 节`}的时间不正确：请填写完整时间，且结束时间须晚于开始时间`;
      setScheduleSaveError(message);
      onShowToast(message);
      return false;
    }
    setIsScheduleSaving(true);
    setScheduleSaveError('');
    try {
      await onSaveSchedulePeriods(localSchedulePeriods);
      if (announce) onShowToast('学校作息已保存并同步到课表');
      return true;
    } catch (error) {
      const message = error instanceof Error && error.message === 'SCHEDULE_PERIOD_IN_USE' ? '被删除的课节仍有课程，请先调整课程' : '学校作息保存失败，请稍后重试';
      setScheduleSaveError(message);
      onShowToast(message);
      return false;
    } finally {
      setIsScheduleSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    onUpdateThreshold(localThreshold);
    onUpdateOcrThresholds(localOcrHumanThreshold, localOcrAutoThreshold);
    onSaveTeacherProfile({
      nickname: nickname.trim() || realName.trim() || '老师',
      realName: realName.trim(),
      schoolName: schoolName.trim(),
      title: title.trim()
    });
    if (await saveSchedulePeriodSettings(false)) {
      writeClassroomExportStudentNo(user.id, classroomExportStudentNo);
      onShowToast('系统设置已保存');
    }
  };

  const updateSchedulePeriod = (index: number, patch: Partial<SchedulePeriod>) => {
    setScheduleSaveError('');
    setLocalSchedulePeriods(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const addSchedulePeriod = () => {
    if (localSchedulePeriods.length >= 12) return;
    const period = localSchedulePeriods.length + 1;
    const startTime = addMinutes(lastPeriod?.endTime ?? '07:50', 10);
    setScheduleSaveError('');
    setLocalSchedulePeriods(current => [...current, { period, label: periodLabels[period - 1], startTime, endTime: addMinutes(startTime, 45) }]);
  };

  const removeLastSchedulePeriod = () => {
    if (localSchedulePeriods.length <= 1) return;
    if (lastPeriodInUse) {
      onShowToast(`${lastPeriod?.label ?? '最后一节'}仍有课程，请先调整课程`);
      return;
    }
    setScheduleSaveError('');
    setLocalSchedulePeriods(current => current.slice(0, -1));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in" id="system-settings-page">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">设置</p>
          <h2 className="text-2xl font-black text-slate-900 dark:text-slate-50 tracking-tight">我的设置</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">管理当前教师工作区的资料、教学设置和外观偏好。</p>
        </div>
        <GlassButton
          onClick={() => void handleSaveSettings()}
          variant="primary" className="px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-all"
        >
          <Save className="w-4 h-4" />
          保存设置
        </GlassButton>
      </div>

      <GlassSegments label="设置分类" value={activeTab} options={tabs.map(tab=>({value:tab.id,label:<><tab.icon className="w-4 h-4"/>{tab.label}</>}))} onChange={setActiveTab}/>

      <div className="glass-panel rounded-[24px] p-6">
        {activeTab === 'teacher' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <SettingInput label="昵称" value={nickname} onChange={setNickname} />
            <SettingInput label="姓名" value={realName} onChange={setRealName} />
            <SettingInput label="学校" value={schoolName} onChange={setSchoolName} />
            <SettingInput label="职称" value={title} onChange={setTitle} />
          </div>
        )}

        {activeTab === 'teaching' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <SettingSelect label="当前学期" value={term} onChange={setTerm} options={['2026 春季学期', '2026 秋季学期', '2025 秋季学期']} />
            <SettingSelect label="学科" value={subject} onChange={setSubject} options={['初中语文', '初中数学', '初中英语']} />
            <SettingSelect label="年级" value={grade} onChange={setGrade} options={['七年级', '八年级', '九年级']} />
            <SettingSelect label="教材版本" value={textbook} onChange={setTextbook} options={['统编版七年级下册', '统编版七年级上册', '统编版八年级上册', '统编版八年级下册']} />
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">默认显示班级</span>
              <select
                value={selectedClassId}
                onChange={(event) => onSelectClass(event.target.value)}
                className="qs-field-input w-full px-3 py-2 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm focus:outline-none"
              >
                {classes.filter(c => c.status === 'active').map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <span>
                <strong className="block text-sm text-slate-700 dark:text-slate-200">课表显示周六、周日</strong>
                <span className="mt-1 block text-xs text-slate-400">关闭时，课表始终完整显示周一至周五。</span>
              </span>
              <input type="checkbox" checked={showWeekends} onChange={event => onShowWeekendsChange(event.target.checked)} className="h-4 w-4 accent-emerald-700" />
            </label>
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <div><strong className="block text-sm text-slate-700 dark:text-slate-200">班委职位</strong><span className="mt-1 block text-xs text-slate-400">这里维护全校通用的职位名称；具体学生在班级详情中委派。</span></div>
              <div className="space-y-2">{committeeRoles.map(role=><div key={role.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950"><input value={roleDrafts[role.id]??role.name} onChange={event=>setRoleDrafts(current=>({...current,[role.id]:event.target.value}))} className="qs-field-input min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"/><GlassButton type="button" onClick={()=>void onUpdateCommitteeRole(role.id,(roleDrafts[role.id]??role.name).trim())} variant="secondary" className="p-2" aria-label={`保存${role.name}`}><Pencil className="h-3.5 w-3.5"/></GlassButton><GlassButton type="button" disabled={role.isDefault} onClick={()=>void onDeleteCommitteeRole(role.id).catch(error=>onShowToast(error instanceof Error&&error.message==='COMMITTEE_ROLE_IN_USE'?'该职位仍有人任职，请先解除委派':'班委职位删除失败'))} variant="danger" className="p-2 disabled:cursor-not-allowed disabled:opacity-30" aria-label={`删除${role.name}`}><Trash2 className="h-3.5 w-3.5"/></GlassButton></div>)}</div>
              <div className="flex gap-2"><input value={newCommitteeRole} onChange={event=>setNewCommitteeRole(event.target.value)} placeholder="如：生活委员、数学课代表" className="qs-field-input min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"/><GlassButton type="button" disabled={!newCommitteeRole.trim()} onClick={()=>void onCreateCommitteeRole(newCommitteeRole.trim()).then(()=>setNewCommitteeRole('')).catch(()=>onShowToast('职位已存在或无法保存'))} variant="primary" className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold disabled:opacity-40"><Plus className="h-3.5 w-3.5"/>添加职位</GlassButton></div>
            </section>
            <section id="schedule-period-settings" className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <strong className="block text-sm text-slate-700 dark:text-slate-200">学校作息时间</strong>
                  <span className="mt-1 block text-xs text-slate-400">当前 {localSchedulePeriods.length} 节，统一用于个人课表、班级课表、手动排课和扫描导入。</span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {hasUnsavedScheduleChanges && <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">有未保存修改</span>}
                  <GlassButton type="button" onClick={removeLastSchedulePeriod} disabled={localSchedulePeriods.length <= 1} variant="secondary" className="inline-flex min-h-11 items-center gap-1 px-3 py-2 text-xs font-bold disabled:opacity-40"><Trash2 className="h-3.5 w-3.5"/>减少一节</GlassButton>
                  <GlassButton type="button" onClick={addSchedulePeriod} disabled={localSchedulePeriods.length >= 12} variant="secondary" className="inline-flex min-h-11 items-center gap-1 px-3 py-2 text-xs font-bold disabled:opacity-40"><Plus className="h-3.5 w-3.5"/>增加一节</GlassButton>
                  <GlassButton containerClassName="min-w-[88px]" type="button" onClick={() => void saveSchedulePeriodSettings()} disabled={!hasUnsavedScheduleChanges || isScheduleSaving} variant="primary" className="inline-flex min-h-11 items-center justify-center px-3 py-2 text-xs font-bold">{isScheduleSaving ? '保存中…' : hasUnsavedScheduleChanges ? '保存作息' : '已同步'}</GlassButton>
                </div>
              </div>
              {scheduleSaveError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{scheduleSaveError}</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                {localSchedulePeriods.map((period, index) => (
                  <div key={period.period} className="grid grid-cols-2 items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[96px_1fr_1fr] dark:border-zinc-700 dark:bg-zinc-950">
                    <input
                      value={period.label}
                      aria-label={`第${period.period}节名称`}
                      onChange={event => updateSchedulePeriod(index, { label: event.target.value })}
                      className="qs-field-input col-span-2 min-h-11 min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-base font-bold sm:col-span-1 dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <ScheduleTimeInput id={`period-${period.period}-start`} label="开始时间" value={period.startTime} onChange={startTime => updateSchedulePeriod(index, { startTime })} onInvalid={message => setScheduleSaveError(message)} />
                    <ScheduleTimeInput id={`period-${period.period}-end`} label="结束时间" value={period.endTime} onChange={endTime => updateSchedulePeriod(index, { endTime })} onInvalid={message => setScheduleSaveError(message)} />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">作业图像与 OCR 质检</label>
              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm font-bold">
                    <span>人工复核阈值</span>
                    <span className="font-mono text-rose-700 dark:text-rose-300">{localOcrHumanThreshold.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0.50" max="0.80" step="0.05" value={localOcrHumanThreshold} onChange={(event) => setLocalOcrHumanThreshold(Math.min(parseFloat(event.target.value), localOcrAutoThreshold - 0.05))} className="w-full cursor-pointer accent-rose-600" />
                  <p className="text-xs leading-5 text-slate-500">低于该值，或出现缺页、学号冲突等硬异常，直接交给教师。</p>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm font-bold">
                    <span>自动通过阈值</span>
                    <span className="font-mono text-emerald-700 dark:text-emerald-300">{localOcrAutoThreshold.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0.75" max="0.98" step="0.01" value={localOcrAutoThreshold} onChange={(event) => setLocalOcrAutoThreshold(Math.max(parseFloat(event.target.value), localOcrHumanThreshold + 0.05))} className="w-full cursor-pointer accent-emerald-700" />
                  <p className="text-xs leading-5 text-slate-500">两个阈值之间先由多模态模型核验，高于该值且无硬异常才自动通过。</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">AI 评分置信度</label>
              <div className="p-4 bg-slate-50 dark:bg-zinc-900/60 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-3">
                <div className="flex justify-between text-sm font-bold">
                  <span>评分异常拦截</span>
                  <span className="text-emerald-700 dark:text-emerald-300 font-mono">{localThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.50"
                  max="0.95"
                  step="0.05"
                  value={localThreshold}
                  onChange={(event) => setLocalThreshold(parseFloat(event.target.value))}
                  className="w-full accent-emerald-700 cursor-pointer"
                />
              </div>
            </div>
            <SettingSelect label="分差复核阈值" value={`${scoreGapThreshold} 分`} onChange={(value) => setScoreGapThreshold(parseInt(value, 10))} options={['1 分', '2 分', '3 分']} />
            <SettingInput label="首选资料源" value={resourceSource} onChange={setResourceSource} />
            <SettingInput label="参考教案网站" value={lessonReferenceSite} onChange={setLessonReferenceSite} />
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <SettingSelect label="原图保存策略" value={imageSavePolicy} onChange={setImageSavePolicy} options={['保存原图与裁剪图', '仅保存原图', '仅保存裁剪图']} />
            <SettingSelect label="诊断报告导出格式" value={exportFormat} onChange={setExportFormat} options={['PDF + Excel', 'PDF', 'Excel', 'CSV']} />
            <SettingSelect label="数据归档策略" value={archivePolicy} onChange={setArchivePolicy} options={['按学期归档', '按学年归档', '手动归档']} />
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <span>
                <strong className="block text-sm text-slate-700 dark:text-slate-200">座位表导出包含学号</strong>
                <span className="mt-1 block text-xs text-slate-400">关闭后，Excel 座位只显示学生姓名。</span>
              </span>
              <input type="checkbox" checked={classroomExportStudentNo} onChange={event => setClassroomExportStudentNo(event.target.checked)} className="h-5 w-5 accent-emerald-700" />
            </label>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">主题色</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {themeOptions.map(option => (
                  <button
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    style={theme === option.value ? { borderColor: option.swatches[0], boxShadow: `0 0 0 2px ${option.swatches[0]}20` } : undefined}
                    className={`rounded-xl border p-3 text-left text-xs font-bold transition-all active:scale-95 ${
                      theme === option.value
                        ? 'bg-white dark:bg-zinc-900'
                        : 'bg-slate-50 dark:bg-zinc-900/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-zinc-800'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>{option.label}</span>
                      {theme === option.value ? <span className="text-[10px] font-medium" style={{ color: option.swatches[0] }}>已选择</span> : null}
                    </span>
                    <span className="mt-3 grid grid-cols-5 overflow-hidden rounded-lg border border-black/5" aria-label={`${option.label}课表色卡`}>
                      {option.swatches.map(color => <span key={color} className="h-7" style={{ backgroundColor: color }} />)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 flex items-start gap-3">
              <Settings2 className="w-5 h-5 text-slate-400 mt-0.5" />
              <p className="text-sm text-slate-500 leading-relaxed">
                页面主色、背景和课表配色会随所选色卡统一切换，并保存在当前设备。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="qs-field-input w-full px-3 py-2 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm focus:outline-none"
      />
    </label>
  );
}

function SettingSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="qs-field-input w-full px-3 py-2 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-sm focus:outline-none"
      >
        {options.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

