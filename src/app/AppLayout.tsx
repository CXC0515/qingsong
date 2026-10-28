import qingsongLogo from '../assets/qingsong-logo.png';
import ClassPicker from '../components/ClassPicker';
import ResponsiveDialog from '../components/ResponsiveDialog';
import { Bell, Boxes, CalendarDays, ChevronDown, HelpCircle, LogOut, Menu, MoreHorizontal, Network, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { SchoolClass, TeacherProfile } from '../domain/types';
import type { NavGroup, PageId } from './navigation';

interface AppLayoutProps {
  activePage: PageId;
  headerContextRef?:(element:HTMLDivElement|null)=>void;
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
  onOpenAssistant: () => void;
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
  headerContextRef,
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
  onOpenAssistant,
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
  useEffect(()=>{
    if(!mobileNavOpen)return;
    const previous=document.activeElement as HTMLElement|null;
    const aside=document.querySelector<HTMLElement>('.qs-sidebar');
    const controls=()=>Array.from(aside?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')??[]).filter(node=>node.getClientRects().length>0);
    controls()[0]?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(document.querySelector('dialog[open]')||!window.matchMedia('(max-width:899px)').matches)return;
      if(event.key==='Escape'){event.preventDefault();setMobileNavOpen(false);}
      if(event.key==='Tab'){
        const items=controls(),first=items[0],last=items.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    window.addEventListener('keydown',keydown);
    return()=>{window.removeEventListener('keydown',keydown);previous?.focus({preventScroll:true});};
  },[mobileNavOpen]);
  const isLibraryWorkspace=activePage==='knowledge-graph'||activePage==='library-editor';
  const isImmersiveWorkspace=isLibraryWorkspace||activePage==='material-pool'||activePage.startsWith('career-');
  const selectPage=(pageId:PageId)=>{onSelectPage(pageId);setMobileNavOpen(false);};
  const currentGroup=navGroups.find(group=>group.items.some(item=>item.id===activePage));
  const currentItem=currentGroup?.items.find(item=>item.id===activePage);
  // Only the workbench uses the global class for its quick-entry defaults.
  const showGlobalClassPicker=activePage==='workbench';
  const avatar=(teacherProfile.nickname.trim()||teacherProfile.realName.trim()||'师')[0];
  const accountButton=(compact=false)=><button type="button" onClick={()=>setAccountMenuOpen(true)} aria-label="账号菜单" aria-haspopup="dialog" aria-expanded={accountMenuOpen} className={compact?'qs-account-trigger qs-account-compact':'qs-account-trigger'}>
    <span className="qs-avatar">{avatar}</span>{!compact&&<span className="min-w-0"><strong>{teacherProfile.nickname||teacherProfile.realName}</strong><small>{accountEmail}</small></span>}<ChevronDown className="h-4 w-4 shrink-0"/>
  </button>;

  return (
    <div className="qs-app qs-shell h-dvh overflow-hidden font-sans antialiased">
      {mobileNavOpen&&<button type="button" className="qs-nav-backdrop" aria-label="关闭导航" onClick={()=>setMobileNavOpen(false)}/>}
      <aside aria-label="主导航" className={'app-sidebar qs-sidebar '+(mobileNavOpen?'qs-sidebar-open':'')}>
        <div className="qs-brand"><span className="qs-brand-mark qs-main-brand"><img src={qingsongLogo} alt="" className="h-10 w-10 object-contain"/></span><span><strong>青松教师</strong><small>留一点从容给教学</small></span><button type="button" className="qs-nav-close" aria-label="关闭导航" onClick={()=>setMobileNavOpen(false)}><X className="h-5 w-5"/></button></div>
        <nav className="qs-navigation" aria-label="功能导航">
          {navGroups.map(group=>{
            const GroupIcon=group.icon,isSingle=group.items.length===1,isExpanded=isSingle||expandedGroups[group.id];
            return <div key={group.id} className="qs-nav-section">
              {group.id==='entry'&&<p className="qs-nav-caption">今天</p>}
              {!isSingle&&<button className="qs-nav-group" aria-expanded={isExpanded} onClick={()=>onToggleGroup(group.id)}><span>{group.label}</span><ChevronDown className={'h-3 w-3 '+(isExpanded?'rotate-180':'')}/></button>}
              {isExpanded&&group.items.map(item=>{
                const Icon=isSingle?GroupIcon:item.icon,isActive=item.id===activePage;
                return <button key={item.id} id={'sidebar-item-'+item.id} aria-current={isActive?'page':undefined} className="qs-nav-item" onClick={()=>selectPage(item.id)}><Icon className="h-[18px] w-[18px] shrink-0"/><span>{isSingle?group.label:item.label}</span>{Boolean(item.badge)&&<span className="qs-nav-badge">{item.badge}</span>}</button>;
              })}
            </div>;
          })}
        </nav>
        <div className="qs-sidebar-footer">
          {pendingReviewCount>0&&<p className="qs-sidebar-status"><HelpCircle className="h-3.5 w-3.5 shrink-0"/><span>待复核 {pendingReviewCount} 条</span></p>}
          {accountButton()}
        </div>
      </aside>
      <div className="qs-main-shell">
        <header className="qs-topbar">
          <button type="button" className="qs-nav-open" aria-label="打开导航" aria-expanded={mobileNavOpen} onClick={()=>setMobileNavOpen(true)}><Menu className="h-5 w-5"/></button>
          <div className="qs-breadcrumb"><span>{currentGroup?.items.length===1?'青松教师':currentGroup?.label}</span><span aria-hidden="true">/</span><strong>{currentGroup?.items.length===1?currentGroup.label:currentItem?.label}</strong></div>
          {isLibraryWorkspace&&<div className="qs-mobile-top-tools"><button type="button" aria-label="知识图谱" onClick={()=>selectPage('knowledge-graph')}><Network className="h-4 w-4"/></button><button type="button" aria-label="资料编辑" onClick={()=>selectPage('library-editor')}><Boxes className="h-4 w-4"/></button></div>}
          {activePage==='schedule'&&<div className="qs-mobile-top-tools"><button type="button" aria-label="课表" onClick={()=>onSelectScheduleSection('schedule')} aria-pressed={scheduleSection==='schedule'}><CalendarDays className="h-4 w-4"/></button><button type="button" aria-label="日程" onClick={()=>onSelectScheduleSection('reminders')} aria-pressed={scheduleSection==='reminders'}><Bell className="h-4 w-4"/></button><button type="button" aria-label="更多课表操作" onClick={onOpenScheduleTools}><MoreHorizontal className="h-4 w-4"/></button></div>}
          <div ref={headerContextRef} className="qs-topbar-context"/>
          {showGlobalClassPicker&&<div className="qs-topbar-class"><ClassPicker classes={classes.filter(c=>c.status==='active')} value={selectedClassId} onChange={onSelectClass} label="选择快捷入口班级"/></div>}
          <div className="qs-mobile-account">{accountButton(true)}</div>
        </header>
        <main className={'app-shell-main qs-main '+(isImmersiveWorkspace?'flex min-h-0 flex-col overflow-hidden':activePage==='workbench'?'overflow-y-auto min-[900px]:flex min-[900px]:min-h-0 min-[900px]:flex-col min-[900px]:overflow-hidden':'overflow-y-auto')}>{children}</main>
      </div>
      <button id="mobile-ai-launch" className="qs-mobile-ai-launch" type="button" onClick={onOpenAssistant} aria-haspopup="dialog"><Sparkles size={20}/>AI 助手</button>
      {accountMenuOpen&&<ResponsiveDialog title="账号菜单" onClose={()=>setAccountMenuOpen(false)}><p className="break-all text-sm text-slate-500">{accountEmail}</p>{isOwner&&<button type="button" className="qs-account-action" onClick={()=>{setAccountMenuOpen(false);onEnterAdmin();}}><ShieldCheck className="h-4 w-4"/>进入管理后台</button>}<button type="button" className="qs-account-action" onClick={()=>{setAccountMenuOpen(false);onSignOut();}}><LogOut className="h-4 w-4"/>退出登录</button></ResponsiveDialog>}
      {showToast&&<div role="status" className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-2xl bg-slate-900/90 px-5 py-3 text-sm text-white shadow-lg"><Sparkles className="h-5 w-5"/>{toastMessage}</div>}
    </div>
  );
}
