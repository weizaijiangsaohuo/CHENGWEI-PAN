'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/supabase';
import {useLanguage} from '@/components/LanguageProvider';
export default function AuthCallback(){
  const router = useRouter();
  const {lang}=useLanguage();
  const [message,setMessage] = useState('');
  useEffect(()=>{(async()=>{
    try {
      const code = new URLSearchParams(window.location.search).get('code');
      if (!code) throw new Error('Missing OAuth authorization code');
      const {error} = await db().auth.exchangeCodeForSession(code);
      if (error) throw error;
      router.replace('/');router.refresh();
    } catch(e) {setMessage(e instanceof Error? e.message : 'Login failed. Please retry');}
  })();},[router]);
  return <main className="center-screen"><div className="mini-card"><h2>{lang==='en'?'Starflow · Authentication':'Starflow · 身份验证'}</h2><p>{message || (lang==='en'?'Verifying your login…':'正在验证登录凭据…')}</p><a href="/">{lang==='en'?'Back to home':'返回首页'}</a></div></main>;
}
