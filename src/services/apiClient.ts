/** @license SPDX-License-Identifier: Apache-2.0 */

import { demoRequest } from '../demo/entry';

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const apiFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const simulated = demoRequest(input, init);
  if (simulated) return simulated;
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (mutatingMethods.has(method)) headers.set('x-demo-csrf', '1');
  return fetch(input, { ...init, headers, credentials: 'same-origin' });
};
