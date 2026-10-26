/** @license SPDX-License-Identifier: Apache-2.0 */

import { createContext, FormEvent, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { GraduationCap, LoaderCircle, LogIn, UserPlus } from 'lucide-react';
import type { TeacherProfile } from '../../domain/types';
import { apiFetch } from '../../services/apiClient';
import { authClient } from '../../services/authClient';

export interface AccountState {
  user: { id: string; email: string; name: string };
  role: 'owner' | 'teacher';
  profile: TeacherProfile;
}
interface AuthState extends AccountState {
  refreshAccount: () => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthState | null>(null);
export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AUTH_CONTEXT_REQUIRED');
  return value;
};

const readCode = async (response: Response) => (await response.json().catch(() => ({})) as { code?: string }).code;

export default function AuthGate({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const params = new URLSearchParams(window.location.search);
  const registrationToken = params.get('token') ?? '';
  const isPasswordReset = window.location.pathname === '/reset-password';
  const resetToken = isPasswordReset ? registrationToken : '';
  const invitedEmail = params.get('email') ?? '';
  const [email, setEmail] = useState(invitedEmail);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refreshAccount = async () => {
    const response = await apiFetch('/api/account');
    if (!response.ok) throw new Error('AUTHENTICATION_REQUIRED');
    setAccount(await response.json() as AccountState);
  };
  useEffect(() => {
    refreshAccount().catch(() => setAccount(null)).finally(() => setLoading(false));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      if (isPasswordReset) {
        const result = await authClient.resetPassword({ newPassword: password, token: resetToken });
        if (result.error) throw new Error('RESET_FAILED');
        window.history.replaceState({}, '', '/');
        setPassword('');
        setError('密码已更新，请使用新密码登录');
        return;
      }
      if (registrationToken) {
        const response = await apiFetch('/api/register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: registrationToken, email, name, password }),
        });
        if (!response.ok) throw new Error((await readCode(response)) ?? 'REGISTRATION_FAILED');
        window.history.replaceState({}, '', '/');
        setName('');
        setPassword('');
        setNotice('注册成功，请使用新账户登录');
        return;
      }
      const result = await authClient.signIn.email({ email, password });
      if (result.error) throw new Error('SIGN_IN_FAILED');
      window.history.replaceState({}, '', '/');
      await refreshAccount();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'SIGN_IN_FAILED';
      setError(code === 'INVALID_OR_EXPIRED_INVITATION' ? '邀请链接无效或已过期' : isPasswordReset ? '重置链接无效或已过期' : registrationToken ? '注册失败，请检查邀请邮箱和密码要求' : '邮箱或密码不正确');
    } finally { setSubmitting(false); }
  };

  const value = useMemo<AuthState | null>(() => account ? ({ ...account, refreshAccount, signOut: async () => { await authClient.signOut({}); setAccount(null); } }) : null, [account]);
  if (loading) return <div className="min-h-dvh grid place-items-center bg-slate-50"><LoaderCircle className="h-7 w-7 animate-spin text-emerald-700" aria-label="正在载入" /></div>;
  if (value) return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_left,#d7e6db_0,transparent_38%),linear-gradient(145deg,#f8faf8,#eef2f0)] px-4 py-8 grid place-items-center">
      <section className="w-full max-w-md rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-2xl shadow-emerald-950/10 backdrop-blur sm:p-8" aria-labelledby="auth-title">
        <div className="mb-7 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-700 text-white"><GraduationCap /></span><div><p className="text-xs font-bold tracking-widest text-emerald-700">青松教师</p><h1 id="auth-title" className="text-2xl font-black text-slate-900">{isPasswordReset ? '设置新密码' : registrationToken ? '接受邀请并注册' : '欢迎回来'}</h1></div></div>
        <p className="mb-5 text-sm leading-6 text-slate-500">{isPasswordReset ? '重置链接仅可使用一次，并在 30 分钟后失效。' : registrationToken ? '每位教师拥有独立工作区。请使用邀请指定的邮箱完成注册。' : '登录后访问你的班级、资料、OCR 结果和批改记录。'}</p>
        <form className="space-y-4" onSubmit={submit}>
          {registrationToken && !isPasswordReset && <label className="block text-sm font-semibold text-slate-700">姓名<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} className="qs-field-input mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-emerald-600" autoComplete="name" /></label>}
          {!isPasswordReset && <label className="block text-sm font-semibold text-slate-700">邮箱<input required type="email" value={email} readOnly={Boolean(invitedEmail)} onChange={event => setEmail(event.target.value)} className="qs-field-input mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-emerald-600 read-only:bg-slate-50" autoComplete="email" /></label>}
          <label className="block text-sm font-semibold text-slate-700">密码<input required type="password" minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} className="qs-field-input mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-emerald-600" autoComplete={registrationToken ? 'new-password' : 'current-password'} /><span className="mt-1 block text-xs font-normal text-slate-400">至少 12 个字符</span></label>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
          <button disabled={submitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : registrationToken && !isPasswordReset ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}{isPasswordReset ? '保存新密码' : registrationToken ? '创建独立工作区' : '登录'}</button>
        </form>
        {!registrationToken && !isPasswordReset && <p className="mt-5 text-center text-xs text-slate-400">目前仅接受管理员邀请注册</p>}
      </section>
    </main>
  );
}
