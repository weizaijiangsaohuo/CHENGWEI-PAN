'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {db,hasConfig} from '@/lib/supabase';
import './StarflowMFA.css';

type Factor={id:string;friendly_name?:string;status?:string};
type Setup={id:string;qr:string;secret:string};
const codePattern=/^\d{6}$/;

export function StarflowMFASettings(){
 const [userId,setUserId]=useState('');
 const [factors,setFactors]=useState<Factor[]>([]);
 const [level,setLevel]=useState('');
 const [setup,setSetup]=useState<Setup|null>(null);
 const [code,setCode]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const refresh=useCallback(async()=>{
  const client=db();
  const [{data:{user},error:authError},factorResult,levelResult]=await Promise.all([
   client.auth.getUser(),client.auth.mfa.listFactors(),client.auth.mfa.getAuthenticatorAssuranceLevel()
  ]);
  if(authError||!user)throw Error('请先登录 Starflow');
  if(factorResult.error)throw factorResult.error;
  if(levelResult.error)throw levelResult.error;
  setUserId(user.id);
  setFactors((factorResult.data?.totp||[]) as Factor[]);
  setLevel(levelResult.data?.currentLevel||'aal1');
 },[]);
 useEffect(()=>{
  let mounted=true;
  if(!hasConfig()){setError('暂时无法连接账号服务');setLoading(false);return;}
  refresh().catch(e=>{if(mounted)setError(e instanceof Error?e.message:'无法读取双重验证设置')})
   .finally(()=>{if(mounted)setLoading(false)});
  return()=>{mounted=false};
 },[refresh]);
 const act=async(fn:()=>Promise<void>)=>{
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{await fn();}
  catch(e){setError(e instanceof Error?e.message:'操作失败，请稍后重试');}
  finally{setBusy(false);}
 };
 const enroll=()=>act(async()=>{
  const result=await db().auth.mfa.enroll({factorType:'totp',friendlyName:'星流身份验证器'});
  if(result.error||!result.data?.totp)throw Error(result.error?.message||'无法创建验证码设置');
  const data=result.data;
  setSetup({id:data.id,qr:data.totp.qr_code,secret:data.totp.secret});
  setCode('');
  setMessage('已创建临时绑定，请把密钥输入认证器应用，然后输入认证器生成的6位数字确认。');
 });
 const verify=()=>act(async()=>{
  if(!setup||!codePattern.test(code))throw Error('请输入认证器生成的6位数字');
  const result=await db().auth.mfa.challengeAndVerify({factorId:setup.id,code});
  if(result.error)throw result.error;
  setSetup(null);setCode('');await refresh();
  setMessage('双重验证已绑定，当前会话已通过第二重验证。以后登录时可使用认证器验证码。');
 });
 const remove=(factorId:string)=>act(async()=>{
  if(!window.confirm('确定移除这个双重验证器吗？建议至少保留一种可用验证方式。'))return;
  const result=await db().auth.mfa.unenroll({factorId});
  if(result.error)throw result.error;
  await refresh();setMessage('已移除验证器。');
 });
 const verifyExisting=(factorId:string)=>act(async()=>{
  if(!codePattern.test(code))throw Error('请输入6位验证码');
  const result=await db().auth.mfa.challengeAndVerify({factorId,code});
  if(result.error)throw result.error;
  setCode('');await refresh();setMessage('已完成第二重身份验证。');
 });
 return <main className="sf-mfa-page"><div className="sf-mfa-shell">
  <nav className="sf-mfa-nav"><Link href="/settings/security">← 账号安全中心</Link><Link href="/">Starflow 首页</Link></nav>
  <h1>✦ 双重验证（2FA）</h1>
  <p className="sf-mfa-muted">使用手机认证器应用生成6位动态验证码，提高账号登录安全。使用 Supabase Auth 原生 TOTP，不需要短信或付费 API。</p>
  {loading?<p role="status">正在读取安全状态…</p>:!userId?<p role="alert">{error||'请先登录'}</p>:<>
   {error&&<p className="sf-mfa-error" role="alert">{error}</p>}
   {message&&<p className="sf-mfa-ok" role="status">{message}</p>}
   <section className="sf-mfa-card">
    <h2>当前保护状态</h2>
    <p>已绑定认证器：<strong>{factors.length} 个</strong></p>
    <p>本次登录验证等级：<strong>{level==='aal2'?'已通过双重验证':'普通登录（尚未完成本次双重验证）'}</strong></p>
    <p className="sf-mfa-muted">认证器丢失可能导致后续登录受阻。Supabase 不提供 TOTP 恢复码；建议妥善保管备用认证器。不要分享验证码或密钥。</p>
   </section>
   {factors.length>0&&<section className="sf-mfa-card">
    <h2>已绑定的验证器</h2>
    {factors.map((factor,i)=><div key={factor.id} className="sf-mfa-factor">
     <span><strong>{factor.friendly_name||'认证器 '+(i+1)}</strong><small>已验证 TOTP</small></span>
     <button type="button" className="secondary" disabled={busy} onClick={()=>void remove(factor.id)}>移除</button>
    </div>)}
    {level!=='aal2'&&<div className="sf-mfa-verify">
     <label htmlFor="sf-mfa-existing-code">验证现有认证器（6位码）</label>
     <input id="sf-mfa-existing-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))}/>
     <button type="button" disabled={busy||!codePattern.test(code)} onClick={()=>void verifyExisting(factors[0].id)}>验证当前登录</button>
    </div>}
   </section>}
   <section className="sf-mfa-card">
    <h2>添加新的认证器</h2>
    {!setup?<button type="button" disabled={busy} onClick={()=>void enroll()}>{busy?'正在处理…':'开始绑定认证器'}</button>:
     <div className="sf-mfa-setup">
      <p>在 Google Authenticator、Microsoft Authenticator 等认证器中添加账号，可以扫描二维码，或选择“手动输入密钥”。同一台 iPhone 建议手动输入。</p>
      {setup.qr.startsWith('data:image/')&&<img src={setup.qr} alt="本次绑定专用二维码，请不要分享" width={192} height={192}/>}
      <label htmlFor="sf-mfa-secret">绑定密钥（只在本次设置时展示）</label>
      <input id="sf-mfa-secret" value={setup.secret} readOnly onFocus={e=>e.target.select()} aria-label="认证器绑定密钥"/>
      <label htmlFor="sf-mfa-setup-code">请输入认证器生成的6位验证码</label>
      <input id="sf-mfa-setup-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))}/>
      <div className="sf-mfa-actions">
       <button type="button" disabled={busy||!codePattern.test(code)} onClick={()=>void verify()}>确认绑定</button>
       <button type="button" className="secondary" disabled={busy} onClick={()=>{setSetup(null);setCode('');setMessage('已退出设置。未验证的临时认证器不会用于登录。')}}>取消</button>
      </div>
     </div>}
   </section>
   <p className="sf-mfa-muted">重要说明：第二重验证为账号提供额外认证级别；敏感数据库操作是否强制要求该级别，还取决于对应服务器权限策略，不代表所有既有接口已自动升级为强制 MFA。</p>
  </>}
 </div></main>;
}
