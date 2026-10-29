import { useEffect, useRef, useState } from 'react';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import PersonalContextPanel from './PersonalContextPanel';
import { GlassButton,GlassSurface } from '../../components/glass/Glass';
import {syncAssistantAppearance} from './assistantAppearance';

export default function AssistantPanel() {
  const [settings,setSettings]=useState(false),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false);
  const closeSettings=useRef<()=>void>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [connectionId,setConnectionId]=useState(()=>crypto.randomUUID());
  const [phase,setPhase]=useState<'page'|'catalogs'>('page');
  const [elapsed,setElapsed]=useState(0);
  const [slow,setSlow]=useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const syncAppearance=()=>{
    try{
      const iframe=frame.current;
      if(iframe?.contentDocument&&iframe.parentElement)syncAssistantAppearance(iframe.contentDocument,getComputedStyle(iframe.parentElement));
    }catch{ /* A non-application error document may not be same-origin. */ }
  };
  useEffect(()=>{
    const observer=new MutationObserver(syncAppearance);
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class','style']});
    syncAppearance();
    return()=>observer.disconnect();
  },[]);
  useEffect(() => {
    let started=performance.now(),connected=false,timer:ReturnType<typeof setInterval>|null=null;
    setReady(false);setError('');setPhase('page');setElapsed(0);setSlow(false);
    const startTimer=()=>{if(timer!==null||connected)return;timer=setInterval(()=>{const seconds=Math.floor((performance.now()-started)/1000);setElapsed(seconds);if(seconds>=15)setSlow(true);if(seconds>=45)setError(current=>current||'连接尚未完成，已有会话保留。可重新连接；不会自动重发消息。');},1000);};
    const stopTimer=()=>{if(timer!==null)clearInterval(timer);timer=null;};
    const receive=(event:MessageEvent)=>{
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;
      if(event.data?.type==='qingsong:settings'){setSettings(true);return;}
      if(event.data?.connectionId!==connectionId)return;
      if(event.data?.type==='qingsong:connection'){
        if(event.data.phase==='catalogs'||event.data.phase==='reconnecting'){
          if(connected||timer===null){connected=false;started=performance.now();setReady(false);setElapsed(0);setSlow(false);setError('');startTimer();}
          setPhase('catalogs');
        }
        if(event.data.phase==='error'){
          connected=false;setReady(false);stopTimer();
          setError(event.data.pending==='workspace'?'工作区同步失败，已有记录保留。可以重新连接。':event.data.pending==='initialization'?'助手界面初始化失败，已有会话保留。可以重新连接。':'会话目录同步失败，已有记录保留。可以重新连接。');
        }
      }
      if(event.data?.type==='qingsong:ready'||(event.data?.type==='qingsong:connection'&&event.data.phase==='ready')){
        if(!connected)console.info('[青松助手] 页面连接完成',{durationMs:Math.round(performance.now()-started)});
        connected=true;setReady(true);setError('');setSlow(false);stopTimer();
      }
    };
    window.addEventListener('message',receive);startTimer();
    return()=>{window.removeEventListener('message',receive);stopTimer();};
  },[connectionId]);
  const retry=()=>setConnectionId(crypto.randomUUID());
  return <GlassSurface className="qs-assistant-panel qs-official-assistant flex h-full min-h-0 flex-col overflow-hidden">
    <style>{".qs-official-assistant>.lg-content{display:flex;flex-direction:column;min-height:0;flex:1;padding:0;gap:0;overflow:hidden}.qs-official-frame{display:flex;flex:1;min-height:0;margin:12px;border-radius:18px;overflow:hidden;background:var(--qs-workbench-surface)}"}</style>
    {!ready&&<div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2 text-sm"><p role={error?'alert':'status'} className={error?'text-red-700':'text-gray-500'}>{error||(phase==='page'?'正在载入助手界面…':'正在同步工作区与会话…')}{!error&&elapsed>0?` ${elapsed}秒`:''}{slow&&!error?'，连接较慢，已有会话保留。':''}</p>{(slow||error)&&<GlassButton disabled={busy} onClick={retry}>重新连接</GlassButton>}</div>}
    <div className="qs-official-frame"><iframe ref={frame} title="青松教学助手" name={"qingsong-assistant:"+connectionId} src={"/api/assistant/official/?connection="+connectionId} onLoad={()=>{syncAppearance();frame.current?.contentWindow?.postMessage({type:'qingsong:probe',connectionId},location.origin);}} className="min-h-0 w-full flex-1 border-0" sandbox="allow-scripts allow-same-origin allow-downloads allow-popups" onError={() => setError('助手未能打开，已有对话保留，请刷新重试。')}/></div>
    {settings&&<ResponsiveDialog title="会话设置" header={null} wide compactFull busy={busy} confirmDiscard={dirty} closeRef={closeSettings} onClose={()=>setSettings(false)}><PersonalContextPanel active onClose={()=>closeSettings.current?.()} onDirtyChange={setDirty} onBusyChange={setBusy}/></ResponsiveDialog>}
  </GlassSurface>;
}
