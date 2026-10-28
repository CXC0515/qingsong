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
const origin = process.env.QS_NATIVE_PREVIEW ? (process.env.QS_PREVIEW_ORIGIN ?? 'http://localhost:4480') : 'http://127.0.0.1:' + Number(process.env.QS_TEST_PORT ?? 4475);
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
  if (queryScenario && ['remember','recall','forget','propose-memory','replay-memory'].includes(queryScenario)) {
    const last = input.messages.filter((m:any)=>!(m.role==='user'&&typeof m.content==='string'&&m.content.startsWith('Current runtime context.'))).at(-1);
    if(queryScenario==='recall'||last?.role==='tool'){
      const snapshot=input.messages.filter((m:any)=>m.role==='user'&&typeof m.content==='string'&&m.content.startsWith('Current runtime context.')).at(-1)?.content??'NO_CONTEXT';
      res.write('data: '+JSON.stringify(frame({role:'assistant',content:snapshot}))+'\n\n');
      res.end('data: '+JSON.stringify(frame({},'stop'))+'\n\ndata: [DONE]\n\n');
    }else{
      const args={action:queryScenario==='forget'?'forget':'propose',kind:'memory',content:queryScenario==='propose-memory'?'fixture-candidate':'fixture-cross-session-memory'};
      res.write('data: '+JSON.stringify(frame({role:'assistant',tool_calls:[{index:0,id:crypto.randomUUID(),type:'function',function:{name:'qingsong_memory',arguments:JSON.stringify(args)}}]}))+'\n\n');
      res.end('data: '+JSON.stringify(frame({},'tool_calls'))+'\n\ndata: [DONE]\n\n');
    }
    return;
  }
  if (queryScenario) {
    const previous = input.messages?.at(-1);
    const result = previous?.role === 'tool' && queryScenario === 'committee' ? JSON.parse(previous.content) : undefined;
    if (previous?.role !== 'tool' || (queryScenario === 'committee' && result.data?.classes)) {
      const args = queryScenario === 'capabilities' ? {kind: 'capabilities'} : queryScenario === 'unsupported' ? {kind: 'grading'} : queryScenario === 'committee' && result ? {kind: 'roster', classId: result.data.classes[0].id} : ['committee','classes'].includes(queryScenario) ? {kind: 'classes'} : {kind: 'roster', classId: '甲教师专属班'};
      res.write('data: ' + JSON.stringify(frame({role: 'assistant', tool_calls: [{index: 0, id: crypto.randomUUID(), type: 'function', function: {name: 'qingsong_query', arguments: JSON.stringify(args)}}]})) + '\n\n');
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
const {createClass,createStudent,listCommitteeRoles} = await import('../../repositories/rosterRepository');
const {createApp} = await import('../../app');
const {officialBudget} = await import('./officialBudget');
const {officialAssistantUpgrade, closeOfficialAssistant} = await import('./officialAssistant');
const {closePersonalContext}=await import('./personalContext');
await initializeAuth();
const server = createApp().listen(testPort, '127.0.0.1');
server.on('upgrade', (req, socket, head) => void officialAssistantUpgrade(req, socket, head));
await new Promise<void>(resolve => server.once('listening', resolve));
after(async () => {
  if (process.env.QS_NATIVE_PREVIEW) return;
  await closeOfficialAssistant(); server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve()));
  closeRosterDatabase(); closeResourceDatabase(); closeAuthDatabase(); closePersonalContext(); await rm(root, {recursive: true, force: true});
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
  runWithWorkspace(createWorkspaceContext(row.user_id, row.workspace_id, row.role), () => {
    const c = createClass({name: className, grade: '七年级', term: '2026秋', headTeacher: className, status: 'active'});
    createStudent({classId: c.id, name: className + '班长', studentNo: '1', gender: 'female', committeeRoleIds: [listCommitteeRoles().find(role => role.name === '班长')!.id]});
  });
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
  for (const scenario of ['classes', 'invalid-class', 'committee', 'capabilities', 'unsupported']) {
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
      const expected: Record<string, RegExp> = {classes: /甲教师专属班/, 'invalid-class': /当前可访问班级中没有此编号/, committee: /甲教师专属班班长/, capabilities: /未开放的查询/, unsupported: /不能据此判断没有记录/};
      assert.match(serialized, expected[scenario]);
      if (scenario === 'committee') assert.match(serialized, /committeeRoles/);
      assert.doesNotMatch(serialized, /请重新登录/);
      assert.doesNotMatch(serialized, /乙教师专属班/);
    } finally { queryScenario = undefined; }
  }
  // Real HTTP and DSH contracts for user-owned memory; all supplier responses are local fixtures.
  const personal=async(cookie:string,method='GET',suffix='',body?:unknown)=>{
    const r=await fetch(apiRoot+'/api/assistant/personal-context'+suffix,{method,headers:{...headers,Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
    return {status:r.status,data:await r.json()};
  };
  assert.equal((await fetch(apiRoot+'/api/assistant/personal-context')).status,401);
  const created=await personal(a,'POST','',{operationId:crypto.randomUUID(),kind:'rule',content:'fixture-rule-manual'});
  assert.equal(created.status,200,JSON.stringify(created));
  assert.equal((await personal(b)).data.entries.length,0);
  assert.equal((await personal(b,'PATCH','/'+created.data.entry.id,{operationId:crypto.randomUUID(),expectedVersion:1,status:'deleted'})).status,409);
  assert.equal((await personal(a,'POST','',{operationId:crypto.randomUUID(),kind:'memory',content:'spoof',userId:'other'})).status,400);
  assert.equal((await fetch(apiRoot+'/api/assistant/personal-context',{method:'POST',headers:{...headers,Cookie:a,Origin:'https://evil.test'},body:'{}'})).status,403);
  const document=(await personal(a,'GET','/instructions')).data;
  const documentWrite={operationId:crypto.randomUUID(),expectedRevision:document.revision,content:'# 个人指令\nfixture-rule-manual'};
  assert.equal((await personal(b,'PUT','/instructions',documentWrite)).status,409);
  const documentSaved=await personal(a,'PUT','/instructions',documentWrite);
  assert.equal(documentSaved.status,200);
  assert.deepEqual((await personal(a,'PUT','/instructions',documentWrite)).data,documentSaved.data);
  assert.equal((await personal(a,'PUT','/instructions',{...documentWrite,operationId:crypto.randomUUID(),content:'stale'})).status,409);
  assert.equal((await fetch(apiRoot+'/api/assistant/personal-context/instructions',{method:'PUT',headers:{...headers,Cookie:a,Origin:'https://evil.test'},body:JSON.stringify(documentWrite)})).status,403);
  assert.equal((await fetch(apiRoot+'/api/assistant/personal-context/instructions')).status,401);
  const memoryTurn=async(scenario:string,text:string,cookie=a)=>{
    queryScenario=scenario;
    try{
      const sid=(await rpc(cookie,'session/create',{request:{workspaceId:cookie===a?wa.body.workspace.workspaceId:undefined}})).value.sessionId;
      assert.equal((await rpc(cookie,'session/prompt',{request:{sessionId:sid,requestId:crypto.randomUUID(),mode:'queue',content:[{type:'text',text}]}})).ok,true);
      let result;
      for(let i=0;i<150;i++){result=await page(cookie,sid);if(result.records?.some((r:any)=>r.event?.type==='turn/end'))break;await new Promise(r=>setTimeout(r,100));}
      assert.ok(result.records?.some((r:any)=>r.event?.type==='turn/end'),'memory turn did not finish');
      return result;
    }finally{queryScenario=undefined;}
  };
  await memoryTurn('remember','记住：fixture-cross-session-memory');
  let saved=(await personal(a)).data.entries.find((e:any)=>e.content==='fixture-cross-session-memory');
  assert.equal(saved?.status,'active','exact authenticated human command must activate');
  assert.equal(saved.source.type,'chat');
  const recalled=await memoryTurn('recall','新会话的个人约定是什么');
  assert.match(JSON.stringify(recalled),/fixture-cross-session-memory/);
  assert.match(JSON.stringify(recalled),/fixture-rule-manual/);
  const isolated=await memoryTurn('recall','我的个人约定是什么',b);
  assert.doesNotMatch(JSON.stringify(isolated),/fixture-cross-session-memory|fixture-rule-manual/);
  await memoryTurn('propose-memory','帮我想想怎样安排教学');
  assert.equal((await personal(a)).data.entries.find((e:any)=>e.content==='fixture-candidate')?.status,'candidate');
  await memoryTurn('forget','忘记：fixture-cross-session-memory');
  assert.ok(!(await personal(a)).data.entries.some((e:any)=>e.content==='fixture-cross-session-memory'));
  const afterDelete=await memoryTurn('recall','删除后新建会话');
  assert.doesNotMatch(JSON.stringify(afterDelete),/fixture-cross-session-memory/);
  await memoryTurn('replay-memory','继续当前问题，不要新增记忆');
  assert.equal((await personal(a)).data.entries.find((e:any)=>e.content==='fixture-cross-session-memory')?.status,'candidate','an old exact command cannot authorize a later turn');
  const candidate=(await personal(a)).data.entries.find((e:any)=>e.content==='fixture-candidate');
  const approved=await personal(a,'PATCH','/'+candidate.id,{operationId:crypto.randomUUID(),expectedVersion:candidate.version,status:'active'});
  assert.equal(approved.status,200);
  assert.equal((await personal(a,'PATCH','/'+candidate.id,{operationId:crypto.randomUUID(),expectedVersion:candidate.version,content:'stale'})).status,409);
  const confirmedRecall=await memoryTurn('recall','检查刚确认的记忆');
  assert.match(JSON.stringify(confirmedRecall),/fixture-candidate/);
  await personal(a,'PATCH','/'+candidate.id,{operationId:crypto.randomUUID(),expectedVersion:approved.data.entry.version,status:'disabled'});
  const disabledRecall=await memoryTurn('recall','检查停用后的记忆');
  assert.doesNotMatch(JSON.stringify(disabledRecall),/fixture-candidate/);
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
