import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../../../agent/package.json', import.meta.url));
const {WebSocket} = require('ws');
const root = await mkdtemp(path.join(os.tmpdir(), 'qs-native-http-'));
const origin = process.env.QS_NATIVE_PREVIEW ? 'http://localhost:4480' : 'http://127.0.0.1:' + Number(process.env.QS_TEST_PORT ?? 4475);
const testPort = Number(process.env.QS_TEST_PORT ?? 4475);
const apiRoot = 'http://127.0.0.1:' + testPort;
process.env.APP_DATA_ROOT = root; process.env.APP_URL = origin; process.env.API_PORT = String(testPort);
process.env.OPENAI_VISION_MODEL = 'fixture'; process.env.OPENAI_API_KEY = 'fixture';
let delayNext = false;
let queryScenario: string | undefined;
const model = createServer(async (req, res) => {
  let text = ''; for await (const chunk of req) text += chunk;
  const input = JSON.parse(text);
  if (delayNext) { delayNext = false; await new Promise(resolve => setTimeout(resolve, 1500)); if (res.destroyed) return; }
  res.writeHead(200, {'content-type': 'text/event-stream'});
  const frame = (delta: unknown, finish_reason: string | null = null) => ({id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{index: 0, delta, finish_reason}]});
  if (queryScenario) {
    if (input.messages?.at(-1)?.role !== 'tool') {
      res.write('data: ' + JSON.stringify(frame({role: 'assistant', tool_calls: [{index: 0, id: crypto.randomUUID(), type: 'function', function: {name: 'qingsong_query', arguments: JSON.stringify(queryScenario === 'classes' ? {kind: 'classes'} : {kind: 'roster', classId: '甲教师专属班'})}}]})) + '\n\n');
      res.end('data: ' + JSON.stringify(frame({}, 'tool_calls')) + '\n\ndata: [DONE]\n\n');
    } else {
      res.write('data: ' + JSON.stringify(frame({role: 'assistant', content: input.messages.at(-1).content})) + '\n\n');
      res.end('data: ' + JSON.stringify(frame({}, 'stop')) + '\n\ndata: [DONE]\n\n');
    }
    return;
  }
  if (input.messages?.at(-1)?.role !== 'tool') {
    res.write('data: ' + JSON.stringify(frame({role: 'assistant', tool_calls: [{index: 0, id: crypto.randomUUID(), type: 'function', function: {name: 'qingsong_query', arguments: '{"kind":"schedule"}'}}]})) + '\n\n');
    res.end('data: ' + JSON.stringify(frame({}, 'tool_calls')) + '\n\ndata: [DONE]\n\n');
  } else {
    const result = JSON.parse(input.messages.at(-1).content);
    const answer = '样本查询结果：\n\n| 班级 | 年级 | 学生数 |\n| --- | --- | --- |\n' + result.data.classes.map(c => '| ' + c.name + ' | ' + c.grade + ' | ' + c.studentCount + ' |').join('\n') + '\n\n今天暂无课程。\n\n[查看课表与班级](' + result.sources[0].url + ')\n\n*这是本机假模型样本，只验证界面与工具连接。*';
    res.write('data: ' + JSON.stringify(frame({role: 'assistant', content: answer})) + '\n\n');
    res.end('data: ' + JSON.stringify(frame({}, 'stop')) + '\n\ndata: [DONE]\n\n');
  }
});
await new Promise<void>(resolve => model.listen(0, '127.0.0.1', resolve));
process.env.OPENAI_BASE_URL = 'http://127.0.0.1:' + (model.address() as any).port + '/v1';
const {initializeAuth} = await import('../../auth/auth');
const {createInvitation} = await import('../../auth/invitations');
const {getAuthDatabase, closeAuthDatabase} = await import('../../database/authDatabase');
const {closeRosterDatabase} = await import('../../database/rosterDatabase');
const {closeResourceDatabase} = await import('../../database/resourceDatabase');
const {createWorkspaceContext, runWithWorkspace} = await import('../../context/workspaceContext');
const {createClass} = await import('../../repositories/rosterRepository');
const {createApp} = await import('../../app');
const {officialBudget} = await import('./officialBudget');
const {officialAssistantUpgrade, closeOfficialAssistant} = await import('./officialAssistant');
await initializeAuth();
const server = createApp().listen(testPort, '127.0.0.1');
server.on('upgrade', (req, socket, head) => void officialAssistantUpgrade(req, socket, head));
await new Promise<void>(resolve => server.once('listening', resolve));
after(async () => {
  if (process.env.QS_NATIVE_PREVIEW) return;
  await closeOfficialAssistant(); server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve()));
  closeRosterDatabase(); closeResourceDatabase(); closeAuthDatabase(); await rm(root, {recursive: true, force: true});
});
const headers = {Origin: origin, 'content-type': 'application/json', 'x-demo-csrf': '1'};
async function register(email: string, className: string) {
  const invite = createInvitation({email, displayName: className, role: 'teacher'});
  const password = 'Fixture-password-12345';
  const made = await fetch(apiRoot + '/api/register', {method: 'POST', headers, body: JSON.stringify({token: invite.token, email, name: className, password})});
  assert.equal(made.status, 201);
  const login = await fetch(apiRoot + '/api/auth/sign-in/email', {method: 'POST', headers, body: JSON.stringify({email, password})});
  assert.equal(login.status, 200);
  const row = getAuthDatabase().prepare('SELECT user_id,workspace_id,role FROM app_workspace_members WHERE user_id=(SELECT id FROM user WHERE email=?)').get(email) as any;
  runWithWorkspace(createWorkspaceContext(row.user_id, row.workspace_id, row.role), () => createClass({name: className, grade: '七年级', term: '2026秋', headTeacher: className, status: 'active'}));
  return login.headers.getSetCookie()[0].split(';')[0];
}
async function rpc(cookie: string, method: string, args: unknown) {
  const response = await fetch(apiRoot + '/api/assistant/official/api/' + method, {method: 'POST', headers: {...headers, Cookie: cookie}, body: JSON.stringify({type: 'client-request', rpcId: crypto.randomUUID(), method, payload: {args}})});
  const text = await response.text(); assert.equal(response.status, 200, text);
  return JSON.parse(text).result;
}
async function page(cookie: string, id: string) {
  return new Promise<any>((resolve, reject) => {
    const ws = new WebSocket(apiRoot.replace('http:', 'ws:') + '/api/assistant/official/api/remote.mux', {headers: {Origin: origin, Cookie: cookie}});
    const timer = setTimeout(() => { ws.terminate(); reject(Error('FOLLOW_TIMEOUT')); }, 10000);
    ws.once('open', () => ws.send(JSON.stringify({type: 'open', streamId: 'read', endpoint: 'session/follow', payload: {args: {request: {address: {kind: 'session', sessionId: id}}}}})));
    ws.on('message', (raw: any) => {
      const frame = JSON.parse(raw.toString());
      if (frame.type === 'item') { clearTimeout(timer); ws.close(); resolve(frame.value); }
      if (frame.type === 'error') { clearTimeout(timer); ws.close(); resolve({error: frame}); }
    });
    ws.once('error', error => {clearTimeout(timer); reject(error);});
  });
}
test('two teachers: real official sessions, tool data, feedback persistence and native API fences', {timeout: 120000}, async () => {
  const a = await register('native-a@fixture.test', '甲教师专属班'), b = await register('native-b@fixture.test', '乙教师专属班');
  assert.equal((await fetch(apiRoot + '/api/assistant/official/')).status, 401);
  const indexPage = await fetch(apiRoot + '/api/assistant/official/', {headers: {Cookie: a}});
  assert.equal(indexPage.status, 200); assert.equal(indexPage.headers.has('set-cookie'), false);
  assert.match(indexPage.headers.get('content-security-policy')!, /frame-ancestors 'self'/);
  assert.equal(indexPage.headers.get('cache-control'), 'no-store');
  assert.match(indexPage.headers.get('server-timing')!, /instance;dur=/);
  const html = await indexPage.text();
  const assetPath = html.match(/(?:src|href)=["']([^"']*\/assets\/[^"']+\.js)["']/)?.[1];
  assert.ok(assetPath, 'official hashed script missing');
  const assetUrl = new URL(assetPath, apiRoot + '/api/assistant/official/').href;
  const asset = await fetch(assetUrl, {headers: {Cookie: a}});
  assert.equal(asset.status, 200); assert.match(asset.headers.get('cache-control')!, /private.*immutable/);
  assert.match(asset.headers.get('vary')!, /Cookie/i);
  const etag = asset.headers.get('etag'); assert.ok(etag);
  await asset.arrayBuffer();
  const cached = await fetch(assetUrl, {headers: {Cookie: a, 'If-None-Match': etag!}});
  assert.equal(cached.status, 304);
  assert.equal((await fetch(assetUrl)).status, 401);

  for (const method of ['credentials/list', 'settings/get', 'directoryPicker/list']) {
    const response = await fetch(apiRoot + '/api/assistant/official/api/' + method, {method: 'POST', headers: {...headers, Cookie: a}, body: JSON.stringify({type:'client-request', method, payload: {args: {}}})}); assert.equal(response.status, 403);
  }
  const preferences = await rpc(a, 'settings/describe', {});
  assert.equal(preferences.value.writable, false);
  assert.deepEqual(preferences.value.namespaces.map(ns => ns.ns), ['locale']);
  const addWorkspace = async (cookie: string, title: string, requestId = crypto.randomUUID(), extra = {}) => {
    const response = await fetch(apiRoot + '/api/assistant/official/api/qingsong/workspace', {method: 'POST', headers: {...headers, Cookie: cookie}, body: JSON.stringify({title, requestId, ...extra})});
    return {status: response.status, body: await response.json()};
  };
  const requestId = crypto.randomUUID();
  const wa = await addWorkspace(a, '备课', requestId);
  assert.equal(wa.status, 200, JSON.stringify(wa));
  const repeated = await addWorkspace(a, '备课', requestId);
  assert.equal(repeated.body.workspace.workspaceId, wa.body.workspace.workspaceId);
  const wb = await addWorkspace(b, '备课', requestId);
  assert.equal(wb.status, 200, JSON.stringify(wb));
  assert.notEqual(wb.body.workspace.workspaceId, wa.body.workspace.workspaceId);
  assert.notEqual(wb.body.workspace.path, wa.body.workspace.path);
  assert.equal((await addWorkspace(a, '../escape')).status, 400);
  assert.equal((await addWorkspace(a, '路径注入', crypto.randomUUID(), {path: '/tmp'})).status, 400);
  assert.equal((await rpc(b, 'session/create', {request: {workspaceId: wa.body.workspace.workspaceId}})).ok, false);
  const grouped = await rpc(a, 'session/create', {request: {workspaceId: wa.body.workspace.workspaceId}});
  assert.equal(grouped.ok, true, JSON.stringify(grouped));
  const made = await rpc(a, 'session/create', {request: {}}); assert.equal(made.ok, true, JSON.stringify(made));
  const id = made.value.sessionId;
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(apiRoot.replace('http:', 'ws:') + '/api/assistant/official/api/remote.mux', {headers: {Origin: origin, Cookie: a}});
    let received = false;
    ws.once('open', () => {
      ws.send(JSON.stringify({type: 'open', streamId: 'jobs', endpoint: 'job/list', payload: {args: {request: {sessionId: id}}}}));
      ws.ping();
    });
    ws.on('message', (raw: any) => { if (JSON.parse(raw.toString()).type === 'item') received = true; });
    const timer = setTimeout(() => { if (ws.readyState !== WebSocket.OPEN || !received) reject(Error('STREAM_CLOSED')); else { ws.close(); resolve(); } }, 200);
    ws.once('error', error => {clearTimeout(timer); reject(error);});
  });
  const hidden = await page(b, id);
  assert.ok(hidden.error, JSON.stringify(hidden));
  const sent = await rpc(a, 'session/prompt', {request: {sessionId: id, requestId: crypto.randomUUID(), mode: 'queue', content: [{type: 'text', text: '我的课表'}]}});
  assert.equal(sent.ok, true, JSON.stringify(sent));
  let snapshot: any;
  for (let i = 0; i < 120; i++) {
    snapshot = await page(a, id);
    if (snapshot.error) throw Error(JSON.stringify(snapshot));
    if (snapshot.records?.some(record => record.event?.type === 'turn/end')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const encoded = JSON.stringify(snapshot);
  assert.match(encoded, /甲教师专属班/); assert.doesNotMatch(encoded, /乙教师专属班/);
  for (const scenario of ['classes', 'invalid-class']) {
    queryScenario = scenario;
    try {
      const sid = (await rpc(a, 'session/create', {request: {}})).value.sessionId;
      const submitted = await rpc(a, 'session/prompt', {request: {sessionId: sid, requestId: crypto.randomUUID(), mode: 'queue', content: [{type: 'text', text: '查询样本'}]}});
      assert.equal(submitted.ok, true, JSON.stringify(submitted));
      let result;
      for (let i = 0; i < 120; i++) {
        result = await page(a, sid);
        if (result.records?.some(record => record.event?.type === 'turn/end')) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const serialized = JSON.stringify(result);
      assert.match(serialized, scenario === 'classes' ? /甲教师专属班/ : /当前可访问班级中没有此编号/);
      assert.doesNotMatch(serialized, /请重新登录/);
      assert.doesNotMatch(serialized, /乙教师专属班/);
    } finally { queryScenario = undefined; }
  }
  // Inspect the persisted official event page to locate an actual assistant message, never invent one.
  const messageId = snapshot.records.find(record => record.event?.type === 'assistant/message').event.data.message.id;
  const rated = await rpc(a, 'messageFeedback/put', {request: {sessionId: id, messageId, rating: 'positive', note: '样本验收', ifVersion: null}});
  assert.equal(rated.ok, true, JSON.stringify(rated));
  const feedback = await rpc(a, 'messageFeedback/list', {request: {sessionId: id}});
  assert.equal(feedback.ok, true, JSON.stringify(feedback));
  const blocked = await new Promise<number>(resolve => {
    const ws = new WebSocket(apiRoot.replace('http:', 'ws:') + '/api/assistant/official/api/remote.mux', {headers: {Origin: origin, Cookie: a}});
    ws.once('open', () => ws.send(JSON.stringify({type: 'open', streamId: 'bad', endpoint: 'settings/follow', payload: {args: {}}})));
    ws.once('close', (code: number) => resolve(code)); ws.once('error', () => resolve(1006));
  });
  assert.notEqual(blocked, 1000);
  if (!process.env.QS_NATIVE_PREVIEW) await closeOfficialAssistant();
  assert.equal((await addWorkspace(a, '备课', requestId)).body.workspace.workspaceId, wa.body.workspace.workspaceId);
  assert.equal((await rpc(a, 'session/create', {request: {workspaceId: wa.body.workspace.workspaceId}})).ok, true);
  const restored = await page(a, id);
  assert.match(JSON.stringify(restored), /甲教师专属班/);
  const persisted = await rpc(a, 'messageFeedback/list', {request: {sessionId: id}});
  assert.match(JSON.stringify(persisted), /positive/);
  const foreignFeedback = await rpc(b, 'messageFeedback/list', {request: {sessionId: id}});
  assert.doesNotMatch(JSON.stringify(foreignFeedback), /positive/);
  const changed = await rpc(a, 'messageFeedback/put', {request: {sessionId: id, messageId, rating: 'negative', note: '更新反馈', ifVersion: rated.value.value.version}});
  assert.equal(changed.ok, true, JSON.stringify(changed));
  const deleted = await rpc(a, 'messageFeedback/delete', {request: {sessionId: id, messageId, ifVersion: changed.value.value.version}});
  assert.equal(deleted.ok, true, JSON.stringify(deleted));
  assert.doesNotMatch(JSON.stringify(await rpc(a, 'messageFeedback/list', {request: {sessionId: id}})), /更新反馈/);
  const send = async (sid: string) => rpc(a, 'session/prompt', {request: {sessionId: sid, requestId: crypto.randomUUID(), mode: 'queue', content: [{type: 'text', text: '下一轮我的课表'}]}});
  const until = async (condition: () => Promise<boolean> | boolean) => { for (let i = 0; i < 150; i++) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw Error('STATE_TIMEOUT'); };
  await send(id);
  await until(async () => (await page(a, id)).records.filter(record => record.event?.type === 'turn/end').length >= 2);
  await until(() => officialBudget.size.active === 0);
  const other = (await rpc(a, 'session/create', {request: {}})).value.sessionId;
  delayNext = true; await send(id);
  await until(() => officialBudget.size.active === 1);
  await send(other);
  await until(() => officialBudget.size.waiting === 1);
  assert.equal((await rpc(a, 'session/cancel', {request: {sessionId: other}})).ok, true);
  await until(() => officialBudget.size.waiting === 0);
  assert.equal((await rpc(a, 'session/cancel', {request: {sessionId: id}})).ok, true);
  await until(() => officialBudget.size.active === 0);
  await send(other);
  await until(async () => JSON.stringify(await page(a, other)).includes('甲教师专属班'));
  await until(() => officialBudget.size.active === 0);
  if (!process.env.QS_NATIVE_PREVIEW) {
    const revoked = new WebSocket(apiRoot.replace('http:', 'ws:') + '/api/assistant/official/api/remote.mux', {headers: {Origin: origin, Cookie: a}});
    await new Promise<void>((resolve, reject) => { revoked.once('open', resolve); revoked.once('error', reject); });
    const disconnected = new Promise<void>((resolve, reject) => { const timer = setTimeout(() => {revoked.terminate(); reject(Error('REVOKE_TIMEOUT'));}, 20000); revoked.once('close', () => {clearTimeout(timer); resolve();}); });
    assert.equal((await fetch(apiRoot + '/api/auth/sign-out', {method: 'POST', headers: {...headers, Cookie: a}, body: '{}'})).status, 200);
    assert.equal((await fetch(apiRoot + '/api/assistant/official/', {headers: {Cookie: a}})).status, 401);
    await disconnected;
  }
  if (process.env.QS_NATIVE_PREVIEW) console.log('本机样本预览可登录：native-a@fixture.test / Fixture-password-12345；数据根：' + root);
});
