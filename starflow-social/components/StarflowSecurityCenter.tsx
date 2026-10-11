'use client';
import {useCallback,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import type {User,UserIdentity} from '@supabase/supabase-js';
import Link from 'next/link';
import {ArrowLeft,CheckCircle2,Eye,EyeOff,KeyRound,Link2,Mail,RefreshCw,ShieldCheck,TriangleAlert} from 'lucide-react';
import {Brand} from './Brand';
import {db,hasConfig} from '@/lib/supabase';
import {linkedProviders} from '@/lib/account-providers';

function accountLabel(i:UserIdentity){
 const meta=i.identity_data||{};
 for(const key of ['email','user_name','preferred_username','name']){
  if(typeof meta[key]==='string'&&meta[key])return String(meta[key]);
 }
 return '已通过平台授权';
}
export function StarflowSecurityCenter(){
 const [user,setUser]=useState<User|null>(null);
 const [identities,setIdentities]=useState<UserIdentity[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const [oldPwd,setOldPwd]=useState('');
 const [newPwd,setNewPwd]=useState('');
 const [newPwd2,setNewPwd2]=useState('');
 const [visible,setVisible]=useState(false);
 const [saving,setSaving]=useState(false);
 const [linking,setLinking]=useState<string|null>(null);
 const [recovering,setRecovering]=useState(false);
 const refresh=useCallback(async()=>{
  setLoading(true);
  try{
   if(!hasConfig())throw Error('尚未配置 Supabase。');
   const [account,methods]=await Promise.all([db().auth.getUser(),db().auth.getUserIdentities()]);
   if(account.error)throw account.error;
   if(methods.error)throw methods.error;
   setUser(account.data.user);
   setIdentities(methods.data.identities||[]);
  }catch(e){setError(e instanceof Error?e.message:'读取绑定信息失败');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);

 const verified=Boolean(user?.email&&user.email_confirmed_at);
 const passwordAccount=identities.some(i=>i.provider==='email');
 async function changePassword(e:FormEvent){
  e.preventDefault();
  if(!user||saving)return;
  if(newPwd.length<8||newPwd.length>72){setError('新密码须为 8–72 位。');return;}
  if(newPwd!==newPwd2){setError('两次输入的新密码不一致。');return;}
  if(passwordAccount&&!oldPwd){setError('请输入当前密码。');return;}
  if(!passwordAccount&&!verified){setError('第三方登录账号须先具有已验证邮箱，才能设置密码。');return;}
  setSaving(true);setError('');setSuccess('');
  try{
   // Supabase GoTrue verifies current_password on the server. Never compare only in the browser.
   const attrs=passwordAccount?{password:newPwd,current_password:oldPwd}:{password:newPwd};
   const {error:changeError}=await db().auth.updateUser(attrs);
   if(changeError)throw changeError;
   setOldPwd('');setNewPwd('');setNewPwd2('');
   setSuccess('登录密码更新成功。');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'密码修改失败');}
  finally{setSaving(false);}
 }
 async function bind(providerId:string){
  const item=linkedProviders.find(p=>p.key===providerId);
  if(!item?.enabled||!user||linking)return;
  setLinking(providerId);setError('');setSuccess('');
  try{
   // Marker is set BEFORE any OAuth redirect. The callback will only accept an exact local route.
   sessionStorage.setItem('sf_identity_link_return',JSON.stringify({at:Date.now(),to:'/settings/security'}));
   const {data,error:linkError}=await db().auth.linkIdentity({
    provider:item.provider,options:{redirectTo:location.origin+'/auth/callback',skipBrowserRedirect:true},
   });
   if(linkError)throw linkError;
   if(!data?.url)throw Error('OAuth 授权地址未返回，无法开始绑定。');
   location.assign(data.url);
  }catch(e){
   sessionStorage.removeItem('sf_identity_link_return');
   setError((e instanceof Error?e.message:'绑定失败')+'。绑定需启用 Supabase 手动身份关联和对应 OAuth 提供商。');
   setLinking(null);
  }
 }
 async function sendRecovery(){
  if(!verified||!user?.email||recovering)return;
  setRecovering(true);setError('');setSuccess('');
  try{
   const {error:requestError}=await db().auth.resetPasswordForEmail(user.email,{redirectTo:location.origin+'/auth/reset'});
   if(requestError)throw requestError;
   setSuccess('已提交找回邮件请求；实际送达仍取决于邮件服务配置。');
  }catch(e){setError(e instanceof Error?e.message:'请求找回失败');}
  finally{setRecovering(false);}
 }
 if(loading)return <main className="sf-sec-state"><RefreshCw size={21}/> 正在读取账户安全信息…</main>;
 if(!user)return <main className="sf-sec-state"><p>请先登录 Starflow 后管理安全设置。</p><Link href="/">返回登录</Link></main>;
 return <main className="sf-sec-page">
  <header className="sf-sec-head"><Link href="/settings"><ArrowLeft size={18}/> 返回设置</Link><Brand compact/></header>
  <div className="sf-sec-main">
   <h1><ShieldCheck size={28}/> 账户安全管理中心</h1>
   <p className="sf-sec-intro">管理当前登录邮箱、密码、第三方绑定和账户找回方式。</p>
   {error&&<div className="sf-sec-alert" role="alert"><TriangleAlert size={18}/>{error}</div>}
   {success&&<div className="sf-sec-success" role="status"><CheckCircle2 size={18}/>{success}</div>}
   <section className="sf-sec-card">
    <h2><Mail size={19}/> 当前绑定邮箱</h2>
    <div className="sf-sec-line"><strong>{user.email||'尚未绑定邮箱'}</strong><span className={verified?'sf-sec-yes':'sf-sec-pending'}>{verified?'已验证':'未验证'}</span></div>
    <p className="sf-sec-muted">{verified?'此邮箱可作为账户找回渠道（需邮件服务正常投递）。':'邮箱未经验证，不能保证用于找回账号。'}</p>
   </section>
   <section className="sf-sec-card">
    <h2><KeyRound size={19}/> {passwordAccount?'修改登录密码':'设置邮箱登录密码'}</h2>
    <form onSubmit={e=>void changePassword(e)} className="sf-sec-form">
     {passwordAccount&&<label>当前密码<input type={visible?'text':'password'} autoComplete="current-password" value={oldPwd} onChange={e=>setOldPwd(e.target.value)} required/></label>}
     <label>新密码（8–72 位）<input type={visible?'text':'password'} autoComplete="new-password" minLength={8} maxLength={72} value={newPwd} onChange={e=>setNewPwd(e.target.value)} required/></label>
     <label>确认新密码<input type={visible?'text':'password'} autoComplete="new-password" minLength={8} maxLength={72} value={newPwd2} onChange={e=>setNewPwd2(e.target.value)} required/></label>
     <button type="button" className="sf-sec-linkbtn" onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={16}/>:<Eye size={16}/>} {visible?'隐藏密码':'显示密码'}</button>
     {!passwordAccount&&<p className="sf-sec-muted">首次通过第三方登录、未设置过邮箱密码的用户，需要已验证邮箱及有效登录会话。</p>}
     <button className="sf-sec-primary" disabled={saving||(!verified&&!passwordAccount)} type="submit">{saving?'正在保存…':'保存新密码'}</button>
    </form>
   </section>
   <section className="sf-sec-card">
    <h2><Link2 size={19}/> 第三方账户绑定</h2>
    <p className="sf-sec-muted">通过官方授权后绑定至当前 Starflow 账号。未开通的服务不会显示假绑定按钮。</p>
    <div className="sf-sec-providers">{linkedProviders.map(p=>{
     const identity=identities.find(i=>i.provider===p.provider);
     return <div className="sf-sec-provider" key={p.key}>
      <span className="sf-sec-provider-text"><strong>{p.label}</strong><small>{identity?accountLabel(identity):p.enabled?'尚未绑定':p.requirement}</small></span>
      {identity?<span className="sf-sec-yes"><CheckCircle2 size={13}/> 已绑定</span>:
       p.enabled?<button className="sf-sec-bind" disabled={linking!==null} onClick={()=>void bind(p.key)} type="button">{linking===p.key?'正在打开授权…':'绑定账号'}</button>:
       <span className="sf-sec-pending">待接入</span>}
     </div>;
    })}</div>
    <p className="sf-sec-muted">为防止失去唯一登录方式，本阶段不开放直接解绑；后续增加安全重认证后再开放。</p>
   </section>
   <section className="sf-sec-card">
    <h2><ShieldCheck size={19}/> 账户找回方式</h2>
    <div className="sf-sec-line"><span>已验证邮箱</span><button className="sf-sec-bind" type="button" disabled={!verified||recovering} onClick={()=>void sendRecovery()}>{recovering?'正在请求…':'发送密码找回邮件'}</button></div>
    <div className="sf-sec-line"><span>已绑定第三方</span><strong>{linkedProviders.filter(p=>p.enabled&&identities.some(i=>i.provider===p.provider)).map(p=>p.label).join('、')||'暂无已启用的关联身份'}</strong></div>
    <p className="sf-sec-muted">绑定社交身份可以提供额外登录路径，但平台账号必须仍可登录；不等于可以绕过原平台认证。邮箱找回需要 SMTP 服务实际可用。</p>
   </section>
   <footer className="sf-sec-foot"><button type="button" className="sf-sec-linkbtn" onClick={()=>void refresh()}><RefreshCw size={16}/> 刷新绑定状态</button><Link href="/settings">返回设置</Link></footer>
  </div>
 </main>;
}
