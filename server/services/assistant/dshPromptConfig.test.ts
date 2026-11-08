import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DshPromptConfigError, readDshPromptConfig, saveDshPromptConfig } from './dshPromptConfig';

test('DSH prompt edits are revisioned, atomic, restoreable, and reject stale writes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qs-dsh-prompts-'));
  const target = path.join(root, 'dsh-prompt-config.json');
  try {
    const initial = await readDshPromptConfigAt(target);
    const changed = initial.nodes.map(node => ({ id: node.id, enabled: node.id === 'skill:system-data' ? false : node.enabled, content: node.id === 'teaching-context' ? node.content + '\n测试规则' : node.content }));
    const saved = await saveDshPromptConfig({ revision: initial.revision, nodes: changed }, 'owner-1', target);
    assert.equal(saved.revision, 1);
    assert.equal(saved.updatedBy, 'owner-1');
    assert.match(saved.nodes[0]!.content, /测试规则/);
    assert.equal(saved.nodes.find(node => node.id === 'skill:system-data')?.enabled, false);
    await assert.rejects(saveDshPromptConfig({ revision: 0, nodes: changed }, 'owner-2', target), (error: unknown) => error instanceof DshPromptConfigError && error.status === 409);
    await saveDshPromptConfig({ revision: 1, nodes: changed }, 'owner-1', target);
    const historyDirectory = path.join(root, 'dsh-prompt-history');
    assert.equal(JSON.parse(await readFile(path.join(historyDirectory, 'revision-1.json'), 'utf8')).revision, 1);
    assert.deepEqual((await readdir(historyDirectory)).filter(name => name.endsWith('.tmp')), []);
    const disk = JSON.parse(await readFile(target, 'utf8'));
    assert.equal(disk.revision, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Skill metadata identity and required fields cannot be removed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qs-dsh-prompts-invalid-'));
  const target = path.join(root, 'dsh-prompt-config.json');
  try {
    const initial = await readDshPromptConfigAt(target);
    const nodes = initial.nodes.map(node => ({ id: node.id, enabled: node.enabled, content: node.id === 'skill:lesson-preparation' ? node.content.replace('name: lesson-preparation', 'name: changed') : node.content }));
    await assert.rejects(saveDshPromptConfig({ revision: 0, nodes }, 'owner-1', target), /frontmatter/);
    assert.equal(await readDshPromptConfigAt(target).then(value => value.revision), 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

async function readDshPromptConfigAt(filePath: string) {
  return readDshPromptConfig(filePath);
}
