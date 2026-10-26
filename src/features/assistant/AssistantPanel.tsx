import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Plus, Send, Square } from 'lucide-react';
import { GlassButton, GlassSurface } from '../../components/glass/Glass';
import { apiFetch } from '../../services/apiClient';
import type { ChatSession } from '../../domain/assistant';

type Model = { provider: string; id: string; name: string };
type Summary = Pick<ChatSession, 'id' | 'title' | 'status' | 'updatedAt'>;
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch('/api/assistant' + url, init);
  const body = await response.json();
  if (!response.ok)
    throw Error(body.message || '助手连接未完成，已有会话仍保留，请刷新重试。');
  return body;
}
const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
export default function AssistantPanel() {
  const [available, setAvailable] = useState<Model[]>([]),
    [model, setModel] = useState(''),
    [canManage, setCanManage] = useState(false);
  const [sessions, setSessions] = useState<Summary[]>([]),
    [chat, setChat] = useState<ChatSession | null>(null),
    [draft, setDraft] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [sending, setSending] = useState(false);
  const principal = useRef(''),
    requestRef = useRef<{ text: string; id: string } | null>(null),
    scroller = useRef<HTMLDivElement>(null);
  const busy = chat?.status === 'running' || chat?.status === 'queued';
  const selected = available.find((m) => `${m.provider}/${m.id}` === model);
  const refreshList = () => request<Summary[]>('/sessions').then(setSessions);
  const open = async (id: string) => {
    setError('');
    const value = await request<ChatSession>('/sessions/' + id);
    setChat(value);
    setModel(`${value.provider}/${value.model}`);
    try {
      localStorage.setItem('qingsong-assistant:' + principal.current, id);
    } catch {}
  };
  useEffect(() => {
    let mounted = true;
    Promise.all([
      request<{ models: Model[]; canManage: boolean; principal: string }>(
        '/status',
      ),
      request<Summary[]>('/sessions'),
    ])
      .then(async ([status, list]) => {
        if (!mounted) return;
        principal.current = status.principal;
        setAvailable(status.models);
        setCanManage(status.canManage);
        setSessions(list);
        if (status.models[0])
          setModel(`${status.models[0].provider}/${status.models[0].id}`);
        let last = '';
        try {
          last =
            localStorage.getItem('qingsong-assistant:' + status.principal) ||
            '';
        } catch {}
        if (list.some((s) => s.id === last)) {
          const value = await request<ChatSession>('/sessions/' + last);
          if (mounted) {
            setChat(value);
            setModel(`${value.provider}/${value.model}`);
          }
        }
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void request<{ models: Model[]; canManage: boolean }>('/status')
        .then((status) => {
          setAvailable(status.models);
          setCanManage(status.canManage);
          if (!chat)
            setModel((current) =>
              status.models.some((m) => `${m.provider}/${m.id}` === current)
                ? current
                : status.models[0]
                  ? `${status.models[0].provider}/${status.models[0].id}`
                  : '',
            );
        })
        .catch(() => {});
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [chat?.id]);
  useEffect(() => {
    if (!chat?.id || !busy) return;
    const events = new EventSource(`/api/assistant/sessions/${chat.id}/events`);
    events.onmessage = (event) => {
      const value = JSON.parse(event.data) as ChatSession;
      setChat(value);
      setError('');
      if (!['queued', 'running'].includes(value.status))
        void refreshList().catch(() => {});
    };
    events.onerror = () =>
      setError(
        '实时连接中断，正在重新连接。已提交的请求会继续，请勿重复发送。',
      );
    return () => events.close();
  }, [chat?.id, busy]);
  useEffect(() => {
    const area = scroller.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [chat?.messages.at(-1)?.content, chat?.messages.length]);
  const send = async () => {
    const text = draft.trim();
    if (!text || busy || sending || (!chat && !selected)) return;
    setSending(true);
    setError('');
    if (requestRef.current?.text !== text)
      requestRef.current = { text, id: crypto.randomUUID() };
    let target = chat;
    try {
      if (!target) {
        target = await request<ChatSession>(
          '/sessions',
          json({ provider: selected!.provider, model: selected!.id }),
        );
        setChat(target);
        try {
          localStorage.setItem(
            'qingsong-assistant:' + principal.current,
            target.id,
          );
        } catch {}
      }
      const value = await request<ChatSession>(
        `/sessions/${target.id}/messages`,
        json({ requestId: requestRef.current!.id, text }),
      );
      setChat(value);
      setDraft('');
      requestRef.current = null;
      void refreshList().catch(() => {});
    } catch (e) {
      if (target) {
        try {
          const state = await request<ChatSession>('/sessions/' + target.id);
          setChat(state);
          if (state.requestIds.includes(requestRef.current!.id)) {
            setDraft('');
            requestRef.current = null;
          }
        } catch {}
      }
      setError(
        e instanceof Error ? e.message : '发送未完成，请核对会话后重试。',
      );
    } finally {
      setSending(false);
    }
  };
  const cancel = async () => {
    if (!chat) return;
    try {
      setChat(
        await request<ChatSession>(`/sessions/${chat.id}/cancel`, json({})),
      );
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '停止请求未确认，请刷新核对。');
    }
  };
  return (
    <GlassSurface className="qs-assistant-panel">
      <div className="qs-chat-heading">
        <h2
          id="workbench-assistant-heading"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <MessageSquare className="h-4 w-4" />
          教学助手
        </h2>
        {canManage && (
          <a
            className="qs-chat-management"
            href="/api/assistant/manage/open"
            target="_blank"
            rel="noopener noreferrer"
          >
            模型管理
          </a>
        )}
      </div>
      <div className="qs-chat-toolbar">
        <label className="sr-only" htmlFor="assistant-history">
          历史会话
        </label>
        <select
          id="assistant-history"
          className="qs-field-input"
          value={chat?.id || ''}
          disabled={sending || loading}
          onChange={(event) => {
            if (event.target.value)
              void open(event.target.value).catch((e) => setError(e.message));
          }}
        >
          <option value="">新会话</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <GlassButton
          aria-label="新建助手会话"
          disabled={sending}
          onClick={() => {
            setChat(null);
            setModel(current => available.some(m => `${m.provider}/${m.id}` === current) ? current : available[0] ? `${available[0].provider}/${available[0].id}` : '');
            setError('');
            requestRef.current = null;
            try {
              localStorage.removeItem(
                'qingsong-assistant:' + principal.current,
              );
            } catch {}
          }}
        >
          <Plus className="h-4 w-4" />
        </GlassButton>
      </div>
      <div
        className="qs-chat-messages"
        ref={scroller}
        aria-live="polite"
        aria-busy={Boolean(busy)}
      >
        {!chat?.messages.length && (
          <p className="qs-chat-empty">
            {loading
              ? '正在读取会话…'
              : available.length
                ? '可以询问课表、班级名单和课堂记录。教学数据通过只读工具查询；资料库检索和业务写入尚未开放。'
                : '尚未配置聊天模型，请联系管理员通过模型管理添加。'}
          </p>
        )}
        {chat?.messages.map((message) => (
          <article
            key={message.id}
            className={`qs-chat-message qs-chat-${message.role}`}
          >
            <p className="qs-chat-role">
              {message.role === 'user' ? '你' : '教学助手'}
            </p>
            <div className="qs-chat-text">
              {message.content ||
                (message.status === 'queued'
                  ? '等待处理…'
                  : message.status === 'running'
                    ? '正在思考或查询…'
                    : '本次未生成回答。')}
            </div>
            {Boolean(message.sources?.length) && (
              <nav className="qs-chat-sources" aria-label="回答来源">
                {message.sources!.map((source) => (
                  <a key={source.url} href={source.url}>
                    {source.title}
                  </a>
                ))}
              </nav>
            )}
          </article>
        ))}
      </div>
      {(error || chat?.error) && (
        <p className="qs-chat-error" role="status">
          {error || chat?.error}
        </p>
      )}
      <form
        className="qs-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="assistant-model">
          聊天模型
        </label>
        <select
          id="assistant-model"
          className="qs-field-input qs-chat-model"
          value={model}
          disabled={Boolean(chat) || loading}
          onChange={(event) => setModel(event.target.value)}
        >
          {!available.length && <option value="">暂未配置模型</option>}
          {available.map((m) => (
            <option
              key={`${m.provider}/${m.id}`}
              value={`${m.provider}/${m.id}`}
            >
              {m.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="assistant-input">
          发送给教学助手
        </label>
        <textarea
          id="assistant-input"
          className="qs-field-input"
          placeholder="向教学助手提问…"
          value={draft}
          maxLength={8000}
          rows={2}
          disabled={loading || sending}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="qs-chat-actions">
          <span>只读查询 · 回答请结合实际核对</span>
          {busy ? (
            <GlassButton type="button" onClick={() => void cancel()}>
              <Square className="h-4 w-4" />
              停止
            </GlassButton>
          ) : (
            <GlassButton
              type="submit"
              disabled={
                !draft.trim() || sending || loading || (!chat && !selected)
              }
            >
              <Send className="h-4 w-4" />
              {sending ? '提交中…' : '发送'}
            </GlassButton>
          )}
        </div>
      </form>
    </GlassSurface>
  );
}
