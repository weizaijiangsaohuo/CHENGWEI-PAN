'use client';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Check, Eye, EyeOff, Globe2, Lock, Mail, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react';
import { Brand } from './Brand';
import { LanguageSwitch, useLanguage } from './LanguageProvider';
import { db, hasConfig } from '@/lib/supabase';

type TurnstileApi = {render: (el:HTMLElement, opts: Record<string, unknown>)=>string; remove:(id:string)=>void; reset:(id:string)=>void};
declare global { interface Window { turnstile?: TurnstileApi } }
function HumanCheck({onToken,revision}:{onToken:(token:string)=>void;revision:number}){
  const {t}=useLanguage();
  const sitekey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref=useRef<HTMLDivElement>(null);
  const widget=useRef<string|null>(null);
  useEffect(()=>{
    if(!sitekey)return;
    let active=true;
    const render=()=>{
      if(!active||!ref.current||!window.turnstile||widget.current)return;
      widget.current=window.turnstile.render(ref.current,{
        sitekey,theme:'light',callback:(token:string)=>onToken(token),
        'expired-callback':()=>onToken(''),'error-callback':()=>onToken('')
      });
    };
    const existing=document.getElementById('sf-turnstile-api') as HTMLScriptElement|null;
    if(existing){if(window.turnstile)render();else existing.addEventListener('load',render);}
    else {const script=document.createElement('script');script.id='sf-turnstile-api';script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=render;document.head.appendChild(script);}
    return()=>{active=false;existing?.removeEventListener('load',render);if(widget.current && window.turnstile){window.turnstile.remove(widget.current);widget.current=null;}};
  },[sitekey,onToken]);
  useEffect(()=>{if(widget.current && window.turnstile){window.turnstile.reset(widget.current);onToken('');}},[revision,onToken]);
  if(!sitekey)return <div className="captcha-alert">{t('captchaNotReady')}</div>;
  return <div className="captcha-container" ref={ref}/>;
}
export function AuthPortal(){
  const {t}=useLanguage();
  const [mode,setMode]=useState<'login'|'signup'|'forgot'>('signup');
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [display,setDisplay]=useState('');const [visible,setVisible]=useState(false);
  const [captcha,setCaptcha]=useState('');const [revision,setRevision]=useState(0);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [success,setSuccess]=useState('');
  const configured=hasConfig();const captchaEnabled=Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  function change(next:'signup'|'login'|'forgot'){setMode(next);setError('');setSuccess('');setRevision(x=>x+1);}
  async function submit(e:FormEvent){
    e.preventDefault();setError('');setSuccess('');
    if(!configured){setError(t('noKeys'));return;}
    if(!captchaEnabled){setError(t('noCaptcha'));return;}
    if(!captcha){setError(t('finishCaptcha'));return;}
    if(mode!=='forgot' && password.length < 12 && mode==='signup'){setError(t('pwdMinimum'));return;}
    if(mode==='signup' && (!display.trim()||display.trim().length>60)){setError(t('nicknameMinimum'));return;}
    setBusy(true);
    try {
      const supabase=db();
      if(mode==='signup'){
        const {data,error}=await supabase.auth.signUp({email:email.trim(),password,
          options:{data:{display_name:display.trim()},captchaToken:captcha,emailRedirectTo:`${location.origin}/auth/callback`}});
        if(error)throw error;
        setSuccess(data.session?t('signupDone'):t('signupConfirm'));
        if(data.session)location.assign('/');
      } else if(mode==='login'){
        const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password,options:{captchaToken:captcha}});
        if(error)throw error;
        location.assign('/');
      } else {
        const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${location.origin}/auth/reset`,captchaToken:captcha});
        if(error)throw error;
        setSuccess(t('resetConfirm'));
      }
    } catch(e) {setError(e instanceof Error?e.message:t('authFailure'));}
    finally{setBusy(false);setCaptcha('');setRevision(x=>x+1);}
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
          <HumanCheck onToken={setCaptcha} revision={revision}/>
          {error&&<div className="form-error" role="alert">{error}</div>}{success&&<div className="form-success" role="status"><Check size={16}/>{success}</div>}
          <button className="btn btn-primary auth-submit" disabled={busy||!configured}>{busy?t('processing'):t(mode==='signup'?'create':mode==='login'?'loginButton':'sendReset')}<ArrowRight size={18}/></button>
        </form>
        <div className="auth-switch">{mode==='signup'?<>{t('haveAccount')} <button onClick={()=>change('login')}>{t('signIn')}</button></>:mode==='login'?<>{t('newAccount')} <button onClick={()=>change('signup')}>{t('signUp')}</button></>:<>{t('rememberPassword')} <button onClick={()=>change('login')}>{t('backLogin')}</button></>}
          {mode==='login'&&<button className="forgot-link" onClick={()=>change('forgot')}>{t('forgotLink')}</button>}</div>
        {!configured&&<p className="configuration-note">{t('configNeeded')}</p>}
        <p className="legal-text">{t('legalLead')} <a href="/terms">{t('terms')}</a> {t('and')} <a href="/privacy">{t('privacy')}</a>{t('legalTail')}</p>
      </div><div className="bottom-credit"><Globe2 size={14}/>{t('authFooter')}</div></section>
    </div>
  </div>;
}
