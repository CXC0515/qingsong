import { Router, type Request, type Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth/auth';
import { getAuthDatabase } from '../database/authDatabase';
import { getWorkspaceContext } from '../context/workspaceContext';
import {
  models,
  listChats,
  getChat,
  registerAssistantStream,
} from '../services/assistant/assistantService';
const router = Router();
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
const statusMessages: Record<string, string> = {
  CHAT_BUSY: '此会话仍在生成，请等待或停止后再发送。',
  QUEUE_FULL: '助手正在处理其他请求，本条尚未提交，请稍后重试。',
  CHAT_NOT_FOUND: '找不到此会话，请返回会话列表。',
  MODEL_NOT_AVAILABLE:
    '此模型目前不可用，本条尚未提交，请选择其他模型或联系管理员。',
  CHAT_FULL: '此会话已达到100条消息，请新建会话，已有内容已保存。',
};
const handle =
  (fn: (req: Request, res: Response) => unknown) =>
  (req: Request, res: Response) =>
    Promise.resolve()
      .then(() => fn(req, res))
      .catch((error) => {
        if (!res.headersSent)
          res
            .status(error.message === 'CHAT_NOT_FOUND' ? 404 : 400)
            .json({
              message:
                statusMessages[error.message] ||
                '请求未完成，请刷新核对会话后重试。已有记录仍保留，未修改教学业务数据。',
            });
      });
const authorize = (req: Request) => {
  const context = getWorkspaceContext();
  const headers = fromNodeHeaders(req.headers);
  return async () => {
    const session = await auth.api.getSession({ headers });
    if (session?.user.id !== context.userId) throw Error('AUTH_EXPIRED');
    const member = getAuthDatabase()
      .prepare(
        "SELECT workspace_id FROM app_workspace_members WHERE user_id=? AND status='active'",
      )
      .get(context.userId) as any;
    if (member?.workspace_id !== context.workspaceId)
      throw Error('ACCESS_DENIED');
  };
};
router.get(
  '/assistant/status',
  handle(async (_req, res) =>
    res.json({
      models: await models(),
      canManage: res.locals.workspace.role === 'owner',
      principal: getWorkspaceContext().userId,
    }),
  ),
);
router.get(
  '/assistant/sessions',
  handle((_req, res) => res.json(listChats(getWorkspaceContext()))),
);
// Legacy records remain readable; only the official runtime may start new turns.
router.post(['/assistant/sessions', '/assistant/sessions/:id/messages', '/assistant/sessions/:id/cancel'], (_req, res) => {
  res.status(410).json({message: '旧会话已改为只读，已有记录保留。请从教学助手新建会话继续。'});
});
router.get(
  '/assistant/sessions/:id',
  handle((req, res) =>
    res.json(getChat(getWorkspaceContext(), String(req.params.id))),
  ),
);
router.get(
  '/assistant/sessions/:id/events',
  handle((req, res) => {
    const context = getWorkspaceContext(),
      id = String(req.params.id),
      check = authorize(req);
    getChat(context, id);
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    let prior = '',
      busy = false,
      closed = false;
    const tick = async () => {
      if (busy || closed) return;
      busy = true;
      try {
        await check();
        if (closed) return;
        const value = JSON.stringify(getChat(context, id));
        if (value !== prior) {
          prior = value;
          res.write(`data: ${value}\n\n`);
        } else res.write(': keepalive\n\n');
      } catch {
        res.end();
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void tick(), 800);
    timer.unref();
    const untrack = registerAssistantStream(() => res.end());
    res.on('close', () => {
      closed = true;
      clearInterval(timer);
      untrack();
    });
    void tick();
  }),
);
export default router;
