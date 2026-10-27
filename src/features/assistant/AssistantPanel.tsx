import { useEffect, useRef, useState } from 'react';
import { GlassSurface } from '../../components/glass/Glass';

export default function AssistantPanel() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
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
  return <GlassSurface className="qs-assistant-panel qs-official-assistant flex h-full min-h-0 flex-col overflow-hidden">
    <style>{".qs-official-assistant>.lg-content{display:flex;flex-direction:column;min-height:0;flex:1;padding:0;gap:0;overflow:hidden}.qs-official-frame{display:flex;flex:1;min-height:0;margin:12px;border-radius:18px;overflow:hidden;background:#fff}"}</style>
    {!ready && !error && <p className="px-4 py-2 text-sm text-gray-500" role="status">正在连接教学助手…</p>}
    {error && <p className="px-4 py-2 text-sm text-red-700" role="alert">{error}</p>}
    <div className="qs-official-frame"><iframe ref={frame} title="青松教学助手" src="/api/assistant/official/" className="min-h-0 w-full flex-1 border-0" sandbox="allow-scripts allow-same-origin allow-downloads allow-popups" onError={() => setError('助手未能打开，已有对话保留，请刷新重试。')}/></div>
  </GlassSurface>;
}
