import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import { z } from 'zod';
import { getModelConfig } from '../../config/modelConfig';
import { runtimeConfig } from '../../config/runtimeConfig';
import {
  type WorkspaceContext,
  runWithWorkspace,
} from '../../context/workspaceContext';
import {
  createTeachingHarness,
  bootstrapModels,
  readProviders,
} from '../../../agent/runtime.mjs';
import { logEvent } from '../../observability/logger';
import { teachingQuery } from './teachingQueries';

import type { ChatSession } from '../../../src/domain/assistant';
export const configHome = path.join(
  runtimeConfig.systemDirectory,
  'assistant-models',
);
const validId = z.uuid();
const scopeKey = (context: WorkspaceContext) =>
  createHash('sha256')
    .update(JSON.stringify([context.userId, context.workspaceId]))
    .digest('hex');
const base = (context: WorkspaceContext) =>
  path.join(context.dataDirectory, 'assistant', scopeKey(context));
const sessionFile = (context: WorkspaceContext, id: string) =>
  path.join(base(context), 'sessions', `${validId.parse(id)}.json`);
const live = new Set<string>();
export const saveChat = (context: WorkspaceContext, session: ChatSession) => {
  const file = sessionFile(context, session.id);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  session.updatedAt = new Date().toISOString();
  const temp = file + '.tmp';
  writeFileSync(temp, JSON.stringify(session), { mode: 0o600 });
  renameSync(temp, file);
};
export const getChat = (context: WorkspaceContext, id: string): ChatSession => {
  const file = sessionFile(context, id);
  if (!existsSync(file)) throw Error('CHAT_NOT_FOUND');
  const session = JSON.parse(readFileSync(file, 'utf8')) as ChatSession;
  if (
    ['running', 'queued'].includes(session.status) &&
    !live.has(scopeKey(context) + id)
  ) {
    session.status = 'interrupted';
    session.error =
      '上次生成已中断，已有内容已保留。请核对后继续提问，不会自动重发。';
    saveChat(context, session);
  }
  return session;
};
export const listChats = (context: WorkspaceContext) => {
  const dir = path.join(base(context), 'sessions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .map((n) => getChat(context, n.slice(0, -5)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ id, title, status, updatedAt }) => ({
      id,
      title,
      status,
      updatedAt,
    }));
};
export async function models() {
  const config = getModelConfig();
  await bootstrapModels(configHome, {
    baseUrl: config.baseUrl,
    model: config.visionModel,
  });
  const providers = await readProviders(configHome);
  return Object.entries(providers).flatMap(([provider, p]: [string, any]) =>
    (p.models ?? []).map((m: any) => ({
      provider,
      id: m.id,
      name: m.name || m.id,
    })),
  );
}
export async function createChat(
  context: WorkspaceContext,
  provider: string,
  model: string,
) {
  if (!(await models()).some((m) => m.provider === provider && m.id === model))
    throw Error('MODEL_NOT_AVAILABLE');
  const session: ChatSession = {
    id: randomUUID(),
    title: '新会话',
    provider,
    model,
    updatedAt: new Date().toISOString(),
    status: 'idle',
    messages: [],
    requestIds: [],
  };
  saveChat(context, session);
  return session;
}
export const assistantError =
  '模型服务或连接未能完成本次生成，已收到的内容已保存；没有修改教学业务数据。请稍后继续提问，仍失败时联系管理员核对模型配置。';
type Task = {
  context: WorkspaceContext;
  session: ChatSession;
  key: string;
  authorize: () => Promise<void>;
  cancelled: boolean;
  close?: () => Promise<void>;
};
const queue: Task[] = [];
let active: Task | undefined;
let draining = false;
let toolServer: Server | undefined;
let toolUrl = '';
const leases = new Map<
  string,
  {
    task: Task;
    delta: (text: string) => void;
    source: (sources: any[]) => void;
  }
>();
let shuttingDown = false;
const streams = new Set<() => void>();
export const registerAssistantStream = (close: () => void) => {
  streams.add(close);
  return () => streams.delete(close);
};
async function toolBridge() {
  if (toolServer) return toolUrl;
  toolServer = createServer(async (req, res) => {
    const lease = leases.get(
      (req.headers.authorization ?? '').replace(/^Bearer /, ''),
    );
    if (!lease || lease.task.cancelled || req.method !== 'POST') {
      res.writeHead(403).end();
      return;
    }
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 65536) throw Error('TOO_LARGE');
      }
      await lease.task.authorize();
      const args = JSON.parse(body);
      if (args.kind === 'delta') {
        if (typeof args.text !== 'string' || args.text.length > 32768)
          throw Error('INVALID_DELTA');
        lease.delta(args.text);
        res.end('{}');
        return;
      }
      const result = runWithWorkspace(lease.task.context, () =>
        teachingQuery(args),
      );
      lease.source(result.sources);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(result));
    } catch {
      res
        .writeHead(400)
        .end(
          JSON.stringify({
            ok: false,
            message:
              '查询未完成，请检查班级与日期范围（最长31天）。未修改教学数据。',
          }),
        );
    }
  });
  await new Promise<void>((resolve) =>
    toolServer!.listen(0, '127.0.0.1', resolve),
  );
  toolServer.unref();
  toolUrl = `http://127.0.0.1:${(toolServer.address() as any).port}`;
  return toolUrl;
}
export async function submitChat(
  context: WorkspaceContext,
  id: string,
  input: { requestId: string; text: string },
  authorize: () => Promise<void>,
) {
  const session = getChat(context, id);
  if (session.requestIds.includes(input.requestId)) return session;
  if (
    live.has(scopeKey(context) + id) ||
    ['running', 'queued'].includes(session.status)
  )
    throw Error('CHAT_BUSY');
  if (queue.length >= 3 || shuttingDown) throw Error('QUEUE_FULL');
  if (session.messages.length >= 100) throw Error('CHAT_FULL');
  session.requestIds.push(input.requestId);
  session.title = session.messages.length
    ? session.title
    : input.text.slice(0, 30);
  session.error = undefined;
  session.status = 'queued';
  session.messages.push(
    { id: input.requestId, role: 'user', content: input.text },
    {
      id: randomUUID(),
      role: 'assistant',
      content: '',
      status: 'queued',
      sources: [],
    },
  );
  const task: Task = {
    context,
    session,
    key: scopeKey(context) + id,
    authorize,
    cancelled: false,
  };
  live.add(task.key);
  saveChat(context, session);
  queue.push(task);
  void drain();
  return session;
}
async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (queue.length && !shuttingDown) {
      const task = queue.shift()!;
      if (task.cancelled) continue;
      active = task;
      const { context, session } = task;
      const message = session.messages.at(-1)!;
      let harness: any;
      let timer: NodeJS.Timeout | undefined;
      const token = randomUUID();
      let persisted = 0;
      try {
        await task.authorize();
        if (task.cancelled) continue;
        session.status = 'running';
        message.status = 'running';
        saveChat(context, session);
        const endpoint = await toolBridge();
        leases.set(token, {
          task,
          delta: (text) => {
            message.content += text;
            if (message.content.length > 100000) throw Error('OUTPUT_TOO_LONG');
            if (Date.now() - persisted > 500) {
              saveChat(context, session);
              persisted = Date.now();
            }
          },
          source: (sources) => {
            for (const s of sources)
              if (!message.sources!.some((v) => v.url === s.url))
                message.sources!.push(s);
            saveChat(context, session);
          },
        });
        harness = await createTeachingHarness({
          home: path.join(base(context), 'runtime'),
          configHome,
          provider: session.provider,
          model: session.model,
          endpoint,
          token,
          key: getModelConfig().apiKey,
        });
        task.close = () => harness.close();
        if (task.cancelled) {
          await harness.close();
          continue;
        }
        timer = setTimeout(() => {
          task.cancelled = true;
          session.status = 'interrupted';
          session.error =
            '模型响应超过3分钟，已停止等待；已有内容已保存，未修改教学业务数据。请稍后继续提问。';
          void harness.close();
        }, 180000);
        timer.unref();
        const handle = session.nativeStarted
          ? await harness.resumeSession(session.id)
          : harness.session(session.id);
        if (!session.nativeStarted) await handle.getWorkingDirectory();
        session.nativeStarted = true;
        saveChat(context, session);
        const result = await handle.run(session.messages.at(-2)!.content);
        if (result.finalResponse) message.content = result.finalResponse;
        const ended = result.events
          .filter((event: any) => event.type === 'turn/end')
          .at(-1)?.data?.reason;
        if (!task.cancelled && ended?.kind !== 'completed')
          throw Error(
            ended?.kind === 'max-tokens'
              ? 'OUTPUT_LIMIT'
              : ended?.error?.message?.includes('CALL_LIMIT')
                ? 'CALL_LIMIT'
                : 'MODEL_TURN_INCOMPLETE',
          );
        if (
          !task.cancelled &&
          !(result.finalResponse || message.content).trim()
        )
          throw Error('MODEL_EMPTY_RESPONSE');
        if (!task.cancelled) {
          message.content = result.finalResponse || message.content;
          message.status = 'complete';
          session.status = 'idle';
        }
      } catch (error) {
        if (!task.cancelled) {
          session.status = 'failed';
          const code =
            error instanceof Error &&
            [
              'MODEL_NOT_AVAILABLE',
              'AUTH_EXPIRED',
              'ACCESS_DENIED',
              'OUTPUT_LIMIT',
            ].includes(error.message)
              ? error.message
              : error instanceof Error && error.message.includes('CALL_LIMIT')
                ? 'CALL_LIMIT'
                : 'RUNTIME_OR_MODEL_FAILURE';
          session.error =
            code === 'OUTPUT_LIMIT'
              ? '回答达到本轮长度上限，已有内容已保存，未修改业务数据。可以继续追问剩余部分。'
              : code === 'CALL_LIMIT'
                ? '本轮处理步数已达到上限，已有内容已保存，未修改业务数据。请缩小问题范围后继续。'
                : code === 'MODEL_NOT_AVAILABLE'
                  ? '原模型已变更或移除，已有会话仍保存。请新建会话选择可用模型。'
                  : code === 'AUTH_EXPIRED' || code === 'ACCESS_DENIED'
                    ? '登录已失效或工作区权限已变更，已有内容仍保存。请重新登录或联系管理员。'
                    : assistantError;
          message.status = 'failed';
          logEvent('warn', 'assistant_run_failed', { code });
        }
      } finally {
        if (timer) clearTimeout(timer);
        try {
          await harness?.close();
        } catch {
          shuttingDown = true;
          for (const pending of queue.splice(0)) {
            pending.session.status = 'interrupted';
            pending.session.error =
              '助手已暂停，已有内容保留，请联系管理员后再试。';
            live.delete(pending.key);
            saveChat(pending.context, pending.session);
          }
          session.status = 'failed';
          session.error =
            '助手进程退出尚未确认，已暂停新生成。已有内容已保存，请联系管理员。';
        }
        leases.delete(token);
        live.delete(task.key);
        message.status = task.cancelled ? 'interrupted' : message.status;
        saveChat(context, session);
        active = undefined;
      }
    }
  } finally {
    draining = false;
  }
}
export async function cancelChat(context: WorkspaceContext, id: string) {
  const key = scopeKey(context) + id;
  const task = active?.key === key ? active : queue.find((t) => t.key === key);
  if (task) {
    task.cancelled = true;
    task.session.status = 'cancelled';
    task.session.messages.at(-1)!.status = 'interrupted';
    task.session.error = '已停止生成，已有内容已保留。没有修改教学业务数据。';
    saveChat(context, task.session);
    if (task.close) await task.close();
    else if (task !== active) {
      queue.splice(queue.indexOf(task), 1);
      live.delete(task.key);
    }
  }
  return getChat(context, id);
}
export async function stopAssistant() {
  shuttingDown = true;
  for (const close of streams) close();
  streams.clear();
  for (const task of queue) {
    task.cancelled = true;
    task.session.status = 'interrupted';
    saveChat(task.context, task.session);
  }
  queue.length = 0;
  if (active) {
    active.cancelled = true;
    active.session.status = 'interrupted';
    active.session.error =
      '服务正在重启，本次生成已停止，已有内容保留。请稍后继续提问。';
    saveChat(active.context, active.session);
    await active.close?.();
  }
  toolServer?.close();
}
