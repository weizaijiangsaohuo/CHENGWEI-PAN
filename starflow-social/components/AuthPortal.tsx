'use client';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Check, Eye, EyeOff, Globe2, Lock, Mail, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react';
import { Brand } from './Brand';
import { TurnstileChallenge } from './TurnstileChallenge';
import { LanguageSwitch, useLanguage } from './LanguageProvider';
import { db, hasConfig } from '@/lib/supabase';
import { activeLoginProviders } from '@/lib/account-providers';

export function AuthPortal(){
  const {t,lang}=useLanguage();
  const [mode,setMode]=useState<'login'|'signup'|'forgot'>('signup');
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [display,setDisplay]=useState('');const [visible,setVisible]=useState(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [success,setSuccess]=useState('');
  const [pendingEmail,setPendingEmail]=useState('');
  const [resendAvailableAt,setResendAvailableAt]=useState(0);
  const [resendSeconds,setResendSeconds]=useState(0);
  useEffect(()=>{
    if(!pendingEmail)return;
    const tick=()=>setResendSeconds(Math.max(0,Math.ceil((resendAvailableAt-Date.now())/1000)));
    tick();
    const timer=window.setInterval(tick,1000);
    return()=>window.clearInterval(timer);
  },[pendingEmail,resendAvailableAt]);
  const configured=hasConfig();
  const configuredSiteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()||'';
  // Temporary preview-host-only fallback. Never use this key on production.
  // Remove this fallback before merging PR #2 into main.
  const [previewSiteKey,setPreviewSiteKey]=useState('');
  useEffect(()=>{
    if(!configuredSiteKey && window.location.hostname==='fix-auth-turnstile-check-weizai.weizai.workers.dev'){
      setPreviewSiteKey('0x4AAAAAAFTiZjZoSmGgJCg6');
    }
  },[configuredSiteKey]);
  const siteKey=configuredSiteKey||previewSiteKey;
  const [captchaToken,setCaptchaToken]=useState('');
  const captchaTokenRef=useRef('');
  const submitting=useRef(false);
  function updateCaptcha(token:string){captchaTokenRef.current=token;setCaptchaToken(token);}
  const [captchaGeneration,setCaptchaGeneration]=useState(0);
  function resetCaptcha(){updateCaptcha('');setCaptchaGeneration(value=>value+1);}
  function change(next:'signup'|'login'|'forgot'){if(submitting.current)return;setMode(next);setError('');setSuccess('');setPendingEmail('');setResendAvailableAt(0);resetCaptcha();}
  async function submit(e:FormEvent){
    e.preventDefault();if(submitting.current)return;setError('');setSuccess('');
    if(!configured){setError(t('noKeys'));return;}
    if(mode==='signup' && password.length < 6){setError(t('pwdMinimum'));return;}
    if(mode==='signup' && (!display.trim()||display.trim().length>60)){setError(t('nicknameMinimum'));return;}
    if(siteKey&&!captchaTokenRef.current){setError(t('captchaRequired'));return;}
    submitting.current=true;
    const requestCaptchaToken=captchaTokenRef.current||undefined;
    setBusy(true);
    try {
      const supabase=db();
      if(mode==='signup'){
        const {data,error}=await supabase.auth.signUp({email:email.trim(),password,
          options:{captchaToken:requestCaptchaToken,data:{display_name:display.trim()},emailRedirectTo:`${location.origin}/auth/confirm`}});
        if(error)throw error;
        setSuccess(data.session?t('signupDone'):t('signupConfirm'));
        if(data.session)location.assign('/');
        else {
          setPendingEmail(email.trim());
          setResendAvailableAt(Date.now()+60_000);
        }
      } else if(mode==='login'){
        const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password,options:{captchaToken:requestCaptchaToken}});
        if(error)throw error;
        location.assign('/');
      } else {
        const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${location.origin}/auth/confirm`,captchaToken:requestCaptchaToken});
        if(error)throw error;
        setSuccess(t('resetConfirm'));
      }
    } catch(e) {setError(e instanceof Error?e.message:t('authFailure'));}
    finally{submitting.current=false;setBusy(false);resetCaptcha();}
  }
  async function resendSignupEmail(){
    if(submitting.current||busy||!pendingEmail||Date.now()<resendAvailableAt||!configured)return;
    if(siteKey&&!captchaTokenRef.current){setError(t('captchaRequired'));return;}
    submitting.current=true;setBusy(true);setError('');
    try{
      const {error:resendError}=await db().auth.resend({
        type:'signup',
        email:pendingEmail,
        options:{
          emailRedirectTo:`${location.origin}/auth/confirm`,
          captchaToken:captchaTokenRef.current||undefined,
        },
      });
      if(resendError)throw resendError;
      setSuccess(lang==='en'?'Confirmation email requested again. Check your inbox and spam folder.':'已重新请求发送注册验证邮件，请检查收件箱和垃圾邮件。');
      setResendAvailableAt(Date.now()+60_000);
    }catch(err){
      setError(err instanceof Error?err.message:t('authFailure'));
    }finally{
      submitting.current=false;setBusy(false);resetCaptcha();
    }
  }
  async function extraOAuth(key:'apple'|'facebook'|'twitter'|'wechat'|'qq'){
    const item=activeLoginProviders.find(p=>p.key===key);
    if(!item||submitting.current||!configured)return;
    submitting.current=true;setBusy(true);setError('');
    try{
      const {error}=await db().auth.signInWithOAuth({
        provider:item.provider,options:{redirectTo:location.origin+'/auth/callback'},
      });
      if(error)throw error;
    }catch(reason){
      setError(reason instanceof Error?reason.message:'第三方账号授权不可用。');
      submitting.current=false;setBusy(false);
    }
  }
  async function oauth(){
    if(submitting.current||process.env.NEXT_PUBLIC_GOOGLE_ENABLED!=='true')return;
    if(!configured){setError(t('authNotReady'));return;}
    setError('');submitting.current=true;setBusy(true);
    try{const {error}=await db().auth.signInWithOAuth({provider:'google',options:{redirectTo:`${location.origin}/auth/callback`,skipBrowserRedirect:false}});if(error)throw error;}
    catch(e){setError(e instanceof Error?e.message:t('googleFailure'));submitting.current=false;setBusy(false);}
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
        {mode!=='forgot'&&<div className="oauth-buttons"><button disabled={busy||process.env.NEXT_PUBLIC_GOOGLE_ENABLED!=='true'} className="oauth-btn" onClick={oauth}><span className="google-g">G</span>{t('continueGoogle')}{process.env.NEXT_PUBLIC_GOOGLE_ENABLED!=='true'&&<small>{t('googleNotReady')}</small>}</button>
          {activeLoginProviders.filter(p=>p.key!=='google').length>0&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
            {activeLoginProviders.filter(p=>p.key!=='google').map(p=><button key={p.key} type="button" className="oauth-btn" disabled={busy} style={{flex:'1 1 120px',minHeight:43}} onClick={()=>void extraOAuth(p.key as 'apple'|'facebook'|'twitter'|'wechat'|'qq')}>使用 {p.label} 登录</button>)}
          </div>}
          <div className="or-divider"><span>{t('orEmail')}</span></div></div>}
        <form onSubmit={submit} className="auth-fields">
          {mode==='signup'&&<label><span>{t('nickname')}</span><div className="field-wrap"><Users size={18}/><input type="text" placeholder={t('nicknamePlace')} value={display} onChange={e=>setDisplay(e.target.value)} maxLength={60} required autoComplete="nickname"/></div></label>}
          <label><span>{t('email')}</span><div className="field-wrap"><Mail size={18}/><input type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></div></label>
          {mode!=='forgot'&&<label><span>{t('password')}</span><div className="field-wrap"><Lock size={18}/><input type={visible?'text':'password'} placeholder={mode==='signup'?t('passwordHint'):t('inputPassword')} value={password} onChange={e=>setPassword(e.target.value)} required minLength={mode==='signup'?6:1} autoComplete={mode==='signup'?'new-password':'current-password'}/><button type="button" className="show-pass" onClick={()=>setVisible(!visible)} aria-label={visible?t('hidePassword'):t('showPassword')}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>}
          {siteKey?<TurnstileChallenge key={captchaGeneration} siteKey={siteKey} onToken={updateCaptcha} onError={()=>setError(t('captchaFailure'))}/>:<p className="captcha-alert">{t('captchaNotReady')}</p>}
          {error&&<div className="form-error" role="alert">{error}</div>}{success&&<div className="form-success" role="status"><Check size={16}/>{success}</div>}
          <button className="btn btn-primary auth-submit" disabled={busy||!configured||Boolean(siteKey&&!captchaToken)}>{busy?t('processing'):t(mode==='signup'?'create':mode==='login'?'loginButton':'sendReset')}<ArrowRight size={18}/></button>
        </form>
        {mode==='signup'&&pendingEmail&&<div style={{textAlign:'center',margin:'12px 0 4px'}}>
          <p style={{fontSize:13,margin:'0 0 8px',color:'#6c6482'}}>{lang==='en'?'Already registered? Do not sign up repeatedly. If confirmation is pending, resend here.':'已提交注册？请勿反复注册。尚未收到确认邮件，可在这里重新发送。'}</p>
          <button type="button" onClick={()=>void resendSignupEmail()}
            disabled={busy||resendSeconds>0||Boolean(siteKey&&!captchaToken)}
            style={{border:'none',background:'none',fontWeight:700,color:'#8a42b9',cursor:'pointer',padding:'8px 12px'}}>
            {resendSeconds>0
              ? (lang==='en'?`Resend in ${resendSeconds}s`:`${resendSeconds} 秒后可重新发送`)
              : (lang==='en'?'Resend confirmation email':'重新发送注册验证邮件')}
          </button>
        </div>}
        <div className="auth-switch">{mode==='signup'?<>{t('haveAccount')} <button disabled={busy} onClick={()=>change('login')}>{t('signIn')}</button></>:mode==='login'?<>{t('newAccount')} <button disabled={busy} onClick={()=>change('signup')}>{t('signUp')}</button></>:<>{t('rememberPassword')} <button disabled={busy} onClick={()=>change('login')}>{t('backLogin')}</button></>}
          {mode==='login'&&<button disabled={busy} className="forgot-link" onClick={()=>change('forgot')}>{t('forgotLink')}</button>}</div>
        {!configured&&<p className="configuration-note">{t('configNeeded')}</p>}
        
<a href="/support" style={{display:'block',textAlign:'center',padding:'14px',margin:'16px 0',borderRadius:16,background:'#f3e7ff',color:'#703b87',fontWeight:700,textDecoration:'none'}}>✦ AI 客服中心 · 无需登录 →</a>

        <p className="legal-text">{t('legalLead')} <a href="/terms">{t('terms')}</a> {t('and')} <a href="/privacy">{t('privacy')}</a>{t('legalTail')}</p>
      </div><div className="bottom-credit"><Globe2 size={14}/>{t('authFooter')}</div></section>
    </div>
  </div>;
}
