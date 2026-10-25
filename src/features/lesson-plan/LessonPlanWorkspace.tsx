/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GlassButton, GlassSegments } from '../../components/glass/Glass';
import { SearchField, WorkspaceToolbar } from '../../components/WorkspaceUI';
import {
  BookOpenCheck, CheckSquare, FileText, Layers, Plus, Search, Sparkles
} from 'lucide-react';

interface LessonPlanWorkspaceProps {
  onShowToast: (message: string) => void;
}

type LessonPlanTab = 'tasks' | 'workflow' | 'review';

const tabs: { id: LessonPlanTab; label: string }[] = [
  { id: 'tasks', label: '教案任务' },
  { id: 'workflow', label: '教案工作流' },
  { id: 'review', label: '复核队列' }
];

const lessonTasks = [
  {
    title: '《驿路梨花》第二课时教学设计',
    className: '七年级 3 班',
    status: '待完善',
    node: '生成教学流程',
    deadline: '今天 20:00'
  },
  {
    title: '标题作用题讲评课微课设计',
    className: '七年级 3 班',
    status: '待复核',
    node: '教师复核',
    deadline: '明天 09:00'
  },
  {
    title: '第四单元复习课教学方案',
    className: '七年级 4 班',
    status: '草稿',
    node: '资料准备',
    deadline: '2026-07-08'
  }
];

export default function LessonPlanWorkspace({ onShowToast }: LessonPlanWorkspaceProps) {
  const [query,setQuery]=useState('');
  const [activeTab, setActiveTab] = useState<LessonPlanTab>('tasks');

  return (
    <div className="space-y-5 animate-fade-in" id="lesson-plan-workspace-page">
      <WorkspaceToolbar label="教案工作区">
        <GlassSegments label="教案页面" value={activeTab} options={tabs.map(tab=>({value:tab.id,label:tab.label}))} onChange={setActiveTab}/>
        <div className="qs-toolbar-actions"><span className="qs-muted">功能预览 · 暂未接入生成与保存</span><GlassButton disabled title="教案生成与保存暂未接入"><Plus className="w-4 h-4"/>新建教案任务</GlassButton></div>
      </WorkspaceToolbar>

      {activeTab === 'tasks' && (
        <div className="glass-panel rounded-[24px] overflow-hidden">
          <div className="p-4 border-b border-slate-200/70 dark:border-zinc-800/80 flex items-center gap-3">
            <SearchField className="qs-search-grow" placeholder="搜索示例教案、班级、课文" value={query} onChange={event=>setQuery(event.target.value)}/>

          </div>

          <div className="qs-lesson-row qs-lesson-heading px-5 py-3 text-[11px] font-black text-slate-400 uppercase border-b border-slate-200/70 dark:border-zinc-800/80">
            <span>任务</span>
            <span>班级</span>
            <span>当前节点</span>
            <span>状态</span>
          </div>
          {lessonTasks.filter(task=>(task.title+' '+task.className).includes(query)).map(task => (
            <div key={task.title} className="qs-lesson-row px-5 py-4 items-center border-b border-slate-200/60 dark:border-zinc-800/70 last:border-b-0 hover:bg-slate-50/70 dark:hover:bg-zinc-900/50 transition-all">
              <div>
                <p className="text-sm font-black text-slate-800 dark:text-slate-100">{task.title}</p>
                <p className="text-xs text-slate-400 mt-1">截止：{task.deadline}</p>
              </div>
              <span className="text-sm text-slate-600 dark:text-slate-300">{task.className}</span>
              <span className="w-fit px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 text-xs font-bold">{task.node}</span>
              <span className="text-xs font-bold text-slate-500">{task.status}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'workflow' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
          <div className="glass-panel rounded-[24px] p-6 space-y-5">
            <div className="flex items-center gap-2">
              <BookOpenCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
              <h3 className="text-base font-black text-slate-900 dark:text-slate-50">教案工作流预览</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {['选择课文与课时', '读取资料与目标', '生成教学流程', '教师调整确认'].map((step, index) => (
                <div key={step} className="p-4 rounded-2xl border border-slate-200/70 dark:border-zinc-800/80 bg-slate-50/70 dark:bg-zinc-900/50">
                  <span className="text-[10px] font-black text-slate-400">STEP {index + 1}</span>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">{step}</p>
                </div>
              ))}
            </div>
            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">教案生成暂未接入</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                输入课文、课时、班级学情和教学目标后，生成教学目标、重难点、课堂流程、板书、提问链和作业建议，并进入教案复核队列。
              </p>
            </div>
          </div>

          <div className="glass-panel rounded-[24px] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
              <h3 className="text-base font-black text-slate-900 dark:text-slate-50">生成结果预览</h3>
            </div>
            {['教学目标', '问题链', '课堂活动', '板书结构'].map(item => (
              <div key={item} className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/70 dark:border-zinc-800/80">
                <span className="text-xs font-black text-slate-700 dark:text-slate-200">{item}</span>
                <p className="text-[11px] text-slate-400 mt-1">等待 AI 教案工作流生成。</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'review' && (
        <div className="glass-panel rounded-[24px] p-8 text-center">
          <CheckSquare className="w-12 h-12 mx-auto text-slate-300 stroke-1 mb-3" />
          <h3 className="text-base font-black text-slate-900 dark:text-slate-50">教案复核队列</h3>
          <p className="text-sm text-slate-500 mt-2">教案生成功能接入后，可在这里复核结果。当前没有待复核教案。</p>
        </div>
      )}
    </div>
  );
}

