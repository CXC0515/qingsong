import type {PreparationAssistantContext,PreparationAssistantTarget} from '../../domain/preparationAssistant';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { RichDocument } from '../../domain/document';
const ReferenceDocumentEditor=lazy(()=>import('../../components/document/DocumentEditor'));
import ResponsiveDialog from '../../components/ResponsiveDialog';
import PersonalContextPanel from './PersonalContextPanel';
import MaterialPoolPicker from './MaterialPoolPicker';
import { GlassButton,GlassSurface } from '../../components/glass/Glass';
import { apiFetch } from '../../services/apiClient';
import { isDemoRoute } from '../../demo/entry';
import DemoAssistant from '../../demo/DemoAssistant';

interface MaterialPickRequest { requestId: string; sessionId: string; connectionId: string; attempts: Map<string, string> }

export interface AssistantEntry extends PreparationAssistantContext {mode:'default'|'preparation'; requestKey?:number}
interface Props {entry?:AssistantEntry}
export default function AssistantPanel({entry}:Props) {
  return isDemoRoute() ? <DemoAssistant /> : <OfficialAssistantPanel entry={entry} />;
}

function OfficialAssistantPanel({entry}:Props) {
  const [settings,setSettings]=useState(false),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false);
  const closeSettings=useRef<()=>void>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [connectionId,setConnectionId]=useState(()=>crypto.randomUUID());
  const [phase,setPhase]=useState<'page'|'catalogs'>('page');
  const [sessionLoad,setSessionLoad]=useState<{phase:'loading'|'slow'|'stalled'|'error';durationMs:number}|null>(null);
  const [elapsed,setElapsed]=useState(0);
  const [slow,setSlow]=useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [materialPick, setMaterialPick] = useState<MaterialPickRequest | null>(null);
  const [lessonPreview,setLessonPreview]=useState<{id:string;title:string;content?:RichDocument;url?:string;error?:string;selection?:string}|null>(null);
  const automaticReconnects = useRef(0);
  useEffect(()=>{
    const controller=new AbortController();
    const navigate=(preparationId:string,documentId?:string)=>{
      if(!window.dispatchEvent(new Event('qingsong:preparation-before-leave',{cancelable:true})))return;
      const url=new URL('/',location.origin);url.searchParams.set('page','lesson-plan');url.searchParams.set('preparationId',preparationId);if(documentId)url.searchParams.set('documentId',documentId);
      history.pushState(null,'',url);window.dispatchEvent(new PopStateEvent('popstate'));setLessonPreview(null);
    };
    const receive=(event:MessageEvent)=>{
      const data=event.data;
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||data?.connectionId!==connectionId)return;
      const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if(data.type==='qingsong:open-lesson'&&uuid.test(data.preparationId)&&(!data.documentId||uuid.test(data.documentId))){navigate(data.preparationId,data.documentId);return;}
      if(data.type!=='qingsong:preview-lesson'||!uuid.test(data.referenceId))return;
      const id=data.referenceId;setLessonPreview({id,title:'正在读取教案引用…'});
      void apiFetch('/api/assistant/official/api/qingsong/lesson-references?preview='+encodeURIComponent(id),{signal:controller.signal}).then(async response=>{const value=await response.json();if(!response.ok)throw Error(value.message);return value;}).then(value=>setLessonPreview(current=>current?.id===id?{id,title:value.reference.title+(value.reference.selection?' · 选中文字':' · 教案引用'),content:value.content,url:value.url,selection:value.reference.selection?.text}:current)).catch(cause=>{if(!controller.signal.aborted)setLessonPreview(current=>current?.id===id?{...current,error:cause.message||'引用暂时无法读取，原会话和教案保留，请重试。'}:current);});
    };
    window.addEventListener('message',receive);return()=>{controller.abort();window.removeEventListener('message',receive);};
  },[connectionId]);
  const activePick = useRef<MaterialPickRequest | null>(null);
  const pickAbort = useRef<AbortController | null>(null);
  const settingsOpen = useRef(settings);
  settingsOpen.current = settings;
  const postPickResult = (request: MaterialPickRequest, type: 'qingsong:materials-picked' | 'qingsong:materials-cancelled' | 'qingsong:materials-opened', references?: unknown[]) => {
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
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow || !['qingsong:pick-materials','qingsong:materials-cancelled'].includes(event.data?.type) || event.data.connectionId !== connectionId) return;
      const {requestId, sessionId} = event.data;
      if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId) || typeof sessionId !== 'string' || !sessionId || sessionId.length > 160) return;
      if(event.data.type==='qingsong:materials-cancelled'){
        if(activePick.current?.requestId===requestId&&activePick.current.sessionId===sessionId){pickAbort.current?.abort();pickAbort.current=null;activePick.current=null;setMaterialPick(null);}
        return;
      }
      const request = {requestId, sessionId, connectionId, attempts: new Map<string, string>()};
      const existing = activePick.current;
      if (existing?.requestId === requestId && existing.sessionId === sessionId) {postPickResult(existing,'qingsong:materials-opened');return;}
      // A settings draft or an existing selection must never be replaced by another frame request.
      if (settingsOpen.current || existing) { postPickResult(request, 'qingsong:materials-cancelled'); return; }
      activePick.current = request; setMaterialPick(request);
      postPickResult(request,'qingsong:materials-opened');
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
    let connectionPhase: 'page'|'catalogs' = 'page';
    setReady(false);setError('');setPhase('page');setElapsed(0);setSlow(false);
    setSessionLoad(null);
    const startTimer=()=>{if(timer!==null||connected)return;timer=setInterval(()=>{const seconds=Math.floor((performance.now()-started)/1000);setElapsed(seconds);if(seconds>=15)setSlow(true);if(seconds>=45)setError(current=>current||'连接尚未完成，已有会话保留。可重新连接；不会自动重发消息。');
      // A stale native auth/WS connection can leave DSH in catalogs forever.
      // Recreate the iframe before its long native retry loop becomes visible.
      if(connectionPhase==='catalogs'&&seconds>=12&&automaticReconnects.current<2){
        automaticReconnects.current+=1;setError('正在刷新助手连接，已有会话保留；不会重发消息。');stopTimer();setConnectionId(crypto.randomUUID());
      }
    },1000);};
    const stopTimer=()=>{if(timer!==null)clearInterval(timer);timer=null;};
    const receive=(event:MessageEvent)=>{
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;
      if(event.data?.type==='qingsong:settings'){setSettings(true);return;}
      if(event.data?.connectionId!==connectionId)return;
      if(event.data?.type==='qingsong:session-load'){
        if(event.data.phase==='empty'||event.data.phase==='ready')setSessionLoad(null);
        else if(['loading','slow','stalled','error'].includes(event.data.phase))setSessionLoad({phase:event.data.phase,durationMs:Number(event.data.durationMs)||0});
        return;
      }
      if(event.data?.type==='qingsong:connection'){
        if(event.data.phase==='catalogs'||event.data.phase==='reconnecting'){
          connectionPhase='catalogs';
          if(connected||timer===null){connected=false;started=performance.now();setReady(false);setElapsed(0);setSlow(false);setError('');startTimer();}
          setPhase('catalogs');
        }
        if(event.data.phase==='error'){
          connected=false;setReady(false);stopTimer();
          setError(event.data.pending==='workspace'?'工作区同步失败，已有记录保留。可以重新连接。':event.data.pending==='initialization'?'助手界面初始化失败，已有会话保留。可以重新连接。':'会话目录同步失败，已有记录保留。可以重新连接。');
        }
      }
      if(event.data?.type==='qingsong:ready'||(event.data?.type==='qingsong:connection'&&event.data.phase==='ready')){
        connectionPhase='catalogs';
        if(!connected)console.info('[青松助手] 页面连接完成',{durationMs:Math.round(performance.now()-started)});
        connected=true;setReady(true);setError('');setSlow(false);stopTimer();
      }
    };
    window.addEventListener('message',receive);startTimer();
    return()=>{window.removeEventListener('message',receive);stopTimer();};
  },[connectionId]);
  useEffect(() => {
    const changed = () => frame.current?.contentWindow?.postMessage({type: "qingsong:lesson-changed", connectionId}, location.origin);
    window.addEventListener("qingsong:preparation-context", changed);
    return () => window.removeEventListener("qingsong:preparation-context", changed);
  }, [connectionId]);
  const [targetError, setTargetError] = useState('');
  const [targetStage, setTargetStage] = useState('');
  const [targetAttempt, setTargetAttempt] = useState(0);
  useEffect(() => {
    if (!ready || !entry) return;
    const controller = new AbortController(), requestId = crypto.randomUUID();
    const started = performance.now();
    const timings: Record<string, number> = {};
    let acknowledgementTimer: ReturnType<typeof setTimeout> | undefined;
    setTargetError(''); setTargetStage('正在打开工作空间…');
    const send = (type: string, extra = {}) => frame.current?.contentWindow?.postMessage({type,connectionId,requestId,...extra},location.origin);
    const acknowledge = (event: MessageEvent) => {
      const data = event.data;
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow || data?.connectionId !== connectionId || data?.requestId !== requestId) return;
      if (data.type === 'qingsong:context-timing') {
        timings[data.stage] = data.durationMs;
        console.info('[青松助手] 会话阶段耗时', {stage:data.stage, durationMs:data.durationMs});
      }
      if (data.type === 'qingsong:context-progress') {
        const labels: Record<string,string> = {'workspace-directory':'正在同步备课工作区…','session-directory':'正在同步教案会话…','session-content':'正在读取教案会话…','session-navigation':'正在打开教案会话…','draft':'正在准备备课要求…','workspace-navigation':'正在打开工作空间…'};
        setTargetStage(labels[data.stage] ?? '正在打开助手…');
      } else if (data.type === 'qingsong:context-opened') {
        clearTimeout(acknowledgementTimer); setTargetStage('');
        window.dispatchEvent(new CustomEvent('qingsong:preparation-session-opened', {detail: {...entry, ...data.target, error:data.error}}));
        console.info('[青松助手] 打开会话完成',{durationMs:Math.round(performance.now()-started),timings,ok:!data.error});
        if (data.error) setTargetError(data.error);
      }
    };
    window.addEventListener('message', acknowledge);
    send('qingsong:prepare-context');
    const {requestKey: _requestKey, ...body} = entry;
    void apiFetch('/api/assistant/official/api/qingsong/preparation-target', {
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]),
    }).then(async response => {
      const value = await response.json();
      if (!response.ok) throw Error(value.message || '工作空间未能打开，已有内容保留。');
      return value.target as PreparationAssistantTarget;
    }).then(target => {
      if (controller.signal.aborted) return;
      timings.targetResolution = Math.round(performance.now() - started);
      send('qingsong:open-context', {target});
      acknowledgementTimer = setTimeout(() => {
        send('qingsong:cancel-context'); setTargetStage('');
        setTargetError('打开教案会话等待超时，教案和原会话保留。请重试，不会重复发送消息。');
        window.dispatchEvent(new CustomEvent('qingsong:preparation-session-opened', {detail:{...entry,error:'会话打开超时，请在助手中重试打开；不会重复发送消息。'}}));
      },30000);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      window.dispatchEvent(new CustomEvent('qingsong:preparation-session-opened', {detail:{...entry,error:'会话未能打开，教案保留，请在助手中重试打开。'}}));
      send('qingsong:cancel-context');
      setTargetStage('');
      setTargetError(cause?.name === 'TimeoutError' ? '工作空间连接超时，教案和原会话保留，请重试。' : cause instanceof Error ? cause.message : '工作空间未能打开，已有内容保留，请重试。');
    });
    return () => {controller.abort(); clearTimeout(acknowledgementTimer); send('qingsong:cancel-context'); window.removeEventListener('message',acknowledge);};
  }, [ready,entry?.mode,entry?.preparationId,entry?.documentId,entry?.sessionId,entry?.instruction,entry?.requestKey,connectionId,targetAttempt]);
  const retry=()=>{closeMaterialPick();automaticReconnects.current=0;setConnectionId(crypto.randomUUID());};
  return <GlassSurface className="qs-assistant-panel qs-official-assistant flex h-full min-h-0 flex-col overflow-hidden">
    {lessonPreview&&<ResponsiveDialog title={lessonPreview.title} wide compactFull closeOnBackdrop onClose={()=>setLessonPreview(null)}>
      {lessonPreview.error&&<p role="alert">{lessonPreview.error}</p>}
      {lessonPreview.selection&&<blockquote className="qs-reference-text-preview">{lessonPreview.selection}</blockquote>}
      {lessonPreview.content&&!lessonPreview.selection&&<Suspense fallback={<p role="status">正在载入预览…</p>}><ReferenceDocumentEditor documentKey={'reference:'+lessonPreview.id} content={lessonPreview.content} readOnly/></Suspense>}
      {lessonPreview.url&&<GlassButton onClick={()=>{if(!window.dispatchEvent(new Event('qingsong:preparation-before-leave',{cancelable:true})))return;history.pushState(null,'',lessonPreview.url);window.dispatchEvent(new PopStateEvent('popstate'));setLessonPreview(null);}}>打开当前教案</GlassButton>}
    </ResponsiveDialog>}
    <style>{".qs-official-assistant>.lg-content{display:flex;flex-direction:column;min-height:0;flex:1;padding:0;gap:0;overflow:hidden}.qs-official-frame{display:flex;flex:1;min-height:0;margin:12px;border-radius:18px;overflow:hidden;background:#fff}"}</style>
    {!ready&&<div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2 text-sm"><p role={error?'alert':'status'} className={error?'text-red-700':'text-gray-500'}>{error||(phase==='page'?'正在载入助手界面…':'正在同步工作区与会话…')}{!error&&elapsed>0?` ${elapsed}秒`:''}{slow&&!error?'，连接较慢，已有会话保留。':''}</p>{(slow||error)&&<GlassButton disabled={busy} onClick={retry}>重新连接</GlassButton>}</div>}
    {ready&&sessionLoad&&<p role={sessionLoad.phase==='error'?'alert':'status'} className={'shrink-0 px-4 py-2 text-sm '+(sessionLoad.phase==='error'?'text-red-700':'text-gray-600')}>
      {sessionLoad.phase==='loading'&&`正在读取当前会话，历史记录保留。${sessionLoad.durationMs>0?` ${Math.ceil(sessionLoad.durationMs/1000)}秒`:''}`}
      {sessionLoad.phase==='slow'&&`当前会话读取较慢，历史记录保留。${Math.ceil(sessionLoad.durationMs/1000)}秒`}
      {sessionLoad.phase==='stalled'&&'当前会话仍未就绪，请从侧栏重新选择；历史记录保留。'}
      {sessionLoad.phase==='error'&&'当前会话内容未能就绪，请从侧栏重新选择；历史记录保留。'}
    </p>}
    {targetStage && <p role="status" className="px-4 py-2 text-sm text-gray-500">{targetStage}</p>}
    {targetError && <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2 text-sm text-red-700"><p role="alert">{targetError}</p><GlassButton onClick={() => setTargetAttempt(value => value + 1)}>重试打开</GlassButton></div>}
    <div className="qs-official-frame"><iframe ref={frame} title="青松教学助手" name={"qingsong-assistant:"+connectionId} src={"/api/assistant/official/?connection="+connectionId} onLoad={()=>frame.current?.contentWindow?.postMessage({type:'qingsong:probe',connectionId},location.origin)} className="min-h-0 w-full flex-1 border-0" sandbox="allow-scripts allow-same-origin allow-downloads allow-popups" onError={() => setError('助手未能打开，已有对话保留，请刷新重试。')}/></div>
    {settings&&<ResponsiveDialog title="会话设置" header={null} wide compactFull busy={busy} confirmDiscard={dirty} closeRef={closeSettings} onClose={()=>setSettings(false)}><PersonalContextPanel active onClose={()=>closeSettings.current?.()} onDirtyChange={setDirty} onBusyChange={setBusy}/></ResponsiveDialog>}
    {materialPick&&<MaterialPoolPicker key={materialPick.requestId} onConfirm={confirmMaterialPick} onClose={closeMaterialPick} />}
  </GlassSurface>;
}
