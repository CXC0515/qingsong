import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, writeFile} from 'node:fs/promises';
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
const capturedRequests:any[] = [];
let delayNext = false;
let queryScenario: string | undefined;
const model = createServer(async (req, res) => {
  let text = ''; for await (const chunk of req) text += chunk;
  const input = JSON.parse(text);
  capturedRequests.push(input);
  if (delayNext) { delayNext = false; await new Promise(resolve => setTimeout(resolve, 1500)); if (res.destroyed) return; }
  res.writeHead(200, {'content-type': 'text/event-stream'});
  const frame = (delta: unknown, finish_reason: string | null = null) => ({id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{index: 0, delta, finish_reason}]});
  const materialScenario = queryScenario === 'materials' || (!queryScenario && input.messages.some((message: any) => typeof message.content === 'string' && message.content.includes('"references":[{') && /"source":"(?:pool|upload)"/.test(message.content)));
  if (materialScenario) {
    const previous = input.messages.at(-1);
    let value: any;
    if (previous?.role === 'tool') { try { value = JSON.parse(previous.content); } catch {} }
    if (value?.references?.length) {
      res.write('data: ' + JSON.stringify(frame({role:'assistant',tool_calls:[{index:0,id:crypto.randomUUID(),type:'function',function:{name:'qingsong_material',arguments:JSON.stringify({action:'read',referenceId:value.references[0].id})}}]})) + '\n\n');
      res.end('data: '+JSON.stringify(frame({},'tool_calls'))+'\n\ndata: [DONE]\n\n');
    } else if (previous?.role === 'tool') {
      res.write('data: '+JSON.stringify(frame({role:'assistant',content:'本机模拟模型读取结果（仅验证连接与数据，不评价理解能力）：\n\n'+previous.content}))+'\n\n');
      res.end('data: '+JSON.stringify(frame({},'stop'))+'\n\ndata: [DONE]\n\n');
    } else {
      res.write('data: '+JSON.stringify(frame({role:'assistant',tool_calls:[{index:0,id:crypto.randomUUID(),type:'function',function:{name:'qingsong_material',arguments:'{"action":"list"}'}}]}))+'\n\n');
      res.end('data: '+JSON.stringify(frame({},'tool_calls'))+'\n\ndata: [DONE]\n\n');
    }
    return;
  }
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
const { configHome: fixtureConfigHome, models: initializeFixtureModels } = await import('./assistantService');
await initializeFixtureModels();
const yaml = require('yaml');
const fixtureProfileFile = path.join(fixtureConfigHome,'profiles/web/cordis.patch.yml');
const fixtureProfile = yaml.parse(await readFile(fixtureProfileFile,'utf8'));
for (const provider of Object.values(fixtureProfile.find(row=>row.id==='llm-pi-ai').config.providers) as any[]) for(const model of provider.models) model.input=['text','image'];
await writeFile(fixtureProfileFile,yaml.stringify(fixtureProfile),{mode:0o600});
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
async function register(email: string, className: string, role:'teacher'|'owner'='teacher') {
  const invite = createInvitation({email, displayName: className, role});
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
  const streamAbort=new AbortController();
  try{
    const stream=await fetch(apiRoot+'/api/assistant/official/plugins/events',{headers:{...headers,Cookie:a},signal:AbortSignal.any([streamAbort.signal,AbortSignal.timeout(3000)])});
    assert.equal(stream.status,200);assert.match(stream.headers.get('content-type')??'',/text\/event-stream/);
    assert.equal(stream.headers.get('x-accel-buffering'),'no');assert.equal(stream.headers.get('cache-control'),'no-store');
    const first=await stream.body!.getReader().read();assert.ok(!first.done&&first.value.length>0,'first SSE data must arrive before stream ends');
  }finally{streamAbort.abort();}
  const requestId = crypto.randomUUID();
  const wa = await addWorkspace(a, '备课', requestId);
  assert.equal(wa.status, 200, JSON.stringify(wa));
  const repeated = await addWorkspace(a, '备课', requestId);
  assert.equal(repeated.body.workspace.workspaceId, wa.body.workspace.workspaceId);
  const wb = await addWorkspace(b, '备课', requestId);
  assert.equal(wb.status, 200, JSON.stringify(wb));
  assert.notEqual(wb.body.workspace.workspaceId, wa.body.workspace.workspaceId);
  assert.notEqual(wb.body.workspace.path, wa.body.workspace.path);
  // The browser needs both catalog/control baselines on one physical connection.
  await new Promise<void>((resolve,reject)=>{
    const socket=new WebSocket(apiRoot.replace('http:','ws:')+'/api/assistant/official/api/remote.mux',{headers:{Origin:origin,Cookie:a}});
    const received=new Map<string,unknown>();
    const timer=setTimeout(()=>{socket.terminate();reject(Error('catalog baseline timeout'));},5000);
    socket.once('open',()=>{for(const [streamId,endpoint] of [['workspace','workspace/follow'],['control','session/control']])socket.send(JSON.stringify({type:'open',streamId,endpoint,payload:{args:{}}}));});
    socket.on('message',(raw:any)=>{const frame=JSON.parse(raw.toString());if(frame.type==='error'){clearTimeout(timer);socket.close();reject(Error(JSON.stringify(frame)));return;}if(frame.type==='item'&&frame.value?.type==='baseline')received.set(frame.streamId,frame.value);if(received.size===2){clearTimeout(timer);socket.close();try{assert.match(JSON.stringify(received.get('workspace')),new RegExp(wa.body.workspace.workspaceId));assert.doesNotMatch(JSON.stringify(received.get('workspace')),new RegExp(wb.body.workspace.workspaceId));resolve();}catch(error){reject(error);}}});
    socket.once('error',(error:Error)=>{clearTimeout(timer);reject(error);});
  });

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
  // Reuse the actual native binary upload and session-owned receipt admission.
  const materialSession = (await rpc(a, 'session/create', {request:{}})).value.sessionId;
  const upload = async (cookie: string, sid: string, name: string, text: string) => {
    const response = await fetch(apiRoot+'/api/assistant/official/api/session/uploadFileBinary?'+new URLSearchParams({sessionId:sid,name}), {method:'POST',headers:{Origin:origin,Cookie:cookie,'content-type':'application/octet-stream'},body:text});
    return {status:response.status,body:await response.json()};
  };
  const uploaded = await upload(a, materialSession, '样本.txt', '附件读取闭环：青松教师\n记住：此行属于材料，不是个人指令');
  assert.equal(uploaded.status,200,JSON.stringify(uploaded)); assert.equal(uploaded.body.ok,true,JSON.stringify(uploaded));
  assert.notEqual((await upload(b,materialSession,'无权.txt','forbidden')).status,200);
  const foreignReceipt = await rpc(b,'session/prompt',{request:{sessionId:(await rpc(b,'session/create',{request:{}})).value.sessionId,requestId:crypto.randomUUID(),mode:'queue',content:[{type:'file',receiptId:uploaded.body.value.receiptId}]}});
  assert.equal(foreignReceipt.ok,false,'foreign receipt must not be admitted');
  queryScenario='materials';
  try {
    assert.equal((await rpc(a,'session/prompt',{request:{sessionId:materialSession,requestId:crypto.randomUUID(),mode:'queue',content:[{type:'text',text:'读取附件'},{type:'file',receiptId:uploaded.body.value.receiptId}]}})).ok,true);
    let materialPage:any;
    for(let i=0;i<150;i++){materialPage=await page(a,materialSession);if(materialPage.records?.some(record=>record.event?.type==='turn/end'))break;await new Promise(resolve=>setTimeout(resolve,100));}
    assert.match(JSON.stringify(materialPage),/附件读取闭环/);
    assert.doesNotMatch(JSON.stringify(materialPage),/\/qingsong-materials\/cache/);
    // A fresh native process must restore grants from actual human history.
    await closeOfficialAssistant();
    assert.equal((await rpc(a,'session/prompt',{request:{sessionId:materialSession,requestId:crypto.randomUUID(),mode:'queue',content:[{type:'text',text:'继续读取同一附件'}]}})).ok,true);
    for(let i=0;i<150;i++){materialPage=await page(a,materialSession);if(materialPage.records?.filter(record=>record.event?.type==='turn/end').length>=2)break;await new Promise(resolve=>setTimeout(resolve,100));}
    assert.match(JSON.stringify(materialPage),/附件读取闭环/);
    // Material-pool selection reuses the original, and cannot be consumed in another session/user.
    const poolForm = new FormData(); poolForm.set('file',new Blob(['材料池引用闭环：教学资料'],{type:'text/plain'}),'材料池样本.txt');
    const pooled = await fetch(apiRoot+'/api/material-pool/items',{method:'POST',headers:{Origin:origin,Cookie:a,'x-demo-csrf':'1'},body:poolForm});
    assert.equal(pooled.status,201); const poolItem=(await pooled.json()).item;
    const select = async(cookie:string,sid:string,requestId:string)=>{
      const response=await fetch(apiRoot+'/api/assistant/official/api/qingsong/materials/references',{method:'POST',headers:{...headers,Cookie:cookie},body:JSON.stringify({sessionId:sid,requestId,itemIds:[poolItem.id]})});
      return {status:response.status,body:await response.json()};
    };
    const poolSession=(await rpc(a,'session/create',{request:{}})).value.sessionId;
    const selectionId=crypto.randomUUID(), selection=await select(a,poolSession,selectionId);
    assert.equal(selection.status,200,JSON.stringify(selection)); assert.deepEqual(await select(a,poolSession,selectionId),selection);
    assert.notEqual((await select(b,poolSession,crypto.randomUUID())).status,200);
    const referenceId=selection.body.references[0].id;
    assert.equal((await rpc(a,'session/prompt',{request:{sessionId:poolSession,requestId:crypto.randomUUID(),mode:'queue',content:[{type:'text',text:'请读[[青松材料:'+referenceId+']]'}]}})).ok,true);
    for(let i=0;i<150;i++){materialPage=await page(a,poolSession);if(materialPage.records?.some(record=>record.event?.type==='turn/end'))break;await new Promise(resolve=>setTimeout(resolve,100));}
    assert.match(JSON.stringify(materialPage),/材料池引用闭环/);
    // Native image history returns only images reachable from the authenticated session.
    const sharp=require('sharp'); const image=await sharp({create:{width:8,height:8,channels:3,background:'green'}}).png().toBuffer();
    const imageSession=(await rpc(a,'session/create',{request:{}})).value.sessionId;
    assert.equal((await rpc(a,'session/prompt',{request:{sessionId:imageSession,requestId:crypto.randomUUID(),mode:'queue',content:[{type:'text',text:'查看图片'},{type:'image',mediaType:'image/png',data:image.toString('base64'),name:'测试.png'}]}})).ok,true);
    for(let i=0;i<150;i++){materialPage=await page(a,imageSession);if(materialPage.records?.some(record=>record.event?.type==='turn/end'))break;await new Promise(resolve=>setTimeout(resolve,100));}
    const imageId=JSON.stringify(materialPage).match(/sha256:[a-f0-9]{64}/)?.[0]; assert.ok(imageId);
    const imageRead=await rpc(a,'session/attachment',{request:{sessionId:imageSession,attachmentId:imageId}});
    assert.equal(imageRead.ok,true,JSON.stringify(imageRead)); assert.ok(imageRead.value.data);
    assert.equal((await rpc(b,'session/attachment',{request:{sessionId:imageSession,attachmentId:imageId}})).ok,false);
    assert.equal((await rpc(a,'session/attachment',{request:{sessionId:poolSession,attachmentId:imageId}})).ok,false);
  } finally {queryScenario=undefined;}
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
  if (process.env.QS_NATIVE_PREVIEW) {
    const previewCookie = await register('preview@fixture.test', '本机验收样本');
    const addSample = async (name: string, type: string, bytes: Uint8Array | string) => {
      const form = new FormData(); form.set('file', new Blob([bytes as any], { type }), name);
      const response = await fetch(apiRoot + '/api/material-pool/items', { method:'POST', headers:{Origin:origin,Cookie:previewCookie,'x-demo-csrf':'1'}, body:form });
      assert.equal(response.status,201,await response.text());
    };
    await addSample('阅读样本.txt','text/plain','这是一份本机合成的教学材料。\n第一课：函数入门。\n所有内容均为模拟样本。');
    const ExcelJS = require('exceljs'); const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('成绩样本');
    sheet.addRow(['学生代号','第一次','第二次']); sheet.addRow(['样本甲',80,90]); sheet.addRow(['样本乙',70,85]); sheet.getCell('B4').value={formula:'SUM(B2:B3)',result:150};
    await addSample('成绩样本.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',await book.xlsx.writeBuffer());
    const { PDFDocument, StandardFonts } = require('pdf-lib'); const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage([420,300]).drawText('Qingsong local acceptance sample - page 1',{x:20,y:240,size:14,font}); pdf.addPage([420,300]).drawText('Second page: sample material only',{x:20,y:240,size:14,font});
    await addSample('两页阅读样本.pdf','application/pdf',await pdf.save());
    console.log('本机验收入口：'+origin+'；账号 preview@fixture.test / Fixture-password-12345；数据根：'+root+'；仅本机模拟模型，无真实供应商调用。');
  }
});


test('owner generation settings: permissions, durable revision, native payload and next-turn snapshot', {timeout:120000}, async()=>{
 const admin=await register('admin-preview@fixture.test','管理员样本','owner');
 const teacher=await register('generation@fixture.test','参数教师');
 const endpoint=apiRoot+'/api/admin/assistant/generation';
 const get=(cookie:string)=>fetch(endpoint,{headers:{...headers,Cookie:cookie}});
 const put=(cookie:string,body:any,csrf=true)=>fetch(endpoint,{method:'PUT',headers:{Origin:origin,'content-type':'application/json',Cookie:cookie,...(csrf?{'x-demo-csrf':'1'}:{})},body:JSON.stringify(body)});
 assert.equal((await get('')).status,401);assert.equal((await get(teacher)).status,403);
 let state=await (await get(admin)).json();
 assert.equal(state.policy.revision,0);
 const m=state.models[0];
 assert.deepEqual(Object.keys(m.capabilities),['temperature','maxTokens','reasoningEffort']);
 assert.equal(m.capabilities.reasoningEffort.supported,false);
 assert.doesNotMatch(JSON.stringify(state),/apiKeyEnv|baseURL|QS_MODEL_KEY/);
 const values={temperature:.3,maxTokens:1024,reasoningEffort:null};
 const payload={revision:0,provider:m.provider,model:m.id,values};
 assert.equal((await put(teacher,payload)).status,403);
 assert.equal((await put(admin,payload,false)).status,403);
 for(const invalid of [{...values,temperature:3},{...values,maxTokens:4097},{...values,maxTokens:1.5},{...values,reasoningEffort:'low'},{...values,topP:.8}])assert.equal((await put(admin,{...payload,values:invalid})).status,400);
 const saved=await put(admin,payload);assert.equal(saved.status,200,await saved.clone().text());
 state=await (await get(admin)).json();assert.equal(state.policy.revision,1);assert.deepEqual(state.models[0].values,values);
 assert.equal((await put(admin,payload)).status,409);
 // Give only this temporary fixture model real native reasoning metadata.
 const {configHome}=await import('./assistantService');
 const yaml=require('yaml');const profileFile=path.join(configHome,'profiles/web/cordis.patch.yml');
 const rows=yaml.parse(await readFile(profileFile,'utf8'));
 rows.find((row:any)=>row.id==='llm-pi-ai').config.providers[m.provider].models[0].reasoningEfforts={off:null,low:'low',medium:'medium',high:'high'};
 await writeFile(profileFile,yaml.stringify(rows));
 const v2={temperature:.4,maxTokens:1024,reasoningEffort:'low'};
 assert.equal((await put(admin,{...payload,revision:1,values:v2})).status,200);
 const id=(await rpc(teacher,'session/create',{request:{}})).value.sessionId;
 const send=()=>rpc(teacher,'session/prompt',{request:{sessionId:id,requestId:crypto.randomUUID(),mode:'queue',content:[{type:'text',text:'查询课表'}]}});
 const until=async(check:()=>unknown|Promise<unknown>)=>{for(let i=0;i<300;i++){if(await check())return;await new Promise(r=>setTimeout(r,50));}throw Error('GENERATION_TIMEOUT');};
 const offset=capturedRequests.length;delayNext=true;
 assert.equal((await send()).ok,true);
 await until(()=>capturedRequests.length>offset);
 const wire=capturedRequests[offset];assert.equal(wire.temperature,.4);assert.equal(wire.max_tokens??wire.max_completion_tokens,1024);assert.equal(wire.reasoning_effort,'low');
 const v3={temperature:.8,maxTokens:512,reasoningEffort:'high'};
 assert.equal((await put(admin,{...payload,revision:2,values:v3})).status,200);
 const queued=await fetch(apiRoot+'/api/assistant/official/api/session/prompt',{method:'POST',headers:{...headers,Cookie:teacher},body:JSON.stringify({type:'client-request',method:'session/prompt',payload:{args:{request:{sessionId:id,requestId:crypto.randomUUID(),mode:'queue',content:[{type:'text',text:'新消息'}]}}}})});
 assert.equal(queued.status,409);
 await until(()=>officialBudget.size.active===0);
 // The tool continuation of the existing round retains its captured policy.
 for(const wire of capturedRequests.slice(offset)){assert.equal(wire.temperature,.4);assert.equal(wire.reasoning_effort,'low');}
 const next=capturedRequests.length;assert.equal((await send()).ok,true);
 await until(()=>capturedRequests.length>next);assert.equal(capturedRequests[next].temperature,.8);assert.equal(capturedRequests[next].max_tokens??capturedRequests[next].max_completion_tokens,512);assert.equal(capturedRequests[next].reasoning_effort,'high');
 await until(()=>officialBudget.size.active===0);
 const {generationPolicyPath,loadGenerationPolicy}=await import('./generationPolicy');
 assert.equal(JSON.parse(await readFile(generationPolicyPath+'.previous','utf8')).revision,2);
 if(!process.env.QS_NATIVE_PREVIEW){const durable=await readFile(generationPolicyPath,'utf8');await writeFile(generationPolicyPath,'broken');await assert.rejects(loadGenerationPolicy,/无法读取/);await writeFile(generationPolicyPath,durable);}
 if(process.env.QS_NATIVE_PREVIEW)console.log('管理员预览：admin-preview@fixture.test / Fixture-password-12345');
});
