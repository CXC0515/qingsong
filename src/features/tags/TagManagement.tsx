import { GlassButton, GlassSegments } from '../../components/glass/Glass';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Check, Edit3, Plus, Sparkles, Tag, Trash2 } from 'lucide-react';

interface TagGroup {
  id: string;
  name: string;
  desc: string;
  tags: { name: string; color: string; enabled: boolean }[];
}

const initialGroups: TagGroup[] = [
  {
    id: 'family',
    name: '家庭关注标签',
    desc: '用于记录家庭支持、沟通方式和学生成长环境。',
    tags: [
      { name: '留守儿童', color: 'rose', enabled: true },
      { name: '双职工家庭', color: 'blue', enabled: true },
      { name: '隔代教养', color: 'amber', enabled: true },
      { name: '单亲家庭', color: 'rose', enabled: true },
      { name: '重组家庭', color: 'violet', enabled: true },
      { name: '家长期望较高', color: 'emerald', enabled: true },
      { name: '作业陪伴不足', color: 'amber', enabled: true },
      { name: '沟通需谨慎', color: 'slate', enabled: true }
    ]
  },
  {
    id: 'academic',
    name: '学情状态标签',
    desc: '用于记录学生阶段性的学习优势、风险和能力变化。',
    tags: [
      { name: '阅读理解薄弱', color: 'amber', enabled: true },
      { name: '表达组织薄弱', color: 'amber', enabled: true },
      { name: '文言文薄弱', color: 'rose', enabled: true },
      { name: '作文稳定', color: 'emerald', enabled: true },
      { name: '进步明显', color: 'blue', enabled: true },
      { name: '波动较大', color: 'violet', enabled: true }
    ]
  },
  {
    id: 'behavior',
    name: '日常表现标签',
    desc: '用于记录课堂参与、作业习惯、情绪和同伴关系。',
    tags: [
      { name: '课堂积极', color: 'emerald', enabled: true },
      { name: '注意力易分散', color: 'amber', enabled: true },
      { name: '作业拖延', color: 'rose', enabled: true },
      { name: '书写认真', color: 'blue', enabled: true },
      { name: '情绪敏感', color: 'violet', enabled: true },
      { name: '同伴关系良好', color: 'emerald', enabled: true }
    ]
  },
  {
    id: 'risk',
    name: '风险提醒标签',
    desc: '用于进入工作台和班级可视化状态灯的提醒来源。',
    tags: [
      { name: '连续下降', color: 'rose', enabled: true },
      { name: '多次缺交', color: 'rose', enabled: true },
      { name: '低置信度频发', color: 'amber', enabled: true },
      { name: '需面批', color: 'blue', enabled: true },
      { name: '需家校沟通', color: 'violet', enabled: true }
    ]
  }
];

const tone: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200',
  rose: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200',
  violet: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-slate-200'
};

interface TagManagementProps {
  onShowToast: (message: string) => void;
}

export default function TagManagement({ onShowToast }: TagManagementProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [activeGroupId, setActiveGroupId] = useState('family');
  const [newTagName, setNewTagName] = useState('');

  const activeGroup = groups.find(g => g.id === activeGroupId) ?? groups[0];

  const addTag = () => {
    if (!newTagName.trim()) return;
    setGroups(groups.map(group => group.id === activeGroupId
      ? { ...group, tags: [...group.tags, { name: newTagName.trim(), color: 'emerald', enabled: true }] }
      : group
    ));
    setNewTagName('');
    onShowToast('标签已添加到当前分类');
  };

  const toggleTag = (name: string) => {
    setGroups(groups.map(group => group.id === activeGroupId
      ? { ...group, tags: group.tags.map(tag => tag.name === name ? { ...tag, enabled: !tag.enabled } : tag) }
      : group
    ));
  };

  const deleteTag = (name: string) => {
    setGroups(groups.map(group => group.id === activeGroupId
      ? { ...group, tags: group.tags.filter(tag => tag.name !== name) }
      : group
    ));
    onShowToast('标签已模拟删除');
  };

  return (
    <div className="space-y-5 animate-fade-in" id="tag-management-page">
      <GlassSegments label="标签大类" value={activeGroupId} options={groups.map(group=>({value:group.id,label:<><span>{{family:'家庭关注',academic:'学情状态',behavior:'日常表现',risk:'风险提醒'}[group.id]}</span><span className="qs-category-count">{group.tags.length}</span></>}))} onChange={setActiveGroupId}/>
      <div>
        <section className="glass-panel rounded-[24px] overflow-hidden">
          <div className="p-5 border-b border-slate-200/70 dark:border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-50 flex items-center gap-2">
                <Tag className="w-5 h-5 text-emerald-700" />
                {activeGroup.name}
              </h3>
              <p className="text-xs text-slate-500 mt-1">{activeGroup.desc}</p>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="输入新标签"
                className="qs-field-input min-w-0 flex-1 px-3 py-2 rounded-2xl bg-slate-50/80 dark:bg-zinc-900/60 border border-slate-200/70 dark:border-zinc-800/80 text-sm focus:outline-none"
              />
              <GlassButton containerClassName="shrink-0" onClick={addTag} variant="primary" className="min-h-11 px-3 py-2 text-xs font-bold flex items-center gap-1.5 transition-all">
                <Plus className="w-4 h-4" />
                添加
              </GlassButton>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2 md:p-5">
            {activeGroup.tags.map(tag => (
              <div key={tag.name} className="flex min-h-14 items-center gap-2 rounded-xl border border-slate-200/70 bg-white/65 p-1.5 pl-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
                <span className={`min-w-24 flex-1 whitespace-normal break-words rounded-full border px-2.5 py-1 text-xs font-bold leading-5 ${tag.enabled ? tone[tag.color] : 'border-slate-200 bg-slate-100 text-slate-400 dark:border-zinc-700 dark:bg-zinc-800'}`}>{tag.name}</span>
                <div className="ml-auto flex shrink-0 items-center gap-0.5">
                  <button onClick={() => toggleTag(tag.name)} aria-pressed={tag.enabled} aria-label={`${tag.enabled ? '停用' : '启用'}标签 ${tag.name}`} className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-2 text-xs font-bold transition-all active:scale-95 ${tag.enabled ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-slate-200 text-slate-500 dark:border-zinc-700 dark:text-slate-400'}`}>
                    <span className={`grid h-4 w-4 place-items-center rounded border ${tag.enabled ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-400 bg-white dark:bg-zinc-900'}`}>{tag.enabled ? <Check className="h-3 w-3" /> : null}</span>
                    {tag.enabled ? '已启用' : '已停用'}
                  </button>
                  <button onClick={() => onShowToast('已模拟打开标签编辑面板')} aria-label={`编辑标签 ${tag.name}`} className="grid h-11 w-11 place-items-center rounded-xl text-slate-500 transition-all active:scale-95">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteTag(tag.name)} aria-label={`删除标签 ${tag.name}`} className="grid h-11 w-11 place-items-center rounded-xl text-rose-600 transition-all active:scale-95">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mx-5 mb-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 p-4 text-xs text-slate-500 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-emerald-700 mt-0.5" />
            <p>这些标签后续会同步用于学生管理、学生画像、班级可视化状态灯、工作台提醒和家校沟通草稿。</p>
          </div>
        </section>
      </div>
    </div>
  );
}
