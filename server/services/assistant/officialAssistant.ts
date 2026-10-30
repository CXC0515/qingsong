import {semanticPersonalContext,queueConversationMemory,drainMemoryWorkers} from './memoryService';
import { assistantCapability, CapabilityError } from './capabilities';
import { WorkspaceDataReadError } from '../../repositories/workspaceFileStore';
import { createHash, randomUUID } from 'node:crypto';
import { createServer, request as httpRequest, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import type { Request, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../auth/auth';
import { getAuthDatabase } from '../../database/authDatabase';
import { runtimeConfig } from '../../config/runtimeConfig';
import { getModelConfig } from '../../config/modelConfig';
import { getWorkspaceContext, createWorkspaceContext, runWithWorkspace, type WorkspaceContext } from '../../context/workspaceContext';
import { configHome, models } from './assistantService';
import {recallPersonalContext, personalTool, explicitPersonalCommand, PersonalContextError} from './personalContext';
import { officialBudget } from './officialBudget';
import {teachingFailure, officialAssetCache} from './officialResponses';
import {logEvent} from '../../observability/logger';
import {pipeOfficialEventStream} from './officialStream';
import {prepareOfficialAsset, officialAssetEncoding} from './officialAssets';
import { startOfficialRuntime } from '../../../agent/official-runtime.mjs';
import { allowOfficialCall } from '../../../agent/official-policy.mjs';
import { relayOfficialSocket } from '../../../agent/official-relay.mjs';
import {loadGenerationPolicy,generationFingerprint} from './generationPolicy';

import { Transform } from 'node:stream';
import { AssistantMaterialError, assistantMaterialTool, materialSessionId, officialMaterialHome, registerMessageMaterials, selectPoolMaterials } from './officialAttachments';
import { RESOURCE_UPLOAD_LIMIT_BYTES } from '../../../src/domain/uploadPolicy';
import { reserveMaterialStorage, releaseMaterialStorage } from './officialMaterialQuota';
import { AssistantMaterialReadError } from './materialReader';
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
  humanTexts: Map<string, string[]>;
  closing?: Promise<void>;
};
async function nativeWorkspaceCall(runtime: {port: number}, cookie: string, method: string, request: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({type: 'client-request', rpcId: randomUUID(), method, payload: {args: {request}}});
    const call = httpRequest({hostname: '127.0.0.1', port: runtime.port, path: '/api/' + method, method: 'POST', headers: {host: new URL(runtimeConfig.appUrl).host, cookie, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload))}}, response => {
      let body = ''; response.on('data', chunk => body += chunk); response.on('end', () => { try { const result = JSON.parse(body).result; if (!result?.ok) throw Error('WORKSPACE_FAILED'); resolve(result.value); } catch { reject(Error('WORKSPACE_FAILED')); } });
    });
    call.setTimeout(15000, () => call.destroy(Error('WORKSPACE_TIMEOUT'))); call.on('error', reject); call.end(payload);
  });
}
async function checkIdentity(headers: IncomingMessage['headers'], context: WorkspaceContext) {
  const session = await auth.api.getSession({headers: fromNodeHeaders(headers)});
  if (session?.user.id !== context.userId) throw Error('AUTH_EXPIRED');
  const member = getAuthDatabase().prepare("SELECT workspace_id FROM app_workspace_members WHERE user_id=? AND status='active'").get(context.userId) as {workspace_id: string} | undefined;
  if (member?.workspace_id !== context.workspaceId) throw Error('ACCESS_DENIED');
}
async function fingerprint() {
  const hash = createHash('sha256');
  hash.update(await generationFingerprint());
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
  await drainMemoryWorkers();
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
    const generationPolicy=await loadGenerationPolicy();
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
        else if (body.kind === 'material-images-saved') {
          releaseMaterialStorage(officialMaterialHome(context), body.reservationId); res.end('{}');
        }
        else if (body.kind === 'materials-context' || body.kind === 'material') {
          if (!materialSessionId(body.sessionId)) throw new AssistantMaterialError('INVALID_SESSION');
          const controller = new AbortController();
          req.once('aborted', () => controller.abort());
          res.once('close', () => { if (!res.writableFinished) controller.abort(); });
          const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]);
          const reservationId = body.kind === 'material' && body.input?.action !== 'list'
            ? await reserveMaterialStorage(officialMaterialHome(context), 30 * 1024 * 1024) : undefined;
          try {
            const result = body.kind === 'materials-context'
              ? await registerMessageMaterials(context, body.sessionId, body.attachments, body.poolIds)
              : await assistantMaterialTool(context, body.sessionId, body.input, signal);
            await authorizeInstance(instance);
            if ('images' in result && result.images?.length && reservationId) res.end(JSON.stringify({ ...result, reservationId }));
            else { if (reservationId) releaseMaterialStorage(officialMaterialHome(context), reservationId); res.end(JSON.stringify(result)); }
          } catch (error) { if (reservationId) releaseMaterialStorage(officialMaterialHome(context), reservationId); throw error; }
        }
        else if (body.kind === 'personal-context' || body.kind === 'personal-tool' || body.kind === 'memory-observe') {
          if (typeof body.sessionId !== 'string' || body.sessionId.length > 160 || typeof body.sourceText !== 'string' || body.sourceText.length > 8020) throw Error('INVALID_OPERATION');
          if(body.messageId!==undefined&&(typeof body.messageId!=='string'||body.messageId.length>160))throw Error('INVALID_OPERATION');
          if(body.turn!==undefined&&(!Number.isSafeInteger(body.turn)||body.turn<0))throw Error('INVALID_OPERATION');
          const trusted = instance.humanTexts.get(body.sessionId)?.includes(createHash('sha256').update(body.sourceText).digest('hex')) ? body.sourceText : null;
          if(body.query!==undefined&&(typeof body.query!=='string'||body.query.length>4000))throw Error('INVALID_OPERATION');
          if(body.kind==='memory-observe'){
            if(!trusted)throw Error('UNTRUSTED_MEMORY_INPUT');
            const result=runWithWorkspace(context,()=>queueConversationMemory(trusted,{type:'chat',sessionId:body.sessionId,workspaceId:context.workspaceId,messageId:body.messageId,turn:body.turn},body.messageId??String(body.turn??'')));
            res.end(JSON.stringify(result));return;
          }
          const result = await runWithWorkspace(context, () => body.kind === 'personal-context'
            ? semanticPersonalContext(body.query??body.sourceText)
            : personalTool(body.input, {type:'chat',sessionId:body.sessionId,workspaceId:context.workspaceId,messageId:body.messageId,turn:body.turn}, trusted));
          res.end(JSON.stringify(result));
        }
        else if (body.kind === 'capability') {
          const controller = new AbortController();
          req.once('aborted', () => controller.abort());
          res.once('close', () => {if(!res.writableFinished)controller.abort();});
          const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(90000)]);
          const value = await runWithWorkspace(context, () => assistantCapability(body.action, body.input,signal));
          await authorizeInstance(instance);
          value.sources = value.sources.map(source => ({...source, url:new URL(source.url,runtimeConfig.appUrl).href}));
          res.end(JSON.stringify(value));
        }
        else throw Error('INVALID_OPERATION');
      } catch (error) {
        if (!res.headersSent) res.writeHead(400);
        const failure = error instanceof CapabilityError ? error.toFailure() : error instanceof WorkspaceDataReadError || error instanceof PersonalContextError || error instanceof AssistantMaterialError || error instanceof AssistantMaterialReadError ? {code:error.code,message:error.message} : (error as Error).message === 'MATERIAL_STORAGE_LIMIT' ? { code: 'MATERIAL_STORAGE_LIMIT', message: '附件与解析缓存已达到当前用户512MB限制，原件和对话仍保留，请减少材料或联系管理员。' } : teachingFailure(error);
        logEvent('warn', 'assistant_tool_failed', {code: failure.code});
        res.end(JSON.stringify(failure));
      }
    });
    await new Promise<void>((resolve, reject) => { bridge.once('error', reject); bridge.listen(0, '127.0.0.1', resolve); });
    const port = (bridge.address() as import('node:net').AddressInfo).port;
    const startTime = performance.now();
    let runtimeReady = startTime, authenticated = startTime;
    let runtime: Awaited<ReturnType<typeof startOfficialRuntime>> | undefined;
    try {
      const endpoint='http://127.0.0.1:'+port+'/';
      runtime = await startOfficialRuntime({home: path.join(context.dataDirectory, 'assistant', key, 'official'), configHome, publicUrl: origin() + officialPrefix + '/', key: getModelConfig().apiKey, endpoint, token, generationPolicy});
      runtimeReady = performance.now();
      const cookie = await new Promise<string>((resolve, reject) => {
        const exchange = httpRequest({hostname: '127.0.0.1', port: runtime!.port, path: '/' + new URL(runtime!.url).search, headers: {host: new URL(runtimeConfig.appUrl).host}}, response => {
          response.resume();
          const value = (response.headers['set-cookie'] ?? []).map(part => part.split(';')[0]).join('; ');
          if (response.statusCode !== 303 || !value.includes('dsh-auth-')) reject(Error('NATIVE_AUTH_FAILED')); else resolve(value);
        });
        exchange.setTimeout(15000, () => exchange.destroy(Error('NATIVE_AUTH_TIMEOUT'))); exchange.once('error', reject); exchange.end();
      });
      authenticated = performance.now();
      const initial = await nativeWorkspaceCall(runtime, cookie, 'workspace/create', {path: path.join(context.dataDirectory, 'assistant', key, 'official', 'empty-workspace')});
      if (initial.workspace.title === 'empty-workspace') await nativeWorkspaceCall(runtime, cookie, 'workspace/rename', {workspaceId: initial.workspace.workspaceId, title: '我的工作区'});
      instance = {runtime, bridge, context, cookie, authorizers: new Map([[identity, authorize]]), leaseTimers: new Map(), touched: Date.now(), fingerprint: revision, leases, sockets: new Set(), humanTexts: new Map()};
      logEvent('info', 'assistant_official_startup', {runtimeMs: Math.round(runtimeReady - startTime), authMs: Math.round(authenticated - runtimeReady), workspaceMs: Math.round(performance.now() - authenticated), totalMs: Math.round(performance.now() - startTime)});
      instances.set(key, instance);
      return instance;
    } catch (error) { await runtime?.close(); bridge.closeAllConnections(); bridge.close(); throw error; }
  })();
  starting.set(key, start);
  try { return await start; } finally { starting.delete(key); }
}
const uploadQueues = new Map<string, { tail: Promise<void>; count: number }>();
/** A bounded carrier for DSH's native upload; it never exposes the native owner cookie. */
async function proxyOfficialUpload(req: Request, res: Response, target: URL) {
  const context = getWorkspaceContext(), key = scope(context);
  const queue = uploadQueues.get(key) ?? { tail: Promise.resolve(), count: 0 };
  if (queue.count >= 20) { res.status(429).json({ message: '待上传附件较多，已有文件保留，请等当前批次完成后重试。' }); return; }
  const previous = queue.tail; let unlock!: () => void;
  queue.tail = new Promise<void>(resolve => { unlock = resolve; }); queue.count++; uploadQueues.set(key, queue);
  const abort = new AbortController();
  const cancelled = () => abort.abort();
  req.once('aborted', cancelled); res.once('close', cancelled);
  let reservationId: string | undefined;
  try {
    await previous;
    if (req.destroyed || res.destroyed || abort.signal.aborted) return;
    const sessionId = target.searchParams.get('sessionId'), name = target.searchParams.get('name');
    if (!materialSessionId(sessionId) || !name || name.length > 255 || /[\\/\x00-\x1f]/.test(name) || [...target.searchParams.keys()].some(k => !['sessionId', 'name'].includes(k)) || req.headers['content-type']?.split(';')[0] !== 'application/octet-stream') throw new AssistantMaterialError('INVALID_UPLOAD');
    const instance = await ensureInstance(context, () => checkIdentity(req.headers, context), createHash('sha256').update(req.headers.cookie ?? '').digest('hex'));
    if (!await nativeWorkspaceCall(instance.runtime, instance.cookie, 'session/projections', { sessionId })) throw new AssistantMaterialError('INVALID_SESSION');
    if (req.destroyed || res.destroyed || abort.signal.aborted) return;
    const declared = Number(req.headers['content-length'] ?? RESOURCE_UPLOAD_LIMIT_BYTES);
    const limit = RESOURCE_UPLOAD_LIMIT_BYTES;
    if (!Number.isSafeInteger(declared) || declared < 0 || declared > limit) throw new AssistantMaterialError('UPLOAD_LIMIT', '附件超过单文件80MB或当前用户512MB存储限制，本次文件未确认保存。已有文件保留，请缩小文件或从材料池引用。');
    reservationId = await reserveMaterialStorage(officialMaterialHome(context), declared);
    if (req.destroyed || res.destroyed || abort.signal.aborted) return;
    await new Promise<void>((resolve, reject) => {
      let size = 0, settled = false;
      const finish = (error?: Error) => {
        if (settled) return; settled = true; clearInterval(guard); req.unpipe(limiter); limiter.destroy();
        if (error) { upstream.destroy(); reject(error); } else resolve();
      };
      const limiter = new Transform({ transform(chunk, _encoding, callback) { size += chunk.length; callback(size > limit ? new AssistantMaterialError('UPLOAD_LIMIT', '上传超过大小限制，未确认保存。已有对话保留，请缩小文件后重试。') : null, chunk); } });
      const upstream = httpRequest({ hostname: '127.0.0.1', port: instance.runtime.port, path: target.pathname + target.search, method: 'POST', headers: { host: new URL(runtimeConfig.appUrl).host, cookie: instance.cookie, 'content-type': 'application/octet-stream' } }, incoming => {
        res.status(incoming.statusCode ?? 502); res.setHeader('content-type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
        incoming.pipe(res); incoming.once('end', () => finish()); incoming.once('error', error => finish(error));
      });
      const guard = setInterval(() => { void checkIdentity(req.headers, context).catch(error => finish(error)); }, 15000); guard.unref();
      upstream.setTimeout(60000, () => finish(new Error('UPLOAD_TIMEOUT')));
      upstream.once('error', error => finish(error)); limiter.once('error', error => finish(error));
      req.once('aborted', () => finish(new Error('UPLOAD_CANCELLED')));
      res.once('close', () => { if (!res.writableFinished) finish(new Error('UPLOAD_CANCELLED')); });
      req.pipe(limiter).pipe(upstream);
    });
  } catch (error) {
    if (!res.headersSent) res.status(error instanceof AssistantMaterialError && error.code === 'UPLOAD_LIMIT' ? 413 : 400).json({ message: error instanceof AssistantMaterialError ? error.message : (error as Error).message === 'MATERIAL_STORAGE_LIMIT' ? '附件与缓存已达当前用户512MB限制，原件和对话保留。请从材料池引用或联系管理员。' : '附件上传未能确认完成，原有文件与对话保留。请查看附件状态后重试。' });
    else res.end();
  } finally {
    if (reservationId) releaseMaterialStorage(officialMaterialHome(context), reservationId);
    req.off('aborted', cancelled); res.off('close', cancelled);
    queue.count--; unlock(); if (!queue.count && uploadQueues.get(key) === queue) uploadQueues.delete(key);
  }
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
  const requestStarted = performance.now();
  res.setHeader('Cache-Control', 'no-store');
  if ((req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin !== origin()) || req.headers['sec-fetch-site'] === 'cross-site') { res.status(403).json({message: '请求来源不符，教学数据未修改，请从青松工作台重新打开助手。'}); return; }
  const raw = req.originalUrl.slice(officialPrefix.length) || '/';
  let target: URL;
  try { target = new URL(raw, origin()); if (target.origin !== origin() || target.pathname.includes('%')) throw Error(); }
  catch { res.status(400).end(); return; }
  if (target.pathname === '/api/settings/describe' && req.method === 'POST' && req.body?.type === 'client-request' && req.body?.method === 'settings/describe') {
    res.json({type: 'server-response', rpcId: req.body.rpcId, result: {ok: true, value: {writable: false, hasDocument: false, namespaces: [{ns: 'locale', autoGenerate: false, schema: {type: 'object', properties: {preference: {type: 'string'}}}, value: {preference: 'zh-CN-x-qingsong'}, applies: 'live', secrets: [], revision: 0}]}}}); return;
  }
  if (target.pathname === '/api/qingsong/workspace' && req.method === 'POST') {
    const body = req.body;
    if (!body || Object.keys(body).some(key => !['title', 'requestId'].includes(key)) || typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 40 || /[\\/\x00-\x1f]/.test(body.title) || ['.', '..'].includes(body.title.trim()) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId ?? '')) {
      res.status(400).json({message: '名称请填1至40个字，不能包含斜线。未新增工作区，请修改后重试。'}); return;
    }
    try {
      const context = getWorkspaceContext();
      const instance = await ensureInstance(context, () => checkIdentity(req.headers, context), createHash('sha256').update(req.headers.cookie ?? '').digest('hex'));
      const directory = path.join(context.dataDirectory, 'assistant', scope(context), 'official', 'workspaces', body.requestId, body.title.trim());
      await mkdir(directory, {recursive: true});
      const result = await nativeWorkspaceCall(instance.runtime, instance.cookie, 'workspace/create', {path: directory});
      res.json({workspace: result.workspace});
    } catch { res.status(409).json({message: '工作区未能确认新增，可能名称重复或连接中断。已有会话保留，请刷新查看后重试。'}); }
    return;
  }
  if (target.pathname === '/api/qingsong/materials/references' && req.method === 'POST') {
    try {
      const body = req.body;
      if (!body || Object.keys(body).some(key => !['sessionId', 'requestId', 'itemIds'].includes(key)) || !materialSessionId(body.sessionId)) throw new AssistantMaterialError('INVALID_SESSION');
      const context = getWorkspaceContext();
      const instance = await ensureInstance(context, () => checkIdentity(req.headers, context), createHash('sha256').update(req.headers.cookie ?? '').digest('hex'));
      if (!await nativeWorkspaceCall(instance.runtime, instance.cookie, 'session/projections', { sessionId: body.sessionId })) throw new AssistantMaterialError('INVALID_SESSION');
      res.json(await selectPoolMaterials(context, body.sessionId, body.requestId, body.itemIds));
    } catch (error) {
      res.status(400).json({ code: error instanceof AssistantMaterialError ? error.code : 'MATERIAL_SELECTION_FAILED', message: error instanceof AssistantMaterialError ? error.message : '材料引用未能确认加入，原件与对话保留，请重新打开材料选择重试。' });
    }
    return;
  }
  if (target.pathname === '/api/session/uploadFileBinary' && req.method === 'POST') {
    await proxyOfficialUpload(req, res, target);
    return;
  }
  if (!allowedPath(target.pathname, req) || target.searchParams.has('token') || target.searchParams.has('auth')) { res.status(403).json({message: '此功能尚未开放，教学数据未修改，请返回教学对话。'}); return; }
  let imageReservation: string | undefined;
  const materialHome = officialMaterialHome(getWorkspaceContext());
  const releaseImages = () => { if (imageReservation) { releaseMaterialStorage(materialHome, imageReservation); imageReservation = undefined; } };
  res.once('close', releaseImages);
  try {
    const context = getWorkspaceContext();
    const parts = target.pathname === '/api/session/prompt' ? req.body?.payload?.args?.request?.content : target.pathname === '/api/session/updateQueue' ? req.body?.payload?.args?.request?.action?.content : [];
    const imageBytes = Array.isArray(parts) ? parts.filter(part => part.type === 'image').reduce((sum, part) => sum + Math.ceil(part.data.length * 3 / 4), 0) : 0;
    if (imageBytes) imageReservation = await reserveMaterialStorage(materialHome, imageBytes + 5 * 4 * 1024 * 1024);
    if (res.destroyed) { releaseImages(); return; }
    const instance = await ensureInstance(context, () => checkIdentity(req.headers, context), createHash('sha256').update(req.headers.cookie ?? '').digest('hex'));
    if(res.destroyed){releaseImages();return;}
    const instanceMs = performance.now() - requestStarted;
    if (target.pathname === '/api/session/prompt') {
      const request = req.body?.payload?.args?.request;
      if (request?.mode !== 'steer' && instance.fingerprint !== await fingerprint()) {
        res.status(409).json({message:'管理员已更新生成配置，请等待当前一轮结束后重新发送。本条消息尚未提交。'}); return;
      }
      if (typeof request?.sessionId === 'string') {
        const text = request.content.filter((part: {type:string}) => part.type === 'text').map((part: {text:string}) => part.text).join('\n');
        if (text.trim() && text.length <= 8020) {
          const texts = instance.humanTexts.get(request.sessionId) ?? [];
          instance.humanTexts.set(request.sessionId, [...texts,createHash('sha256').update(text).digest('hex')].slice(-32));
          if (instance.humanTexts.size > 100) instance.humanTexts.delete(instance.humanTexts.keys().next().value!);
        }
      }
    }
    const upstreamStarted = performance.now();
    let firstByteMs:number|undefined,headersMs:number|undefined,bytes=0;
    const report=(outcome:string)=>logEvent('info','assistant_official_request',{requestId:res.getHeader('x-request-id'),endpoint:target.pathname,method:req.method,status:res.statusCode,outcome,instanceMs:Math.round(instanceMs),upstreamHeadersMs:headersMs===undefined?null:Math.round(headersMs),firstByteMs:firstByteMs===undefined?null:Math.round(firstByteMs),bytes,totalMs:Math.round(performance.now()-requestStarted)});
    let reported=false;
    res.once('close',()=>{if(!reported){reported=true;report(res.writableFinished?'complete':'closed');}});
    const body = req.method === 'POST' ? JSON.stringify(req.body) : undefined;
    const headers: Record<string, string> = {host: new URL(runtimeConfig.appUrl).host, cookie: instance.cookie};
    for (const name of ['content-type', 'accept', 'origin']) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
    if (body) headers['content-length'] = String(Buffer.byteLength(body));
    const upstream = httpRequest({hostname: '127.0.0.1', port: instance.runtime.port, path: target.pathname + target.search, method: req.method, headers}, incoming => {
      res.status(incoming.statusCode ?? 502);
      headersMs=performance.now()-upstreamStarted;
      incoming.on('data',(chunk:Buffer)=>{if(firstByteMs===undefined){firstByteMs=performance.now()-upstreamStarted;logEvent('info','assistant_official_first_byte',{requestId:res.getHeader('x-request-id'),endpoint:target.pathname,instanceMs:Math.round(instanceMs),upstreamHeadersMs:Math.round(headersMs!),firstByteMs:Math.round(firstByteMs)});}bytes+=chunk.length;});
      res.setHeader('Server-Timing', 'instance;dur=' + instanceMs.toFixed(1) + ', upstream;dur=' + (performance.now() - upstreamStarted).toFixed(1));
      if (['GET', 'HEAD'].includes(req.method) && [200, 304].includes(incoming.statusCode ?? 0)) {
        res.setHeader('Cache-Control', officialAssetCache(target.pathname, String(incoming.headers['content-type'] ?? ''), target.search));
      }
      res.removeHeader('Content-Security-Policy'); res.removeHeader('X-Frame-Options');
      for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined && !['set-cookie', 'connection', 'transfer-encoding', 'content-length', 'content-security-policy', 'x-frame-options', 'cache-control', 'vary'].includes(name)) res.setHeader(name, value);
      if (incoming.headers.vary) res.vary(String(incoming.headers.vary));
      res.vary('Cookie');
      const nativeCsp = String(incoming.headers['content-security-policy'] ?? '').split(';').filter(rule => !/^\s*frame-ancestors\b/i.test(rule)).filter(rule => rule.trim()).join('; ');
      res.setHeader('Content-Security-Policy', [nativeCsp, "frame-ancestors 'self'", ...(nativeCsp ? [] : ["object-src 'none'", "base-uri 'self'"])].filter(Boolean).join('; '));
      if (incoming.headers.location) { res.status(502).end('助手连接未完成，已有对话保留，请重新打开助手。'); incoming.resume(); return; }
      if(/^text\/event-stream\b/i.test(String(incoming.headers['content-type']??''))){
        pipeOfficialEventStream(incoming,res,upstream,()=>checkIdentity(req.headers,context),{onHeartbeat:()=>{instance.touched=Date.now();}});
        return;
      }
      const cache = String(res.getHeader('Cache-Control'));
      if (req.method === 'GET' && incoming.statusCode === 200 && cache.startsWith('private,')) {
        let chunks: Buffer[] = [], size = 0, streaming = false;
        incoming.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (!streaming && size > 8 * 1024 * 1024) {
            streaming = true; res.setHeader('Cache-Control', 'no-store');
            for (const buffered of chunks) res.write(buffered);
            chunks = [];
          }
          if (streaming) res.write(chunk); else chunks.push(chunk);
        });
        incoming.on('end', () => {
          if (streaming) { res.end(); return; }
          void (async () => {
            const encoding = officialAssetEncoding(req.headers['accept-encoding']);
            res.vary('Accept-Encoding');
            if (!encoding) { res.status(406).end(); return; }
            const artifact = await prepareOfficialAsset(Buffer.concat(chunks), String(incoming.headers['content-type'] ?? ''));
            if (res.destroyed) return;
            const body = artifact[encoding], etag = artifact.etags[encoding];
            res.setHeader('ETag', etag);
            if (encoding !== 'identity') res.setHeader('Content-Encoding', encoding);
            else res.removeHeader('Content-Encoding');
            const supplied = req.headers['if-none-match']?.split(',').map(value => value.trim().replace(/^W\//, '')) ?? [];
            if (supplied.includes(etag) || supplied.includes('*')) res.status(304).end();
            else { res.setHeader('Content-Length', body.length); res.end(body); }
          })().catch(() => {
            if (!res.headersSent && !res.destroyed) res.status(502).end('助手页面资源加载失败，已有对话保留，请重新连接。');
            else res.destroy();
          });
        });
        incoming.on('error', () => res.destroy());
      } else incoming.pipe(res);
    });
    upstream.setTimeout(60000, () => upstream.destroy(Error('NATIVE_TIMEOUT')));
    upstream.on('error', () => { if (!res.headersSent) res.status(502).json({message: '助手连接中断，已有对话保留，教学数据未修改，请刷新重试。'}); else res.end(); });
    res.on('close', () => upstream.destroy()); upstream.end(body);
  } catch (error) {
    releaseImages();
    const quota = (error as Error).message === 'MATERIAL_STORAGE_LIMIT';
    logEvent('warn','assistant_official_request',{endpoint:target.pathname,method:req.method,status:quota?413:503,outcome:quota?'material_storage_limit':'startup_failed',totalMs:Math.round(performance.now()-requestStarted)});
    if (!res.headersSent&&!res.destroyed) res.status(quota?413:503).json({message: quota ? '附件与缓存已达到当前用户512MB限制，本条消息未确认发送。已有对话和文件保留，请从材料池引用或联系管理员。' : '助手暂时未能启动，已有对话保留，教学数据未修改，请稍后重试。'});
  }
}
export async function officialAssistantUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  const started=performance.now();
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
    logEvent('info','assistant_official_socket',{outcome:'connected',durationMs:Math.round(performance.now()-started)});
    if (instance.closing) relay.close();
    else if (!closed) instance.sockets.add(relay);
  } catch(error) {const code=error instanceof Error&&['ORIGIN','AUTH','AUTH_EXPIRED','ACCESS_DENIED'].includes(error.message)?error.message:'UPSTREAM_CONNECTION';logEvent('warn','assistant_official_socket',{outcome:'failed',code,durationMs:Math.round(performance.now()-started)});if (!socket.destroyed) socket.end('HTTP/1.1 '+(code==='UPSTREAM_CONNECTION'?'503 Service Unavailable':'403 Forbidden')+'\r\n\r\n'); }
}
