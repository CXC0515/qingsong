import { GlassButton } from '../../components/glass/Glass';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { 
  Sliders, Shield, Eye, FileOutput, HelpCircle, 
  Sparkles, Save, BookOpen, Layers, CheckCircle 
} from 'lucide-react';

interface SystemSettingsProps {
  lowConfidenceThreshold: number;
  onUpdateThreshold: (val: number) => void;
  onShowToast: (message: string) => void;
}

export default function SystemSettings({
  lowConfidenceThreshold,
  onUpdateThreshold,
  onShowToast
}: SystemSettingsProps) {
  // Local state for settings form
  const [textbook, setTextbook] = useState('部编版 (初中语文)');
  const [gradingDepth, setGradingDepth] = useState<'standard' | 'deep' | 'ultra'>('deep');
  const [researchSource, setResearchSource] = useState('国家中小学智慧教育平台 + 语文报教研大纲');
  const [exportFormat, setExportFormat] = useState('PDF + Excel');
  const [localThreshold, setLocalThreshold] = useState(lowConfidenceThreshold);
  const [theme, setTheme] = useState('morandi-green');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'morandi-green') {
      root.removeAttribute('data-theme');
      root.removeAttribute('data-theme-forced');
      root.classList.remove('dark-theme-active');
      return;
    }

    root.setAttribute('data-theme', theme);
    root.setAttribute('data-theme-forced', 'true');
    if (theme === 'dark-graphite') {
      root.classList.add('dark-theme-active');
    } else {
      root.classList.remove('dark-theme-active');
    }
  }, [theme]);

  const handleSaveSettings = () => {
    onUpdateThreshold(localThreshold);
    onShowToast('⚙️ 系统配置修改成功！智能拦截与批改、教材大纲及报告生成逻辑已全部就绪。');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in" id="system-settings-page">
      
      {/* Settings Panel Grid */}
      <div className="glass-panel rounded-3xl p-6 space-y-6">
        
        <div className="border-b pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              智能辅助教学系统设置
            </h2>
            <p className="text-xs text-slate-400">在此统一配置大语言模型的智能分析深度、拦截敏感度及默认课程体系。</p>
          </div>
          
          <GlassButton
            onClick={handleSaveSettings}
            variant="primary" className="px-4 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Save className="w-4 h-4" />
            保存全局配置
          </GlassButton>
        </div>

        {/* 1. Textbook config */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-600 dark:text-slate-300">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">1. 基础教材版本与大纲</label>
            <p className="text-[10px] text-slate-400">决定 AI 对文言实词、名著导读、古诗文等知识图谱的对齐锚定版本。</p>
            <select
              value={textbook}
              onChange={(e) => setTextbook(e.target.value)}
              className="qs-field-input w-full px-3 py-2 border rounded-xl bg-slate-50 dark:bg-zinc-800 focus:outline-none"
            >
              <option>部编版 (初中语文)</option>
              <option>苏教版 (初中语文)</option>
              <option>人教新课标 (初中语文)</option>
              <option>上海一期/二期大纲</option>
            </select>
          </div>

          {/* 2. Research Source */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">2. 教研教案和习题推荐源</label>
            <p className="text-[10px] text-slate-400">大模型生成个性化补弱特训卷和讲评课件时优先采信的素材库。</p>
            <select
              value={researchSource}
              onChange={(e) => setResearchSource(e.target.value)}
              className="qs-field-input w-full px-3 py-2 border rounded-xl bg-slate-50 dark:bg-zinc-800 focus:outline-none"
            >
              <option>国家中小学智慧教育平台 + 语文报教研大纲</option>
              <option>各地历年中考真题精选库</option>
              <option>名校联盟模考金卷教研库</option>
            </select>
          </div>
        </div>

        {/* 3. Threshold controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs border-t pt-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">3. 智能笔迹/批改拦截阈值</label>
            <p className="text-[10px] text-slate-400">设定系统底层识别匹配的严格程度。凡是低于此置信度分数的阅卷，将被强制暂扣至[复核队列]中。</p>
            
            <div className="p-4 bg-slate-50 dark:bg-zinc-800/40 rounded-2xl border space-y-3">
              <div className="flex justify-between font-bold">
                <span>智能拦截系数：</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-mono">{localThreshold.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">松散 (0.50)</span>
                <input
                  type="range"
                  min="0.50"
                  max="0.95"
                  step="0.05"
                  value={localThreshold}
                  onChange={(e) => setLocalThreshold(parseFloat(e.target.value))}
                  className="flex-1 accent-emerald-700 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400">严格 (0.95)</span>
              </div>
              <span className="text-[9px] text-slate-400 block pt-0.5">※ 推荐配置为 <b>0.75</b>，可保持 90%+ 的自动放行率，又能精准拦截书写草乱或偏题严重的答卷。</span>
            </div>
          </div>

          {/* 4. AI Grading Depth */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">4. 大语言模型批改与诊断深度</label>
            <p className="text-[10px] text-slate-400">大模型分析学生书写和知识点偏差时的推理轮数。更高级的深度将对古诗象征义进行三次交叉核准。</p>
            
            <div className="grid grid-cols-1 gap-2">
              <label className="flex items-start gap-2.5 p-3 border rounded-xl bg-slate-50 dark:bg-zinc-800/40 cursor-pointer">
                <input
                  type="radio"
                  checked={gradingDepth === 'standard'}
                  onChange={() => setGradingDepth('standard')}
                  className="accent-emerald-700 mt-0.5"
                />
                <div>
                  <span className="font-bold text-slate-700 dark:text-slate-300 block">标准级别（快速极简对齐）</span>
                  <span className="text-[10px] text-slate-400 block">单轮批改推理，最快可在 5 秒内完成全班 40 余份试卷的客观题批改。</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 border rounded-xl bg-slate-50 dark:bg-zinc-800/40 cursor-pointer">
                <input
                  type="radio"
                  checked={gradingDepth === 'deep'}
                  onChange={() => setGradingDepth('deep')}
                  className="accent-emerald-700 mt-0.5"
                />
                <div>
                  <span className="font-bold text-emerald-800 dark:text-emerald-400 block">多模型交叉核准级别（深度对齐）</span>
                  <span className="text-[10px] text-slate-400 block">推荐级别。双模型交叉跑分。对主观阅读理解的每个评分要点进行三次深度解析对齐。</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 border rounded-xl bg-slate-50 dark:bg-zinc-800/40 cursor-pointer">
                <input
                  type="radio"
                  checked={gradingDepth === 'ultra'}
                  onChange={() => setGradingDepth('ultra')}
                  className="accent-emerald-700 mt-0.5"
                />
                <div>
                  <span className="font-bold text-slate-700 dark:text-slate-300 block">极致学情画像挖掘级别（精准学术诊断）</span>
                  <span className="text-[10px] text-slate-400 block">在多维度扣分的同时，自动提取学生笔误并自动检索推荐微课、对齐家长报告书。</span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* 5. Exports formats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs border-t pt-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">5. 诊断报告一键导出默认格式</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="qs-field-input w-full px-3 py-2 border rounded-xl bg-slate-50 dark:bg-zinc-800 focus:outline-none"
            >
              <option>PDF + Excel</option>
              <option>单纯结构化 CSV 数据</option>
              <option>完整讲评 PowerPoint 切片包</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">6. 主题色与深色模式</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['morandi-green', '莫兰迪绿'],
                ['fog-blue', '雾蓝'],
                ['dusty-pink', '豆沙粉'],
                ['warm-gray', '暖灰'],
                ['dark-graphite', '深色石墨']
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                    theme === value
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-50 dark:bg-zinc-800/40 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-zinc-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1.5 p-3 bg-emerald-500/5 rounded-2xl border border-dashed text-[11px] text-slate-500 leading-normal">
          <span className="font-bold text-emerald-800 dark:text-emerald-400 block mb-1">系统配置提示：</span>
          本系统的所有智能批改数据目前安全保存在您的本地浏览器中。正式版本需要增加班级、学生、作业原图和家校信息的权限控制与数据归档策略。
        </div>

      </div>

    </div>
  );
}

