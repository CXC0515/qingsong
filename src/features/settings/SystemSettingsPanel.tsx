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
import type {ReviewPreferences} from '../../domain/reviewPreferences';
import {themeOptions} from '../../domain/appearance';
import {useAppearance} from './useAppearance';
import { readClassroomExportStudentNo, writeClassroomExportStudentNo } from '../../domain/userPreferences';

interface SystemSettingsPanelProps {
  reviewPreferences:ReviewPreferences;
  onSaveReviewPreferences:(value:ReviewPreferences)=>void;
  active: boolean;
  showWeekends: boolean;
  onShowWeekendsChange: (value: boolean) => void;
  schedulePeriods: SchedulePeriod[];
  schedule: ScheduleItem[];
  onSaveSchedulePeriods: (periods: SchedulePeriod[]) => Promise<void>;
  requestedSection: 'schedule-periods' | 'assistant' | null;
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
  onSaveTeacherProfile: (profile: TeacherProfile) => Promise<void>;
}

type SettingsTab = 'teacher' | 'teaching' | 'ai' | 'storage' | 'appearance';

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'teacher', label: '教师信息', icon: UserRound },
  { id: 'teaching', label: '教学设置', icon: BookOpen },
  { id: 'ai', label: 'OCR 与评分', icon: Sliders },
  { id: 'storage', label: '导出', icon: Database },
  { id: 'appearance', label: '外观', icon: Palette }
];

const periodLabels = ['第一节', '第二节', '第三节', '第四节', '第五节', '第六节', '第七节', '第八节', '第九节', '第十节', '第十一节', '第十二节'];
const addMinutes = (time: string, minutes: number) => {
  const [hour, minute] = time.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export default function SystemSettingsPanel({
  active,
  reviewPreferences,onSaveReviewPreferences,
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
  const [reviewDraft,setReviewDraft]=useState(reviewPreferences);
  const [reviewError,setReviewError]=useState('');
  useEffect(()=>setReviewDraft(reviewPreferences),[reviewPreferences]);
  const [activeTab, setActiveTab] = useState<SettingsTab>('teacher');
  const [nickname, setNickname] = useState(teacherProfile.nickname);
  const [realName, setRealName] = useState(teacherProfile.realName);
  const [schoolName, setSchoolName] = useState(teacherProfile.schoolName);
  const [title, setTitle] = useState(teacherProfile.title);
  const [classroomExportStudentNo, setClassroomExportStudentNo] = useState(() => readClassroomExportStudentNo(user.id));
  const [theme, setTheme] = useAppearance(user.id);
  const [appearanceError,setAppearanceError]=useState('');
  const [localSchedulePeriods, setLocalSchedulePeriods] = useState(schedulePeriods);
  const [isScheduleSaving, setIsScheduleSaving] = useState(false);
  const [scheduleSaveError, setScheduleSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [newCommitteeRole,setNewCommitteeRole]=useState('');
  const [roleDrafts,setRoleDrafts]=useState<Record<string,string>>({});
  const lastPeriod = localSchedulePeriods.at(-1);
  const lastPeriodInUse = lastPeriod ? schedule.some(item => item.period === lastPeriod.period) : false;
  const hasUnsavedScheduleChanges = JSON.stringify(localSchedulePeriods) !== JSON.stringify(schedulePeriods);

  useEffect(() => setLocalSchedulePeriods(schedulePeriods), [schedulePeriods]);

  useEffect(() => {
    if (!active || saving) return;
    if (requestedSection === 'assistant') {
      setActiveTab('ai');
      onRequestedSectionHandled();
      return;
    }
    if (requestedSection !== 'schedule-periods') return;
    setActiveTab('teaching');
    const timeout = window.setTimeout(() => {
      document.getElementById('schedule-period-settings')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onRequestedSectionHandled();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [active, saving, onRequestedSectionHandled, requestedSection]);

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
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      if (activeTab === 'teacher') {
        await onSaveTeacherProfile({nickname: nickname.trim() || realName.trim() || '老师', realName: realName.trim(), schoolName: schoolName.trim(), title: title.trim()});
        onShowToast('教师信息已保存');
      } else if (activeTab === 'storage') {
        writeClassroomExportStudentNo(user.id, classroomExportStudentNo);
        onShowToast('座位表导出偏好已保存在当前设备');
      }
    } catch (error) {
      setSaveError(activeTab === 'teacher' ? (error instanceof Error && !(error instanceof TypeError) ? error.message : '连接中断，教师信息保存未能确认。当前填写内容已保留，请重试或刷新核对。') : '导出偏好未保存，当前选择保留。请检查浏览器存储权限后重试。');
    } finally { setSaving(false); }
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
          <h2 className="text-2xl font-black text-slate-900 dark:text-slate-50 tracking-tight">我的设置</h2>
        </div>
        {(activeTab === 'teacher' || activeTab === 'storage') && <GlassButton
          disabled={saving}
          onClick={() => void handleSaveSettings()}
          variant="primary" className="px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-all"
        >
          <Save className="w-4 h-4" />
          {saving ? '正在保存…' : activeTab === 'teacher' ? '保存教师信息' : '保存导出偏好'}
        </GlassButton>}
      </div>

      <GlassSegments label="设置分类" value={activeTab} options={tabs.map(tab=>({value:tab.id,label:<><tab.icon className="w-4 h-4"/>{tab.label}</>}))} onChange={value => { if (saving) return false; setActiveTab(value); setSaveError(''); }}/>

      {saveError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
      <fieldset disabled={saving} className="glass-panel min-w-0 rounded-[24px] p-4 sm:p-6" aria-busy={saving}>
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
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">工作台快捷入口班级（当前会话）</span>
              <select
                value={selectedClassId}
                onChange={(event) => onSelectClass(event.target.value)}
                className="qs-field-input w-full px-3 py-2 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-base focus:outline-none"
              >
                {classes.filter(c => c.status === 'active').map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <span>
                <strong className="block text-sm text-slate-700 dark:text-slate-200">课表显示周六、周日</strong>
                <span className="mt-1 block text-xs text-slate-400">关闭时，课表始终完整显示周一至周五。修改立即保存至当前设备。</span>
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

        <div hidden={activeTab !== 'ai'}>
          <div className="space-y-6">
            {([{key:'human',label:'OCR 人工复核参考'},{key:'auto',label:'OCR 较高质量参考'},{key:'score',label:'评分置信度参考'}] as const).map(({key,label})=><label key={key} className="block max-w-xl"><span className="flex justify-between">{label}<output>{Math.round(reviewDraft[key]*100)}%</output></span><input className="mt-4 w-full accent-emerald-700" type="range" min={0} max={100} value={Math.round(reviewDraft[key]*100)} onChange={e=>setReviewDraft(v=>({...v,[key]:Number(e.target.value)/100}))}/></label>)}
            <p className="text-sm leading-6 text-slate-500">仅保存到本设备的当前账号，用于批改页置信度颜色与复核参考标记；不改变后台识别、评分、自动放行或教师确认要求。</p>
            {reviewError&&<p role="alert" className="text-sm text-red-700">{reviewError}</p>}
            <GlassButton variant="primary" onClick={()=>{try{onSaveReviewPreferences(reviewDraft);setReviewError('');onShowToast('复核标记偏好已保存。');}catch(e){setReviewError(e instanceof Error?e.message:'偏好未保存，请检查浏览器存储设置后重试。');}}}>保存复核标记</GlassButton>
          </div>
        </div>

        {activeTab === 'storage' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 dark:border-zinc-800 dark:bg-zinc-900/60">
              <span>
                <strong className="block text-sm text-slate-700 dark:text-slate-200">座位表导出包含学号</strong>
                <span className="mt-1 block text-xs text-slate-400">关闭后，Excel 座位只显示学生姓名。保存后用于当前设备、当前账号的后续导出。</span>
              </span>
              <input type="checkbox" checked={classroomExportStudentNo} onChange={event => setClassroomExportStudentNo(event.target.checked)} className="h-5 w-5 accent-emerald-700" />
            </label>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="space-y-4">
            {appearanceError&&<p role="alert" className="text-sm text-red-700">{appearanceError}</p>}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">主题色</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {themeOptions.map(option => (
                  <button
                    key={option.value}
                    onClick={() => {try{setTheme(option.value);setAppearanceError('');}catch{setAppearanceError('外观偏好未保存，当前配色保持不变。请检查浏览器是否允许本站保存数据后重试。');}}}
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
      </fieldset>
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
        maxLength={label === '学校' ? 100 : label === '职称' ? 60 : 40}
        onChange={(event) => onChange(event.target.value)}
        className="qs-field-input w-full px-3 py-2 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-base focus:outline-none"
      />
    </label>
  );
}
