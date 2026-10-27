import { History, Plus, MessageSquare } from 'lucide-react';
import { GlassButton, GlassSurface } from '../../../src/components/glass/Glass';
export default function OfficialAssistantPanel(){
 const command=(action:string)=>{const frame=document.querySelector<HTMLIFrameElement>('#official-dsh-chat');frame?.contentWindow?.postMessage({type:'qingsong-prototype',action},location.origin);};
 return <GlassSurface className="qs-assistant-panel qs-official-prototype">
  <header className="qs-official-heading"><h2 id="workbench-assistant-heading"><MessageSquare size={17}/>教学助手 <span>官方 DSH UI · 样本</span></h2><div><GlassButton title="会话历史" aria-label="会话历史" onClick={()=>command('history')}><History size={17}/></GlassButton><GlassButton title="新对话" aria-label="新对话" onClick={()=>command('new')}><Plus size={18}/></GlassButton></div></header>
  <iframe id="official-dsh-chat" title="DSH官方对话界面（隔离样本）" src="/official/open"/>
  <style>{`.qs-official-prototype>.lg-content{padding:12px 14px 8px;gap:0;overflow:hidden}.qs-official-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0;padding:0 2px 8px}.qs-official-heading h2{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:600}.qs-official-heading h2 span{font-size:10px;font-weight:400;color:#7a8982;margin-left:6px}.qs-official-heading>div{display:flex;gap:4px}.qs-official-heading button{min-height:40px;min-width:40px}#official-dsh-chat{border:0;display:block;width:100%;flex:1;min-height:0;border-radius:12px;background:transparent}@media(max-width:767px){.qs-assistant-space{height:78dvh;min-height:500px}.qs-official-heading h2 span{display:none}.qs-official-heading button{min-height:44px;min-width:44px}}`}</style>
 </GlassSurface>;
}
