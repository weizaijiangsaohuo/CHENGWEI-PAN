'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/supabase';
import { useLanguage } from '@/components/LanguageProvider';
import { isEnglishLocale } from '@/lib/i18n';

export default function EmailVerified() {
  const { lang } = useLanguage();
  const en = isEnglishLocale(lang);
  const router = useRouter();
  const [state, setState] = useState<'checking'|'ready'|'unavailable'>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const { data, error } = await db().auth.getUser();
        if (!active) return;
        if (error || !data.user || !data.user.email_confirmed_at) {
          setState('unavailable');
          return;
        }
        setState('ready');
        router.replace('/');
      } catch {
        if (active) setState('unavailable');
      }
    }
    void check();
    return () => { active = false; };
  }, [router, attempt]);

  return <main className="center-screen">
    <div className="mini-card" role="status" aria-live="polite">
      <h1>{state === 'ready' ? (en ? 'Signed in' : '登录成功') : (en ? 'Account confirmation' : '账号确认')}</h1>
      {state === 'checking' ? <p>{en ? 'Checking your sign-in session…' : '正在确认登录状态…'}</p> :
       state === 'ready' ? <p>{en ? 'Taking you to Starflow…' : '正在进入星流…'}</p> :
       <p>{en ? 'Your sign-in session could not be confirmed. Retry or return to sign in.' : '暂时无法确认登录状态，可重试或返回网站登录。'}</p>}
      {state === 'unavailable' && <button type="button" onClick={() => { setState('checking'); setAttempt(n => n + 1); }}>{en ? 'Retry' : '重试'}</button>}
      <Link href="/">{en ? 'Return to Starflow' : '返回星流'}</Link>
    </div>
  </main>;
}
