import { useEffect, useRef, useState } from 'react';
import { GlassButton } from '../../components/glass/Glass';
import { listPreparationSessions } from '../../services/preparationApi';
import type { PreparationSessionBinding } from '../../domain/preparation';

export default function PreparationConversations({preparationId, documentId, onOpen}: {
  preparationId: string; documentId: string;
  onOpen: (choice: {sessionId?: string; newSessionId?: string}) => Promise<boolean>;
}) {
  const [sessions, setSessions] = useState<PreparationSessionBinding[]>([]);
  const [selected, setSelected] = useState('');
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const locked = useRef(false);
  useEffect(() => {
    let active = true;
    setSessions([]); setSelected(''); setPending(false); setError(''); locked.current = false;
    const load = async (sessionId?: string) => {
      try {
        const rows = (await listPreparationSessions(preparationId)).filter(row => row.documentId === documentId).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
        if (active) {setSessions(rows);setSelected(sessionId??rows[0]?.sessionId??'');setError('');}
      } catch {if (active) setError('会话列表未能读取，教案保留。点击 AI 助手可重试打开最近会话。');}
    };
    void load();
    const opened = (event: Event) => {
      const target = (event as CustomEvent).detail;
      if (target?.preparationId !== preparationId || target?.documentId !== documentId) return;
      locked.current = false; setPending(false);
      if (target.error) setError(target.error); else void load(target.sessionId);
    };
    window.addEventListener('qingsong:preparation-session-opened', opened);
    return () => {active = false; window.removeEventListener('qingsong:preparation-session-opened', opened);};
  }, [preparationId, documentId]);
  const open = async (create: boolean) => {
    if (locked.current) return;
    locked.current = true; setPending(true); setError('');
    try {
      const accepted = await onOpen(create ? {newSessionId: crypto.randomUUID()} : selected ? {sessionId: selected} : {});
      if (!accepted) {locked.current = false; setPending(false);}
    } catch {locked.current = false; setPending(false); setError('会话未能打开，教案保留，请重试。');}
  };
  return <div className="qs-prep-conversations">
    <select aria-label="选择本教案会话" value={selected} disabled={pending} onChange={event => setSelected(event.target.value)}>
      <option value="">最近使用的会话</option>
      {sessions.map((row, index) => <option key={row.sessionId} value={row.sessionId}>会话 {sessions.length - index} · {new Date(row.updatedAt).toLocaleString('zh-CN')}</option>)}
    </select>
    <GlassButton disabled={pending} onClick={() => void open(false)}>{pending ? '正在打开…' : 'AI 助手'}</GlassButton>
    <GlassButton disabled={pending} onClick={() => void open(true)}>新会话</GlassButton>
    {error && <span role="alert">{error}</span>}
  </div>;
}
