import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { runtimeConfig } from '../../config/runtimeConfig';
import { contextGuidance } from '../../../agent/context-builder.mjs';

const skillFiles = [
  ['system-data', 'skills/system-data/SKILL.md', ['class', 'student', 'classroomTask', 'resource', 'knowledge', 'grading']],
  ['lesson-preparation', 'skills/lesson-preparation/SKILL.md', ['preparation', 'lessonPlan', 'preparationSource']],
  ['chinese-teaching', 'skills/chinese-teaching/SKILL.md', ['preparation', 'lessonPlan']],
  ['chinese-teaching-review', 'skills/chinese-teaching/references/review.md', ['lessonPlan']],
  ['chinese-teaching-template', 'skills/chinese-teaching/references/template.md', ['lessonPlan']],
] as const;

const persistedPath = path.join(runtimeConfig.systemDirectory, 'dsh-prompt-config.json');
const historyDirectory = path.join(runtimeConfig.systemDirectory, 'dsh-prompt-history');
const parseYaml = createRequire(path.join(process.cwd(), 'agent', 'package.json'))('yaml').parse as (source: string) => Record<string, unknown>;
const editableNodeSchema = z.object({
  id: z.string().min(1).max(160),
  enabled: z.boolean(),
  content: z.string().max(100_000),
});
const saveSchema = z.object({ revision: z.number().int().nonnegative(), nodes: z.array(editableNodeSchema).max(32) });

export class DshPromptConfigError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export interface DshPromptNode {
  id: string;
  title: string;
  kind: 'prompt' | 'skill';
  editable: boolean;
  enabled: boolean;
  content: string;
  description: string;
  requires: string[];
  version: string;
  hash: string;
}

export interface DshPromptConfig {
  revision: number;
  updatedAt: string | null;
  updatedBy: string | null;
  nodes: DshPromptNode[];
}

let writeQueue: Promise<void> = Promise.resolve();

const hash = (content: string) => createHash('sha256').update(content).digest('hex');
const skillPath = (file: string) => path.resolve(process.cwd(), 'agent', file);
const atomicWriteJson = async (filePath: string, value: unknown) => {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(value), { mode: 0o600 });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
};

async function defaultNodes(): Promise<DshPromptNode[]> {
  const contextNode: DshPromptNode = {
    id: 'teaching-context', title: '教学助手上下文规则', kind: 'prompt', editable: true, enabled: true,
    content: contextGuidance, description: '每轮加入主 Agent 的青松业务上下文规则。', requires: [], version: '1.0', hash: hash(contextGuidance),
  };
  const skills = await Promise.all(skillFiles.map(async ([id, file, requires]) => {
    const content = await readFile(skillPath(file), 'utf8');
    const header = parseYaml(content.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '');
    if (header.name !== id || typeof header.description !== 'string' || typeof header.version !== 'string') {
      throw new DshPromptConfigError('DSH_PROMPT_DEFAULT_INVALID', `Skill ${id} 的发布头信息无效，配置未载入。`, 503);
    }
    return {
      id: `skill:${id}`, title: `Skill · ${id}`, kind: 'skill' as const, editable: true, enabled: true, content,
      description: header.description, requires: [...requires], version: header.version, hash: hash(content),
    };
  }));
  return [contextNode, ...skills];
}

async function loadConfig(filePath = persistedPath): Promise<DshPromptConfig> {
  let raw: DshPromptConfig;
  try {
    raw = JSON.parse(await readFile(filePath, 'utf8')) as DshPromptConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new DshPromptConfigError('DSH_PROMPT_CONFIG_UNREADABLE', '管理员提示词配置无法读取，原配置保留。请重新载入或联系管理员。', 503);
    }
    return { revision: 0, updatedAt: null, updatedBy: null, nodes: await defaultNodes() };
  }
  if (!Number.isSafeInteger(raw.revision) || raw.revision < 1 || !Array.isArray(raw.nodes)) {
    throw new DshPromptConfigError('DSH_PROMPT_CONFIG_INVALID', '管理员提示词配置格式无效，原配置保留。', 503);
  }
  const defaults = await defaultNodes();
  const map = new Map(raw.nodes.map(node => [node.id, node]));
  const nodes = defaults.map(base => {
    const saved = map.get(base.id);
    if (!saved) return base;
    if (typeof saved.enabled !== 'boolean' || typeof saved.content !== 'string' || saved.content.length > 100_000) {
      throw new DshPromptConfigError('DSH_PROMPT_CONFIG_INVALID', `节点 ${base.title} 的内容无效，原配置保留。`, 503);
    }
    const content = saved.content;
    if (base.kind === 'skill') {
      const header = parseYaml(content.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '');
      if (header.name !== base.id.slice('skill:'.length) || typeof header.description !== 'string' || typeof header.version !== 'string') {
        throw new DshPromptConfigError(`DSH_PROMPT_SKILL_INVALID`, `${base.title} 的 frontmatter 不完整或名称不可修改，原配置保留。`);
      }
      return { ...base, enabled: saved.enabled, content, description: header.description, version: header.version, hash: hash(content) };
    }
    return { ...base, enabled: saved.enabled, content, hash: hash(content) };
  });
  if (map.size !== defaults.length || defaults.some(node => !map.has(node.id))) {
    throw new DshPromptConfigError('DSH_PROMPT_CONFIG_INVALID', '管理员配置中的节点与当前发布目录不一致，原配置保留。', 503);
  }
  return { revision: raw.revision, updatedAt: raw.updatedAt ?? null, updatedBy: raw.updatedBy ?? null, nodes };
}

export async function readDshPromptConfig(filePath = persistedPath) {
  return loadConfig(filePath);
}

export async function dshPromptAdminState() {
  const config = await loadConfig();
  let history: { revision: number; updatedAt: string | null; updatedBy: string | null }[] = [];
  try {
    const files = (await readdir(historyDirectory)).filter(name => /^revision-\d+\.json$/.test(name));
    const rows = await Promise.all(files.map(async name => {
      try {
        const snapshot = JSON.parse(await readFile(path.join(historyDirectory, name), 'utf8')) as DshPromptConfig;
        return { revision: snapshot.revision, updatedAt: snapshot.updatedAt, updatedBy: snapshot.updatedBy };
      } catch { return null; }
    }));
    history = rows.filter((row): row is NonNullable<typeof row> => Boolean(row)).sort((a, b) => b.revision - a.revision).slice(0, 20);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return { ...config, history };
}

export async function readDshPromptHistory(revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new DshPromptConfigError('DSH_PROMPT_HISTORY_NOT_FOUND', '历史版本不存在。', 404);
  try {
    return JSON.parse(await readFile(path.join(historyDirectory, `revision-${revision}.json`), 'utf8')) as DshPromptConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new DshPromptConfigError('DSH_PROMPT_HISTORY_NOT_FOUND', '历史版本不存在或已不可用。', 404);
    throw new DshPromptConfigError('DSH_PROMPT_CONFIG_UNREADABLE', '历史版本无法读取，当前配置未改变。', 503);
  }
}

export async function saveDshPromptConfig(input: unknown, userId: string, filePath = persistedPath) {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) throw new DshPromptConfigError('INVALID_DSH_PROMPT_CONFIG', '节点内容无效或超过 100 KB，修改尚未保存。');
  let resolve!: (value: DshPromptConfig) => void;
  let reject!: (reason: unknown) => void;
  const result = new Promise<DshPromptConfig>((ok, fail) => { resolve = ok; reject = fail; });
  const previous = writeQueue;
  writeQueue = previous.then(async () => {
    const current = await loadConfig(filePath);
    if (current.revision !== parsed.data.revision) throw new DshPromptConfigError('DSH_PROMPT_REVISION_CONFLICT', '另一位管理员已保存新版本。请先重新载入，当前草稿仍保留。', 409);
    const byId = new Map(parsed.data.nodes.map(node => [node.id, node]));
    if (byId.size !== current.nodes.length || current.nodes.some(node => !node.editable || !byId.has(node.id))) {
      throw new DshPromptConfigError('INVALID_DSH_PROMPT_CONFIG', '提交的节点清单与当前发布不一致，未保存。');
    }
    const nodes = current.nodes.map(node => {
      const value = byId.get(node.id)!;
      const content = value.content.replace(/\r\n/g, '\n');
      if (node.kind === 'prompt' && !content.trim()) throw new DshPromptConfigError('EMPTY_DSH_PROMPT', `${node.title} 不能为空，未保存。`);
      return { ...node, enabled: value.enabled, content, hash: hash(content), ...(node.kind === 'skill' ? skillMetadata(content, node) : {}) };
    });
    const next: DshPromptConfig = { revision: current.revision + 1, updatedAt: new Date().toISOString(), updatedBy: userId, nodes };
    const dir = path.dirname(filePath);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await mkdir(path.join(dir, 'dsh-prompt-history'), { recursive: true, mode: 0o700 });
    if (current.revision > 0) await atomicWriteJson(path.join(dir, 'dsh-prompt-history', `revision-${current.revision}.json`), current);
    await atomicWriteJson(filePath, next);
    resolve(next);
  }).catch(error => { reject(error); });
  return result;
}

function skillMetadata(content: string, node: DshPromptNode) {
  const header = parseYaml(content.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '');
  if (header.name !== node.id.slice('skill:'.length) || typeof header.description !== 'string' || typeof header.version !== 'string') {
    throw new DshPromptConfigError('DSH_PROMPT_SKILL_INVALID', `${node.title} 的 frontmatter 必须保留 Skill 名称、描述和版本，未保存。`);
  }
  return { description: header.description, version: header.version };
}
