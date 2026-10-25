import { GlassButton } from '../../components/glass/Glass';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertTriangle, Check, CheckCircle2, FileImage, RefreshCw, ScanLine, ShieldCheck, Sparkles, Star, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ReviewItem } from '../../domain/types';
import ScoreKeypad from './ScoreKeypad';

interface ReviewQueuePageProps {
  reviewQueue: ReviewItem[];
  onConfirmReview: (reviewId: string, finalScore: number, changeReason: string) => void;
  onBounceToOcr: (reviewId: string) => void;
  onMarkAsSample: (studentName: string) => void;
  onShowToast: (message: string) => void;
}

type ReviewFilter = 'all' | 'ocr' | 'grading' | 'sample' | 'completed';

const filters: { id: ReviewFilter; label: string }[] = [
  { id: 'all', label: '全部异常' },
  { id: 'ocr', label: 'OCR 异常' },
  { id: 'grading', label: '评分异常' },
  { id: 'sample', label: '抽样检查' },
  { id: 'completed', label: '已完成' }
];

const inputClass = 'h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-emerald-600 dark:border-zinc-800 dark:bg-zinc-900';

export default function ReviewQueuePage({ reviewQueue, onConfirmReview, onBounceToOcr, onMarkAsSample, onShowToast }: ReviewQueuePageProps) {
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>('all');
  const [viewMode, setViewMode] = useState<'student' | 'question'>('student');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedItem = reviewQueue.find(item => item.id === selectedItemId) ?? null;
  const [editedScore, setEditedScore] = useState(0);
  const [reasonInput, setReasonInput] = useState('');
  const [sampledIds, setSampledIds] = useState<Set<string>>(() => new Set());

  const items = useMemo(() => reviewQueue.filter(item => {
    if (activeFilter === 'completed') return item.status === 'completed';
    if (item.status === 'completed') return false;
    if (activeFilter === 'all') return true;
    if (activeFilter === 'ocr') return (item.ocrConfidence ?? 1) < 0.85;
    if (activeFilter === 'sample') return item.type === 'pending-confirm';
    return item.type === 'low-confidence' || item.type === 'large-gap' || item.type === 'conflict';
  }), [activeFilter, reviewQueue]);

  const openItem = (item: ReviewItem) => {
    setSelectedItemId(item.id);
    setEditedScore(item.teacherFinalScore);
    setReasonInput('');
  };

  const confirmReview = () => {
    if (!selectedItem) return;
    onConfirmReview(selectedItem.id, editedScore, reasonInput || '教师根据原图、OCR 和评分证据完成终审。');
    onShowToast(`${selectedItem.studentName} 已完成教师终审，最终得分 ${editedScore} 分`);
    setSelectedItemId(null);
  };

  const returnToOcr = () => {
    if (!selectedItem) return;
    onBounceToOcr(selectedItem.id);
    onShowToast(`${selectedItem.studentName} 已退回 OCR 识别质检`);
    setSelectedItemId(null);
  };

  const pendingCount = reviewQueue.filter(item => item.status === 'pending').length;

  return (
    <div className="space-y-4" id="review-queue-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">{filters.map(filter => {
          const count = filter.id === 'completed' ? reviewQueue.filter(item => item.status === 'completed').length : filter.id === 'all' ? pendingCount : undefined;
          return <button key={filter.id} type="button" onClick={() => setActiveFilter(filter.id)} className={`rounded-2xl px-4 py-2.5 text-xs font-bold transition-all ${activeFilter === filter.id ? 'bg-emerald-700 text-white shadow-md shadow-emerald-700/10' : 'glass-panel text-slate-500 hover:text-slate-800 dark:text-slate-300'}`}>{filter.label}{count !== undefined ? ` ${count}` : ''}</button>;
        })}</div>
        <div className="glass-panel flex rounded-2xl bg-slate-100/60 p-2 dark:bg-zinc-900/60"><button type="button" onClick={() => setViewMode('student')} className={`rounded-xl px-4 py-2 text-xs font-bold ${viewMode === 'student' ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-slate-500'}`}>按学生</button><button type="button" onClick={() => setViewMode('question')} className={`rounded-xl px-4 py-2 text-xs font-bold ${viewMode === 'question' ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-slate-500'}`}>按题目</button></div>
      </div>

      {items.length ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map(item => {
            const primary = viewMode === 'student' ? item.studentName : item.questionTitle?.split('：')[0] ?? '阅读理解题';
            const secondary = viewMode === 'student' ? item.questionTitle : item.studentName;
            return (
              <button key={item.id} type="button" onClick={() => openItem(item)} className="glass-panel min-h-40 rounded-[24px] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-lg font-black text-slate-900 dark:text-white">{primary}</strong><span className="mt-1 block truncate text-xs font-bold text-slate-500">{secondary}</span></div><span className={`rounded-xl px-2 py-1 text-[10px] font-bold ${item.priority === 'high' ? 'bg-rose-100 text-rose-800' : item.priority === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{item.typeName}</span></div>
                <p className="mt-4 line-clamp-2 text-xs leading-5 text-slate-500">{item.differenceReason}</p>
                <div className="mt-4 flex items-center justify-between border-t border-slate-200/70 pt-3 text-[11px] dark:border-zinc-800"><span className="text-slate-400">{item.status === 'completed' ? '已完成' : '待教师处理'}</span><span className="font-bold text-emerald-700">查看证据</span></div>
              </button>
            );
          })}
        </section>
      ) : <section className="glass-panel flex min-h-72 flex-col items-center justify-center rounded-[24px] text-center"><CheckCircle2 className="h-10 w-10 text-emerald-500" /><p className="mt-3 text-sm font-bold text-slate-600 dark:text-slate-300">当前筛选下没有待复核项</p></section>}

      {selectedItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${selectedItem.studentName} 异常复核详情`}>
          <div className="flex max-h-[calc(100vh-32px)] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl dark:bg-zinc-950">
            <header className="flex flex-none items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 dark:border-zinc-800"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black text-slate-900 dark:text-white">{selectedItem.studentName}</h2><span className="rounded-xl bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">{selectedItem.typeName}</span></div><p className="mt-1 text-sm text-slate-500">{selectedItem.questionTitle}</p></div><button type="button" title="关闭详情" aria-label="关闭详情" onClick={() => setSelectedItemId(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button></header>

            <div className="min-h-0 overflow-y-auto p-5">
              <div className="grid gap-4 lg:grid-cols-3">
                <section className="glass-panel rounded-[24px] p-4"><h3 className="flex items-center gap-2 text-sm font-black"><FileImage className="h-4 w-4 text-emerald-700" />原始答卷</h3><div className="relative mx-auto mt-4 min-h-64 max-w-sm rotate-[-0.5deg] border border-slate-300 bg-[#fffdf7] p-5 shadow-sm"><span className="absolute right-4 top-3 font-mono text-xs text-slate-500">{selectedItem.studentId.toUpperCase()}</span><p className="mt-8 font-serif text-sm leading-8 text-slate-700">{selectedItem.studentAnswer}</p><p className="mt-5 border-t border-dashed border-slate-300 pt-3 text-[11px] leading-5 text-slate-400">模拟原图：{selectedItem.rawImageDescription}</p></div></section>
                <section className="glass-panel rounded-[24px] p-4"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-black"><ScanLine className="h-4 w-4 text-emerald-700" />OCR 文本</h3><span className="rounded-xl bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{Math.round((selectedItem.ocrConfidence ?? 1) * 100)}%</span></div><p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm leading-7 text-slate-700 dark:bg-zinc-900 dark:text-slate-200">{selectedItem.studentAnswer}</p><GlassButton type="button" onClick={returnToOcr} variant="secondary" containerClassName="mt-3" className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold"><RefreshCw className="h-3.5 w-3.5" />退回 OCR 质检</GlassButton></section>
                <section className="glass-panel rounded-[24px] p-4"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-black"><Sparkles className="h-4 w-4 text-emerald-700" />AI 评分</h3><span className="text-xs text-slate-400">置信度 {Math.round((selectedItem.gradingConfidence ?? 0.75) * 100)}%</span></div><div className="mt-3 flex items-end gap-1"><strong className="text-3xl">{selectedItem.aiSuggestedScore}</strong><span className="pb-1 text-sm text-slate-400">/ 6 分</span></div><div className="mt-3 rounded-2xl bg-rose-50 p-3 text-xs leading-5 text-rose-800"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{selectedItem.differenceReason}</div><div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-zinc-900 dark:text-slate-300"><strong>当前评分依据：</strong>{selectedItem.rubric}</div></section>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <ScoreKeypad value={editedScore} max={6} onChange={setEditedScore} onConfirm={confirmReview} />
                <label className="space-y-1"><span className="text-xs font-bold text-slate-500">终审理由</span><textarea rows={5} value={reasonInput} onChange={event => setReasonInput(event.target.value)} placeholder="说明采用或调整分数的证据" className={'qs-field-input '+(`${inputClass} h-auto resize-y py-3`)} /></label>
              </div>

              {selectedItem.aiReviews?.length ? <section className="glass-panel mt-4 rounded-[24px] p-4"><div className="flex items-start justify-between"><div><h3 className="text-sm font-black">三路 AI 独立评审</h3><p className="mt-1 text-xs text-slate-500">差异过大时只提供证据，不替代教师终审。</p></div><span className="rounded-xl bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">联合评审</span></div><div className="mt-4 grid gap-3 md:grid-cols-3">{selectedItem.aiReviews.map(review => <div key={review.reviewer} className="rounded-2xl border border-slate-200 p-3 dark:border-zinc-800"><div className="flex items-center justify-between"><strong className="text-xs">{review.reviewer}</strong><span className="text-sm font-black">{review.score} / 6</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{review.reason}</p><span className="mt-2 block text-[10px] text-slate-400">置信度 {Math.round(review.confidence * 100)}%</span></div>)}</div></section> : null}
            </div>

            <footer className="flex-none border-t border-slate-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-950"><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { setSampledIds(current => { const next = new Set(current); next.add(selectedItem.id); return next; }); onMarkAsSample(selectedItem.studentName); onShowToast(`${selectedItem.studentName} 已设为讲评样本`); }} className={`flex h-11 items-center gap-2 rounded-2xl border px-3 text-xs font-bold ${sampledIds.has(selectedItem.id) ? 'border-amber-300 bg-amber-100 text-amber-900' : 'border-slate-200 text-slate-600 dark:border-zinc-700 dark:text-slate-300'}`}><Star className={`h-4 w-4 ${sampledIds.has(selectedItem.id) ? 'fill-amber-500 text-amber-600' : 'text-amber-500'}`} />{sampledIds.has(selectedItem.id) ? '已收藏' : '讲评样本'}</button><GlassButton containerClassName="h-11" type="button" onClick={confirmReview} variant="primary" className="flex items-center gap-2 px-4 text-xs font-bold"><Check className="h-4 w-4" />确认裁定</GlassButton></div></footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
