'use client';

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/components/LanguageProvider';

/** Email links are GET requests, often prefetched by security scanners.
 * Render a harmless page on GET, then verify the one-time token by POST
 * once the actual browser has loaded the application.
 */
export default function EmailConfirmation() {
  const { lang } = useLanguage();
  const en = lang === 'en';
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const token_hash = params.get('token_hash');
    const type = params.get('type');

    // Remove single-use credentials from address bar and browser history.
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (!token_hash || (type !== 'email' && type !== 'recovery')) {
      setFailed(true);
      return;
    }

    async function confirm() {
      try {
        const response = await fetch('/api/auth/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token_hash, type }),
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const result = (await response.json()) as { next?: unknown };
        if (!response.ok || (result.next !== '/auth/verified' && result.next !== '/auth/reset')) {
          throw new Error('Email verification failed');
        }
        window.location.replace(result.next);
      } catch {
        setFailed(true);
      }
    }
    void confirm();
  }, []);

  return <main className="center-screen">
    <div className="mini-card" role="status" aria-live="polite">
      <h1>{en ? 'Starflow · Email verification' : 'Starflow · 邮箱验证'}</h1>
      {failed ? <>
        <p>{en
          ? 'The confirmation link has expired, has already been used, or could not be verified. Try signing in if your email was already confirmed.'
          : '验证链接已失效、被使用过或暂时无法验证。若邮箱已确认，可直接登录；否则请重新获取验证邮件。'}</p>
        <a href="/">{en ? 'Back to sign in' : '返回登录'}</a>
      </> : <p>{en ? 'Verifying your email securely…' : '正在安全验证邮箱，请稍候…'}</p>}
    </div>
  </main>;
}
