'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/components/LanguageProvider';

export default function EmailVerified() {
  const { lang } = useLanguage();
  const en = lang === 'en';

  useEffect(() => {
    // Verification and cookie setup already succeeded in /auth/confirm.
    const timer = window.setTimeout(() => window.location.replace('/'), 1400);
    return () => window.clearTimeout(timer);
  }, []);

  return <main className="center-screen">
    <div className="mini-card" role="status" aria-live="polite">
      <h1>{en ? 'Email verified' : '邮箱验证成功'}</h1>
      <p>{en ? 'Your Starflow account is ready. Taking you to Starflow…' : '你的 Starflow 账号已验证，正在自动进入星流…'}</p>
      <a href="/">{en ? 'Enter Starflow now' : '立即进入 Starflow'}</a>
    </div>
  </main>;
}
