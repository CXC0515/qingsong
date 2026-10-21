import type { TaskListItem } from '../../domain/classroomTasks';
import { action } from './ClassroomTaskDialogs';

export default function ClassroomHistoryItem({ item, busy, onOpen, onArchive }: {
  key?: string; item: TaskListItem; busy: boolean; onOpen: () => void; onArchive: () => void;
}) {
  return <article className="relative flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
    <button onClick={onOpen} className="min-h-24 min-w-0 flex-1 p-1 text-left">
      <h3 className="break-words text-base font-bold">{item.name}</h3>
      <p className="mt-1 text-sm text-slate-500">{item.className} · {item.checkDate}{item.round!==undefined?' · 第'+item.round+'轮':''} · {item.lifecycle === 'archived' ? '已归档' : item.lifecycle === 'ended' ? '已结束' : '进行中'}</p>
      <p className="mt-3 text-sm">{item.mode === 'pass' ? '通过' : '完成'} {item.counts.positive} · 待跟进 {item.counts.negative} · 未记录 {item.counts.unrecorded} · 免做 {item.counts.exempt}</p>
    </button>
    <details className="relative shrink-0">
      <summary role="button" aria-label={item.name + '的操作'} className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-xl text-xl text-slate-500 hover:bg-slate-100">⋯</summary>
      <div className="absolute right-0 z-20 grid w-44 gap-2 rounded-xl border bg-white p-2 shadow-lg dark:bg-zinc-900">
        <button className={action} onClick={onOpen}>查看详情</button>
        <button className={action} disabled={busy} onClick={onArchive}>{busy ? '正在保存…' : item.lifecycle === 'archived' ? '恢复归档前状态' : '归档本次检查'}</button>
      </div>
    </details>
  </article>;
}
