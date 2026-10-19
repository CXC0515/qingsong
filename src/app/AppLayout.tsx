import { Bell, Boxes, CalendarDays, ChevronDown, GraduationCap, HelpCircle, LogOut, Menu, MoreHorizontal, Network, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { SchoolClass, TeacherProfile } from '../domain/types';
import type { NavGroup, PageId } from './navigation';

interface AppLayoutProps {
  activePage: PageId;
  classes: SchoolClass[];
  expandedGroups: Record<string, boolean>;
  navGroups: NavGroup[];
  pendingReviewCount: number;
  selectedClass?: SchoolClass;
  selectedClassId: string;
  showToast: boolean;
  toastMessage: string | null;
  teacherProfile: TeacherProfile;
  accountEmail: string;
  scheduleSection: 'schedule' | 'reminders';
  children: ReactNode;
  onSelectClass: (classId: string) => void;
  onSelectPage: (pageId: PageId) => void;
  onSelectScheduleSection: (section: 'schedule' | 'reminders') => void;
  onOpenScheduleTools: () => void;
  onToggleGroup: (groupId: string) => void;
  onSignOut: () => void;
  isOwner: boolean;
  onEnterAdmin: () => void;
}

export default function AppLayout({
  activePage,
  classes,
  expandedGroups,
  navGroups,
  pendingReviewCount,
  selectedClass,
  selectedClassId,
  showToast,
  toastMessage,
  teacherProfile,
  accountEmail,
  scheduleSection,
  children,
  onSelectClass,
  onSelectPage,
  onSelectScheduleSection,
  onOpenScheduleTools,
  onToggleGroup,
  onSignOut,
  isOwner,
  onEnterAdmin,
}: AppLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setAccountMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [accountMenuOpen]);
  const isLibraryWorkspace = activePage === 'knowledge-graph' || activePage === 'library-editor';
  const isImmersiveWorkspace = isLibraryWorkspace || activePage === 'classroom-tasks' || activePage === 'material-pool' || activePage.startsWith('career-');
  const selectPage = (pageId: PageId) => {
    onSelectPage(pageId);
    setMobileNavOpen(false);
  };

  return (
    <div className="h-dvh overflow-hidden bg-slate-100 dark:bg-zinc-950 text-slate-800 dark:text-slate-100 font-sans flex flex-col antialiased">
      <header className="app-shell-header flex-none bg-white/75 dark:bg-zinc-900/75 backdrop-blur-2xl border-b border-slate-200/70 dark:border-zinc-800/80 px-3 sm:px-6 flex items-center justify-between z-30">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"
            aria-label="打开导航"
            aria-expanded={mobileNavOpen}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="hidden items-center gap-3 sm:flex">
            <div className="w-10 h-10 rounded-[20px] bg-emerald-700 dark:bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-900/10">
              <GraduationCap className="w-5.5 h-5.5" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-1.5">
                青松教师
                <span className="text-[10px] bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold px-1.5 py-0.2 rounded-full border border-emerald-500/10">
                  PRO v1.5
                </span>
              </h1>
              <p className="hidden text-[10px] text-slate-400 sm:block">教学证据采集、作业 AI 批改、学情诊断和学生画像平台</p>
            </div>
          </div>
          {isLibraryWorkspace && (
            <div className="flex min-w-0 items-center rounded-xl border border-slate-200/80 bg-slate-100/80 p-0.5 sm:hidden dark:border-zinc-700/80 dark:bg-zinc-800/80">
              <button
                type="button"
                onClick={() => selectPage('knowledge-graph')}
                className={`flex min-h-9 items-center gap-1 rounded-[10px] px-2.5 text-[11px] font-bold ${activePage === 'knowledge-graph' ? 'bg-white text-emerald-800 shadow-sm dark:bg-zinc-700 dark:text-emerald-200' : 'text-slate-500 dark:text-zinc-400'}`}
              >
                <Network className="h-3.5 w-3.5" />
                知识图谱
              </button>
              <button
                type="button"
                onClick={() => selectPage('library-editor')}
                className={`flex min-h-9 items-center gap-1 rounded-[10px] px-2.5 text-[11px] font-bold ${activePage === 'library-editor' ? 'bg-white text-emerald-800 shadow-sm dark:bg-zinc-700 dark:text-emerald-200' : 'text-slate-500 dark:text-zinc-400'}`}
              >
                <Boxes className="h-3.5 w-3.5" />
                资料编辑
              </button>
            </div>
          )}
          {activePage === 'schedule' && (
            <div className="flex min-w-0 items-center rounded-xl border border-slate-200/80 bg-slate-100/80 p-0.5 sm:hidden dark:border-zinc-700/80 dark:bg-zinc-800/80">
              <button type="button" onClick={() => onSelectScheduleSection('schedule')} className={`flex min-h-9 items-center gap-1 rounded-[10px] px-3 text-[11px] font-bold ${scheduleSection === 'schedule' ? 'bg-white text-emerald-800 shadow-sm dark:bg-zinc-700 dark:text-emerald-200' : 'text-slate-500 dark:text-zinc-400'}`}>
                <CalendarDays className="h-3.5 w-3.5" />课表
              </button>
              <button type="button" onClick={() => onSelectScheduleSection('reminders')} className={`flex min-h-9 items-center gap-1 rounded-[10px] px-3 text-[11px] font-bold ${scheduleSection === 'reminders' ? 'bg-white text-emerald-800 shadow-sm dark:bg-zinc-700 dark:text-emerald-200' : 'text-slate-500 dark:text-zinc-400'}`}>
                <Bell className="h-3.5 w-3.5" />日程
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {activePage === 'schedule' && (
            <button type="button" onClick={onOpenScheduleTools} className="grid h-11 w-11 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 sm:hidden dark:text-slate-300 dark:hover:bg-zinc-800" aria-label="更多课表操作" title="更多课表操作">
              <MoreHorizontal className="h-5 w-5" />
            </button>
          )}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/65 dark:bg-zinc-800/65 border border-slate-200/70 dark:border-zinc-700/70 text-[11px] text-slate-500 dark:text-slate-400">
            <span>2026 春季学期</span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span>初中语文</span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span>统编版七年级下册</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-700/10">
            <span className="text-[11px] font-bold text-emerald-900/60 dark:text-emerald-200/70">当前班级</span>
            <select
              value={selectedClassId}
              onChange={(e) => onSelectClass(e.target.value)}
              className="bg-transparent text-xs font-semibold cursor-pointer text-emerald-950 dark:text-emerald-100 focus:outline-none"
            >
              {classes.filter(c => c.status === 'active').map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <button type="button" onClick={() => setAccountMenuOpen(open => !open)} aria-label="账号菜单" aria-expanded={accountMenuOpen} className="flex min-h-11 items-center gap-2 rounded-xl px-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800">
              <span className="hidden text-right sm:block"><span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">{teacherProfile.nickname}</span><span className="block max-w-36 truncate text-[10px] text-slate-400">{accountEmail}</span></span>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-200/90 text-xs font-bold text-slate-700 dark:bg-zinc-800 dark:text-slate-200">{(teacherProfile.nickname.trim() || teacherProfile.realName.trim() || '师')[0]}</span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
            </button>
            {accountMenuOpen && <>
              <button type="button" aria-label="关闭账号菜单" className="fixed inset-0 z-40 cursor-default" onClick={() => setAccountMenuOpen(false)} />
              <div aria-label="账号操作" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                <p className="break-all px-3 py-2 text-xs text-slate-500">{accountEmail}</p>
                {isOwner && <button type="button" onClick={() => { setAccountMenuOpen(false); onEnterAdmin(); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-slate-700 hover:bg-emerald-50 dark:text-slate-100 dark:hover:bg-zinc-800"><ShieldCheck className="h-4 w-4 text-emerald-700" />进入管理后台</button>}
                <button type="button" onClick={() => { setAccountMenuOpen(false); onSignOut(); }} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-zinc-800"><LogOut className="h-4 w-4" />退出登录</button>
              </div>
            </>}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 flex overflow-hidden">
        {mobileNavOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-label="关闭导航"
          />
        )}
        <aside className={`fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border-r border-slate-200/70 dark:border-zinc-800/80 flex flex-col justify-between p-4 flex-shrink-0 select-none transition-transform lg:static lg:h-full lg:z-20 lg:bg-white/70 lg:dark:bg-zinc-900/70 lg:translate-x-0 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-3">导航</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="lg:hidden p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                aria-label="关闭导航"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="space-y-2">
              {navGroups.map(group => {
                const GroupIcon = group.icon;
                const isSingle = group.items.length === 1;
                const isExpanded = isSingle || expandedGroups[group.id];
                const hasActiveChild = group.items.some(item => item.id === activePage);

                return (
                  <div key={group.id} className="rounded-2xl">
                    <button
                      onClick={() => isSingle ? selectPage(group.items[0].id) : onToggleGroup(group.id)}
                      className={`w-full px-3 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                        hasActiveChild
                          ? 'bg-emerald-700/10 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200'
                          : 'text-slate-500 hover:bg-white/80 hover:text-slate-800 dark:hover:bg-zinc-800/80 dark:hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <GroupIcon className="w-4.5 h-4.5" />
                        <span>{group.label}</span>
                      </div>
                      {!isSingle && (
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      )}
                    </button>

                    {!isSingle && isExpanded && (
                      <div className="mt-1 ml-5 pl-3 border-l border-slate-200/80 dark:border-zinc-800/80 space-y-1">
                        {group.items.map(item => {
                          const ItemIcon = item.icon;
                          const isActive = activePage === item.id;
                          return (
                            <button
                              key={item.id}
                              id={`sidebar-item-${item.id}`}
                              onClick={() => selectPage(item.id)}
                              className={`w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-emerald-700 text-white shadow-md shadow-emerald-700/10'
                                  : 'text-slate-500 hover:bg-white/80 hover:text-slate-800 dark:hover:bg-zinc-800/80 dark:hover:text-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <ItemIcon className="w-4 h-4" />
                                <span>{item.label}</span>
                              </div>
                              {item.badge && item.badge > 0 && (
                                <span className={`px-1.5 py-0.2 text-[9px] rounded-full font-bold ${isActive ? 'bg-white text-emerald-800' : 'bg-red-500 text-white'}`}>
                                  {item.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          <div className="p-3 bg-white/65 dark:bg-zinc-850/40 rounded-2xl border border-slate-200/70 dark:border-zinc-800/60 text-[11px] text-slate-500 space-y-1">
            <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" />
              当前班级
            </span>
            <p className="leading-normal">{selectedClass?.name}，{selectedClass?.studentCount} 人。待复核 {pendingReviewCount} 条。</p>
          </div>
        </aside>

        <main className={`app-shell-main flex-1 min-w-0 p-3 sm:p-4 lg:p-6 bg-slate-50 dark:bg-zinc-950 ${isImmersiveWorkspace ? 'flex min-h-0 flex-col overflow-hidden' : 'overflow-y-auto'}`}>
          {children}
        </main>
      </div>

      {showToast && (
        <div className="fixed top-4 right-4 bg-slate-900/90 dark:bg-zinc-900/90 text-white backdrop-blur-md px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 z-50 border border-slate-700/50 animate-fade-in">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
