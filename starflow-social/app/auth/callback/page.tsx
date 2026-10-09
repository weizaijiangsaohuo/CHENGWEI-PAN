'use client';

import { useEffect, useRef, useState } from 'react';
import { db } from '@/lib/supabase';
import { useLanguage } from '@/components/LanguageProvider';

export default function AuthCallback() {
  const { lang } = useLanguage();
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    // React Strict Mode may run effects twice in development.
    if (started.current) return;
    started.current = true;

    async function verify() {
      try {
        const params = new URLSearchParams(window.location.search);
        const tokenHash = params.get('token_hash');
        const code = params.get('code');
        const supabase = db();

        if (tokenHash) {
          // Verify email independently of the browser that started signup.
          // The email template must link here using {{ .TokenHash }}.
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'email',
          });
          if (error) throw error;
        } else if (code) {
          // Keep supporting existing OAuth-style authorization redirects.
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          throw new Error('Missing confirmation token. Please request a new verification email.');
        }

        // Reload so the app reads the newly stored session.
        window.location.replace('/');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Verification failed. Please try again.');
      }
    }

    void verify();
  }, []);

  return (
    <main className="center-screen">
      <div className="mini-card">
        <h2>{lang === 'en' ? 'Starflow · Authentication' : 'Starflow · 身份验证'}</h2>
        <p>
          {message || (lang === 'en'
            ? 'Confirming your email or signing you in…'
            : '正在验证邮箱或登录凭据…')}
        </p>
        <a href="/">{lang === 'en' ? 'Back to home' : '返回首页'}</a>
      </div>
    </main>
  );
}
