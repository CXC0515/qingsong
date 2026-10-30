import {createHash} from 'node:crypto';
import {brotliCompress, gzip, constants} from 'node:zlib';
import {promisify} from 'node:util';
import {transform} from 'esbuild';
import {logEvent} from '../../observability/logger';

const brotli = promisify(brotliCompress), zip = promisify(gzip);
type Artifact = {identity: Buffer; br: Buffer; gzip: Buffer; etags: Record<string, string>};
const cache = new Map<string, Artifact>();
const pending = new Map<string, Promise<Artifact>>();
const limit = 32 * 1024 * 1024;
let used = 0;
const bytes = (a: Artifact) => a.identity.length + a.br.length + a.gzip.length;

// Call only after per-request authentication. Content addressing shares code, never cookies or data.
export async function prepareOfficialAsset(source: Buffer, contentType: string): Promise<Artifact> {
  const loader = /text\/css/i.test(contentType) ? 'css' : 'js';
  const key = loader + ':' + createHash('sha256').update(source).digest('hex');
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  if (pending.has(key)) return pending.get(key)!;
  const work = (async () => {
    const started = performance.now();
    let identity = source;
    try {
      const result = await transform(source.toString('utf8'), {loader, minify: true, target: 'es2022', legalComments: 'inline'});
      const compact = Buffer.from(result.code);
      if (compact.length < source.length) identity = compact;
    } catch {
      logEvent('warn', 'assistant_asset_minify_failed', {bytes: source.length, loader});
    }
    const [br, compressed] = await Promise.all([
      brotli(identity, {params: {[constants.BROTLI_PARAM_QUALITY]: 5}}),
      zip(identity, {level: 6}),
    ]);
    const variants = {identity, br, gzip: compressed};
    logEvent('info', 'assistant_asset_prepared', {sourceBytes: source.length, compactBytes: identity.length, brotliBytes: br.length, gzipBytes: compressed.length, totalMs: Math.round(performance.now() - started), loader});
    const artifact: Artifact = {...variants, etags: Object.fromEntries(Object.entries(variants).map(([encoding, body]) => [encoding, '"' + createHash('sha256').update(body).digest('hex') + '"']))};
    const size = bytes(artifact);
    if (size <= limit) {
      while (cache.size >= 32 || used + size > limit) {
        const oldest = cache.keys().next().value!; used -= bytes(cache.get(oldest)!); cache.delete(oldest);
      }
      cache.set(key, artifact); used += size;
    }
    return artifact;
  })();
  if (pending.size < 8) pending.set(key, work);
  try { return await work; } finally { if (pending.get(key) === work) pending.delete(key); }
}

export function officialAssetEncoding(header: string | undefined): 'br' | 'gzip' | 'identity' | undefined {
  if (!header) return 'identity';
  const qualities = new Map<string, number>();
  for (const part of header.toLowerCase().split(',')) {
    const [name, ...parameters] = part.trim().split(';');
    const q = parameters.find(value => value.trim().startsWith('q='));
    const value = q ? Number(q.trim().slice(2)) : 1;
    qualities.set(name, Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0);
  }
  const quality = (name: string) => qualities.get(name) ?? (name === 'identity' ? (qualities.get('*') === 0 ? 0 : 1) : qualities.get('*') ?? 0);
  const compressed = (['br', 'gzip'] as const).filter(name => quality(name) > 0).sort((a,b) => quality(b)-quality(a));
  if (compressed.length && (!qualities.has('identity') || quality(compressed[0]) >= quality('identity'))) return compressed[0];
  if (quality('identity') > 0) return 'identity';
  return compressed[0];
}
