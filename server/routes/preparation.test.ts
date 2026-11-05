import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runWithWorkspace } from '../context/workspaceContext';
import { closePreparationDatabase } from '../database/preparationDatabase';
import router from './preparation';
import * as preparations from '../services/preparation/preparationService';

test('HTTP contract returns explicit unsaved conflicts and hides other teachers records', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qs-preparation-http-'));
  const app = express(); app.use(express.json());
  app.use((_req, _res, next) => runWithWorkspace({ userId: String(_req.headers['x-test-user'] ?? 'teacher-a'), workspaceId: 'workspace-http', role: 'teacher', root, dataDirectory: path.join(root,'data'), uploadDirectory: path.join(root,'uploads') }, next));
  app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as {port: number}).port}/api/preparations`;
  const send = (url: string, method = 'GET', body?: unknown, user = 'teacher-a') => fetch(url, { method, headers: { 'content-type': 'application/json', 'x-test-user': user }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    const created = await send(base, 'POST', { title: '合成备课', operationId: randomUUID() });
    assert.equal(created.status, 200);
    assert.equal(created.headers.get('cache-control'), 'no-store');
    const detail = (await created.json()).preparation, id = detail.preparation.id, doc = detail.documents[0];
    const request = { expectedRevision: 1, operationId: randomUUID(), content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '第一版' }] }] } };
    const saved = await send(`${base}/${id}/documents/${doc.id}`, 'PUT', request);
    assert.equal((await saved.json()).document.revision, 2);
    const conflict = await send(`${base}/${id}/documents/${doc.id}`, 'PUT', { ...request, operationId: randomUUID() });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).saved, false);
    const forbidden = await send(`${base}/${id}`, 'GET', undefined, 'teacher-b');
    assert.equal((await send(`${base}/${id}/sessions`, 'GET', undefined, 'teacher-b')).status,404);
    assert.deepEqual((await (await send(`${base}/${id}/sessions`)).json()).sessions,[]);
    assert.equal(forbidden.status, 404);
    assert.equal((await forbidden.json()).code, 'PREPARATION_NOT_FOUND');
    const invalid = await send(base, 'POST', { title: '', operationId: randomUUID() });
    assert.equal(invalid.status, 400);
    const error = await invalid.json();
    assert.equal(error.saved, false);
    assert.match(error.message, /尚未保存/);
    const task = runWithWorkspace({ userId: 'teacher-a', workspaceId: 'workspace-http', role: 'teacher', root, dataDirectory: path.join(root,'data'), uploadDirectory: path.join(root,'uploads') }, () => preparations.createTask(id, { documentId: doc.id, instruction: '测试停止', operationId: randomUUID() }));
    const cancelRequest = { operationId: randomUUID() };
    const cancelled = await send(`${base}/${id}/tasks/${task.id}/cancel`, 'POST', cancelRequest);
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json()).task.status, 'cancelled');
    const repeatedCancel = await send(`${base}/${id}/tasks/${task.id}/cancel`, 'POST', cancelRequest);
    assert.equal((await repeatedCancel.json()).task.status, 'cancelled');
    const hiddenTask = await send(`${base}/${id}/tasks/${task.id}/cancel`, 'POST', {operationId: randomUUID()}, 'teacher-b');
    assert.equal(hiddenTask.status, 404);
    const historical = await send(`${base}/${id}/documents/${doc.id}/revisions/1`);
    assert.equal((await historical.json()).document.revision, 1);
  } finally {
    await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
    closePreparationDatabase(); await rm(root, {recursive:true,force:true});
  }
});
