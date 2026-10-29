/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dataFilePath } from '../context/workspaceContext';

const mapCaches = new Map<string, Map<string, unknown>>();
const arrayCaches = new Map<string, unknown[]>();
const atomicWrite = (target: string, value: unknown) => {
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, JSON.stringify(value));
  renameSync(temporary, target);
};

export class WorkspaceDataReadError extends Error {
  constructor(public code: 'DATA_CORRUPT' | 'DATA_READ_FAILED') {
    super(code === 'DATA_CORRUPT'
      ? '已有业务记录格式损坏，不能当作没有记录。本次未保存任何更改，请联系管理员检查原文件。'
      : '已有业务记录暂时无法读取，本次未保存任何更改。请稍后重试或联系管理员检查。');
  }
}
function loadArray(target: string): unknown[] {
  let text: string;
  try { text = readFileSync(target, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new WorkspaceDataReadError('DATA_READ_FAILED');
  }
  try {
    const value = JSON.parse(text);
    if (!Array.isArray(value)) throw Error('shape');
    return value;
  } catch { throw new WorkspaceDataReadError('DATA_CORRUPT'); }
}
export const workspaceMapStore = <T>(fileName: string) => {
  const target = dataFilePath(fileName);
  let values = mapCaches.get(target) as Map<string, T> | undefined;
  if (!values) {
    const entries = loadArray(target);
    if (entries.some(row => !Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' || row[1] === null || typeof row[1] !== 'object') || new Set(entries.map(row => (row as any[])[0])).size !== entries.length)
      throw new WorkspaceDataReadError('DATA_CORRUPT');
    values = new Map(entries as [string, T][]);
    mapCaches.set(target, values as Map<string, unknown>);
  }
  return { values, persist: () => atomicWrite(target, [...values.entries()]) };
};
export const workspaceArrayStore = <T>(fileName: string) => {
  const target = dataFilePath(fileName);
  let values = arrayCaches.get(target) as T[] | undefined;
  if (!values) {
    const rows = loadArray(target);
    if (rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new WorkspaceDataReadError('DATA_CORRUPT');
    values = rows as T[];
    arrayCaches.set(target, values as unknown[]);
  }
  return { values, persist: () => atomicWrite(target, values) };
};

export const clearWorkspaceFileStoreCaches = () => { mapCaches.clear(); arrayCaches.clear(); };
