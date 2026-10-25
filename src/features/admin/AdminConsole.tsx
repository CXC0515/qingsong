import { GlassButton } from '../../components/glass/Glass';
/** @license SPDX-License-Identifier: Apache-2.0 */

import { ArrowLeft, LogOut, ShieldCheck } from 'lucide-react';
import AccountAccessPanel from '../settings/AccountAccessPanel';

interface AdminConsoleProps {
  accountEmail: string;
  onReturn: () => void;
  onSignOut: () => void;
}

export default function AdminConsole({ accountEmail, onReturn, onSignOut }: AdminConsoleProps) {
  return <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-800 dark:bg-zinc-950 dark:text-slate-100">
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 dark:border-zinc-800 dark:bg-zinc-900/95">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white"><ShieldCheck className="h-5 w-5" /></span>
          <div><p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">教师 AI 助手</p><strong className="text-lg font-black">管理后台</strong></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden max-w-52 truncate text-xs text-slate-500 md:block">{accountEmail}</span>
          <GlassButton type="button" onClick={onReturn} variant="secondary" className="inline-flex min-h-11 items-center gap-2 px-3 text-sm font-bold"><ArrowLeft className="h-4 w-4" />返回教师工作台</GlassButton>
          <GlassButton containerClassName="h-11 w-11" type="button" onClick={onSignOut} aria-label="退出登录" title="退出登录" variant="secondary" className="grid place-items-center"><LogOut className="h-4 w-4" /></GlassButton>
        </div>
      </div>
    </header>
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6"><p className="text-xs font-bold tracking-wider text-emerald-700 dark:text-emerald-300">平台管理</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">账号与邀请</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">管理教师账号和一次性邀请。每位教师的班级、资料与批改内容仍属于其独立工作区。</p></div>
      <AccountAccessPanel />
    </main>
  </div>;
}
