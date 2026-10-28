import { useEffect, useRef, useState } from 'react';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import PersonalContextPanel from './PersonalContextPanel';
import MaterialPoolPicker from './MaterialPoolPicker';
import { GlassButton,GlassSurface } from '../../components/glass/Glass';
import { apiFetch } from '../../services/apiClient';

interface MaterialPickRequest { requestId: string; sessionId: string; connectionId: string; attempts: Map<string, string> }

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
  const [materialPick, setMaterialPick] = useState<MaterialPickRequest | null>(null);
  const activePick = useRef<MaterialPickRequest | null>(null);
  const pickAbort = useRef<AbortController | null>(null);
  const settingsOpen = useRef(settings);
  settingsOpen.current = settings;
  const postPickResult = (request: MaterialPickRequest, type: 'qingsong:materials-picked' | 'qingsong:materials-cancelled', references?: unknown[]) => {
    frame.current?.contentWindow?.postMessage({type, requestId: request.requestId, sessionId: request.sessionId, connectionId: request.connectionId, ...(references ? {references} : {})}, location.origin);
  };
  const closeMaterialPick = () => {
    pickAbort.current?.abort(); pickAbort.current = null;
    const request = activePick.current;
    activePick.current = null; setMaterialPick(null);
    if (request) postPickResult(request, 'qingsong:materials-cancelled');
  };
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow || event.data?.type !== 'qingsong:pick-materials' || event.data.connectionId !== connectionId) return;
      const {requestId, sessionId} = event.data;
      if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId) || typeof sessionId !== 'string' || !sessionId || sessionId.length > 160) return;
      const request = {requestId, sessionId, connectionId, attempts: new Map<string, string>()};
      const existing = activePick.current;
      if (existing?.requestId === requestId && existing.sessionId === sessionId) return;
      // A settings draft or an existing selection must never be replaced by another frame request.
      if (settingsOpen.current || existing) { postPickResult(request, 'qingsong:materials-cancelled'); return; }
      activePick.current = request; setMaterialPick(request);
    };
    window.addEventListener('message', receive);
    return () => {
      window.removeEventListener('message', receive);
      pickAbort.current?.abort(); pickAbort.current = null;
      activePick.current = null; setMaterialPick(null);
    };
  }, [connectionId]);
  const confirmMaterialPick = async (itemIds: string[]) => {
    const request = activePick.current;
    if (!request || request.connectionId !== connectionId) throw Error('助手连接已变化，尚未确认引用；请从当前会话重新选择。');
    // Reuse an operation identity after an unknown response, but bind a new
    // identity when the teacher changes the selected set. The iframe request
    // remains the correlation identity for this open picker, not a write key.
    const sortedIds = [...itemIds].sort();
    const fingerprint = JSON.stringify(sortedIds);
    const attemptId = request.attempts.get(fingerprint) ?? crypto.randomUUID();
    request.attempts.set(fingerprint, attemptId);
    const controller = new AbortController();
    pickAbort.current?.abort(); pickAbort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await apiFetch('/api/assistant/official/api/qingsong/materials/references', {
        method: 'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify({sessionId: request.sessionId, requestId: attemptId, itemIds: sortedIds}), signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(response.status === 401 ? '登录已失效，引用结果未确认，原件未改变；请重新登录后选择。' : typeof result.message === 'string' ? result.message : '材料引用未能确认，原件未改变；请刷新列表后重试。');
      if (!Array.isArray(result.references) || result.references.length !== itemIds.length || !result.references.every((reference: any) => reference && typeof reference.id === 'string' && typeof reference.name === 'string' && reference.source === 'pool')) throw Error('材料引用回执不完整，原件未改变；请重试。');
      if (activePick.current !== request || controller.signal.aborted) return;
      postPickResult(request, 'qingsong:materials-picked', result.references);
      activePick.current = null; setMaterialPick(null);
    } catch (cause) {
      if (controller.signal.aborted) throw Error('连接中断或等待超时，引用结果未确认，原件未改变；请重试。');
      if (cause instanceof TypeError) throw Error('网络连接失败，引用结果未确认，原件未改变；请重试。');
      throw cause;
    } finally {
      clearTimeout(timeout);
      if (pickAbort.current === controller) pickAbort.current = null;
    }
  };
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
  const retry=()=>{closeMaterialPick();setConnectionId(crypto.randomUUID());};
  return <GlassSurface className="qs-assistant-panel qs-official-assistant flex h-full min-h-0 flex-col overflow-hidden">
    <style>{".qs-official-assistant>.lg-content{display:flex;flex-direction:column;min-height:0;flex:1;padding:0;gap:0;overflow:hidden}.qs-official-frame{display:flex;flex:1;min-height:0;margin:12px;border-radius:18px;overflow:hidden;background:#fff}"}</style>
    {!ready&&<div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2 text-sm"><p role={error?'alert':'status'} className={error?'text-red-700':'text-gray-500'}>{error||(phase==='page'?'正在载入助手界面…':'正在同步工作区与会话…')}{!error&&elapsed>0?` ${elapsed}秒`:''}{slow&&!error?'，连接较慢，已有会话保留。':''}</p>{(slow||error)&&<GlassButton disabled={busy} onClick={retry}>重新连接</GlassButton>}</div>}
    <div className="qs-official-frame"><iframe ref={frame} title="青松教学助手" name={"qingsong-assistant:"+connectionId} src={"/api/assistant/official/?connection="+connectionId} onLoad={()=>frame.current?.contentWindow?.postMessage({type:'qingsong:probe',connectionId},location.origin)} className="min-h-0 w-full flex-1 border-0" sandbox="allow-scripts allow-same-origin allow-downloads allow-popups" onError={() => setError('助手未能打开，已有对话保留，请刷新重试。')}/></div>
    {settings&&<ResponsiveDialog title="会话设置" header={null} wide compactFull busy={busy} confirmDiscard={dirty} closeRef={closeSettings} onClose={()=>setSettings(false)}><PersonalContextPanel active onClose={()=>closeSettings.current?.()} onDirtyChange={setDirty} onBusyChange={setBusy}/></ResponsiveDialog>}
    {materialPick&&<MaterialPoolPicker key={materialPick.requestId} onConfirm={confirmMaterialPick} onClose={closeMaterialPick} />}
  </GlassSurface>;
}
