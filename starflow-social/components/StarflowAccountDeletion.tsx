'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { db, hasConfig } from '@/lib/supabase';

/** Only the logged-in account owner can request deletion. Never expose admin deletion of other profiles. */
export function StarflowAccountDeletion() {
  const pathname = usePathname();
  const isSettings = pathname === '/settings' || pathname === '/settings/';
  const [host, setHost] = useState<Element | null>(null);
  const [dialog, setDialog] = useState(false);
  const [handle, setHandle] = useState('');
  const [typed, setTyped] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSettings) { setHost(null); setDialog(false); return; }
    const locate = () => {
      const next = document.querySelector('.app-frame .settings-content');
      setHost(current => current === next ? current : next);
    };
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    locate();
    return () => observer.disconnect();
  }, [isSettings]);

  useEffect(() => {
    if (!host || !hasConfig()) return;
    let active = true;
    db().auth.getUser().then(async ({ data, error: authError }) => {
      if (!active || authError || !data.user) return;
      const { data: profile } = await db().from('profiles')
        .select('handle').eq('id', data.user.id).maybeSingle();
      if (active) setHandle(profile?.handle ?? '当前账号');
    }).catch(() => { /* Delete endpoint will verify identity itself. */ });
    return () => { active = false; };
  }, [host]);

  useEffect(() => {
    if (!dialog) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [dialog]);

  const close = () => {
    if (pending) return;
    setDialog(false); setTyped(''); setUnderstood(false); setError('');
  };

  async function removeOwnAccount() {
    if (pending || typed !== '永久删除我的账号' || !understood || !hasConfig()) return;
    setPending(true); setError('');
    try {
      // The Edge Function authenticates the bearer token and deletes ONLY that JWT's own user ID.
      const { data, error: requestError } = await db().functions.invoke('delete-own-account', {
        body: { confirmation: 'PERMANENT_DELETE_MY_ACCOUNT', understood: true },
      });
      if (requestError) throw requestError;
      if (data?.deleted !== true) throw new Error(data?.error || '注销未完成，请稍后再试。');
      try { await db().auth.signOut({ scope: 'local' }); } catch { /* Invalidated user token is expected after deletion. */ }
      window.location.replace('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '注销失败，请稍后再试。');
      setPending(false);
    }
  }

  if (!host || !hasConfig()) return null;
  return <>
    {createPortal(<section className="sf-account-danger" aria-label="账号注销">
      <h3>账号管理</h3>
      <p>需要永久注销账号时，可以在这里申请。普通用户只能删除自己当前登录的账号，不能删除其他人。</p>
      <button type="button" className="sf-account-danger-open" onClick={() => { setDialog(true); setError(''); }}>
        <Trash2 size={17}/> 永久注销我的账号
      </button>
    </section>, host)}
    {dialog && createPortal(<div className="sf-account-delete-overlay" role="presentation">
      <div className="sf-account-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="sf-delete-title">
        <div className="sf-account-delete-header">
          <h2 id="sf-delete-title"><AlertTriangle size={22}/> 永久注销账号</h2>
          <button type="button" aria-label="取消注销" disabled={pending} onClick={close}><X size={21}/></button>
        </div>
        <div className="sf-account-delete-body">
          <p>即将注销 <strong>@{handle}</strong>。此操作不可撤销。</p>
          <p>注销后将删除当前账号的登录凭据、个人资料、帖子、关注关系及相关数据；已有公开分享链接可能失效。今后可以重新注册，但历史内容无法恢复。</p>
          <label className="sf-account-delete-check"><input type="checkbox" checked={understood} disabled={pending} onChange={event => setUnderstood(event.target.checked)}/><span>我理解此操作会永久删除我的账号和内容。</span></label>
          <label className="sf-account-delete-type">为确认操作，请输入：<strong>永久删除我的账号</strong>
            <input type="text" value={typed} disabled={pending} onChange={event => setTyped(event.target.value)} placeholder="请输入上方确认文字" autoComplete="off"/>
          </label>
          {error && <p className="sf-account-delete-error" role="alert">{error}</p>}
        </div>
        <div className="sf-account-delete-actions">
          <button type="button" disabled={pending} onClick={close}>取消</button>
          <button type="button" className="sf-account-delete-confirm" disabled={pending || !understood || typed !== '永久删除我的账号'} onClick={() => void removeOwnAccount()}>
            {pending ? '正在注销…' : '确认永久注销'}
          </button>
        </div>
      </div>
    </div>, document.body)}
  </>;
}
