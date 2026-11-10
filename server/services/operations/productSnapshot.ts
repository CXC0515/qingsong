/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

interface FileRecord { path: string; size: number; sha256: string }
export interface ProductSnapshotManifest { formatVersion: 2; createdAt: string; sourceRoot: string; files: FileRecord[]; sqliteFiles: string[] }
const included = ['system', 'workspaces'] as const;
const isInside = (root: string, candidate: string) => { const relative = path.relative(root, candidate); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); };
const ensureAbsent = async (target: string) => { try { await lstat(target); throw new Error(`TARGET_ALREADY_EXISTS:${target}`); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } };
const listFiles = async (root: string, current = root): Promise<string[]> => {
  const entries = await readdir(current, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`SYMLINK_NOT_ALLOWED:${absolute}`);
    if (entry.isDirectory()) result.push(...await listFiles(root, absolute));
    else if (entry.isFile()) result.push(path.relative(root, absolute));
  }
  return result.sort();
};
const hash = async (target: string) => { const digest = createHash('sha256'); for await (const chunk of createReadStream(target)) digest.update(chunk); return digest.digest('hex'); };
const records = async (root: string) => Promise.all((await listFiles(root)).filter(item => item !== 'manifest.json' && item !== 'restore-report.json').map(async item => { const target = path.join(root, item); const info = await lstat(target); return { path: item, size: info.size, sha256: await hash(target) }; }));
const sqliteFiles = async (root: string) => (await listFiles(root)).filter(item => item.endsWith('.sqlite'));
const verifySqlite = (target: string) => { const db = new Database(target, { readonly: true, fileMustExist: true }); try { if (String(db.pragma('integrity_check', { simple: true })) !== 'ok') throw new Error(`SQLITE_INTEGRITY_FAILED:${target}`); } finally { db.close(); } };

export const createProductSnapshot = async (sourceInput: string, destinationInput: string) => {
  const sourceRoot = path.resolve(sourceInput);
  const destinationRoot = path.resolve(destinationInput);
  if (sourceRoot === destinationRoot || isInside(destinationRoot, sourceRoot)) throw new Error('INVALID_SNAPSHOT_ROOTS');
  await access(sourceRoot); await ensureAbsent(destinationRoot); await mkdir(destinationRoot, { recursive: true });
  for (const directory of included) {
    const source = path.join(sourceRoot, directory);
    await access(source);
    await cp(source, path.join(destinationRoot, directory), { recursive: true, filter: candidate => !/\.sqlite(?:-wal|-shm)?$/.test(path.basename(candidate)) });
  }
  const databases = (await sqliteFiles(sourceRoot)).filter(item => included.some(directory => item === directory || item.startsWith(`${directory}${path.sep}`)));
  for (const relative of databases) {
    const destination = path.join(destinationRoot, relative); await mkdir(path.dirname(destination), { recursive: true });
    const db = new Database(path.join(sourceRoot, relative), { readonly: true, fileMustExist: true });
    try { await db.backup(destination); } finally { db.close(); }
    verifySqlite(destination);
  }
  const manifest: ProductSnapshotManifest = { formatVersion: 2, createdAt: new Date().toISOString(), sourceRoot, files: await records(destinationRoot), sqliteFiles: databases };
  await writeFile(path.join(destinationRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return manifest;
};

export const verifyProductSnapshot = async (snapshotInput: string) => {
  const root = path.resolve(snapshotInput);
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')) as ProductSnapshotManifest;
  if (manifest.formatVersion !== 2) throw new Error('UNSUPPORTED_PRODUCT_SNAPSHOT');
  const actual = await records(root); const expected = new Map(manifest.files.map(item => [item.path, item]));
  if (actual.length !== expected.size) throw new Error('PRODUCT_SNAPSHOT_FILE_COUNT_MISMATCH');
  for (const item of actual) { const saved = expected.get(item.path); if (!saved || saved.size !== item.size || saved.sha256 !== item.sha256) throw new Error(`PRODUCT_SNAPSHOT_FILE_MISMATCH:${item.path}`); }
  for (const relative of manifest.sqliteFiles) verifySqlite(path.join(root, relative));
  return manifest;
};

const remapWorkspacePaths = async (targetRoot: string, sourceRoot: string) => {
  const workspaceRoot = path.join(targetRoot, 'workspaces');
  for (const entry of await readdir(workspaceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const root = path.join(workspaceRoot, entry.name);
    const resourceDb = path.join(root, 'data', 'resources.sqlite');
    try {
      const db = new Database(resourceDb); const rows = db.prepare('SELECT id, disk_path FROM resources').all() as Array<{ id: string; disk_path: string }>;
      const update = db.prepare('UPDATE resources SET disk_path = ? WHERE id = ?');
      db.transaction(() => {
        rows.forEach(row => { if (path.isAbsolute(row.disk_path) && isInside(sourceRoot, row.disk_path)) update.run(path.join(targetRoot, path.relative(sourceRoot, row.disk_path)), row.id); });
        const hasPool = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'pool_items'").get() as { count: number };
        if (hasPool.count) {
          const poolRows = db.prepare('SELECT id, disk_path FROM pool_items').all() as Array<{ id: string; disk_path: string }>;
          const updatePool = db.prepare('UPDATE pool_items SET disk_path = ? WHERE id = ?');
          poolRows.forEach(row => { if (path.isAbsolute(row.disk_path) && isInside(sourceRoot, row.disk_path)) updatePool.run(path.join(targetRoot, path.relative(sourceRoot, row.disk_path)), row.id); });
        }
      })(); db.close();
    } catch { /* A newly invited empty workspace may not have a resource DB yet. */ }
    for (const relative of (await listFiles(root)).filter(item => item.endsWith('.json'))) {
      const file = path.join(root, relative); const content = await readFile(file, 'utf8');
      if (content.includes(sourceRoot)) await writeFile(file, content.split(sourceRoot).join(targetRoot));
    }
  }
};

export const restoreProductSnapshot = async (snapshotInput: string, targetInput: string) => {
  const snapshotRoot = path.resolve(snapshotInput); const targetRoot = path.resolve(targetInput);
  const manifest = await verifyProductSnapshot(snapshotRoot);
  if (snapshotRoot === targetRoot || isInside(snapshotRoot, targetRoot)) throw new Error('INVALID_RESTORE_ROOTS');
  await ensureAbsent(targetRoot); await mkdir(targetRoot, { recursive: true });
  for (const directory of included) await cp(path.join(snapshotRoot, directory), path.join(targetRoot, directory), { recursive: true });
  await remapWorkspacePaths(targetRoot, manifest.sourceRoot);
  for (const relative of await sqliteFiles(targetRoot)) verifySqlite(path.join(targetRoot, relative));
  const report = { formatVersion: 2, restoredAt: new Date().toISOString(), snapshotRoot, sourceRoot: manifest.sourceRoot, targetRoot };
  await writeFile(path.join(targetRoot, 'restore-report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  return report;
};

const sameSnapshotContent = (first: ProductSnapshotManifest, second: ProductSnapshotManifest) => {
  if (first.files.length !== second.files.length) return false;
  return first.files.every((file, index) => {
    const other = second.files[index];
    return other?.path === file.path && other.size === file.size && other.sha256 === file.sha256;
  });
};

const snapshotTimestamp = (now: Date) => now.toISOString().replaceAll(':', '-').replaceAll('.', '-');

export interface ManagedProductSnapshotResult {
  status: 'created' | 'skipped';
  snapshotPath?: string;
  comparedWith?: string;
  pruned: string[];
}

export const createManagedProductSnapshot = async (
  sourceInput: string,
  automaticRootInput: string,
  retention = 1,
  now = new Date(),
): Promise<ManagedProductSnapshotResult> => {
  if (!Number.isInteger(retention) || retention < 1) throw new Error('INVALID_SNAPSHOT_RETENTION');
  const sourceRoot = path.resolve(sourceInput);
  const automaticRoot = path.resolve(automaticRootInput);
  if (sourceRoot === automaticRoot) throw new Error('INVALID_AUTOMATIC_BACKUP_ROOT');
  await mkdir(automaticRoot, { recursive: true });

  const stamp = snapshotTimestamp(now);
  const suffix = randomUUID();
  const pending = path.join(automaticRoot, `.pending-${stamp}-${suffix}`);
  const incomplete = path.join(automaticRoot, `incomplete-${stamp}-${suffix}`);
  try {
    const current = await createProductSnapshot(sourceRoot, pending);
    await verifyProductSnapshot(pending);
    const existing = (await readdir(automaticRoot, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && entry.name.startsWith('product-'))
      .map(entry => path.join(automaticRoot, entry.name))
      .sort();
    const verifiedExisting: Array<{ path: string; manifest: ProductSnapshotManifest }> = [];
    for (const candidate of existing) {
      try {
        verifiedExisting.push({ path: candidate, manifest: await verifyProductSnapshot(candidate) });
      } catch {
        // Keep damaged snapshots for diagnosis, but never let one prevent a new
        // verified recovery point from being created.
      }
    }
    const previous = verifiedExisting.at(-1);
    const previousPath = previous?.path;
    if (previousPath) {
      if (sameSnapshotContent(current, previous.manifest)) {
        await rm(pending, { recursive: true, force: true });
        return { status: 'skipped', comparedWith: previousPath, pruned: [] };
      }
    }

    const destination = path.join(automaticRoot, `product-${stamp}-${suffix}`);
    await rename(pending, destination);
    const successful = [...verifiedExisting.map(item => item.path), destination].sort();
    const pruned = successful.slice(0, Math.max(0, successful.length - retention));
    for (const target of pruned) await rm(target, { recursive: true, force: true });
    return { status: 'created', snapshotPath: destination, comparedWith: previousPath, pruned };
  } catch (error) {
    try {
      await lstat(pending);
      await rename(pending, incomplete);
    } catch (pendingError) {
      if ((pendingError as NodeJS.ErrnoException).code !== 'ENOENT') throw pendingError;
    }
    throw error;
  }
};
