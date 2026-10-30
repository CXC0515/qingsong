import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {brotliDecompressSync, gunzipSync} from 'node:zlib';
import {prepareOfficialAsset, officialAssetEncoding} from './officialAssets';

test('minified factories preserve deferred execution, compressed variants and content identity', async () => {
  const source = Buffer.from('/*! fixture license */\n' + '/* removable comment */\n'.repeat(100) + 'globalThis.factory = function(require) { const longName = require("value"); globalThis.executed = true; return longName + 2; };');
  const [a,b] = await Promise.all([prepareOfficialAsset(source, 'text/javascript'), prepareOfficialAsset(source, 'text/javascript')]);
  assert.equal(a,b);
  assert.ok(a.identity.length < source.length / 2);
  assert.match(a.identity.toString(), /fixture license/);
  assert.deepEqual(brotliDecompressSync(a.br), a.identity);
  assert.deepEqual(gunzipSync(a.gzip), a.identity);
  assert.notEqual(a.etags.br, a.etags.gzip);
  assert.notEqual(a.etags.identity, a.etags.gzip);
  const context: any = {}; runInNewContext(a.identity.toString(), context);
  assert.equal(context.executed, undefined);
  assert.equal(context.factory(() => 40), 42); assert.equal(context.executed, true);
  assert.equal(await prepareOfficialAsset(source, 'text/javascript'), a);
  const changed = await prepareOfficialAsset(Buffer.concat([source,Buffer.from('globalThis.changed = true;')]), 'text/javascript');
  assert.notEqual(changed.etags.identity,a.etags.identity);
});
test('CSS stays CSS and unsupported transforms preserve original bytes', async () => {
  const css = await prepareOfficialAsset(Buffer.from('/* comment */ .test { color: red; padding: 0px 0px; }'), 'text/css');
  assert.match(css.identity.toString(), /color:red/);
  const invalid = Buffer.from('invalid @ syntax');
  assert.deepEqual((await prepareOfficialAsset(invalid, 'text/javascript')).identity, invalid);
});
test('encoding negotiation honors exclusions, weights and identity', () => {
  for (const [header, expected] of [[undefined,'identity'],['br, gzip','br'],['gzip','gzip'],['br;q=0,gzip;q=.5','gzip'],['br;q=.3,gzip;q=.9','gzip'],['identity;q=1,br;q=.5','identity'],['*;q=0',undefined],['identity;q=0,br;q=0,gzip;q=0',undefined],['*;q=.5','br'],['br;q=invalid','identity']] as const) assert.equal(officialAssetEncoding(header),expected);
});
