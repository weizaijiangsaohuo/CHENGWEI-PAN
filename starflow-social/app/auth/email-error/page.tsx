'use client';

import { useLanguage } from '@/components/LanguageProvider';

export default function EmailLinkError() {
  const { lang } = useLanguage();
  const en = lang === 'en';
  return <main className="center-screen">
    <div className="mini-card" role="alert">
      <h1>{en ? 'Email link unavailable' : '邮箱验证链接无法使用'}</h1>
      <p>{en
        ? 'This link may have expired or already been used. If you have already verified your email, sign in normally. Otherwise, request a new email.'
        : '验证链接可能已经过期或使用过。如果邮箱已经验证成功，可以直接登录；否则请重新获取验证邮件。'}</p>
      <a href="/">{en ? 'Return to Starflow' : '返回 Starflow 登录'}</a>
    </div>
  </main>;
}
