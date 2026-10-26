import { createHash, randomUUID } from 'node:crypto';
import { createServer, request as httpRequest, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Request, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../auth/auth';
import { getAuthDatabase } from '../../database/authDatabase';
import { runtimeConfig } from '../../config/runtimeConfig';
import { getModelConfig } from '../../config/modelConfig';
import { getWorkspaceContext, createWorkspaceContext, runWithWorkspace, type WorkspaceContext } from '../../context/workspaceContext';
import { configHome, models } from './assistantService';
import { teachingQuery } from './teachingQueries';
import { officialBudget } from './officialBudget';
import { startOfficialRuntime } from '../../../agent/official-runtime.mjs';
import { allowOfficialCall } from '../../../agent/official-policy.mjs';
import { relayOfficialSocket } from '../../../agent/official-relay.mjs';
export const officialPrefix = '/api/assistant/official';
const instances = new Map<string, Instance>();
const starting = new Map<string, Promise<Instance>>();
const scope = (c: WorkspaceContext) => createHash('sha256').update(JSON.stringify([c.userId, c.workspaceId])).digest('hex');
const origin = () => new URL(runtimeConfig.appUrl).origin;
type Instance = {
  runtime: Awaited<ReturnType<typeof startOfficialRuntime>>;
  bridge: ReturnType<typeof createServer>;
  cookie: string;
  context: WorkspaceContext;
  authorizers: Map<string, () => Promise<void>>;
  leaseTimers: Map<string, ReturnType<typeof setTimeout>>;
  touched: number;
  fingerprint: string;
  leases: Map<string, AbortController>;
  sockets: Set<{close: () => void}>;
  closing?: Promise<void>;
};
async function checkIdentity(headers: IncomingMessage['headers'], context: WorkspaceContext) {
  const session = await auth.api.getSession({headers: fromNodeHeaders(headers)});
  if (session?.user.id !== context.userId) throw Error('AUTH_EXPIRED');
  const member = getAuthDatabase().prepare("SELECT workspace_id FROM app_workspace_members WHERE user_id=? AND status='active'").get(context.userId) as {workspace_id: string} | undefined;
  if (member?.workspace_id !== context.workspaceId) throw Error('ACCESS_DENIED');
}
async function fingerprint() {
  const hash = createHash('sha256');
  for (const file of ['profiles/web/cordis.patch.yml', '.credentials.yaml']) {
    try { hash.update(await readFile(path.join(configHome, file))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return hash.digest('hex');
}
async function authorizeInstance(instance: Instance) {
  for (const [key, check] of instance.authorizers) { try { await check(); return; } catch { instance.authorizers.delete(key); } }
  throw Error('AUTH_EXPIRED');
}
async function closeInstance(key: string, instance: Instance) {
  if (instance.closing) return instance.closing;
  instance.closing = (async () => {
    for (const timer of instance.leaseTimers.values()) clearTimeout(timer);
    instance.leaseTimers.clear();
    for (const controller of instance.leases.values()) controller.abort();
    for (const socket of instance.sockets) socket.close();
    await instance.runtime.close();
    for (const lease of instance.leases.keys()) officialBudget.release(lease);
    instance.leases.clear();
    instance.bridge.closeAllConnections();
    await new Promise<void>((resolve, reject) => instance.bridge.close(error => error ? reject(error) : resolve()));
    if (instances.get(key) === instance) instances.delete(key);
  })();
  return instance.closing;
}
export async function closeOfficialAssistant() {
  await Promise.allSettled([...starting.values()]);
  await Promise.all([...instances].map(([key, instance]) => closeInstance(key, instance)));
}
const reaper = setInterval(() => {
  for (const [key, instance] of instances) {
    if (!instance.leases.size && Date.now() - instance.touched > 600000)
      void closeInstance(key, instance).catch(() => {});
  }
}, 60000); reaper.unref();
async function ensureInstance(context: WorkspaceContext, authorize: () => Promise<void>, identity: string) {
  const key = scope(context);
  await authorize();
  await models();
  const revision = await fingerprint();
  const existing = instances.get(key);
  if (existing) {
    if (existing.closing) { await existing.closing; return ensureInstance(context, authorize, identity); }
    if (!existing.runtime.isAlive() || (existing.fingerprint !== revision && !existing.leases.size)) {
      await closeInstance(key, existing);
    } else { existing.authorizers.set(identity, authorize); existing.touched = Date.now(); return existing; }
  }
  if (starting.has(key)) { const ready = await starting.get(key)!; ready.authorizers.set(identity, authorize); return ready; }
  if (instances.size + starting.size >= 4) throw Error('INSTANCE_CAPACITY');
  const start = (async () => {
    const token = randomUUID();
    const leases = new Map<string, AbortController>();
    let instance: Instance | undefined;
    const bridge = createServer(async (req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.method !== 'POST' || req.url !== '/' || req.headers.authorization !== 'Bearer ' + token || !instance) { res.writeHead(403).end('{}'); return; }
      try {
        let text = '';
        for await (const chunk of req) { text += chunk; if (text.length > 32768) throw Error('TOO_LARGE'); }
        const body = JSON.parse(text);
        const lease = key + ':' + body.lease;
        if (body.kind === 'release') {
          clearTimeout(instance.leaseTimers.get(lease)); instance.leaseTimers.delete(lease);
          leases.get(lease)?.abort(); leases.delete(lease); officialBudget.release(lease);
          res.end('{}'); return;
        }
        await authorizeInstance(instance); if (instance.closing) throw Error('CLOSING'); instance.touched = Date.now();
        if (body.kind === 'acquire') {
          if (typeof body.lease !== 'string' || body.lease.length > 160 || leases.has(lease)) throw Error('INVALID_LEASE');
          const controller = new AbortController(); leases.set(lease, controller);
          const deadline = setTimeout(() => { if (instance) void closeInstance(key, instance).catch(() => {}); }, 190000); deadline.unref(); instance.leaseTimers.set(lease, deadline);
          const cancel = () => controller.abort();
          req.on('aborted', cancel); res.on('close', () => { if (!res.writableEnded) cancel(); });
          try { await officialBudget.acquire(lease, controller.signal); await authorizeInstance(instance); res.end('{}'); }
          catch (error) { clearTimeout(instance.leaseTimers.get(lease)); instance.leaseTimers.delete(lease); controller.abort(); leases.delete(lease); officialBudget.release(lease); throw error; }
        } else if (body.kind === 'authorize') res.end('{}');
        else if (body.kind === 'query') {
          const value = runWithWorkspace(context, () => teachingQuery(body.input));
          // Absolute app links stay in the teacher workspace and never resolve beneath the iframe mount.
          value.sources = value.sources.map(source => ({...source, url: new URL(source.url, runtimeConfig.appUrl).href}));
          res.end(JSON.stringify(value));
        } else throw Error('INVALID_OPERATION');
      } catch (error) {
        if (!res.headersSent) res.writeHead(400);
        res.end(JSON.stringify({message: (error as Error).message === 'QUEUE_FULL' ? '助手正在处理其他请求，已保留对话，教学数据未修改，请稍后重试。' : '本次请求未完成，已有对话保留，教学数据未修改，请重新登录后重试。'}));
      }
    });
    await new Promise<void>((resolve, reject) => { bridge.once('error', reject); bridge.listen(0, '127.0.0.1', resolve); });
    const port = (bridge.address() as import('node:net').AddressInfo).port;
    let runtime: Awaited<ReturnType<typeof startOfficialRuntime>> | undefined;
    try {
      runtime = await startOfficialRuntime({home: path.join(context.dataDirectory, 'assistant', key, 'official'), configHome, publicUrl: origin() + officialPrefix + '/', key: getModelConfig().apiKey, endpoint: 'http://127.0.0.1:' + port + '/', token});
      const cookie = await new Promise<string>((resolve, reject) => {
        const exchange = httpRequest({hostname: '127.0.0.1', port: runtime!.port, path: '/' + new URL(runtime!.url).search, headers: {host: new URL(runtimeConfig.appUrl).host}}, response => {
          response.resume();
          const value = (response.headers['set-cookie'] ?? []).map(part => part.split(';')[0]).join('; ');
          if (response.statusCode !== 303 || !value.includes('dsh-auth-')) reject(Error('NATIVE_AUTH_FAILED')); else resolve(value);
        });
        exchange.setTimeout(15000, () => exchange.destroy(Error('NATIVE_AUTH_TIMEOUT'))); exchange.once('error', reject); exchange.end();
      });
      await new Promise<void>((resolve, reject) => {
        const payload = JSON.stringify({type: 'client-request', rpcId: randomUUID(), method: 'workspace/create', payload: {args: {request: {path: path.join(context.dataDirectory, 'assistant', key, 'official', 'empty-workspace')}}}});
        const call = httpRequest({hostname: '127.0.0.1', port: runtime!.port, path: '/api/workspace/create', method: 'POST', headers: {host: new URL(runtimeConfig.appUrl).host, cookie, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload))}}, response => {
          let body = ''; response.on('data', chunk => body += chunk); response.on('end', () => {
            try { if (!JSON.parse(body).result?.ok) throw Error('WORKSPACE_INIT_FAILED'); resolve(); } catch { reject(Error('WORKSPACE_INIT_FAILED')); }
          });
        }); call.setTimeout(15000, () => call.destroy(Error('WORKSPACE_TIMEOUT'))); call.on('error', reject); call.end(payload);
      });
      instance = {runtime, bridge, context, cookie, authorizers: new Map([[identity, authorize]]), leaseTimers: new Map(), touched: Date.now(), fingerprint: revision, leases, sockets: new Set()};
      instances.set(key, instance);
      return instance;
    } catch (error) { await runtime?.close(); bridge.closeAllConnections(); bridge.close(); throw error; }
  })();
  starting.set(key, start);
  try { return await start; } finally { starting.delete(key); }
}
function allowedPath(pathname: string, req: Request) {
  if (pathname.startsWith('/api/')) {
    const endpoint = pathname.slice(5);
    return req.method === 'POST' && req.body?.type === 'client-request' && req.body.method === endpoint && allowOfficialCall(endpoint, req.body.payload);
  }
  if (!['GET', 'HEAD'].includes(req.method)) return false;
  return pathname === '/' || pathname.startsWith('/assets/') || pathname.startsWith('/plugins/') || pathname === '/favicon.ico';
}
export async function officialAssistantProxy(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  if ((req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin !== origin()) || req.headers['sec-fetch-site'] === 'cross-site') { res.status(403).json({message: '请求来源不符，教学数据未修改，请从青松工作台重新打开助手。'}); return; }
  const raw = req.originalUrl.slice(officialPrefix.length) || '/';
  let target: URL;
  try { target = new URL(raw, origin()); if (target.origin !== origin() || target.pathname.includes('%')) throw Error(); }
  catch { res.status(400).end(); return; }
  if (target.pathname === '/api/settings/describe' && req.method === 'POST' && req.body?.type === 'client-request' && req.body?.method === 'settings/describe') {
    res.json({type: 'server-response', rpcId: req.body.rpcId, result: {ok: true, value: {writable: false, hasDocument: false, namespaces: [{ns: 'locale', autoGenerate: false, schema: {type: 'object', properties: {preference: {type: 'string'}}}, value: {preference: 'zh-CN-x-qingsong'}, applies: 'live', secrets: [], revision: 0}]}}}); return;
  }
  if (!allowedPath(target.pathname, req) || target.searchParams.has('token') || target.searchParams.has('auth')) { res.status(403).json({message: '此功能尚未开放，教学数据未修改，请返回教学对话。'}); return; }
  try {
    const context = getWorkspaceContext();
    const instance = await ensureInstance(context, () => checkIdentity(req.headers, context), createHash('sha256').update(req.headers.cookie ?? '').digest('hex'));
    const body = req.method === 'POST' ? JSON.stringify(req.body) : undefined;
    const headers: Record<string, string> = {host: new URL(runtimeConfig.appUrl).host, cookie: instance.cookie};
    for (const name of ['content-type', 'accept', 'origin', 'if-none-match']) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
    if (body) headers['content-length'] = String(Buffer.byteLength(body));
    const upstream = httpRequest({hostname: '127.0.0.1', port: instance.runtime.port, path: target.pathname + target.search, method: req.method, headers}, incoming => {
      res.status(incoming.statusCode ?? 502);
      res.removeHeader('Content-Security-Policy'); res.removeHeader('X-Frame-Options');
      for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined && !['set-cookie', 'connection', 'transfer-encoding', 'content-length', 'content-security-policy', 'x-frame-options', 'cache-control'].includes(name)) res.setHeader(name, value);
      const nativeCsp = String(incoming.headers['content-security-policy'] ?? '').split(';').filter(rule => !/^\s*frame-ancestors\b/i.test(rule)).filter(rule => rule.trim()).join('; ');
      res.setHeader('Content-Security-Policy', [nativeCsp, "frame-ancestors 'self'", ...(nativeCsp ? [] : ["object-src 'none'", "base-uri 'self'"])].filter(Boolean).join('; '));
      if (incoming.headers.location) { res.status(502).end('助手连接未完成，已有对话保留，请重新打开助手。'); incoming.resume(); return; }
      incoming.pipe(res);
    });
    upstream.setTimeout(60000, () => upstream.destroy(Error('NATIVE_TIMEOUT')));
    upstream.on('error', () => { if (!res.headersSent) res.status(502).json({message: '助手连接中断，已有对话保留，教学数据未修改，请刷新重试。'}); else res.end(); });
    res.on('close', () => upstream.destroy()); upstream.end(body);
  } catch { if (!res.headersSent) res.status(503).json({message: '助手暂时未能启动，已有对话保留，教学数据未修改，请稍后重试。'}); }
}
export async function officialAssistantUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  try {
    if (req.url !== officialPrefix + '/api/remote.mux' || req.headers.origin !== origin()) throw Error('ORIGIN');
    const session = await auth.api.getSession({headers: fromNodeHeaders(req.headers)});
    const member = session ? getAuthDatabase().prepare("SELECT workspace_id,role FROM app_workspace_members WHERE user_id=? AND status='active'").get(session.user.id) as {workspace_id: string; role: 'owner' | 'teacher'} | undefined : undefined;
    if (!session || !member) throw Error('AUTH');
    const context = createWorkspaceContext(session.user.id, member.workspace_id, member.role);
    const authorize = () => checkIdentity(req.headers, context);
    const instance = await ensureInstance(context, authorize, createHash('sha256').update(req.headers.cookie ?? '').digest('hex'));
    let relay: {close: () => void} | undefined;
    let closed = false;
    relay = await relayOfficialSocket(req, socket, head, {port: instance.runtime.port, cookie: instance.cookie, host: new URL(runtimeConfig.appUrl).host, authorize, onClose: () => { closed = true; if (relay) instance.sockets.delete(relay); }});
    if (instance.closing) relay.close();
    else if (!closed) instance.sockets.add(relay);
  } catch { if (!socket.destroyed) socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); }
}
