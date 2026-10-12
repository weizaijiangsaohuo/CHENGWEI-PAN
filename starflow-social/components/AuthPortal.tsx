'use client';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Check, Eye, EyeOff, Globe2, Lock, Mail, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react';
import { Brand } from './Brand';
import { TurnstileChallenge } from './TurnstileChallenge';
import { useLanguage } from './LanguageProvider';
import {isEnglishLocale} from '@/lib/i18n';
import { db, hasConfig } from '@/lib/supabase';
import { activeLoginProviders } from '@/lib/account-providers';
import type { Lang } from '@/lib/i18n';

type TurnstileGuidance={domain:string;network:string;config:string;other:string;retry:string};
const turnstileHelp:Record<Lang,TurnstileGuidance>={
  zh:{domain:'正式域名未获 Turnstile 授权，请网站管理员在 Cloudflare 添加当前域名。',network:'验证组件无法连接 Cloudflare；请切换网络或关闭内容拦截后重试。',config:'人机验证站点密钥配置异常，需要网站管理员检查。',other:'无法完成人机验证，请重试。',retry:'重新尝试验证'},
  en:{domain:'This site is not authorized for Turnstile. The administrator must add this hostname in Cloudflare.',network:'Unable to load Cloudflare verification. Switch networks or disable content blockers and try again.',config:'The verification site key needs administrator attention.',other:'Verification could not be completed.',retry:'Retry verification'},
  'zh-HK':{domain:'正式網域尚未獲 Turnstile 授權，請網站管理員於 Cloudflare 加入此網域。',network:'無法連接 Cloudflare 驗證，請切換網絡或停用內容攔截後重試。',config:'驗證網站金鑰配置有誤，需網站管理員檢查。',other:'無法完成人機驗證，請重試。',retry:'重新嘗試驗證'},
  'ko-KR':{domain:'현재 도메인이 Turnstile에 등록되지 않았습니다. 관리자에게 도메인 등록을 요청하세요.',network:'Cloudflare 인증을 불러오지 못했습니다. 네트워크를 바꾸거나 콘텐츠 차단을 해제하세요.',config:'인증 사이트 키 설정을 관리자가 확인해야 합니다.',other:'인증에 실패했습니다. 다시 시도하세요.',retry:'인증 다시 시도'},
  'ja-JP':{domain:'このドメインは Turnstile に登録されていません。管理者が Cloudflare で設定する必要があります。',network:'Cloudflare の認証を読み込めません。通信環境やコンテンツブロッカーをご確認ください。',config:'認証サイトキーの設定を管理者が確認する必要があります。',other:'認証できませんでした。もう一度お試しください。',retry:'認証を再試行'},
  'en-SG':{domain:'This site is not authorised for Turnstile. The administrator must add this hostname in Cloudflare.',network:'Could not load Cloudflare verification. Try another network or disable content blockers.',config:'The verification site key needs administrator attention.',other:'Verification could not be completed.',retry:'Retry verification'},
  'en-GB':{domain:'This site is not authorised for Turnstile. The administrator must add this hostname in Cloudflare.',network:'Could not load Cloudflare verification. Try another network or disable content blockers.',config:'The verification site key needs administrator attention.',other:'Verification could not be completed.',retry:'Retry verification'},
  'de-DE':{domain:'Diese Domain ist für Turnstile nicht freigegeben. Der Administrator muss sie in Cloudflare hinzufügen.',network:'Cloudflare-Verifizierung nicht erreichbar. Bitte Netzwerk wechseln oder Inhaltsblocker deaktivieren.',config:'Der Administrator muss den Verifizierungsschlüssel prüfen.',other:'Verifizierung fehlgeschlagen. Bitte erneut versuchen.',retry:'Verifizierung wiederholen'},
  'fr-FR':{domain:'Ce domaine n’est pas autorisé pour Turnstile. L’administrateur doit l’ajouter dans Cloudflare.',network:'Vérification Cloudflare inaccessible. Essayez un autre réseau ou désactivez le bloqueur de contenu.',config:'L’administrateur doit vérifier la clé du widget.',other:'Impossible de vérifier. Veuillez réessayer.',retry:'Réessayer la vérification'}
};
function turnstileFailureHint(code:string,lang:Lang){
 const guide=turnstileHelp[lang]??turnstileHelp.en;
 if(code==='110200'||code==='400021')return guide.domain;
 if(['110100','110110','400020','400070'].includes(code))return guide.config;
 if(code==='200500'||code==='SCRIPT_LOAD_FAILED')return guide.network;
 return guide.other;
}


export function AuthPortal(){
  const {t,lang}=useLanguage();
  const [mode,setMode]=useState<'login'|'signup'|'forgot'>('signup');
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [display,setDisplay]=useState('');const [handle,setHandle]=useState('');const [visible,setVisible]=useState(false);
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
  const [captchaFailureCode,setCaptchaFailureCode]=useState('');
  const captchaTokenRef=useRef('');
  const submitting=useRef(false);
  function updateCaptcha(token:string){
    captchaTokenRef.current=token;setCaptchaToken(token);
    if(token){setCaptchaFailureCode('');setError(previous=>previous===t('captchaFailure')?'':previous);}
  }
  const [captchaGeneration,setCaptchaGeneration]=useState(0);
  function resetCaptcha(){updateCaptcha('');setCaptchaFailureCode('');setCaptchaGeneration(value=>value+1);}
  function change(next:'signup'|'login'|'forgot'){if(submitting.current)return;setMode(next);setError('');setSuccess('');setPendingEmail('');setResendAvailableAt(0);resetCaptcha();}
  async function submit(e:FormEvent){
    e.preventDefault();if(submitting.current)return;setError('');setSuccess('');
    if(!configured){setError(t('noKeys'));return;}
    if(mode==='signup' && password.length < 6){setError(t('pwdMinimum'));return;}
    if(mode==='signup' && (!display.trim()||display.trim().length>60)){setError(t('nicknameMinimum'));return;}
    if(mode==='signup' && (!/^[a-z0-9_]{3,24}$/.test(handle.trim().toLowerCase()) || /^(admin|administrator|support|system|security|moderator)(_|$)/.test(handle.trim().toLowerCase()))){setError(isEnglishLocale(lang)?'Use 3–24 letters, numbers or underscores for your username. This username may be reserved.':'用户名必须为 3–24 位英文字母、数字或下划线，且不能使用系统保留名称。');return;}
    if(siteKey&&!captchaTokenRef.current){setError(t('captchaRequired'));return;}
    submitting.current=true;
    const requestCaptchaToken=captchaTokenRef.current||undefined;
    setBusy(true);
    try {
      const supabase=db();
      if(mode==='signup'){
        const {data,error}=await supabase.auth.signUp({email:email.trim(),password,
          options:{captchaToken:requestCaptchaToken,data:{display_name:display.trim(),handle:handle.trim().toLowerCase()},emailRedirectTo:`${location.origin}/auth/confirm`}});
        if(error)throw error;
        setSuccess(data.session?t('signupDone'):t('signupConfirm'));
        if(data.session)location.assign('/');
        else {
          setPendingEmail(email.trim());
          setResendAvailableAt(Date.now()+60_000);
        }
      } else if(mode==='login'){
        const identity=email.trim();
        if(identity.includes('@') && !identity.startsWith('@')){
          const {error}=await supabase.auth.signInWithPassword({email:identity,password,options:{captchaToken:requestCaptchaToken}});
          if(error)throw error;
        }else{
          const {data,error}=await supabase.functions.invoke('auth-identifier',{
            body:{action:'login',username:identity,password,captchaToken:requestCaptchaToken},
          });
          if(error||!data?.session?.access_token||!data?.session?.refresh_token)throw new Error(isEnglishLocale(lang)?'Incorrect username or password, or verification failed.':'用户名或密码不正确，或人机验证失败。');
          const {error:sessionError}=await supabase.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
          if(sessionError)throw sessionError;
        }
        location.assign('/');
      } else {
        const identity=email.trim();
        if(identity.includes('@') && !identity.startsWith('@')){
          const {error}=await supabase.auth.resetPasswordForEmail(identity,{redirectTo:`${location.origin}/auth/confirm`,captchaToken:requestCaptchaToken});
          if(error)throw error;
        }else{
          const {error}=await supabase.functions.invoke('auth-identifier',{
            body:{action:'recover',username:identity,captchaToken:requestCaptchaToken},
          });
          if(error)throw new Error(isEnglishLocale(lang)?'Could not request recovery. Please try again.':'暂时无法发送找回邮件，请稍后再试。');
        }
        setSuccess(isEnglishLocale(lang)?'If the account exists, a reset link will be sent to its registered email.':'如果账号存在，系统会向注册时预留的邮箱发送密码重置链接。');
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
      setSuccess(isEnglishLocale(lang)?'Confirmation email requested again. Check your inbox and spam folder.':'已重新请求发送注册验证邮件，请检查收件箱和垃圾邮件。');
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
        <div className="sf-auth-brand"><Brand/></div>
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
          <p>{mode==='forgot'?(isEnglishLocale(lang)?'Enter your email or username. A secure reset link is sent only to the registered mailbox.':'填写预留邮箱或用户名，系统仅向注册邮箱发送安全重置链接。'):t(mode==='signup'?'signupDesc':'loginDesc')}</p></div>
        {mode!=='forgot'&&<div className="oauth-buttons"><button disabled={busy||process.env.NEXT_PUBLIC_GOOGLE_ENABLED!=='true'} className="oauth-btn" onClick={oauth}><span className="google-g">G</span>{t('continueGoogle')}{process.env.NEXT_PUBLIC_GOOGLE_ENABLED!=='true'&&<small>{t('googleNotReady')}</small>}</button>
          {activeLoginProviders.filter(p=>p.key!=='google').length>0&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
            {activeLoginProviders.filter(p=>p.key!=='google').map(p=><button key={p.key} type="button" className="oauth-btn" disabled={busy} style={{flex:'1 1 120px',minHeight:43}} onClick={()=>void extraOAuth(p.key as 'apple'|'facebook'|'twitter'|'wechat'|'qq')}>使用 {p.label} 登录</button>)}
          </div>}
          <div className="or-divider"><span>{isEnglishLocale(lang)?'Or use an email / username and password':'或使用邮箱／用户名和密码'}</span></div></div>}
        <form onSubmit={submit} className="auth-fields">
          {mode==='signup'&&<><label><span>{t('nickname')}</span><div className="field-wrap"><Users size={18}/><input type="text" placeholder={t('nicknamePlace')} value={display} onChange={e=>setDisplay(e.target.value)} maxLength={60} required autoComplete="nickname"/></div></label>
          <label><span>{isEnglishLocale(lang)?'Username':'用户名（注册时自选）'}</span><div className="field-wrap"><Users size={18}/><input name="handle" type="text" placeholder="e.g. starlover_26" value={handle} onChange={e=>setHandle(e.target.value)} minLength={3} maxLength={24} autoComplete="username" autoCapitalize="none" spellCheck={false} required/></div></label></>}
          <label><span>{mode==='signup'?(isEnglishLocale(lang)?'Recovery email (required)':'预留邮箱（用于验证与找回密码）'):(isEnglishLocale(lang)?'Email or username':'邮箱或用户名')}</span><div className="field-wrap"><Mail size={18}/><input name="identity" type={mode==='signup'?'email':'text'} placeholder={mode==='signup'?'you@example.com':(isEnglishLocale(lang)?'Email, username or @username':'请输入邮箱、用户名或 @用户名')} value={email} onChange={e=>setEmail(e.target.value)} required autoComplete={mode==='signup'?'email':'username'} autoCapitalize="none" spellCheck={false}/></div></label>
          {mode!=='forgot'&&<label><span>{t('password')}</span><div className="field-wrap"><Lock size={18}/><input type={visible?'text':'password'} placeholder={mode==='signup'?t('passwordHint'):t('inputPassword')} value={password} onChange={e=>setPassword(e.target.value)} required minLength={mode==='signup'?6:1} autoComplete={mode==='signup'?'new-password':'current-password'}/><button type="button" className="show-pass" onClick={()=>setVisible(!visible)} aria-label={visible?t('hidePassword'):t('showPassword')}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>}
          {siteKey?<TurnstileChallenge key={captchaGeneration} siteKey={siteKey} onToken={updateCaptcha} onError={code=>{setCaptchaFailureCode(code||'UNKNOWN');setError(t('captchaFailure'));}}/>:<p className="captcha-alert">{t('captchaNotReady')}</p>}
          {captchaFailureCode&&<div className="captcha-alert" role="status" style={{marginTop:9,padding:12,borderRadius:12,background:'#fff5f5',fontSize:13}}>
            <span>{turnstileFailureHint(captchaFailureCode,lang)} <strong style={{whiteSpace:'nowrap'}}>({captchaFailureCode})</strong></span>
            <button type="button" onClick={()=>{setError('');resetCaptcha();}} style={{display:'block',marginTop:8,padding:'8px 12px',borderRadius:11,border:'1px solid #dfbde8',background:'white',color:'#7d43a1',fontWeight:750}}>{(turnstileHelp[lang]??turnstileHelp.en).retry}</button>
          </div>}
          {error&&<div className="form-error" role="alert">{error}</div>}{success&&<div className="form-success" role="status"><Check size={16}/>{success}</div>}
          <button className="btn btn-primary auth-submit" disabled={busy||!configured||Boolean(siteKey&&!captchaToken)}>{busy?t('processing'):t(mode==='signup'?'create':mode==='login'?'loginButton':'sendReset')}<ArrowRight size={18}/></button>
        </form>
        {mode==='signup'&&pendingEmail&&<div style={{textAlign:'center',margin:'12px 0 4px'}}>
          <p style={{fontSize:13,margin:'0 0 8px',color:'#6c6482'}}>{isEnglishLocale(lang)?'Already registered? Do not sign up repeatedly. If confirmation is pending, resend here.':'已提交注册？请勿反复注册。尚未收到确认邮件，可在这里重新发送。'}</p>
          <button type="button" onClick={()=>void resendSignupEmail()}
            disabled={busy||resendSeconds>0||Boolean(siteKey&&!captchaToken)}
            style={{border:'none',background:'none',fontWeight:700,color:'#8a42b9',cursor:'pointer',padding:'8px 12px'}}>
            {resendSeconds>0
              ? (isEnglishLocale(lang)?`Resend in ${resendSeconds}s`:`${resendSeconds} 秒后可重新发送`)
              : (isEnglishLocale(lang)?'Resend confirmation email':'重新发送注册验证邮件')}
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
