import test from 'node:test';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {request} from 'node:http';
import {bootstrapModels} from './runtime.mjs';
import {prepareOfficialRuntime, startOfficialRuntime} from './official-runtime.mjs';
import {allowOfficialCall} from './official-policy.mjs';
import {BasicCompactionEngine} from '@deepseek-ai/dsh-compaction-basic';
import {Session} from '@deepseek-ai/dsh-session';
import {createUserMessage} from '@deepseek-ai/dsh-llm';

test('teacher calls reject configuration, arbitrary directories and forged attachments', () => {
  assert.equal(allowOfficialCall('session/create', {args: {request: {}}}), true);
  for (const endpoint of ['settings/get', 'credentials/list', 'directoryPicker/list', 'workspace/create', 'commands/execute'])
    assert.equal(allowOfficialCall(endpoint, {args: {}}), false);
  assert.equal(allowOfficialCall('session/create', {args: {request: {cwd: '/tmp'}}}), false);
  assert.equal(allowOfficialCall('session/create', {args: {request: {agentPreset: 'standard'}}}), false);
  assert.equal(allowOfficialCall('session/prompt', {args: {request: {content: [{type: 'image', url: '/tmp/a'}]}}}), false);
  assert.equal(allowOfficialCall('session/prompt', {args:{request:{mode:'queue',content:[{type:'file',receiptId:'native-session-owned'}]}}}),true);
  assert.equal(allowOfficialCall('session/prompt', {args:{request:{mode:'queue',content:[{type:'file',attachment:{attachmentId:'forged'}}]}}}),false);
  assert.equal(allowOfficialCall('session/updateQueue', {args: {request: {action: {kind: 'edit', content: [{type: 'text', text: 'x'.repeat(8001)}]}}}}), false);
  assert.equal(allowOfficialCall('session/updateQueue', {args: {request: {action: {kind: 'edit', content: [{type: 'image'}]}}}}), false);
  assert.equal(allowOfficialCall('settings/follow', {args: {}}, true), false);
});
test('only argument-free compact is admitted through the command boundary',()=>{
  const args={agentId:'session-owned',line:'/compact',submittedAttachments:[]};
  assert.equal(allowOfficialCall('commands/execute',{args}),true);
  for(const patch of [{line:'/compact now'},{line:'/feedback'},{submittedAttachments:[{type:'file',receiptId:'x'}]},{agentId:'../other'},{cwd:'/tmp'}])
    assert.equal(allowOfficialCall('commands/execute',{args:{...args,...patch}}),false);
  assert.equal(allowOfficialCall('commands/execute',{args},true),false);
});
test('native compaction preserves source history, shrinks the surface and retains recent instructions',async()=>{
  const session=Session.create('compaction-fixture');
  session.append('turn/start',{turn:0});
  for(const text of ['旧资料'.repeat(9000),'旧候选'.repeat(9000),'请只修改当前引用段落，其他正文保持。'])
    session.append('user/message',createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}),{surfaceOp:'append'});
  const originalSeqs=[...session.surface.nodes];
  const measure=s=>{
    const nodes=s.surface.nodes.map(seq=>{const tokens=Math.ceil(JSON.stringify(s.eventAt(seq).data).length/2);return {seq,tokens,heuristicTokens:tokens};});
    return {nodes,totalTokens:nodes.reduce((sum,n)=>sum+n.tokens,0)};
  };
  const ctx={reflect:{provide:()=>{}},on:()=>{},get:()=>undefined,tokenMeter:{measure,estimateMessage:m=>Math.ceil(JSON.stringify(m).length/2)},waterfall:()=>false};
  const engine=new BasicCompactionEngine(ctx,{auto:false,headroomTokens:4096,maxTokens:2048});
  engine.summarize=async()=>({summary:[{type:'text',text:'已完成初稿；教案第7版。仅修改教师当前引用内容，不编造学情。'}],provider:'fixture',model:'fixture',maxTokens:2048});
  const before=measure(session).totalTokens;
  const result=await engine.compactRegion(originalSeqs[0],originalSeqs[1],{session},new AbortController().signal);
  assert.ok(measure(session).totalTokens<before/2);
  assert.equal(session.surface.nodes.at(-1),originalSeqs[2]);
  assert.equal(session.eventAt(originalSeqs[0]).data.content[0].text,'旧资料'.repeat(9000),'original append-only event must remain readable');
  assert.match(JSON.stringify(session.eventAt(result.summarySeq).data),/教案第7版/);
  const surfaceBeforeFailure=[...session.surface.nodes];
  engine.summarize=async()=>{throw Error('fixture summary service unavailable');};
  await assert.rejects(engine.compactRegion(surfaceBeforeFailure[0],surfaceBeforeFailure[0],{session},new AbortController().signal),/summary service unavailable/);
  assert.deepEqual(session.surface.nodes,surfaceBeforeFailure,'failed summary must preserve the usable surface');
});
test('official process boots, serves extension, creates teaching sessions and stops', {timeout: 90000}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qs-native-test-'));
  const home = path.join(root, 'teacher');
  const configHome = path.join(root, 'config');
  await bootstrapModels(configHome, {baseUrl: 'http://127.0.0.1:9/v1', model: 'fixture'});
  let runtime;
  try {
    const profile = await prepareOfficialRuntime({home, configHome});
    const prompt = profile.find(row => row.id === 'system-prompt').config;
    const preset=profile.flatMap(row=>row.insert??[]).find(row=>row.id==='qingsong-preset');
    const compact=preset.config.plugins.find(row=>row.id==='compaction').config.find(row=>row.id==='compaction-basic').config;
    // Exercise the native capacity calculation rather than repeating our config.
    // DSH's unconfigured 65,536-token headroom fails on this same 32k route.
    const header={config:{provider:'qingsong',model:'fixture',maxTokens:4096}};
    const agent={session:{requestHeader:()=>header,seq:0,surface:{nodes:[],replaceGeneration:0}}};
    let measured=24000,pruned=0;
    const ctx={reflect:{provide:()=>{}},on:()=>{},tokenMeter:{measure:()=>({totalTokens:measured,nodes:[]})},llm:{resolveModelInfo:async()=>({context:{contextWindow:32768},defaultMaxTokens:4096})},get:()=>({pruneSession:()=>{pruned++;measured=18000;}})};
    const defaults=new BasicCompactionEngine(ctx,{auto:false});
    await assert.rejects(defaults.compactIfNeeded(agent,'pressure',new AbortController().signal),/leaving no pressure budget/);
    const configured=new BasicCompactionEngine(ctx,compact);
    assert.equal(await configured.compactIfNeeded(agent,'pressure',new AbortController().signal),null);
    assert.equal(pruned,1,'native pressure path must trim oversized old tool results before another request');
    assert.match(prompt.personaPrefix,/明确要求创建个人提醒\/日程时，直接按其明确内容创建/u);
    assert.match(prompt.personaPrefix,/拒绝不删除原事项/u);
    assert.equal(prompt.includeHarnessIdentity, false);
    assert.equal(prompt.includeRuntimeContext, false);
    const disabled=profile.filter(row=>row.disabled).map(row=>row.id);
    assert.ok(disabled.includes('ui-cordis')&&disabled.includes('cordis-client-runner'),'other native footer actions must stay outside teacher scope');
    runtime = await startOfficialRuntime({home, configHome, publicUrl: 'http://localhost:4480/api/assistant/official/', endpoint: 'http://127.0.0.1:9/', token: 'fixture', key: 'fixture'});
    const call = (url, body, cookie = '') => new Promise((resolve, reject) => {
      const req = request({hostname: '127.0.0.1', port: runtime.port, path: url, method: body ? 'POST' : 'GET', headers: {host: 'localhost:4480', cookie, origin: 'http://localhost:4480', 'content-type': 'application/json'}}, res => {
        let text = ''; res.setEncoding('utf8'); res.on('data', chunk => text += chunk);
        res.on('end', () => resolve({status: res.statusCode, headers: res.headers, text}));
      }); req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
    });
    const exchange = await call('/' + new URL(runtime.url).search);
    assert.equal(exchange.status, 303);
    const cookie = exchange.headers['set-cookie'].map(value => value.split(';')[0]).join('; ');
    let page;
    for (let i = 0; i < 50; i++) {
      page = await call('/', undefined, cookie);
      if (page.text.includes('@qingsong/assistant-ui')) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(page.status, 200);
    assert.ok(page.text.includes('@qingsong/assistant-ui'), 'custom UI module missing');
    assert.match(page.text, /pXSMma_headline/);
    const rpc = async (method, args) => {
      const response = await call('/api/' + method, {type: 'client-request', rpcId: crypto.randomUUID(), method, payload: {args}}, cookie);
      assert.equal(response.status, 200, response.text);
      return JSON.parse(response.text).result;
    };
    const made = await rpc('session/create', {request: {}});
    assert.equal(made.ok, true, JSON.stringify(made));
    assert.equal(made.value.agentPreset, 'qingsong');
    const catalog = await rpc('session/modelCatalog', {});
    assert.equal(catalog.ok, true);
    assert.match(JSON.stringify(catalog), /fixture/);
    const condensed=await rpc('commands/execute',{agentId:made.value.sessionId,line:'/compact',submittedAttachments:[]});
    assert.equal(condensed.ok,true,JSON.stringify(condensed));
    assert.equal(condensed.value.result.kind,'success',JSON.stringify(condensed));
    console.log('native runtime fixture root:', root);
  } finally { await runtime?.close(); await rm(root, {recursive: true, force: true}); }
});


test('teaching settings footer renders, opens host settings and has no unconditional hidden ancestor',async()=>{
  const require=createRequire(new URL('../package.json',import.meta.url));
  const React=require('react');
  const {renderToStaticMarkup}=require('react-dom/server');
  const source=await readFile(new URL('./official-ui/client.js',import.meta.url),'utf8');
  const css=await readFile(new URL('./official-ui/shell.css',import.meta.url),'utf8');
  const slots=[],messages=[];let plugin;
  vm.runInNewContext(source,{window:{__ModuleLoader__:{load:module=>{plugin=module.factory(require);}}},parent:{postMessage:(...args)=>messages.push(args)},location:{origin:'https://fixture.test'},crypto:globalThis.crypto});
  plugin.apply({slots:{inject:(_name,register)=>register(),register:(options,render)=>{slots.push({options,render});}},effect:()=>{}});
  const slot=slots.find(s=>s.options.name==='sidebar.footer.action'&&s.options.id==='qingsong-settings');
  assert.ok(slot,'settings action is not registered in the native footer');
  const element=slot.render();
  assert.match(renderToStaticMarkup(element),/aria-label="会话设置"/);
  assert.match(renderToStaticMarkup(element),/<svg/);
  element.props.onClick();
  assert.equal(messages[0][0].type,'qingsong:settings');assert.equal(messages[0][1],'https://fixture.test');
  for(const [,selector,declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    if(!/display\s*:\s*none\b/.test(declarations))continue;
    for(const part of selector.split(',')){
      if(part.includes('data-sidebar-collapsed'))continue;
      assert.ok(!/hHd-Xa_footerActions|data-slot\s*=\s*["']sidebar\.footer["']|qs-sidebar-settings/.test(part),'settings hidden by ancestor rule: '+part);
    }
  }
  assert.match(css,/\.hHd-Xa_settingsArea\{display:none!important\}/,'native management must remain hidden');
  assert.match(css,/data-sidebar-collapsed[^{}]*\.qs-sidebar-settings\{display:none/,'collapsed sidebar must not show settings');
});

test('connection observer reports catalog failures, recovers, answers trusted probes and disposes',async()=>{
 const require=createRequire(new URL('../package.json',import.meta.url));
 const source=await readFile(new URL('./official-ui/client.js',import.meta.url),'utf8');
 const listeners=new Map(),effects=[],messages=[];
 const parent={postMessage:(data,origin)=>messages.push({data,origin})};
 const workspace={phase:'pending',state:'loading'},sessions={phase:'pending',state:'loading'};
 const store=snapshot=>{const callbacks=new Set();return{getSnapshot:()=>snapshot,subscribe:callback=>{callbacks.add(callback);return()=>callbacks.delete(callback);},notify:()=>callbacks.forEach(callback=>callback()),callbacks};};
 const workStore=store(workspace),sessionStore=store(sessions);let plugin;
 vm.runInNewContext(source,{window:{name:'qingsong-assistant:attempt-one',__ModuleLoader__:{load:module=>{plugin=module.factory(require);}},QingsongAssistantNavigation:{observeSelectedSession:()=>()=>{}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)},parent,location:{origin:'https://fixture.test',search:'?connection=removed-by-router'},URLSearchParams,performance,crypto:globalThis.crypto});
 plugin.apply({slots:{inject:()=>{}},effect:fn=>effects.push(fn),workspaces:{list:workStore},sessions:{list:sessionStore}});
 const dispose=effects.at(-1)();assert.equal(messages.at(-1).data.phase,'catalogs');
 workspace.state='error';workStore.notify();assert.equal(messages.at(-1).data.phase,'error');assert.equal(messages.at(-1).data.pending,'workspace');
 workspace.state='idle';workspace.phase='ready';sessions.state='error';sessionStore.notify();assert.equal(messages.at(-1).data.pending,'sessions');
 sessions.phase='ready';sessions.state='idle';sessionStore.notify();assert.equal(messages.at(-1).data.type,'qingsong:ready');
 const before=messages.length;listeners.get('message')({origin:'https://evil.test',source:parent,data:{type:'qingsong:probe',connectionId:'attempt-one'}});assert.equal(messages.length,before);
 listeners.get('message')({origin:'https://fixture.test',source:parent,data:{type:'qingsong:probe',connectionId:'old-attempt'}});assert.equal(messages.length,before);
 listeners.get('message')({origin:'https://fixture.test',source:parent,data:{type:'qingsong:probe',connectionId:'attempt-one'}});assert.ok(messages.length>before);
 assert.ok(messages.every(m=>m.data.connectionId==='attempt-one'&&m.origin==='https://fixture.test'));
 dispose();assert.equal(workStore.callbacks.size,0);assert.equal(sessionStore.callbacks.size,0);assert.equal(listeners.size,0);
});

test("native selection has no business association guard or redirect bridge",async()=>{const source=await readFile(new URL("./official-ui/client.js",import.meta.url),"utf8");assert.doesNotMatch(source,/preparation-selection|AssociationGuard|native-selection|session-association|preparation-recovery/);assert.match(source,/ctx.uiWorkspace.startSession/);});

test('lesson transcript references register on the native presentation service',async()=>{
 const require=createRequire(new URL('../package.json',import.meta.url));const source=await readFile(new URL('./official-ui/client.js',import.meta.url),'utf8');let plugin;const effects=[],rules=[];
 vm.runInNewContext(source,{window:{__ModuleLoader__:{load:module=>{plugin=module.factory(require);}}},location:{origin:'https://fixture.test'}});
 plugin.apply({slots:{inject:()=>{}},effect:fn=>effects.push(fn),uiConversation:{userText:{register:rule=>rules.push(rule)}}});
 effects[0]();assert.equal(rules[0].id,'qingsong-lesson');const id='f2dc315d-33a5-54d5-a4b7-80e30b16d909',text='请修改[[青松教案:'+id+']]';const node=rules[0].match(text,0);assert.equal(node.data.referenceId,id);assert.equal(text.slice(node.start,node.end),'[[青松教案:'+id+']]');assert.equal(rules[0].match(text,node.end),undefined);
});

test('sent lesson references open the in-assistant preview instead of navigating away',async()=>{
 const source=await readFile(new URL('./official-ui/client.js',import.meta.url),'utf8');
 assert.match(source,/className:'qs-sent-lesson-reference',[^}]*onClick:\(\)=>openLessonPreview\(reference\.id\)/);
 assert.doesNotMatch(source,/qingsong:open-lesson|handleLessonLink/);
});

test('execution step limit has a teacher-facing recovery message',async()=>{
 const source=await readFile(new URL('./official-ui/failure.js',import.meta.url),'utf8');
 const context={};vm.runInNewContext(source,context);
 assert.match(context.QingsongAssistantFailure.reason({code:'UNKNOWN',message:'本轮备课尝试次数已用完，已有内容保留。'}),/尝试次数已用完/);
 assert.equal(context.QingsongAssistantFailure.classifiedCode({code:'UNKNOWN',message:'本轮备课尝试次数已用完，已有内容保留。'}),'EXECUTION_STEP_LIMIT');
});
