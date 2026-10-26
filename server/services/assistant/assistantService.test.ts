import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
const root = mkdtempSync(path.join(os.tmpdir(), 'qs-assistant-contract-'));
process.env.APP_DATA_ROOT = root;
process.env.OPENAI_API_KEY = 'fixture-only';
process.env.OPENAI_VISION_MODEL = 'fixture';
let modelCalls = 0;
let failProvider = false;
const mock = createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  modelCalls++;
  if (failProvider) {
    res
      .writeHead(401, { 'content-type': 'application/json' })
      .end('{"error":{"message":"fixture unauthorized"}}');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write(
    'data: ' +
      JSON.stringify({
        id: 'f',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: '虚构回答' },
            finish_reason: null,
          },
        ],
      }) +
      '\n\n',
  );
  setTimeout(
    () =>
      res.end(
        'data: ' +
          JSON.stringify({
            id: 'f',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          }) +
          '\n\ndata: [DONE]\n\n',
      ),
    500,
  );
});
await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(mock.address() as any).port}/v1`;
const { createWorkspaceContext, runWithWorkspace } = await import(
  '../../context/workspaceContext'
);
const service = await import('./assistantService');
const { teachingQuery } = await import('./teachingQueries');
const { getRosterDatabase, closeRosterDatabase } = await import(
  '../../database/rosterDatabase'
);
const a = createWorkspaceContext('teacher-a', 'workspace-a', 'teacher'),
  b = createWorkspaceContext('teacher-b', 'workspace-b', 'teacher');
const settle = async (id: string) => {
  for (let i = 0; i < 100; i++) {
    const s = service.getChat(a, id);
    if (!['queued', 'running'].includes(s.status)) return s;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error('timeout');
};
after(async () => {
  await service.stopAssistant();
  mock.closeAllConnections();
  await new Promise<void>((resolve) => mock.close(() => resolve()));
  closeRosterDatabase();
  rmSync(root, { recursive: true, force: true });
});
test('sessions are principal scoped, duplicate requests do not call model twice, resume retains history', async () => {
  const chat = await service.createChat(a, 'qingsong', 'fixture');
  assert.throws(() => service.getChat(b, chat.id));
  assert.equal(service.listChats(b).length, 0);
  assert.throws(() => service.getChat(a, '../../x'));
  const input = { requestId: randomUUID(), text: '虚构问题' };
  await service.submitChat(a, chat.id, input, async () => {});
  await service.submitChat(a, chat.id, input, async () => {});
  const result = await settle(chat.id);
  assert.equal(result.status, 'idle');
  assert.equal(result.messages.at(-1)?.content, '虚构回答');
  assert.equal(modelCalls, 1);
  await service.submitChat(
    a,
    chat.id,
    { requestId: randomUUID(), text: '继续' },
    async () => {},
  );
  assert.equal((await settle(chat.id)).status, 'idle');
  assert.equal(modelCalls, 2);
});
test('queued cancellation does not generate and active cancellation retains recoverable state', async () => {
  const first = await service.createChat(a, 'qingsong', 'fixture'),
    second = await service.createChat(a, 'qingsong', 'fixture');
  await service.submitChat(
    a,
    first.id,
    { requestId: randomUUID(), text: '准备取消' },
    async () => {},
  );
  await service.submitChat(
    a,
    second.id,
    { requestId: randomUUID(), text: '不应生成' },
    async () => {},
  );
  const cancelled = await service.cancelChat(a, second.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.messages.at(-1)?.status, 'interrupted');
  for (
    let i = 0;
    i < 60 && service.getChat(a, first.id).messages.at(-1)?.content === '';
    i++
  )
    await new Promise((r) => setTimeout(r, 40));
  await service.cancelChat(a, first.id);
  assert.equal((await settle(first.id)).status, 'cancelled');
  await service.submitChat(
    a,
    first.id,
    { requestId: randomUUID(), text: '停止后继续' },
    async () => {},
  );
  assert.equal((await settle(first.id)).status, 'idle');
});
test('revoked access fails before model invocation', async () => {
  const count = modelCalls,
    chat = await service.createChat(a, 'qingsong', 'fixture');
  await service.submitChat(
    a,
    chat.id,
    { requestId: randomUUID(), text: '撤销授权' },
    async () => {
      throw Error('revoked');
    },
  );
  assert.equal((await settle(chat.id)).status, 'failed');
  assert.equal(modelCalls, count);
});
test('native turn failure is never reported as a completed answer', async () => {
  failProvider = true;
  try {
    const chat = await service.createChat(a, 'qingsong', 'fixture');
    await service.submitChat(
      a,
      chat.id,
      { requestId: randomUUID(), text: '模型失败样本' },
      async () => {},
    );
    const state = await settle(chat.id);
    assert.equal(state.status, 'failed');
    assert.equal(state.messages.at(-1)?.status, 'failed');
    assert.match(state.error!, /未能完成/);
  } finally {
    failProvider = false;
  }
});
test('teaching queries isolate data, reject spoofed principals and invalid calendar days', () => {
  runWithWorkspace(a, () => {
    getRosterDatabase().exec(
      "INSERT INTO classes(id,name,grade,term,head_teacher,textbook_version,default_submit_time,status,created_at,updated_at) VALUES('class-a','虚构甲班','','','','','','active','now','now')",
    );
    assert.equal(teachingQuery({ kind: 'schedule' }).data.classes.length, 1);
    assert.throws(() =>
      teachingQuery({ kind: 'schedule', workspaceId: b.workspaceId }),
    );
    for (const from of ['2026-02-30', '2026-13-01'])
      assert.throws(() =>
        teachingQuery({
          kind: 'classroom',
          classId: 'class-a',
          from,
          to: '2026-03-01',
        }),
      );
  });
  runWithWorkspace(b, () => {
    assert.equal(teachingQuery({ kind: 'schedule' }).data.classes.length, 0);
    assert.throws(() => teachingQuery({ kind: 'roster', classId: 'class-a' }));
  });
});
