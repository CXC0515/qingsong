/** Exercise the official SDK with a local fixture endpoint, never a real model. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';

const root = await mkdtemp(path.join(os.tmpdir(), 'qingsong-dsh-probe-'));
const home = path.join(root, 'home');
const workspace = path.join(root, 'workspace');
const userHome = path.join(root, 'user');
await Promise.all([home, workspace, userHome].map(p => mkdir(p, { recursive: true })));
const requests = [];
const mock = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url?.endsWith('/models')) {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data: [{ id: 'qingsong-fixture' }] }));
    return;
  }
  if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
    response.writeHead(404); response.end(); return;
  }
  let body = '';
  for await (const chunk of request) body += chunk;
  const input = JSON.parse(body);
  requests.push(input);
  const content = `fixture-response-${requests.length}`;
  if (!input.stream) {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ id: 'fixture', model: 'qingsong-fixture', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const frame = (delta, finish_reason = null) => ({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'qingsong-fixture', choices: [{ index: 0, delta, finish_reason }] });
  response.write(`data: ${JSON.stringify(frame({ role: 'assistant', content }))}\n\n`);
  response.write(`data: ${JSON.stringify(frame({}, 'stop'))}\n\n`);
  response.end('data: [DONE]\n\n');
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const port = mock.address().port;
const patch = path.join(root, 'fixture.cordis.yml');
await writeFile(patch, `
- id: tool-fs
  disabled: true
- id: tool-working-directory
  disabled: true
- id: persistent-bash
  disabled: true
- id: persistent-pwsh
  disabled: true
- id: terminal-bash
  disabled: true
- id: terminal-pwsh
  disabled: true
- insert:
    - id: qingsong-fixture-model
      name: '@deepseek-ai/dsh-llm-pi-ai'
      config:
        providers:
          qingsong-fixture:
            api: openai-completions
            apiKeyEnv: QINGSONG_FIXTURE_KEY
            baseURL: http://127.0.0.1:${port}/v1
            retryPolicy:
              mode: normal
              maxRetries: 0
            models:
              - id: qingsong-fixture
                name: Qingsong fixture
                contextWindow: 32768
                maxTokens: 1024
                reasoningEfforts: false
`);
const options = {
  profile: 'sdk-minimal', patches: [patch], dshHome: home, processCwd: workspace, cwd: workspace,
  provider: 'qingsong-fixture', model: 'qingsong-fixture', maxTokens: 128,
  initializeTimeoutMs: 60000, requestTimeoutMs: 30000,
  env: { PATH: process.env.PATH, HOME: userHome, TMPDIR: os.tmpdir(), LANG: 'en_US.UTF-8', TZ: 'Asia/Shanghai', DSH_AGENTS_HOME: path.join(userHome, 'agents'), DSH_TELEMETRY_DISABLED: '1', QINGSONG_FIXTURE_KEY: 'local-fixture-only' },
};
let harness;
try {
  harness = new DeepSeekHarness(options);
  const first = await harness.run('fixture-first-message');
  assert.match(first.finalResponse, /fixture-response-1/);
  const sessionId = first.sessionId;
  await harness.close();
  harness = new DeepSeekHarness(options);
  const session = await harness.resumeSession(sessionId);
  const second = await session.run('fixture-second-message');
  assert.match(second.finalResponse, /fixture-response-2/);
  assert.equal(requests.length, 2, 'no hidden model requests');
  assert.ok(requests[1].messages.some(message => JSON.stringify(message.content).includes('fixture-first-message')), 'persisted user history restored');
  assert.ok(requests[1].messages.some(message => JSON.stringify(message.content).includes('fixture-response-1')), 'persisted assistant history restored');
  assert.ok(requests.every(request => !request.tools?.length), 'no generic tools exposed');
  assert.ok(requests.every(request => request.max_tokens <= 128 || request.max_completion_tokens <= 128), 'output budget passed to provider');
  console.log(JSON.stringify({ ok: true, runtime: 'deepseek-harness', version: '0.2.1-rc.3', localFixtureRequests: requests.length, persistenceResume: true, genericTools: 0, realModelCalls: 0 }));
} finally {
  if (harness) await harness.close();
  await new Promise(resolve => mock.close(resolve));
  await rm(root, { recursive: true, force: true });
}
