'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Check, Eye, EyeOff, Globe2, Lock, Mail, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react';
import { Brand } from './Brand';
import { TurnstileChallenge } from './TurnstileChallenge';
import { LanguageSwitch, useLanguage } from './LanguageProvider';
import { db, hasConfig } from '@/lib/supabase';

export function AuthPortal(){
  const {t}=useLanguage();
  const [mode,setMode]=useState<'login'|'signup'|'forgot'>('signup');
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [display,setDisplay]=useState('');const [visible,setVisible]=useState(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [success,setSuccess]=useState('');
  const configured=hasConfig();
  const siteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const [captchaToken,setCaptchaToken]=useState('');
  const [captchaGeneration,setCaptchaGeneration]=useState(0);
  function resetCaptcha(){setCaptchaToken('');setCaptchaGeneration(value=>value+1);}
  function change(next:'signup'|'login'|'forgot'){setMode(next);setError('');setSuccess('');resetCaptcha();}
  async function submit(e:FormEvent){
    e.preventDefault();setError('');setSuccess('');
    if(!configured){setError(t('noKeys'));return;}
    if(mode!=='forgot' && password.length < 12 && mode==='signup'){setError(t('pwdMinimum'));return;}
    if(mode==='signup' && (!display.trim()||display.trim().length>60)){setError(t('nicknameMinimum'));return;}
    if(siteKey&&!captchaToken){setError(t('captchaRequired'));return;}
    setBusy(true);
    try {
      const supabase=db();
      if(mode==='signup'){
        const {data,error}=await supabase.auth.signUp({email:email.trim(),password,
          options:{captchaToken:captchaToken||undefined,data:{display_name:display.trim()},emailRedirectTo:`${location.origin}/auth/callback`}});
        if(error)throw error;
        setSuccess(data.session?t('signupDone'):t('signupConfirm'));
        if(data.session)location.assign('/');
      } else if(mode==='login'){
        const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password,options:{captchaToken:captchaToken||undefined}});
        if(error)throw error;
        location.assign('/');
      } else {
        const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${location.origin}/auth/reset`,captchaToken:captchaToken||undefined});
        if(error)throw error;
        setSuccess(t('resetConfirm'));
      }
    } catch(e) {setError(e instanceof Error?e.message:t('authFailure'));}
    finally{setBusy(false);resetCaptcha();}
  }
  async function oauth(){
    if(!configured){setError(t('authNotReady'));return;}
    setError('');setBusy(true);
    try{const {error}=await db().auth.signInWithOAuth({provider:'google',options:{redirectTo:`${location.origin}/auth/callback`,skipBrowserRedirect:false}});if(error)throw error;}
    catch(e){setError(e instanceof Error?e.message:t('googleFailure'));setBusy(false);}
  }
  return <div className="welcome-page sf-auth-premium">
    <div className="welcome-grid">
      <section className="welcome-story">
        <div className="sf-auth-brand"><Brand/><LanguageSwitch/></div>
        <div className="welcome-copy">
          <div className="hero-pill"><span className="dot-live"/> {t('heroBadge')}</div>
          <h1>{t('heroLineOne')}<br/><em>{t('heroLineTwo')}</em></h1>
          <p>{t('heroSub')}</p>
          <div className="preview-speech"><div className="preview-icon"><Sparkles size={23}/></div><div><strong>{t('heroSpot')}</strong><span>{t('heroSpotSub')}</span></div><ArrowRight size={18}/></div>
        </div>
        <div className="welcome-features"><span><Users size={16}/>{t('heroOne')}</span><span><ShieldCheck size={16}/>{t('heroTwo')}</span><span><Zap size={16}/>{t('heroThree')}</span></div>
      </section>
      <section className="welcome-form"><div className="auth-card">
        <div className="auth-heading"><span className="sf-auth-monogram">✦</span><h2>{t(mode==='signup'?'signup':mode==='login'?'login':'forgot')}</h2>
          <p>{t(mode==='signup'?'signupDesc':mode==='login'?'loginDesc':'forgotDesc')}</p></div>
        {mode!=='forgot'&&<div className="oauth-buttons"><button disabled={busy||process.env.NEXT_PUBLIC_GOOGLE_ENABLED!=='true'} className="oauth-btn" onClick={oauth}><span className="google-g">G</span>{t('continueGoogle')}{process.env.NEXT_PUBLIC_GOOGLE_ENABLED!=='true'&&<small>{t('googleNotReady')}</small>}</button><div className="or-divider"><span>{t('orEmail')}</span></div></div>}
        <form onSubmit={submit} className="auth-fields">
          {mode==='signup'&&<label><span>{t('nickname')}</span><div className="field-wrap"><Users size={18}/><input type="text" placeholder={t('nicknamePlace')} value={display} onChange={e=>setDisplay(e.target.value)} maxLength={60} required autoComplete="nickname"/></div></label>}
          <label><span>{t('email')}</span><div className="field-wrap"><Mail size={18}/><input type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></div></label>
          {mode!=='forgot'&&<label><span>{t('password')}</span><div className="field-wrap"><Lock size={18}/><input type={visible?'text':'password'} placeholder={mode==='signup'?t('passwordHint'):t('inputPassword')} value={password} onChange={e=>setPassword(e.target.value)} required minLength={mode==='signup'?12:1} autoComplete={mode==='signup'?'new-password':'current-password'}/><button type="button" className="show-pass" onClick={()=>setVisible(!visible)} aria-label={visible?t('hidePassword'):t('showPassword')}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>}
          {siteKey?<TurnstileChallenge key={captchaGeneration} siteKey={siteKey} onToken={setCaptchaToken} onError={()=>setError(t('captchaFailure'))}/>:<p className="captcha-alert">{t('captchaNotReady')}</p>}
          {error&&<div className="form-error" role="alert">{error}</div>}{success&&<div className="form-success" role="status"><Check size={16}/>{success}</div>}
          <button className="btn btn-primary auth-submit" disabled={busy||!configured||Boolean(siteKey&&!captchaToken)}>{busy?t('processing'):t(mode==='signup'?'create':mode==='login'?'loginButton':'sendReset')}<ArrowRight size={18}/></button>
        </form>
        <div className="auth-switch">{mode==='signup'?<>{t('haveAccount')} <button onClick={()=>change('login')}>{t('signIn')}</button></>:mode==='login'?<>{t('newAccount')} <button onClick={()=>change('signup')}>{t('signUp')}</button></>:<>{t('rememberPassword')} <button onClick={()=>change('login')}>{t('backLogin')}</button></>}
          {mode==='login'&&<button className="forgot-link" onClick={()=>change('forgot')}>{t('forgotLink')}</button>}</div>
        {!configured&&<p className="configuration-note">{t('configNeeded')}</p>}
        
<a href="/support" style={{display:'block',textAlign:'center',padding:'14px',margin:'16px 0',borderRadius:16,background:'#f3e7ff',color:'#703b87',fontWeight:700,textDecoration:'none'}}>✦ AI 客服中心 · 无需登录 →</a>

        <p className="legal-text">{t('legalLead')} <a href="/terms">{t('terms')}</a> {t('and')} <a href="/privacy">{t('privacy')}</a>{t('legalTail')}</p>
      </div><div className="bottom-credit"><Globe2 size={14}/>{t('authFooter')}</div></section>
    </div>
  </div>;
}
