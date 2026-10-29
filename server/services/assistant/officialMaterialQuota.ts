import { randomUUID } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

const MAX_BYTES = 512 * 1024 * 1024;
const reservations = new Map<string, { home: string; bytes: number; timer: ReturnType<typeof setTimeout> }>();
const locks = new Map<string, Promise<unknown>>();
async function directoryBytes(directory: string): Promise<number> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error; }
  let total = 0;
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(file);
    else if (entry.isFile()) total += (await lstat(file)).size;
  }
  return total;
}
export function releaseMaterialStorage(home: string, id: unknown) {
  if (typeof id !== 'string') return;
  const reservation = reservations.get(id);
  if (reservation?.home !== home) return;
  clearTimeout(reservation.timer); reservations.delete(id);
}
/** Serialize accounting, not model execution. Reservations cover concurrent native writes. */
export async function reserveMaterialStorage(home: string, bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_BYTES) throw Error('MATERIAL_STORAGE_LIMIT');
  const previous = locks.get(home) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    const used = await directoryBytes(path.join(home, 'attachments')) + await directoryBytes(path.join(home, 'qingsong-materials', 'cache'));
    const held = [...reservations.values()].filter(value => value.home === home).reduce((sum, value) => sum + value.bytes, 0);
    if (used + held + bytes > MAX_BYTES) throw Error('MATERIAL_STORAGE_LIMIT');
    const id = randomUUID();
    const timer = setTimeout(() => releaseMaterialStorage(home, id), 120000); timer.unref();
    reservations.set(id, { home, bytes, timer });
    return id;
  });
  locks.set(home, pending);
  try { return await pending; } finally { if (locks.get(home) === pending) locks.delete(home); }
}
