'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {db,hasConfig} from '@/lib/supabase';
type Factor={id:string;friendly_name?:string};
// Prompt users who already enrolled a verified factor when their new session is aal1.
// Sensitive server mutations must independently enforce aal2 where required.
export function StarflowMFASessionPrompt(){
 const [factor,setFactor]=useState<Factor|null>(null);
 const [code,setCode]=useState('');
 const [dismissed,setDismissed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!hasConfig())return;
  let alive=true,version=0;
  const client=db();
  const check=async()=>{
   const v=++version;
   try{
    const {data:{user}}=await client.auth.getUser();
    if(!alive||v!==version||!user){if(alive&&v===version)setFactor(null);return;}
    const level=await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if(!alive||v!==version||level.error)return;
    if(level.data?.currentLevel==='aal2'||level.data?.nextLevel!=='aal2'){setFactor(null);return;}
    const factors=await client.auth.mfa.listFactors();
    if(!alive||v!==version||factors.error)return;
    const first=(factors.data?.totp||[])[0];
    setFactor(first?{id:first.id,friendly_name:first.friendly_name}:null);
   }catch{/* Login and other features must still work if MFA is unavailable. */}
  };
  void check();
  const {data:{subscription}}=client.auth.onAuthStateChange(event=>{
   if(event==='SIGNED_OUT'){++version;setFactor(null);setCode('');setDismissed(false);return;}
   if(event==='SIGNED_IN'){setDismissed(false);}
   if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED')
    queueMicrotask(()=>void check());
  });
  return()=>{alive=false;++version;subscription.unsubscribe()};
 },[]);
 async function verify(){
  if(!factor||busy||!/^[0-9]{6}$/.test(code))return;
  setBusy(true);setError('');
  try{
   const {error:e}=await db().auth.mfa.challengeAndVerify({factorId:factor.id,code});
   if(e)throw e;
   setFactor(null);setCode('');setDismissed(false);
  }catch(e){setError(e instanceof Error?e.message:'验证码无效，请检查手机时间与验证码');}
  finally{setBusy(false);}
 }
 if(!factor||dismissed)return null;
 return <aside role="dialog" aria-label="本次登录的双重验证" aria-modal="false" style={{
  position:'fixed',bottom:90,right:12,zIndex:230,width:'min(350px,calc(100vw - 24px))',
  background:'white',color:'#312646',border:'1px solid #daccf0',
  borderRadius:17,padding:18,boxShadow:'0 18px 48px #39235b33'
 }}>
  <strong style={{display:'block',fontSize:16}}>星流安全 · 请验证登录</strong>
  <p style={{fontSize:13,lineHeight:1.6,margin:'8px 0'}}>当前账号已经开启认证器保护，请输入认证器中的6位验证码，完成本次双重验证。</p>
  <label htmlFor="sf-mfa-session-code" style={{display:'block',fontSize:12}}>动态验证码</label>
  <input id="sf-mfa-session-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
   value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))}
   style={{boxSizing:'border-box',width:'100%',padding:10,margin:'7px 0',borderRadius:9,border:'1px solid #b8a9c9',color:'#312646',background:'white'}}/>
  {error&&<p role="alert" style={{color:'#a72945',fontSize:12}}>{error}</p>}
  <div style={{display:'flex',gap:9,alignItems:'center',flexWrap:'wrap'}}>
   <button type="button" disabled={busy||code.length!==6} onClick={()=>void verify()}
    style={{border:0,borderRadius:10,background:'#7549bd',color:'white',padding:'10px 16px'}}>
    {busy?'验证中…':'确认验证'}
   </button>
   <button type="button" onClick={()=>setDismissed(true)}
    style={{border:0,background:'#f3eff9',color:'#54348b',borderRadius:9,padding:'9px 12px'}}>稍后</button>
   <Link href="/settings/security/2fa" style={{fontSize:12,color:'#7549bd'}}>安全设置</Link>
  </div>
 </aside>;
}
