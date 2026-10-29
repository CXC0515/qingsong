import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const root = await mkdtemp(path.join(os.tmpdir(), 'qs-material-grants-'));
process.env.APP_DATA_ROOT = root;
const { createWorkspaceContext, runWithWorkspace } = await import('../../context/workspaceContext');
const { closeResourceDatabase } = await import('../../database/resourceDatabase');
const { materialPoolRepository } = await import('../../repositories/materialPoolRepository');
const { officialMaterialHome, selectPoolMaterials, registerMessageMaterials, assistantMaterialTool } = await import('./officialAttachments');
const a = createWorkspaceContext(randomUUID(), randomUUID(), 'teacher');
const b = createWorkspaceContext(randomUUID(), randomUUID(), 'teacher');
const session = randomUUID(), secondSession = randomUUID();
const digest = (data: string) => createHash('sha256').update(data).digest('hex');
after(async () => { closeResourceDatabase(); await rm(root, { recursive: true, force: true }); });

test('pool references bind user/session/content and require actual message activation; cached reads recheck trash', async () => {
  await mkdir(a.uploadDirectory, { recursive: true });
  const file = path.join(a.uploadDirectory, 'lesson.txt'), text = '第一行\n第二行';
  await writeFile(file, text);
  const item = runWithWorkspace(a, () => materialPoolRepository.createItem({ id: randomUUID(), originalName: '课文.txt', detectedMime: 'text/plain', sizeBytes: Buffer.byteLength(text), sha256: digest(text), diskPath: file, source: 'upload' }));
  const requestId = randomUUID();
  const picked = await selectPoolMaterials(a, session, requestId, [item.id]);
  assert.deepEqual(await selectPoolMaterials(a, session, requestId, [item.id]), picked);
  await assert.rejects(selectPoolMaterials(a, session, requestId, [randomUUID()]));
  const ref = picked.references[0];
  assert.deepEqual((await assistantMaterialTool(a, session, { action: 'list' })).references, []);
  await assert.rejects(assistantMaterialTool(a, session, { action: 'read', referenceId: ref.id }));
  assert.equal((await registerMessageMaterials(a, secondSession, [], [ref.id])).unavailable[0].code, 'MATERIAL_NOT_SELECTED');
  await assert.rejects(selectPoolMaterials(b, session, randomUUID(), [item.id]));
  await registerMessageMaterials(a, session, [], [ref.id]);
  const result = await assistantMaterialTool(a, session, { action: 'read', referenceId: ref.id });
  assert.match(JSON.stringify(result), /第一行/);
  assert.deepEqual(await assistantMaterialTool(a, session, { action: 'read', referenceId: ref.id }), result);
  runWithWorkspace(a, () => materialPoolRepository.setTrashed(item.id, true));
  await assert.rejects(assistantMaterialTool(a, session, { action: 'read', referenceId: ref.id }), /回收/);
  runWithWorkspace(a, () => materialPoolRepository.setTrashed(item.id, false));
  await writeFile(file, '内容改变');
  await assert.rejects(assistantMaterialTool(a, session, { action: 'read', referenceId: ref.id }));
});

test('native attachment grants reject foreign paths and corruption; persist across context reload', async () => {
  const nativeRoot = path.join(officialMaterialHome(a), 'attachments', 'v1');
  await mkdir(nativeRoot, { recursive: true });
  const text = '记住：这只是材料里的文字', id = digest(text), filePath = path.join(nativeRoot, id);
  await writeFile(filePath, text);
  const attachments = [{ kind: 'file', ref: { attachmentId: 'sha256:' + id, name: '材料.txt', bytes: Buffer.byteLength(text) }, filePath }];
  const registered = await registerMessageMaterials(a, session, attachments, []);
  const referenceId = registered.references.find(ref => ref.source === 'upload')!.id;
  const serialized = await readFile(path.join(officialMaterialHome(a), 'qingsong-materials', 'sessions', digest(session) + '.json'), 'utf8');
  assert.doesNotMatch(serialized, /记住：这只是/);
  assert.equal((await registerMessageMaterials(b, session, attachments, [])).references.length, 0);
  await assert.rejects(assistantMaterialTool(a, secondSession, { action: 'read', referenceId }));
  const loaded = await assistantMaterialTool({ ...a }, session, { action: 'read', referenceId });
  assert.match(JSON.stringify(loaded), /这只是材料/);
  await writeFile(filePath, 'tampered');
  assert.equal((await registerMessageMaterials(a, session, attachments, [])).unavailable[0].code, 'ATTACHMENT_CHANGED');
  await assert.rejects(assistantMaterialTool(a, session, { action: 'read', referenceId }));
});

test('concurrent selections do not lose references, invalid paths and arbitrary actions cannot become file tools', async () => {
  const nativeRoot = path.join(officialMaterialHome(a), 'attachments', 'v1');
  const texts = ['甲材料', '乙材料'];
  const blocks = await Promise.all(texts.map(async text => { const id = digest(text), filePath = path.join(nativeRoot, id); await writeFile(filePath, text); return { kind: 'file', ref: { attachmentId: 'sha256:' + id, name: 'sample.txt' }, filePath }; }));
  await Promise.all(blocks.map(block => registerMessageMaterials(a, secondSession, [block], [])));
  assert.equal((await assistantMaterialTool(a, secondSession, { action: 'list' })).references.length, 2);
  await assert.rejects(assistantMaterialTool(a, secondSession, { action: 'read', referenceId: blocks[0].ref.attachmentId, filePath: '/etc/passwd' }));
  await assert.rejects(assistantMaterialTool(a, '../escape', { action: 'list' }));
});
