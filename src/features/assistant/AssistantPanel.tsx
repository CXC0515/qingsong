import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import { GlassButton, GlassSurface } from '../../components/glass/Glass';
import { apiFetch } from '../../services/apiClient';
import type { ChatSession } from '../../domain/assistant';

export default function AssistantPanel() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [legacy, setLegacy] = useState(false);
  const [history, setHistory] = useState<Array<Pick<ChatSession, 'id' | 'title'>>>([]);
  const [oldChat, setOldChat] = useState<ChatSession | null>(null);
  const [canManage, setCanManage] = useState(false);
  useEffect(() => {
    let active = true;
    apiFetch('/api/assistant/status').then(async response => {
      if (!response.ok) throw Error('登录状态已失效，请重新登录。已有对话保留。');
      const status = await response.json();
      if (active) setCanManage(status.canManage);
    }).catch(e => { if (active) setError(e.message); });
    const receive = (event: MessageEvent) => {
      if (event.origin === location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'qingsong:ready') {
        clearTimeout(timeout); setReady(true); setError('');
      }
      if (event.origin === location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'qingsong:error') {
        clearTimeout(timeout); setError('助手连接未完成，已有对话保留，请刷新重试。');
      }
    };
    window.addEventListener('message', receive);
    const timeout = setTimeout(() => { if (active) setError(current => current || '助手连接较慢，已有对话保留。请稍等或重新打开助手。'); }, 70000);
    return () => { active = false; window.removeEventListener('message', receive); clearTimeout(timeout); };
  }, []);
  const send = (type: string) => frame.current?.contentWindow?.postMessage({type}, location.origin);
  const openLegacy = async () => {
    try {
      const response = await apiFetch('/api/assistant/sessions');
      if (!response.ok) throw Error('旧会话暂时无法读取，记录仍保留，请稍后重试。');
      setHistory(await response.json()); setLegacy(true);
    } catch (e) { setError((e as Error).message); }
  };
  const readLegacy = async (id: string) => {
    try {
      const response = await apiFetch('/api/assistant/sessions/' + id);
      if (!response.ok) throw Error('旧会话暂时无法读取，记录仍保留，请稍后重试。');
      setOldChat(await response.json());
    } catch (e) { setError((e as Error).message); }
  };
  return <GlassSurface className="qs-assistant-panel qs-official-assistant flex h-full min-h-0 flex-col overflow-hidden">
    <style>{".qs-official-assistant>.lg-content{display:flex;flex-direction:column;min-height:0;flex:1;padding:0;gap:0;overflow:hidden}.qs-official-frame{display:flex;flex:1;min-height:0;margin:12px;border-radius:18px;overflow:hidden;background:#fff}.qs-official-assistant header button{min-height:44px}@media(max-width:767px){.qs-assistant-space{height:78dvh;min-height:400px}}"}</style>
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
      <h2 className="text-base font-semibold">教学助手</h2>
      <div className="flex flex-wrap items-center gap-2">
        <GlassButton onClick={() => { setLegacy(false); send('qingsong:history'); }} disabled={!ready}><MessageSquare size={16}/>历史</GlassButton>
        <GlassButton onClick={() => { setLegacy(false); send('qingsong:new'); }} disabled={!ready}><Plus size={16}/>新会话</GlassButton>
        <GlassButton onClick={() => void openLegacy()}>旧会话</GlassButton>
        {canManage && <a className="px-2 py-2 text-sm" href="/api/assistant/manage/open" target="_blank" rel="noreferrer">模型管理</a>}
      </div>
    </header>
    {!ready && !error && <p className="px-4 py-2 text-sm text-gray-500" role="status">正在连接教学助手…</p>}
    {error && <p className="px-4 py-2 text-sm text-red-700" role="alert">{error}</p>}
    {legacy && <section className="min-h-0 flex-1 overflow-auto p-4">
      <p className="mb-3 text-sm text-gray-500">升级前的会话仅供查阅；新问题请点“新会话”。</p>
      <div className="flex flex-wrap gap-2">{history.map(chat => <GlassButton key={chat.id} onClick={() => void readLegacy(chat.id)}>{chat.title}</GlassButton>)}</div>
      {!history.length && <p className="text-sm text-gray-500">暂无旧会话。</p>}
      {oldChat?.messages.map(message => <article key={message.id} className="my-4 whitespace-pre-wrap break-words text-sm"><strong>{message.role === 'user' ? '我' : '教学助手'}</strong><p>{message.content}</p></article>)}
    </section>}
    <div className={legacy ? 'hidden' : 'qs-official-frame'}><iframe ref={frame} title="青松教学助手" src="/api/assistant/official/" className={legacy ? 'hidden' : 'min-h-0 w-full flex-1 border-0'} sandbox="allow-scripts allow-same-origin allow-downloads allow-popups" onError={() => setError('助手未能打开，已有对话保留，请刷新重试。')}/></div>
  </GlassSurface>;
}
