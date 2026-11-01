/** Removable visitor feature: the only shared hook, with no production state. */
export const demoCredentials = { email: 'demo@qingsong.test', password: 'demo@qingsong.test' };
// Build with VITE_VISITOR_DEMO=false to remove the entry without a server change.
export const demoEnabled = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_VISITOR_DEMO !== 'false';
export const isDemoRoute = () => demoEnabled && typeof window !== 'undefined'
  && window.location.pathname === '/' && new URLSearchParams(window.location.search).get('demo') === '1';
let handler: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | undefined;
export function installDemoApi(next: NonNullable<typeof handler>) { handler = next; }
export function demoRequest(input: RequestInfo | URL, init?: RequestInit) {
  if (!isDemoRoute()) return undefined;
  // Never fall back to the real API, including while the demo is loading.
  return handler ? handler(input, init) : Promise.resolve(Response.json({
    code: '演示正在准备，本次操作未保存，请稍后重试。', message: '演示正在准备，本次操作未保存，请稍后重试。'
  }, { status: 503 }));
}
