'use client';
import { useEffect, useState } from 'react';
import { db, hasConfig } from '@/lib/supabase';
import { Brand } from '@/components/Brand';
import {useLanguage,LanguageSwitch} from '@/components/LanguageProvider';
export default function ResetPassword(){
  const {lang}=useLanguage();const en=lang==='en';
  const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');
  const [ready,setReady]=useState(false);const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [finished,setFinished]=useState(false);
  useEffect(()=>{
    if(!hasConfig()){setMessage((en?'Configure Supabase to reset a password.':'需要先配置 Supabase 才能使用密码找回。'));return;}
    let active=true;
    const supabase=db();
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event)=>{
      if(active && (event==='PASSWORD_RECOVERY'||event==='SIGNED_IN')){setReady(true);setMessage('');}
    });
    (async()=>{
      try{
        const params=new URLSearchParams(window.location.search);
        const code=params.get('code');
        if(code){const {error}=await supabase.auth.exchangeCodeForSession(code);if(error)throw error;}
        const {data,error}=await supabase.auth.getSession();
        if(error)throw error;
        if(!active)return;
        if(data.session){setReady(true);setMessage('');}
        else setMessage((en?'Please open a valid reset link from your email.':'请使用邮箱中收到的有效密码重置链接访问本页。'));
      }catch(err){if(active)setMessage(err instanceof Error?err.message:(en?'Invalid recovery link':'验证链接失败'));}
    })();
    return()=>{active=false;subscription.unsubscribe()};
  },[]);
  async function submit(e:React.FormEvent){
    e.preventDefault();if(password.length<12){setMessage((en?'Password must be at least 12 characters':'密码至少需要 12 位字符'));return;}
    if(password!==confirm){setMessage((en?'Passwords do not match':'两次输入的密码不一致'));return;}
    setBusy(true);
    const {error}=await db().auth.updateUser({password});
    setBusy(false);
    if(error)setMessage(error.message);
    else{setMessage((en?'Password updated. You can return to the home page.':'密码修改成功，可以返回首页继续使用。'));setReady(false);setFinished(true);setPassword('');setConfirm('');}
  }
  return <main className="center-screen"><div className="mini-card"><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><Brand/><LanguageSwitch/></div><h1>{en?'Reset password':'重设密码'}</h1><p className="muted">{en?'Set a new, secure password for your account.':'为账户设置新的安全密码。'}</p>
    {ready&&!finished?<form className="stack" onSubmit={submit}>
      <input className="text-input" type="password" autoComplete="new-password" placeholder={en?'New password (12+ characters)':'新密码（至少 12 位)'} minLength={12} value={password} onChange={e=>setPassword(e.target.value)} required/>
      <input className="text-input" type="password" autoComplete="new-password" placeholder={en?'Confirm password':'再次输入新密码'} minLength={12} value={confirm} onChange={e=>setConfirm(e.target.value)} required/>
      <button className="btn btn-primary" disabled={busy}>{busy?(en?'Saving…':'正在保存…'):(en?'Update password':'确认修改密码')}</button>
    </form>:null}
    <p aria-live="polite">{message||(en?'Verifying reset link…':'正在验证密码重置链接…')}</p><a href="/">{en?'Back to home':'返回首页'}</a></div></main>;
}
