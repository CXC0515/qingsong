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

test('teacher calls reject configuration, arbitrary directories and attachments', () => {
  assert.equal(allowOfficialCall('session/create', {args: {request: {}}}), true);
  for (const endpoint of ['settings/get', 'credentials/list', 'directoryPicker/list', 'workspace/create', 'commands/execute'])
    assert.equal(allowOfficialCall(endpoint, {args: {}}), false);
  assert.equal(allowOfficialCall('session/create', {args: {request: {cwd: '/tmp'}}}), false);
  assert.equal(allowOfficialCall('session/create', {args: {request: {agentPreset: 'standard'}}}), false);
  assert.equal(allowOfficialCall('session/prompt', {args: {request: {content: [{type: 'image', url: '/tmp/a'}]}}}), false);
  assert.equal(allowOfficialCall('session/updateQueue', {args: {request: {action: {kind: 'edit', content: [{type: 'text', text: 'x'.repeat(8001)}]}}}}), false);
  assert.equal(allowOfficialCall('session/updateQueue', {args: {request: {action: {kind: 'edit', content: [{type: 'image'}]}}}}), false);
  assert.equal(allowOfficialCall('settings/follow', {args: {}}, true), false);
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
    assert.equal(createHash('sha256').update(prompt.personaPrefix).digest('hex'), '9a33fa2f391fd75597f86819f24b8c5413d1dac0233f7320ba53e42be1c6932a', 'preserve the exact user-approved prompt');
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
