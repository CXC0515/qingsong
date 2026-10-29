import {lazy, Suspense, useEffect, useState} from 'react';
import {ArrowLeft, LogOut, ShieldCheck} from 'lucide-react';
import {GlassButton, GlassSegments, GlassSurface} from '../../components/glass/Glass';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import AccountAccessPanel from '../settings/AccountAccessPanel';
const GenerationSettingsPanel = lazy(() => import('./GenerationSettingsPanel'));
const sections = [{value:'accounts',label:'账号与邀请'},{value:'assistant',label:'AI 设置'}] as const;
type Section = typeof sections[number]['value'];
const fromPath = ():Section => window.location.pathname === '/admin/assistant' ? 'assistant' : 'accounts';
export default function AdminConsole({accountEmail,onReturn,onSignOut}:{accountEmail:string;onReturn:()=>void;onSignOut:()=>void}) {
  const [section,setSection] = useState(fromPath);
  const [openedAI,setOpenedAI] = useState(section === 'assistant');
  const [dirty,setDirty] = useState(false);
  const [leaving,setLeaving] = useState<'return'|'signout'|null>(null);
  useEffect(() => {const changed=()=>{const next=fromPath();setSection(next);if(next==='assistant')setOpenedAI(true);};window.addEventListener('popstate',changed);return()=>window.removeEventListener('popstate',changed);},[]);
  const change=(next:Section)=>{window.history.pushState({},'', '/admin/'+next);setSection(next);if(next==='assistant')setOpenedAI(true);};
  const leave=(action:'return'|'signout')=>{if(dirty)setLeaving(action);else if(action==='return')onReturn();else onSignOut();};
  return <div className="qs-app qs-admin min-h-dvh"><div className="qs-admin-shell">
    <GlassSurface className="qs-admin-header"><header className="qs-admin-header-row"><div className="flex min-w-0 items-center gap-3"><ShieldCheck className="h-5 w-5 shrink-0"/><h1>管理后台</h1></div><div className="flex flex-wrap items-center gap-2"><span className="qs-muted hidden max-w-52 truncate md:block">{accountEmail}</span><GlassButton onClick={()=>leave('return')}><ArrowLeft className="h-4 w-4"/>返回工作台</GlassButton><GlassButton onClick={()=>leave('signout')} aria-label="退出登录"><LogOut className="h-4 w-4"/></GlassButton></div></header></GlassSurface>
    <nav className="qs-admin-navigation"><GlassSegments label="管理后台栏目" value={section} options={sections} onChange={change}/></nav>
    <main><div hidden={section!=='accounts'}><AccountAccessPanel/></div>{openedAI&&<div hidden={section!=='assistant'}><Suspense fallback={<p role="status">正在载入设置…</p>}><GenerationSettingsPanel onDirtyChange={setDirty}/></Suspense></div>}</main>
  </div>{leaving&&<ResponsiveDialog title="放弃未保存的参数？" onClose={()=>setLeaving(null)}><p>生成参数的修改尚未保存。</p><div className="mt-4 flex flex-wrap justify-end gap-2"><GlassButton onClick={()=>setLeaving(null)}>继续编辑</GlassButton><GlassButton variant="danger" onClick={()=>{if(leaving==='return')onReturn();else onSignOut();}}>放弃修改并离开</GlassButton></div></ResponsiveDialog>}</div>;
}
