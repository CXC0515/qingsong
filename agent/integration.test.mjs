import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bootstrapModels, createTeachingHarness } from './runtime.mjs';

test('controlled native tool, real stream deltas and durable resume', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'qs-teaching-integration-'),
  );
  const requests = [],
    deltas = [],
    queries = [];
  const mock = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    if (req.url === '/tool') {
      if (input.kind === 'delta') deltas.push(input.text);
      else queries.push(input);
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          data: { classes: [{ id: 'class-fixture', name: '虚构班级' }] },
          sources: [{ title: '课表', url: '/?page=schedule' }],
        }),
      );
      return;
    }
    requests.push(input);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const frame = (delta, finish_reason = null) => ({
      id: 'fixture',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'fixture',
      choices: [{ index: 0, delta, finish_reason }],
    });
    if (requests.length === 1) {
      res.write(
        `data: ${JSON.stringify(frame({ role: 'assistant', tool_calls: [{ index: 0, id: 'call-fixture', type: 'function', function: { name: 'qingsong_query', arguments: '{"kind":"schedule"}' } }] }))}\n\n`,
      );
      res.write(`data: ${JSON.stringify(frame({}, 'tool_calls'))}\n\n`);
    } else {
      res.write(
        `data: ${JSON.stringify(frame({ role: 'assistant', content: '虚构回答' }))}\n\n`,
      );
      res.write(`data: ${JSON.stringify(frame({}, 'stop'))}\n\n`);
    }
    res.end('data: [DONE]\n\n');
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  const port = mock.address().port;
  let harness;
  try {
    const configHome = path.join(root, 'model-config');
    await bootstrapModels(configHome, {
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: 'fixture',
    });
    const options = {
      home: path.join(root, 'user-a'),
      configHome,
      provider: 'qingsong',
      model: 'fixture',
      endpoint: `http://127.0.0.1:${port}/tool`,
      token: 'test-only',
      key: 'fixture',
    };
    harness = await createTeachingHarness(options);
    const first = await harness.run('请查询课表');
    assert.equal(first.finalResponse, '虚构回答');
    const sessionId = first.sessionId;
    await harness.close();
    harness = await createTeachingHarness(options);
    const handle = await harness.resumeSession(sessionId);
    const second = await handle.run('继续');
    assert.equal(second.finalResponse, '虚构回答');
    assert.equal(queries.length, 1);
    assert.equal(queries[0].kind, 'schedule');
    assert.equal(deltas.join(''), '虚构回答虚构回答');
    assert.equal(requests.length, 3);
    assert.deepEqual(
      requests[0].tools.map((t) => t.function.name),
      ['qingsong_query'],
    );
    assert.ok(
      requests[2].messages.some((m) =>
        JSON.stringify(m).includes('请查询课表'),
      ),
    );
  } finally {
    await harness?.close();
    await new Promise((resolve) => mock.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('native loop caps tool-driven model steps at eight', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qs-budget-integration-'));
  let calls = 0,
    harness;
  const mock = createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    if (req.url === '/tool') {
      res.end('{"ok":true}');
      return;
    }
    calls++;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(
      'data: ' +
        JSON.stringify({
          id: 'f',
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call-' + calls,
                    type: 'function',
                    function: {
                      name: 'qingsong_query',
                      arguments: '{"kind":"schedule"}',
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        }) +
        '\n\ndata: ' +
        JSON.stringify({
          id: 'f',
          choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
        }) +
        '\n\ndata: [DONE]\n\n',
    );
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  const port = mock.address().port;
  try {
    const configHome = path.join(root, 'models');
    await bootstrapModels(configHome, {
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: 'fixture',
    });
    harness = await createTeachingHarness({
      home: path.join(root, 'worker'),
      configHome,
      provider: 'qingsong',
      model: 'fixture',
      endpoint: `http://127.0.0.1:${port}/tool`,
      token: 'fixture',
      key: 'fixture',
    });
    const result = await harness.run('fixture loop');
    assert.equal(
      result.events.filter((e) => e.type === 'turn/end').at(-1)?.data.reason
        .kind,
      'error',
    );
    assert.equal(calls, 8);
  } finally {
    await harness?.close();
    await new Promise((resolve) => mock.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
