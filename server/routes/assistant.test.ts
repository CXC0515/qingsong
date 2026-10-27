import test, { after } from 'node:test';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root = await mkdtemp(path.join(os.tmpdir(), 'qs-assistant-http-'));
const origin = 'http://127.0.0.1:4473';
process.env.APP_DATA_ROOT = root;
process.env.APP_URL = origin;
process.env.API_PORT = '4473';
process.env.OPENAI_VISION_MODEL = 'fixture';
process.env.OPENAI_API_KEY = 'fixture';
process.env.OPENAI_BASE_URL = 'http://127.0.0.1:9/v1';
const { initializeAuth } = await import('../auth/auth');
const { createInvitation } = await import('../auth/invitations');
const { createApp } = await import('../app');
const { closeAuthDatabase } = await import('../database/authDatabase');
const { closeRosterDatabase } = await import('../database/rosterDatabase');
const { closeResourceDatabase } = await import('../database/resourceDatabase');
const { stopAssistant } = await import(
  '../services/assistant/assistantService'
);
await initializeAuth();
const { modelAdminUpgrade, closeModelAdmin } = await import(
  '../services/assistant/modelAdmin'
);
const server = createApp().listen(4473, '127.0.0.1');
server.on(
  'upgrade',
  (req, socket, head) => void modelAdminUpgrade(req, socket, head),
);
await new Promise<void>((resolve) => server.once('listening', resolve));
after(async () => {
  await stopAssistant();
  await closeModelAdmin();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeAuthDatabase();
  closeRosterDatabase();
  closeResourceDatabase();
  await rm(root, { recursive: true, force: true });
});
const headers = {
  Origin: origin,
  'Content-Type': 'application/json',
  'x-demo-csrf': '1',
};
async function register(email: string, role: 'owner' | 'teacher') {
  const invitation = createInvitation({ email, displayName: '虚构教师', role });
  const password = 'Fixture-password-12345';
  const created = await fetch(origin + '/api/register', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      token: invitation.token,
      email,
      name: '虚构教师',
      password,
    }),
  });
  assert.equal(created.status, 201);
  const response = await fetch(origin + '/api/auth/sign-in/email', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie()[0].split(';')[0];
}
test('assistant HTTP routes enforce login, workspace ownership, strict input, CSRF and admin role', async () => {
  assert.equal((await fetch(origin + '/api/assistant/status')).status, 401);
  const a = await register('a@fixture.test', 'teacher'),
    b = await register('b@fixture.test', 'teacher');
  const status = await fetch(origin + '/api/assistant/status', {
    headers: { Cookie: a },
  });
  const meta = await status.json();
  assert.equal(meta.canManage, false);
  assert.equal(JSON.stringify(meta).includes('apiKey'), false);
  for (const endpoint of ['', '/old/messages', '/old/cancel']) {
    const response = await fetch(origin + '/api/assistant/sessions' + endpoint, {method: 'POST', headers: {...headers, Cookie: a}, body: '{}'});
    assert.equal(response.status, 410);
    assert.match(await response.text(), /只读/);
  }
  assert.equal(
    (
      await fetch(origin + '/api/assistant/manage/open', {
        headers: { Cookie: a },
        redirect: 'manual',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(origin + '/api/assistant/sessions', {
        method: 'POST',
        headers: { ...headers, Origin: 'https://evil.test', Cookie: a },
        body: '{}',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(origin + '/api/assistant/sessions', {
        method: 'POST',
        headers: { ...headers, Cookie: a },
        body: JSON.stringify({
          provider: 'qingsong',
          model: 'fixture',
          workspaceId: 'spoofed',
        }),
      })
    ).status,
    410,
  );
  assert.equal(
    (
      await (
        await fetch(origin + '/api/assistant/sessions', {
          headers: { Cookie: b },
        })
      ).json()
    ).length,
    0,
  );
});

test('native configuration exchanges its token server-side and keeps its own same-origin transport', async () => {
  const owner = await register('owner@fixture.test', 'owner');
  const opened = await fetch(origin + '/api/assistant/manage/open', {
    headers: { Cookie: owner },
    redirect: 'manual',
  });
  assert.equal(opened.status, 303);
  assert.equal(opened.headers.get('location'), '/api/assistant/manage/');
  assert.ok(opened.headers.getSetCookie().length);
  const cookies =
    owner +
    '; ' +
    opened.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
  const page = await fetch(origin + '/api/assistant/manage/', {
    headers: { Cookie: cookies },
  });
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes('DeepSeek Harness'));
  const response = await fetch(
    origin + '/api/assistant/manage/api/agentPresets/list',
    {
      method: 'POST',
      headers: {
        Origin: origin,
        Cookie: cookies,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rpcId: 'fixture', args: [] }),
    },
  );
  assert.notEqual(
    response.status,
    403,
    'native requests must not require the business UI CSRF header',
  );
  assert.equal(
    (
      await fetch(origin + '/api/assistant/manage/api/agentPresets/list', {
        method: 'POST',
        headers: {
          Origin: 'https://evil.test',
          Cookie: cookies,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
    ).status,
    403,
  );
});

test('native websocket admission rejects anonymous, teacher and foreign-origin requests',async()=>{
 const teacher=await register('ws-teacher@fixture.test','teacher');
 const owner=await register('ws-owner@fixture.test','owner');
 async function upgrade(cookie:string,requestOrigin:string){return new Promise<number>((resolve,reject)=>{const req=httpRequest(origin+'/api/assistant/manage/api/remote.mux',{headers:{Cookie:cookie,Origin:requestOrigin,Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':Buffer.alloc(16).toString('base64')}},res=>{res.resume();resolve(res.statusCode!);});req.on('upgrade',(_res,socket)=>{socket.destroy();resolve(101);});req.on('error',reject);req.setTimeout(3000,()=>req.destroy(Error('upgrade timeout')));req.end();});}
 assert.equal(await upgrade('',origin),403);assert.equal(await upgrade(teacher,origin),403);assert.equal(await upgrade(owner,'https://evil.test'),403);
});
