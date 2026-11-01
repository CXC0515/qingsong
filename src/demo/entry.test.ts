import assert from 'node:assert/strict';
import test from 'node:test';
import { apiFetch } from '../services/apiClient';
import { demoRequest, installDemoApi, isDemoRoute } from './entry';
import { createDemoApi } from './mockApi';

test('demo API never falls back to fetch, while teacher API preserves its original transport', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousFetch = globalThis.fetch;
  const location = { pathname: '/', search: '?demo=1' };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location } });
  let network = 0;
  globalThis.fetch = async (_input, init) => { network++; assert.equal(new Headers(init?.headers).get('x-demo-csrf'), '1'); assert.equal(init?.credentials, 'same-origin'); return Response.json({ teacher: true }); };
  try {
    assert.equal(isDemoRoute(), true);
    assert.equal((await demoRequest('/api/roster')!).status, 503);
    installDemoApi(createDemoApi());
    assert.equal((await apiFetch('/api/roster')).status, 200);
    assert.equal((await apiFetch('/api/assistant/official/api/session/prompt', { method: 'POST' })).status, 409);
    assert.equal(network, 0);
    location.search = '';
    assert.equal(isDemoRoute(), false);
    assert.deepEqual(await (await apiFetch('/api/account/profile', { method: 'PUT' })).json(), { teacher: true });
    assert.equal(network, 1);
    location.pathname = '/reset-password'; location.search = '?demo=1';
    assert.equal(isDemoRoute(), false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
