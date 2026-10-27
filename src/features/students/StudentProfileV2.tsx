import { GlassButton } from '../../components/glass/Glass';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpDown, Edit3, Eye, MessageSquare, Search, TrendingUp } from 'lucide-react';
import { CommitteeRole, Student, TeacherObservation } from '../../domain/types';
import { SortDirection, sortStudents, StudentSortKey } from '../../domain/studentSorting';
import BehaviorTagEditor from './BehaviorTagEditor';
import { behaviorApi } from '../../services/classroomBehaviorApi';
import { behaviorKinds, type BehaviorList } from '../../domain/classroomBehavior';
import { today, action } from '../classroom-tasks/ClassroomTaskDialogs';
import { taskApi } from '../../services/classroomTaskApi';

interface StudentProfileV2Props {
  active: boolean;
  onOpenClassroomTask: (taskId: string, studentId: string) => void;
  students: Student[];
  committeeRoles: CommitteeRole[];
  selectedClassId: string;
  selectedStudentId: string;
  onSelectStudent: (studentId: string) => void;
  onEditStudent: (studentId: string) => void;
  onAddObservation: (studentId: string, note: TeacherObservation) => Promise<void>;
  onUpdateStudent: (student: Student) => Promise<boolean>;
  onShowToast: (message: string) => void;
  targetStudentId?: string | null;
  onTargetStudentHandled?: () => void;
}

const statusLabel = {
  good: '状态良好',
  warning: '需要关注',
  risk: '近期风险',
  outstanding: '表现突出'
};

const statusStyle = {
  good: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  risk: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200',
  outstanding: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
};

export default function StudentProfileV2({
  active,
  onOpenClassroomTask,
  students,
  committeeRoles,
  selectedClassId,
  selectedStudentId,
  onSelectStudent,
  onEditStudent,
  onAddObservation,
  onUpdateStudent,
  onShowToast,
  targetStudentId,
  onTargetStudentHandled
}: StudentProfileV2Props) {
  const [query, setQuery] = useState('');
  const [detailMode, setDetailMode] = useState(false);
  const [note, setNote] = useState('');
  const [noteBusy,setNoteBusy]=useState(false);
  const [noteError,setNoteError]=useState('');
  const [days,setDays]=useState(7);
  const [behavior,setBehavior]=useState<{studentId:string;days:number;data:BehaviorList}|null>(null);
  const [behaviorError,setBehaviorError]=useState('');
  const [behaviorRetry,setBehaviorRetry]=useState(0);
  const [sortKey,setSortKey]=useState<StudentSortKey>('studentNo');
  const [sortDirection,setSortDirection]=useState<SortDirection>('asc');

  const classStudents = useMemo(() => {
    return sortStudents(students
      .filter(s => s.classId === selectedClassId)
      .filter(s => !query || `${s.name}${s.studentNo}`.includes(query)),sortKey,sortDirection);
  }, [query, selectedClassId, sortDirection, sortKey, students]);

  const toggleSort=(key:StudentSortKey)=>{if(sortKey===key)setSortDirection(value=>value==='asc'?'desc':'asc');else{setSortKey(key);setSortDirection('asc')}};

  const selectedStudent = students.find(s => s.id === selectedStudentId) ?? classStudents[0] ?? students[0];
  const taskStudentId = selectedStudent?.id;
  const [studentTasks, setStudentTasks] = useState<{ studentId: string; tasks: Awaited<ReturnType<typeof taskApi.studentTasks>> } | null>(null);
  const [taskReadError, setTaskReadError] = useState<string | null>(null);
  const [taskRetry, setTaskRetry] = useState(0);
  useEffect(() => {
    if (!active || !detailMode || !taskStudentId) return;
    let current = true;
    let request = 0;
    const refresh = async () => {
      const latest = ++request;
      try {
        const tasks = await taskApi.studentTasks(taskStudentId);
        if (!current || latest !== request) return;
        setStudentTasks({ studentId: taskStudentId, tasks });
        setTaskReadError(null);
      } catch {
        if (current && latest === request) setTaskReadError(taskStudentId);
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { current = false; window.removeEventListener('focus', refresh); };
  }, [active, detailMode, taskRetry, taskStudentId]);
  const visibleTasks = studentTasks?.studentId === taskStudentId ? studentTasks.tasks : null;
  const endDate=today();
  const start=new Date(endDate+'T12:00:00');start.setDate(start.getDate()-days+1);
  const from=start.getFullYear()+'-'+String(start.getMonth()+1).padStart(2,'0')+'-'+String(start.getDate()).padStart(2,'0');
  useEffect(()=>{
    if(!active||!detailMode||!taskStudentId)return;let current=true;let sequence=0;setBehaviorError('');
    const refresh=async()=>{const n=++sequence;try{const data=await behaviorApi.list({studentId:taskStudentId,from,to:endDate,limit:100});if(current&&n===sequence){setBehavior({studentId:taskStudentId,days,data});setBehaviorError('');}}catch{if(current&&n===sequence)setBehaviorError('表现记录读取失败，已保存数据未改变，请重试。');}};
    void refresh();window.addEventListener('focus',refresh);return()=>{current=false;window.removeEventListener('focus',refresh);};
  },[active,detailMode,taskStudentId,from,endDate,days,behaviorRetry]);
  const currentBehavior=behavior?.studentId===taskStudentId&&behavior.days===days?behavior.data:null;
  const periodTasks=visibleTasks?.filter(t=>t.checkDate>=from&&t.checkDate<=endDate&&t.participant.included&&!t.participant.exempt)??[];
  const taskCounts={positive:0,negative:0,unrecorded:0,retest:0};
  for(const t of periodTasks){if(t.participant.result==='positive'){taskCounts.positive++;if(t.participant.firstResult==='negative')taskCounts.retest++;}else if(t.participant.result==='negative')taskCounts.negative++;else taskCounts.unrecorded++;}


  const openDetail = (studentId: string) => {
    onSelectStudent(studentId);
    setDetailMode(true);
  };

  useEffect(() => {
    if (!targetStudentId || !students.some(student => student.id === targetStudentId)) return;
    openDetail(targetStudentId);
    onTargetStudentHandled?.();
  }, [onTargetStudentHandled, students, targetStudentId]);

  const addNote = async () => {
    if (!note.trim() || noteBusy) return;
    setNoteBusy(true);setNoteError('');
    try{await onAddObservation(selectedStudent.id,{date:today(),type:'neutral',category:'study',content:note.trim()});setNote('');onShowToast('教师观察已保存');}
    catch{setNoteError('观察未确认保存，输入已保留。请重新读取核对后再保存。');}
    finally{setNoteBusy(false);}
  };

  if (detailMode) {
    const errors = selectedStudent.homeworkHistory.flatMap(hw => hw.knowledgeErrors.map(err => ({ hw, err })));

    return (
      <div className="space-y-5 animate-fade-in">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <button onClick={() => setDetailMode(false)} className="text-xs font-bold text-slate-500 hover:text-emerald-700 flex items-center gap-1 mb-2">
              <ArrowLeft className="w-4 h-4" />
              返回学生列表
            </button>
            <h2 className="text-2xl font-black text-slate-900 dark:text-slate-50">{selectedStudent.name} 的学生画像</h2>
            <p className="text-sm text-slate-500 mt-1">{selectedStudent.className} · 学号 {selectedStudent.studentNo}</p>
          </div>
          <GlassButton onClick={() => onEditStudent(selectedStudent.id)} variant="primary" className="px-4 py-2 text-sm font-bold flex items-center gap-1.5 transition-all">
            <Edit3 className="w-4 h-4" />
            编辑学生档案
          </GlassButton>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
          <section className="space-y-5">
            <div className="glass-panel space-y-3 rounded-[24px] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">近期学习与课堂记录</h3><div className="flex gap-2">{[7,30].map(n=><button key={n} className={action} aria-pressed={days===n} onClick={()=>setDays(n)}>近{n}天{days===n?' ✓':''}</button>)}</div></div>
              <p className="text-xs text-slate-500">{from} 至 {endDate} · 只汇总教师记录，可查看来源；没有记录不代表没有表现。</p>
              {visibleTasks&&<p className="text-sm">应参与检查 {periodTasks.length}次 · 当前完成／通过 {taskCounts.positive}次（其中后来补做／补测通过 {taskCounts.retest}次） · 明确未完成／未过 {taskCounts.negative}次 · 未记录 {taskCounts.unrecorded}次</p>}
              {behaviorError&&<p role="alert" className="text-sm text-amber-800">{behaviorError}<button className={action+' ml-2'} onClick={()=>setBehaviorRetry(n=>n+1)}>重试</button></p>}
              {!currentBehavior&&!behaviorError&&<p role="status" className="text-sm text-slate-500">正在读取表现记录…</p>}
              {currentBehavior&&<><div className="flex flex-wrap gap-2">{[...behaviorKinds,...Object.keys(currentBehavior.counts).filter(key=>!behaviorKinds.some(k=>k.key===key)).map(key=>({key,label:currentBehavior.labels[key]??'自定义表现'}))].map(k=><span key={k.key} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-zinc-900">{currentBehavior.labels[k.key]??k.label} · 已记录 {currentBehavior.counts[k.key]??0}次</span>)}</div><details><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">查看表现来源记录（共{currentBehavior.total}笔，含已撤销）</summary><div className="space-y-2">{currentBehavior.events.map(e=><div key={e.id} className="rounded-xl border p-3 text-sm"><strong>{e.occurredDate} · {e.projectLabel??behaviorKinds.find(k=>k.key===e.kind)?.label??'表现记录'}{' · 第'+(e.round??1)+'轮'}{e.lessonSnapshot?' · '+e.lessonSnapshot.title:''}{e.retracted?' · 已撤销':''}</strong><p className="mt-1 break-words">{e.note||'未填写说明'}</p><p className="mt-1 break-all text-xs text-slate-500">记录于 {new Date(e.recordedAt).toLocaleString('zh-CN')} · 操作者 {e.actorUserId}</p></div>)}{currentBehavior.total>currentBehavior.events.length&&<p className="text-sm text-slate-500">仅显示最近100笔；上方次数按完整日期范围计算。</p>}</div></details></>}
              <h4 className="text-sm font-semibold">仍待跟进（所有日期）</h4>
              {visibleTasks?.filter(t=>t.lifecycle==='active'&&t.participant.included&&!t.participant.exempt&&t.participant.result==='negative').map(t=><button key={t.id} className={action+' block w-full text-left'} onClick={()=>onOpenClassroomTask(t.id,selectedStudent.id)}>{t.checkDate} · {t.name} →</button>)}
            </div>

            <div className="glass-panel rounded-[24px] p-5">
              <h3 className="mb-3 text-sm font-black">课堂任务参与记录</h3>
              {taskReadError === taskStudentId && <p role="status" className="mb-3 text-sm text-amber-800 dark:text-amber-200">任务摘要读取失败，已保存的记录未改变。{visibleTasks ? '保留上次结果，请重新读取核对。' : '请重试读取。'}<button type="button" onClick={() => setTaskRetry(value => value + 1)} className="ml-2 min-h-11 px-2 font-bold underline">重试</button></p>}
              {visibleTasks === null && taskReadError !== taskStudentId && <p className="text-sm text-slate-500">正在读取任务记录…</p>}
              {visibleTasks?.length === 0 && <p className="text-sm text-slate-500">该学生暂无课堂任务参与记录。</p>}
              <div className="space-y-2">{visibleTasks?.map(task => <button type="button" key={task.id} onClick={() => onOpenClassroomTask(task.id, selectedStudent.id)} className="flex min-h-11 w-full min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-emerald-400 dark:border-zinc-700">
                <span className="min-w-0"><span className="block break-words text-sm font-semibold">{task.name}</span><span className="mt-1 block text-xs text-slate-500">{task.currentProjectLabel&&task.currentProjectLabel+' · '}{task.checkDate} · {task.mode === 'pass' ? '过关检查' : '完成检查'} · {task.lifecycle === 'active' ? '进行中' : task.lifecycle === 'ended' ? '已结束' : '已归档'}</span><span className="mt-2 block text-sm text-slate-600 dark:text-slate-300">{!task.participant.included ? '不参与' : task.participant.exempt ? '免做' : `首次：${task.participant.firstResult === 'positive' ? (task.mode === 'pass' ? '已通过' : '已完成') : task.participant.firstResult === 'negative' ? (task.mode === 'pass' ? '未通过' : '未完成') : '未记录'} · 当前：${task.participant.result === 'positive' ? (task.mode === 'pass' ? '已通过' : '已完成') : task.participant.result === 'negative' ? (task.mode === 'pass' ? '未通过' : '未完成') : '未记录'}`}</span></span>
                <span className="shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-300">查看记录 →</span>
              </button>)}</div>
            </div>
            <div className="glass-panel rounded-[24px] p-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="rounded-2xl bg-slate-50/80 dark:bg-zinc-900/50 p-3">
                  <p className="text-slate-400">状态</p>
                  <p className="font-black mt-1">{statusLabel[selectedStudent.status]}</p>
                </div>
                <div className="rounded-2xl bg-slate-50/80 dark:bg-zinc-900/50 p-3">
                  <p className="text-slate-400">班委职责</p>
                  <p className="font-black mt-1">{selectedStudent.committeeRoleIds.map(id=>committeeRoles.find(role=>role.id===id)?.name).filter(Boolean).join('、')||'无'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50/80 dark:bg-zinc-900/50 p-3">
                  <p className="text-slate-400">第一联系人</p>
                  <p className="font-black mt-1">{selectedStudent.parent.name || '未填写'} · {selectedStudent.parent.relation} · {selectedStudent.parent.phone}</p><p className="mt-1">{selectedStudent.parent.remark}</p>
                  <p className="mt-3 text-slate-400">第二联系人</p><p className="mt-1 font-semibold">{selectedStudent.secondaryParent?.name || '未填写'} · {selectedStudent.secondaryParent?.relation} · {selectedStudent.secondaryParent?.phone}</p><p>{selectedStudent.secondaryParent?.remark}</p>
                </div>
                <div className="rounded-2xl bg-slate-50/80 dark:bg-zinc-900/50 p-3">
                  <p className="text-slate-400">家庭关注</p>
                  <p className="font-black mt-1">{selectedStudent.familyStatusTag || '普通'}</p>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-[24px] p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black">日常表现标签</h3>
                <span className="text-[11px] text-slate-400">点击即可保存</span>
              </div>
              <BehaviorTagEditor selectedTags={selectedStudent.behaviorTags} onChange={behaviorTags => onUpdateStudent({ ...selectedStudent, behaviorTags })} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="glass-panel rounded-[24px] p-5">
                <h3 className="text-sm font-black mb-3">学得好的知识点 / 题型</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedStudent.strongKnowledge.map(item => (
                    <span key={item} className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 text-xs font-bold">{item}</span>
                  ))}
                </div>
              </div>
              <div className="glass-panel rounded-[24px] p-5">
                <h3 className="text-sm font-black mb-3">学得不好的知识点 / 题型</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedStudent.weakKnowledge.map(item => (
                    <span key={item} className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 text-xs font-bold">{item}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-[24px] p-5">
              <h3 className="text-sm font-black mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-700" />最近作业趋势</h3>
              <div className="h-32 flex items-end gap-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-900/50 p-4">
                {selectedStudent.recentHomeworkTrend.map((score, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-mono font-black text-emerald-800 dark:text-emerald-300">{score}</span>
                    <div className="w-full max-w-10 rounded-t-xl bg-emerald-600" style={{ height: `${Math.max(score * 0.75, 12)}px` }}></div>
                    <span className="text-[10px] text-slate-400">第{index + 1}次</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-[24px] overflow-hidden">
              <div className="p-5 border-b border-slate-200/70 dark:border-zinc-800/80">
                <h3 className="text-sm font-black">知识点错误记录</h3>
              </div>
              {errors.length ? errors.map(({ hw, err }) => (
                <div key={`${hw.id}-${err.questionId}`} className="p-4 grid grid-cols-1 md:grid-cols-[120px_1fr_120px] gap-3 text-sm border-b border-slate-200/60 dark:border-zinc-800/70 last:border-b-0">
                  <span className="text-xs text-slate-400">{hw.date}</span>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-100">{hw.title} · {err.questionTitle}</p>
                    <p className="text-xs text-slate-500 mt-1">{err.points.join('、')} · {err.errorType}</p>
                  </div>
                  <span className="text-xs font-bold text-amber-700">待巩固</span>
                </div>
              )) : (
                <div className="p-6 text-center text-sm text-slate-400">暂无知识点错误记录</div>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <div className="glass-panel rounded-[24px] p-5 space-y-3">
              <h3 className="text-sm font-black flex items-center gap-2"><MessageSquare className="w-4 h-4 text-emerald-700" />教师观察</h3>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={6} placeholder="记录课堂表现、作业习惯或家校沟通要点..." className="qs-field-input w-full p-3 rounded-2xl bg-slate-50/80 dark:bg-zinc-900/60 border border-slate-200/70 dark:border-zinc-800/80 text-sm resize-none focus:outline-none" />
              <GlassButton disabled={noteBusy} onClick={()=>void addNote()} variant="primary" containerClassName="w-full" className="py-2.5 text-xs font-bold transition-all">{noteBusy?'正在保存…':'保存观察'}</GlassButton>{noteError&&<p role="alert" className="text-sm text-red-700">{noteError}</p>}
            </div>
            <div className="glass-panel rounded-[24px] p-5">
              <h3 className="text-sm font-black mb-3">历史观察</h3>
              <div className="space-y-2">
                {selectedStudent.observationHistory.map((item, index) => (
                  <div key={index} className="p-3 rounded-2xl bg-slate-50/80 dark:bg-zinc-900/50 text-xs">
                    <p className="text-slate-400">{item.date}</p>
                    <p className="mt-1 text-slate-700 dark:text-slate-300">{item.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-bold text-slate-400">排序</span>
          <ProfileSort label="学号" value="studentNo" active={sortKey} direction={sortDirection} onSort={toggleSort}/>
          <ProfileSort label="姓名" value="name" active={sortKey} direction={sortDirection} onSort={toggleSort}/>
          <ProfileSort label="学习状态" value="status" active={sortKey} direction={sortDirection} onSort={toggleSort}/>
          <ProfileSort label="家庭关注" value="familyStatus" active={sortKey} direction={sortDirection} onSort={toggleSort}/>
          <ProfileSort label="最近趋势" value="recentScore" active={sortKey} direction={sortDirection} onSort={toggleSort}/>
        </div>
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索姓名/学号" className="qs-field-input w-full rounded-xl border border-slate-200/70 bg-white/80 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-600 dark:border-zinc-800/80 dark:bg-zinc-900/60" />
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
        {classStudents.map(student => (
          <button key={student.id} onClick={() => openDetail(student.id)} className="glass-panel group rounded-[20px] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-base text-slate-900 dark:text-slate-100">{student.name}</strong>
                  <span className="font-mono text-xs text-slate-400">{student.studentNo}</span>
                  {student.committeeRoleIds.map(roleId=><span key={roleId} className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">{committeeRoles.find(role=>role.id===roleId)?.name}</span>)}
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className={`rounded-full px-2 py-1 font-bold ${statusStyle[student.status]}`}>{statusLabel[student.status]}</span>
                  <span>家庭关注：{student.familyStatusTag || '普通'}</span>
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-700"><Eye className="h-3.5 w-3.5"/>查看</span>
            </span>
            <span className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3 dark:border-zinc-800">
              <span className="text-[11px] text-slate-400">最近作业趋势</span>
              <span className="flex h-7 items-end gap-1" aria-label={`最近成绩 ${student.recentHomeworkTrend.slice(-5).join('、') || '暂无'}`}>
                {student.recentHomeworkTrend.slice(-5).map((score, index) => <i key={index} className="w-2.5 rounded-t bg-emerald-500/80" style={{ height: `${Math.max(score / 4, 6)}px` }} />)}
                {!student.recentHomeworkTrend.length && <span className="text-[11px] text-slate-400">暂无</span>}
              </span>
            </span>
          </button>
        ))}
        {!classStudents.length && <div className="glass-panel col-span-full rounded-[20px] p-8 text-center text-sm text-slate-400">没有符合条件的学生</div>}
      </div>
    </div>
  );
}

function ProfileSort({label,value,active,direction,onSort}:{label:string;value:StudentSortKey;active:StudentSortKey;direction:SortDirection;onSort:(key:StudentSortKey)=>void}){const selected=value===active;return <button type="button" onClick={()=>onSort(value)} aria-label={`${label}${selected&&direction==='desc'?'降序':'升序'}排列`} className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${selected?'bg-emerald-100 text-emerald-800':'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800'}`}>{label}<ArrowUpDown className="h-3 w-3"/></button>}

