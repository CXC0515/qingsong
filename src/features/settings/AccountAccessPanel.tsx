/** @license SPDX-License-Identifier: Apache-2.0 */

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, RefreshCw, UserPlus, XCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthGate';
import { apiFetch } from '../../services/apiClient';

interface Invitation { id: string; email: string; displayName: string; status: string; expiresAt: string }
interface Account { id: string; email: string; name: string; role: string; status: string }
interface AccountList { invitations: Invitation[]; accounts: Account[] }
interface IssuedLink { label: string; url: string; expires: string }

const fieldClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-900';
const actionClass = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-zinc-700 dark:text-slate-200 dark:hover:bg-zinc-800';

export default function AccountAccessPanel() {
  const { role } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [issuedLink, setIssuedLink] = useState<IssuedLink | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [confirmAction, setConfirmAction] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/admin/accounts');
      if (!response.ok) throw new Error('ACCOUNT_LIST_FAILED');
      const body = await response.json() as AccountList;
      setInvitations(body.invitations);
      setAccounts(body.accounts);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (role === 'owner') void load(); }, [load, role]);
  if (role !== 'owner') return null;

  const refreshAfterAction = async (successText: string) => {
    await load();
    setFeedback({ type: 'success', text: successText });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusyAction('create');
    setFeedback(null);
    try {
      const response = await apiFetch('/api/admin/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, displayName }) });
      if (!response.ok) throw new Error('INVITATION_FAILED');
      const body = await response.json() as { invitation: { url: string } };
      setIssuedLink({ label: `${displayName} · ${email}`, url: body.invitation.url, expires: '72 小时' });
      setEmail('');
      setDisplayName('');
      await refreshAfterAction('邀请已创建。请复制链接并自行发送，系统没有自动发送邮件。');
    } catch {
      setFeedback({ type: 'error', text: '邀请未创建。请检查邮箱是否已注册或存在待使用邀请，然后重试。' });
    } finally {
      setBusyAction('');
    }
  };

  const revoke = async (invitation: Invitation) => {
    setBusyAction(`revoke:${invitation.id}`);
    setFeedback(null);
    try {
      const response = await apiFetch(`/api/admin/invitations/${encodeURIComponent(invitation.id)}/revoke`, { method: 'POST' });
      if (!response.ok) throw new Error('REVOKE_FAILED');
      setIssuedLink(null);
      setConfirmAction('');
      await refreshAfterAction(`${invitation.email} 的邀请已撤销，原链接不能再使用。`);
    } catch {
      setFeedback({ type: 'error', text: `${invitation.email} 的邀请未撤销，原状态仍有效。请刷新列表后重试。` });
    } finally {
      setBusyAction('');
    }
  };

  const createReset = async (account: Account) => {
    setBusyAction(`reset:${account.id}`);
    setFeedback(null);
    try {
      const response = await apiFetch(`/api/admin/accounts/${encodeURIComponent(account.id)}/password-reset`, { method: 'POST' });
      if (!response.ok) throw new Error('RESET_FAILED');
      const body = await response.json() as { resetUrl: string };
      setIssuedLink({ label: `${account.name} · ${account.email}`, url: body.resetUrl, expires: '30 分钟' });
      setConfirmAction('');
      setFeedback({ type: 'success', text: '重置链接已生成。请核对收件人并自行发送，系统没有自动发送邮件。' });
    } catch {
      setFeedback({ type: 'error', text: `${account.email} 的重置链接未生成，账号密码没有改变。请稍后重试。` });
    } finally {
      setBusyAction('');
    }
  };

  const copyLink = async () => {
    if (!issuedLink) return;
    try {
      await navigator.clipboard.writeText(issuedLink.url);
      setFeedback({ type: 'success', text: '链接已复制。请只发送给对应教师。' });
    } catch {
      setFeedback({ type: 'error', text: '浏览器未允许复制。链接仍显示在下方，可以手动选择并复制。' });
    }
  };

  const pendingInvitations = invitations.filter(item => item.status === 'pending' && Date.parse(item.expiresAt) > Date.now());
  const otherInvitations = invitations.filter(item => item.status !== 'pending' || Date.parse(item.expiresAt) <= Date.now());

  return <div className="space-y-6">
    {feedback && <p role="status" aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm ${feedback.type === 'error' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'}`}>{feedback.text}</p>}
    {issuedLink && <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20" aria-label="新生成的链接">
      <h2 className="text-sm font-bold">新生成的链接 · {issuedLink.expires}有效</h2>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">仅发送给 {issuedLink.label}。离开此页面后链接不再显示。</p>
      <p className="mt-3 break-all rounded-lg bg-white p-3 text-xs text-slate-700 dark:bg-zinc-900 dark:text-slate-200">{issuedLink.url}</p>
      <button type="button" onClick={() => void copyLink()} className={`${actionClass} mt-3 bg-white dark:bg-zinc-900`}><Copy className="h-4 w-4" />复制链接</button>
    </section>}

    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4"><h2 className="text-lg font-black">创建教师邀请</h2><p className="mt-1 text-sm text-slate-500">邀请仅可使用一次，72 小时后过期。受邀教师会获得独立工作区。</p></div>
      <form onSubmit={event => void submit(event)} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-bold text-slate-600 dark:text-slate-300">教师邮箱<input required type="email" maxLength={320} value={email} onChange={event => setEmail(event.target.value)} className={'qs-field-input '+(`${fieldClass} mt-1.5`)} /></label>
        <label className="text-xs font-bold text-slate-600 dark:text-slate-300">教师称呼<input required maxLength={80} value={displayName} onChange={event => setDisplayName(event.target.value)} className={'qs-field-input '+(`${fieldClass} mt-1.5`)} /></label>
        <button disabled={Boolean(busyAction)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50"><UserPlus className="h-4 w-4" />{busyAction === 'create' ? '创建中…' : '创建邀请'}</button>
      </form>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">账号</h2><p className="mt-1 text-sm text-slate-500">可查看状态并为当前账号生成一次性密码重置链接。</p></div><button type="button" onClick={() => void load()} disabled={loading} className={actionClass}><RefreshCw className="h-4 w-4" />刷新</button></div>
      {loading ? <p role="status" className="py-6 text-sm text-slate-500">正在加载账号与邀请…</p> : loadError ? <p role="alert" className="py-6 text-sm text-red-700">账号列表暂时无法加载，数据没有改变。请点击刷新重试。</p> : accounts.length === 0 ? <p className="py-6 text-sm text-slate-500">暂无账号。</p> : <div className="space-y-2">{accounts.map(account => <div key={account.id} className="rounded-xl border border-slate-200 p-3 dark:border-zinc-700">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><strong className="block break-words text-sm">{account.name}</strong><span className="block break-all text-xs text-slate-500">{account.email}</span><span className="mt-1 block text-xs text-slate-500">{account.role === 'owner' ? '管理员' : '教师'} · {account.status === 'active' ? '正常' : account.status}</span></div><button type="button" onClick={() => setConfirmAction(`reset:${account.id}`)} disabled={Boolean(busyAction)} className={actionClass}><KeyRound className="h-4 w-4" />生成重置链接</button></div>
        {confirmAction === `reset:${account.id}` && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><p>确认为 {account.email} 生成重置链接？有效期 30 分钟，需由你自行发送。</p><div className="mt-3 flex gap-2"><button type="button" disabled={Boolean(busyAction)} onClick={() => void createReset(account)} className="min-h-11 rounded-lg bg-amber-700 px-3 font-bold text-white disabled:opacity-50">确认生成</button><button type="button" onClick={() => setConfirmAction('')} className={actionClass}>取消</button></div></div>}
      </div>)}</div>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-black">待使用邀请</h2>
      {loading ? <p className="py-6 text-sm text-slate-500">正在加载…</p> : loadError ? <p className="py-6 text-sm text-red-700">邀请列表暂时无法加载，请刷新重试。</p> : pendingInvitations.length === 0 ? <p className="py-6 text-sm text-slate-500">没有待使用邀请。</p> : <div className="mt-4 space-y-2">{pendingInvitations.map(invitation => <div key={invitation.id} className="rounded-xl border border-slate-200 p-3 dark:border-zinc-700"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><strong className="block text-sm">{invitation.displayName}</strong><span className="block break-all text-xs text-slate-500">{invitation.email}</span><span className="mt-1 block text-xs text-slate-500">{new Date(invitation.expiresAt).toLocaleString()} 到期</span></div><button type="button" disabled={Boolean(busyAction)} onClick={() => setConfirmAction(`revoke:${invitation.id}`)} className={actionClass}><XCircle className="h-4 w-4" />撤销邀请</button></div>{confirmAction === `revoke:${invitation.id}` && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><p>撤销发给 {invitation.email} 的邀请后，原链接将不能使用。</p><div className="mt-3 flex gap-2"><button type="button" disabled={Boolean(busyAction)} onClick={() => void revoke(invitation)} className="min-h-11 rounded-lg bg-red-700 px-3 font-bold text-white disabled:opacity-50">确认撤销</button><button type="button" onClick={() => setConfirmAction('')} className={actionClass}>取消</button></div></div>}</div>)}</div>}
      {!loading && !loadError && otherInvitations.length > 0 && <details className="mt-4 border-t border-slate-200 pt-3 dark:border-zinc-700"><summary className="cursor-pointer text-sm font-semibold text-slate-600 dark:text-slate-300">历史邀请（最近 {otherInvitations.length} 条）</summary><div className="mt-3 space-y-2">{otherInvitations.map(invitation => <div key={invitation.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-zinc-800"><span className="break-all">{invitation.displayName} · {invitation.email}</span><span className="text-slate-500">{invitation.status === 'consumed' ? '已注册' : invitation.status === 'revoked' ? '已撤销' : '已过期'}</span></div>)}</div></details>}
    </section>
  </div>;
}
