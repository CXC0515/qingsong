import { request as proxyRequest } from 'node:http';
import type { Request, Response } from 'express';
import { runtimeConfig } from '../../config/runtimeConfig';
import { getModelConfig } from '../../config/modelConfig';
import { startModelAdmin } from '../../../agent/model-admin.mjs';
import { configHome, models } from './assistantService';
let blocked = false;
let admin: any;
let starting: Promise<any> | undefined;
let idle: NodeJS.Timeout | undefined;
const prefix = '/api/assistant/manage';
const nativeCookie = (value: string | undefined) =>
  (value ?? '')
    .split(';')
    .filter((part) => part.trim().startsWith('dsh-auth-'))
    .join('; ');
const cookiePath = (cookie: string) =>
  cookie.replace(/Path=\//i, `Path=${prefix}/`) +
  (runtimeConfig.production && !/;\s*Secure/i.test(cookie) ? '; Secure' : '');
export async function closeModelAdmin() {
  if (idle) clearTimeout(idle);
  await admin?.close();
  admin = undefined;
}
export async function ensureAdmin() {
  if (blocked) throw Error('ADMIN_EXIT_UNCONFIRMED');
  if (admin?.isAlive()) return admin;
  if (starting) return starting;
  starting = (async () => {
    await models();
    admin = await startModelAdmin({
      home: configHome,
      publicUrl: runtimeConfig.appUrl + prefix + '/',
      key: getModelConfig().apiKey,
    });
    return admin;
  })();
  try {
    return await starting;
  } catch (error) {
    if (error instanceof Error && error.message === 'ADMIN_EXIT_UNCONFIRMED')
      blocked = true;
    throw error;
  } finally {
    starting = undefined;
  }
}
export async function modelAdminProxy(req: Request, res: Response) {
  if (
    req.method !== 'GET' &&
    req.method !== 'HEAD' &&
    req.headers.origin !== new URL(runtimeConfig.appUrl).origin
  ) {
    res
      .status(403)
      .json({ message: '管理请求来源不符，配置未保存，请重新打开模型管理。' });
    return;
  }
  try {
    const instance = await ensureAdmin();
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => void closeModelAdmin().catch(() => {}), 600000);
    idle.unref();
    if (req.path === '/open') {
      const url = new URL(instance.url);
      const cookies = await new Promise<string[]>((resolve, reject) => {
        const exchange = proxyRequest(
          {
            hostname: '127.0.0.1',
            port: instance.port,
            path: '/' + url.search,
            headers: { host: new URL(runtimeConfig.appUrl).host },
          },
          (incoming) => {
            incoming.resume();
            if (incoming.statusCode !== 303) reject(Error('ADMIN_AUTH_FAILED'));
            else resolve(incoming.headers['set-cookie'] ?? []);
          },
        );
        exchange.setTimeout(15000, () =>
          exchange.destroy(Error('ADMIN_AUTH_TIMEOUT')),
        );
        exchange.on('error', reject);
        exchange.end();
      });
      res.setHeader('set-cookie', cookies.map(cookiePath));
      res.redirect(303, prefix + '/');
      return;
    }
    const subpath = req.originalUrl.slice(prefix.length) || '/';
    const headers = {
      ...req.headers,
      cookie: nativeCookie(req.headers.cookie),
      host: new URL(runtimeConfig.appUrl).host,
    };
    delete headers['accept-encoding'];
    delete headers['content-length'];
    const body =
      req.body && Object.keys(req.body).length
        ? JSON.stringify(req.body)
        : undefined;
    if (body) headers['content-length'] = String(Buffer.byteLength(body));
    const upstream = proxyRequest(
      {
        hostname: '127.0.0.1',
        port: instance.port,
        path: subpath,
        method: req.method,
        headers,
      },
      (incoming) => {
        res.removeHeader('content-security-policy');
        res.status(incoming.statusCode ?? 502);
        for (const [name, value] of Object.entries(incoming.headers))
          if (
            value !== undefined &&
            !['connection', 'transfer-encoding', 'content-length'].includes(
              name,
            )
          )
            res.setHeader(name, value);
        const cookies = incoming.headers['set-cookie'];
        if (cookies) res.setHeader('set-cookie', cookies.map(cookiePath));
        if (incoming.headers.location?.startsWith('/'))
          res.setHeader('location', prefix + incoming.headers.location);
        incoming.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent)
        res
          .status(502)
          .json({ message: '模型管理暂时不可用，原配置保持不变，请重试。' });
      else res.end();
    });
    res.on('close', () => upstream.destroy());
    if (body) upstream.end(body);
    else upstream.end();
  } catch {
    if (!res.headersSent)
      res
        .status(503)
        .json({ message: '模型管理未能启动，原配置保持不变，请稍后重试。' });
  }
}
export async function modelAdminUpgrade(
  req: import('node:http').IncomingMessage,
  socket: import('node:stream').Duplex,
  head: Buffer,
) {
  try {
    if (
      req.url?.split('?')[0] !== prefix + '/api/remote.mux' ||
      req.headers.origin !== new URL(runtimeConfig.appUrl).origin
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const [{ auth }, { fromNodeHeaders }, { getAuthDatabase }] =
      await Promise.all([
        import('../../auth/auth'),
        import('better-auth/node'),
        import('../../database/authDatabase'),
      ]);
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    const membership = session
      ? (getAuthDatabase()
          .prepare(
            "SELECT role FROM app_workspace_members WHERE user_id=? AND status='active'",
          )
          .get(session.user.id) as any)
      : null;
    if (membership?.role !== 'owner') {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const instance = await ensureAdmin();
    let checking = false;
    const guard = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const current = await auth.api.getSession({
          headers: fromNodeHeaders(req.headers),
        });
        const member = current
          ? (getAuthDatabase()
              .prepare(
                "SELECT role FROM app_workspace_members WHERE user_id=? AND status='active'",
              )
              .get(current.user.id) as any)
          : null;
        if (member?.role !== 'owner') socket.destroy();
      } catch {
        socket.destroy();
      } finally {
        checking = false;
      }
    }, 15000);
    guard.unref();
    socket.once('close', () => clearInterval(guard));
    const upstream = proxyRequest({
      hostname: '127.0.0.1',
      port: instance.port,
      path: req.url.slice(prefix.length),
      headers: {
        ...req.headers,
        cookie: nativeCookie(req.headers.cookie),
        host: new URL(runtimeConfig.appUrl).host,
      },
    });
    upstream.on('upgrade', (response, connection, upstreamHead) => {
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          Object.entries(response.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n') +
          '\r\n\r\n',
      );
      if (upstreamHead.length) socket.write(upstreamHead);
      if (head.length) connection.write(head);
      connection.on('error', () => socket.destroy());
      socket.on('error', () => connection.destroy());
      socket.on('close', () => connection.destroy());
      connection.on('close', () => socket.destroy());
      socket.pipe(connection);
      connection.pipe(socket);
    });
    upstream.on('response', () => socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'));
    upstream.on('error', () => socket.destroy());
    upstream.end();
  } catch {
    socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
  }
}
