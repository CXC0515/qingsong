import { GlassButton } from '../../components/glass/Glass';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  User, Sparkles, TrendingUp, AlertTriangle, BookOpen, Calendar, 
  ChevronRight, Award, Brain, Mail, MessageSquare, Phone, Plus, History, Download 
} from 'lucide-react';
import { Student, SchoolClass, TeacherObservation } from '../../domain/types';

interface StudentProfileProps {
  students: Student[];
  classes: SchoolClass[];
  selectedStudentId: string;
  onSelectStudent: (studentId: string) => void;
  onAddObservation: (studentId: string, note: TeacherObservation) => void;
  onShowToast: (message: string) => void;
}

export default function StudentProfile({
  students,
  classes,
  selectedStudentId,
  onSelectStudent,
  onAddObservation,
  onShowToast
}: StudentProfileProps) {
  const [newObsText, setNewObsText] = useState('');
  const [newObsCategory, setNewObsCategory] = useState<'study' | 'behavior' | 'emotion' | 'attendance'>('study');

  const selectedStudent = students.find(s => s.id === selectedStudentId) || students[0];
  const currentClass = classes.find(c => c.id === selectedStudent.classId) || classes[0];

  // Abilities ratings mock data
  const abilities = [
    { label: '背诵默写', score: selectedStudent.status === 'risk' ? 55 : (selectedStudent.status === 'outstanding' ? 95 : 82), color: 'bg-emerald-500' },
    { label: '阅读理解', score: selectedStudent.status === 'risk' ? 62 : (selectedStudent.status === 'outstanding' ? 98 : 78), color: 'bg-emerald-500' },
    { label: '文体写作', score: selectedStudent.status === 'risk' ? 70 : (selectedStudent.status === 'outstanding' ? 92 : 85), color: 'bg-emerald-500' },
    { label: '字词运用', score: selectedStudent.status === 'risk' ? 58 : (selectedStudent.status === 'outstanding' ? 90 : 80), color: 'bg-emerald-500' },
    { label: '文言常识', score: selectedStudent.status === 'risk' ? 45 : (selectedStudent.status === 'outstanding' ? 96 : 74), color: 'bg-amber-500' }
  ];

  const handleAddObsSubmit = () => {
    if (!newObsText.trim()) return;
    const newNote: TeacherObservation = {
      date: '2026-07-02',
      type: 'neutral',
      category: newObsCategory,
      content: newObsText.trim(),
      author: '王王老师'
    };
    onAddObservation(selectedStudent.id, newNote);
    onShowToast(`✏️ 成功录入关于 [${selectedStudent.name}] 的课堂日常随笔观察！`);
    setNewObsText('');
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'study': return '学习状态';
      case 'behavior': return '日常行为';
      case 'emotion': return '情绪起伏';
      case 'attendance': return '出勤习惯';
      default: return '其他';
    }
  };

  const getCategoryStyle = (cat: string) => {
    switch (cat) {
      case 'study': return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'behavior': return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'emotion': return 'bg-purple-50 text-purple-800 border-purple-200';
      default: return 'bg-amber-50 text-amber-800 border-amber-200';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" id="student-profile-page">
      
      {/* Top Selector Card */}
      <div className="glass-panel rounded-3xl p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {/* Avatar mock */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold text-lg shadow-md">
            {selectedStudent.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{selectedStudent.name}</h2>
              {selectedStudent.committeeRoleIds.length > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">班委</span>
              )}
            </div>
            <p className="text-xs text-slate-400">学号：{selectedStudent.studentNo} · {selectedStudent.className}</p>
          </div>
        </div>

        {/* Change selected Student drop downs */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-semibold">选择学生电子画像：</span>
          <select
            value={selectedStudent.id}
            onChange={(e) => onSelectStudent(e.target.value)}
            className="qs-field-input px-3 py-1.5 bg-slate-50 dark:bg-zinc-850 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-600 dark:text-slate-200 font-semibold cursor-pointer"
          >
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.className})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main grids: Abilities & History VS Observation journal */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left column: Score trend & Core abilities radar-bar */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* Abilities bars */}
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Brain className="w-4.5 h-4.5 text-emerald-600" />
              语文核心素养五维度能力分布 (知识图谱定位)
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {abilities.map((ab, idx) => (
                <div key={idx} className="space-y-1.5 text-xs">
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-600 dark:text-slate-300">{ab.label}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">{ab.score}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${ab.color} rounded-full`}
                      style={{ width: `${ab.score}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Homework Scores sparkline history */}
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <History className="w-4.5 h-4.5 text-emerald-600" />
                近期语文课作业与考卷成绩走势
              </h3>
              <span className="text-xs text-slate-400">最近五次作业/课堂测验</span>
            </div>

            <div className="flex items-end justify-between h-24 pt-4 px-4 bg-slate-50 dark:bg-zinc-850/20 rounded-2xl relative">
              {/* Simple background guide lines */}
              <div className="absolute inset-x-0 top-1/4 border-t border-slate-100 dark:border-zinc-800/40 border-dashed pointer-events-none"></div>
              <div className="absolute inset-x-0 top-2/4 border-t border-slate-100 dark:border-zinc-800/40 border-dashed pointer-events-none"></div>
              <div className="absolute inset-x-0 top-3/4 border-t border-slate-100 dark:border-zinc-800/40 border-dashed pointer-events-none"></div>

              {selectedStudent.recentHomeworkTrend.map((score, i) => (
                <div key={i} className="flex flex-col items-center flex-1 space-y-1.5 z-10">
                  <span className="text-xs font-mono font-black text-emerald-800 dark:text-emerald-400">{score}</span>
                  <div 
                    className="w-8 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 rounded-t-lg transition-all"
                    style={{ height: `${score * 0.6}px` }}
                  ></div>
                  <span className="text-[9px] text-slate-400">测验 {i + 1}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Academic Strengths & Weaknesses detailed */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 text-xs space-y-2">
              <span className="font-bold text-emerald-800 dark:text-emerald-400 block">✓ 学科优势与核心强项</span>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
                {selectedStudent.strongKnowledge.join('、')}：大模型深度语义对齐中展现出优秀的文学情感共鸣。文字通顺细腻，能敏锐感悟古诗词情景象征。
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-xs space-y-2">
              <span className="font-bold text-amber-800 dark:text-amber-400 block">✗ 学科瓶颈与诊断点</span>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
                {selectedStudent.weakKnowledge.join('、')}：对文言文特殊实词及课外虚词在不同文境下的具体含义常有混淆，导致解题翻译不周密。
              </p>
            </div>

          </div>

        </div>

        {/* Right column: Observation Journal (Teacher Diary) */}
        <div className="glass-panel rounded-3xl p-5 flex flex-col justify-between space-y-5">
          
          <div className="space-y-4 flex-1">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <MessageSquare className="w-4.5 h-4.5 text-emerald-600" />
              课堂日常实录与家校观察日志
            </h3>

            {/* Observation List */}
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {selectedStudent.observationHistory.map((note, index) => (
                <div 
                  key={index} 
                  id={`obs-note-${index}`}
                  className="p-3 border rounded-xl space-y-1.5 text-xs bg-slate-50/50 dark:bg-zinc-800/20"
                >
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.2 border text-[9px] font-semibold rounded ${getCategoryStyle((note as any).category || 'study')}`}>
                      {getCategoryLabel((note as any).category || 'study')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{note.date} · {(note as any).author || '教师'}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-normal font-sans">{note.content}</p>
                </div>
              ))}

              {selectedStudent.observationHistory.length === 0 && (
                <span className="text-xs text-slate-400 italic block text-center pt-8">暂无添加任何课堂随笔观察。</span>
              )}
            </div>
          </div>

          {/* Form to insert observation */}
          <div className="pt-4 border-t space-y-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">添加新观察随记</span>
            
            <div className="flex gap-2">
              <select
                value={newObsCategory}
                onChange={(e) => setNewObsCategory(e.target.value as any)}
                className="qs-field-input px-2 py-1 bg-slate-100 border rounded-lg text-xs"
              >
                <option value="study">学习状态</option>
                <option value="behavior">行为态度</option>
                <option value="emotion">心理情绪</option>
                <option value="attendance">出勤/漏交</option>
              </select>
              <span className="text-xs text-slate-400 self-center">记录分类</span>
            </div>

            <textarea
              value={newObsText}
              onChange={(e) => setNewObsText(e.target.value)}
              placeholder="记录孩子今天的亮点表现或潜在异常状态..."
              className="qs-field-input w-full h-20 p-2.5 text-xs bg-slate-50 dark:bg-zinc-850/20 border border-slate-200 rounded-xl focus:outline-none"
            />

            <GlassButton
              onClick={handleAddObsSubmit}
              variant="primary" containerClassName="w-full" className="py-2 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              保存课堂随记到档案
            </GlassButton>
          </div>

        </div>

      </div>

      {/* Parent info & Family support context card */}
      <div className="glass-panel rounded-3xl p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Parent contacts detail */}
        <div className="space-y-3 text-xs">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">家长联系方式 & 随堂预约情况</span>
          
          <div className="p-4 border rounded-2xl bg-slate-50 dark:bg-zinc-800/40 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-700 dark:text-slate-300">{selectedStudent.parent.name} ({selectedStudent.parent.relation})</span>
              <span className="font-mono text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />
                {selectedStudent.parent.phone}
              </span>
            </div>
            
            <div className="p-2.5 bg-amber-500/5 rounded-xl border border-dashed text-slate-500 text-[11px] leading-relaxed">
              <b>家校沟通随手记:</b> “{selectedStudent.parent.remark}”
            </div>
          </div>
        </div>

        {/* Family situation details */}
        <div className="space-y-3 text-xs">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">家庭关注点 & 关怀建议</span>
          <div className="p-4 border rounded-2xl bg-slate-50 dark:bg-zinc-800/40 space-y-2.5">
            <div className="flex justify-between items-center">
              <span>家庭关照等级:</span>
              <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                selectedStudent.familyStatusTag ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {selectedStudent.familyStatusTag || '家庭关怀良好（普通）'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
              <b>关怀建议:</b> 
              {selectedStudent.familyStatusTag === '留守儿童' ? ' 父母长年在外务工，隔代监护容易产生溺爱和学习滞后。在语文作业收缴提醒和早自习背诵时，任课老师需倾注更多温和鼓励。' :
               selectedStudent.familyStatusTag === '单亲关注' ? ' 父母离异重组，孩子容易敏感内敛。课堂上可创造协助收发、优秀作业范文投屏展示的机会，建立班级归属感。' :
               ' 该生家庭教育重视度高，亲子沟通顺畅。日常表现平稳，教学中多鼓励其发挥语文骨干引领作用即可。'}
            </p>
          </div>
        </div>

      </div>

      {/* AI helper bottom actions toolbar */}
      <div className="glass-panel rounded-3xl p-5 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs">
          <Sparkles className="w-4.5 h-4.5 text-emerald-700" />
          <span className="font-bold text-slate-800 dark:text-slate-100">
            大模型提分智囊：已为您实时分析 {selectedStudent.name} 的所有知识点薄弱项。
          </span>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <GlassButton
            onClick={() => {
              onShowToast(`📄 正在生成学生 [${selectedStudent.name}] 的“学情诊断致家长的一封信” PDF 报告...导出成功！`);
            }}
            variant="secondary" containerClassName="flex-1 md:flex-none" className="px-4 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            生成家长汇报单
          </GlassButton>
          <GlassButton
            onClick={() => {
              onShowToast(`🌟 已成功为 [${selectedStudent.name}] 定制了《文言常识与虚词特训方案》，配套自适应微课切片及 5 道精选题，已同步推送至其课后答题器中！`);
            }}
            variant="primary" containerClassName="flex-1 md:flex-none" className="px-4 py-2 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Brain className="w-4 h-4" />
            一键AI定制辅导方案
          </GlassButton>
        </div>
      </div>

    </div>
  );
}

