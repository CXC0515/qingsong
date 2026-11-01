import { useEffect, useState, type ReactNode } from 'react';
import type { AuthState } from '../features/auth/AuthGate';
import { createDemoApi } from './mockApi';
import { demoCredentials, installDemoApi } from './entry';
import './demo.css';

const userId = 'qingsong-visitor-demo';
function clearDemoStorage() {
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) if (key.includes(userId)) storage.removeItem(key);
  }
}
export default function VisitorSession({ children }: { children: (auth: AuthState) => ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    clearDemoStorage();
    // Defense in depth: even an accidentally introduced direct fetch or iframe
    // cannot connect to a real business / model service in this document.
    const policy = document.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = `connect-src data: blob:; frame-src data: blob:; form-action 'none'; img-src ${window.location.origin}/assets/ data: blob:`;
    document.head.append(policy);
    installDemoApi(createDemoApi());
    setReady(true);
    return () => { policy.remove(); };
  }, []);
  if (!ready) return <div role="status" className="grid min-h-dvh place-items-center">正在准备模拟数据…</div>;
  const auth: AuthState = {
    user: { id: userId, email: demoCredentials.email, name: '体验老师' }, role: 'teacher',
    profile: { nickname: '体验老师', realName: '体验老师', schoolName: '青松示范学校（虚构）', title: '教师' },
    refreshAccount: async () => {},
    signOut: async () => { clearDemoStorage(); window.location.replace('/'); }
  };
  return <div className="qs-demo-session">
    <aside className="qs-demo-banner" aria-label="访客演示说明">
      <p><strong>访客演示</strong><span> · 模拟数据与 AI 示例，刷新重置</span></p>
      <div><button type="button" onClick={() => { clearDemoStorage(); window.location.assign('/?demo=1'); }}>重置体验</button><button type="button" onClick={() => void auth.signOut()}>退出</button></div>
    </aside>
    {children(auth)}
  </div>;
}
