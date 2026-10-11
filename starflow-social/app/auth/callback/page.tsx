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
          // Direct TokenHash links support email clients that open in a different browser.
          // Only accept the email signup template here; recovery has its own route.
          if (params.get('type') !== 'email') {
            throw new Error('Invalid email verification link type.');
          }
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
        const detail = error instanceof Error ? error.message : 'Verification failed. Please try again.';
        // Older default email links may carry a PKCE code that cannot cross browsers.
        // The long-term fix is a TokenHash-based Supabase confirmation email template.
        setMessage(detail.includes('PKCE code verifier')
          ? (lang === 'en'
            ? 'Your email may already be verified, but this link was opened in a different browser. Return to Starflow and sign in with your email and password. If it is not verified, request a fresh confirmation email.'
            : '邮箱可能已经验证成功，但此链接是在另一个浏览器中打开的，无法完成登录。请返回 Starflow，用刚才的邮箱和密码登录；如果仍未验证，请重新获取确认邮件。')
          : detail);
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
