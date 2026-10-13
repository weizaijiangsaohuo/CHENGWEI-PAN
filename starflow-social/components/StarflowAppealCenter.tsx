'use client';
import {useCallback,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import Link from 'next/link';
import {db,hasConfig} from '@/lib/supabase';
import './StarflowGrowth.css';

type Appeal={
 id:string;category:string;subject:string;body:string;status:string;
 response:string|null;created_at:string;reviewed_at:string|null
};
const statusLabel:Record<string,string>={pending:'等待审核',approved:'审核已认可',rejected:'未通过'};
const catLabel:Record<string,string>={account:'账号限制 / 登录',content:'动态内容处理',verification:'认证审核',other:'其他问题'};
export function StarflowAppealCenter(){
 const [uid,setUid]=useState('');
 const [appeals,setAppeals]=useState<Appeal[]>([]);
 const [category,setCategory]=useState('account');
 const [subject,setSubject]=useState('');const [body,setBody]=useState('');
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const refresh=useCallback(async(userId:string)=>{
  const {data,error}=await db().from('sf_user_appeals')
   .select('id,category,subject,body,status,response,created_at,reviewed_at')
   .eq('user_id',userId).order('created_at',{ascending:false}).limit(40);
  if(error)throw error;
  setAppeals((data||[]) as Appeal[]);
 },[]);
 useEffect(()=>{
  let active=true;
  if(!hasConfig()){setLoading(false);setError('账号服务尚未配置');return;}
  db().auth.getUser().then(async ({data:{user},error:e})=>{
   if(!active)return;
   if(e||!user){setError('请登录后提交申诉');return;}
   setUid(user.id);await refresh(user.id);
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'服务暂时无法使用')}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[refresh]);
 async function submit(event:FormEvent){
  event.preventDefault();if(!uid||busy)return;
  setError('');setNotice('');setBusy(true);
  try{
   const {data,error:e}=await db().rpc('sf_submit_appeal',{
    p_category:category,p_subject:subject.trim(),p_body:body.trim()
   });
   if(e||!data)throw Error(e?.message||'申诉提交失败');
   setSubject('');setBody('');await refresh(uid);
   setNotice('已提交申诉。管理员审核后将通过站内通知反馈。');
  }catch(e){setError(e instanceof Error?e.message:'无法提交申诉');}
  finally{setBusy(false);}
 }
 return <main className="sf-growth-page"><div className="sf-growth-shell">
  <nav className="sf-growth-nav"><Link href="/">← 返回星流</Link><Link href="/settings">账号设置</Link><Link href="/support">帮助中心</Link></nav>
  <h1>✦ 举报申诉与处理反馈</h1>
  <p className="sf-growth-note">这里可以对账号限制、动态内容处理、认证结果等提交复核请求。申诉资料仅供本人和获授权的审核人员查看。</p>
  {loading?<p role="status">正在验证登录状态…</p>:!uid?<p role="alert">{error||'请先登录'}</p>:<>
   {notice&&<p role="status" className="sf-growth-notice">{notice}</p>}
   {error&&<p role="alert" className="sf-growth-error">{error}</p>}
   <section className="sf-growth-card"><h2>发起新的申诉</h2>
    <form onSubmit={e=>void submit(e)} style={{display:'flex',flexDirection:'column',gap:12}}>
     <label htmlFor="sf-appeal-category">问题类型</label>
     <select id="sf-appeal-category" value={category} onChange={e=>setCategory(e.target.value)}>
      {Object.entries(catLabel).map(([value,name])=><option key={value} value={value}>{name}</option>)}
     </select>
     <label htmlFor="sf-appeal-title">申诉标题（5–100字）</label>
     <input id="sf-appeal-title" value={subject} onChange={e=>setSubject(e.target.value)} minLength={5} maxLength={100} required placeholder="简单描述希望复核的问题"/>
     <label htmlFor="sf-appeal-body">原因与事实说明（20–2000字）</label>
     <textarea id="sf-appeal-body" rows={6} value={body} onChange={e=>setBody(e.target.value)} minLength={20} maxLength={2000} required placeholder="说明被处理内容、时间和申诉理由。不要粘贴密码或私密密钥。"/>
     <button disabled={busy||subject.trim().length<5||body.trim().length<20} type="submit">{busy?'正在提交…':'提交申诉'}</button>
    </form>
    <p className="sf-growth-note">最多同时保留3条待审申诉，每24小时最多提交5条。审核认可不等于自动撤销封禁，账号处置另由管理员审查。</p>
   </section>
   <section className="sf-growth-card"><h2>我的处理记录 · {appeals.length}</h2>
    {appeals.length===0?<p>还没有提交过申诉。</p>:appeals.map(a=><article key={a.id} className="sf-growth-item">
     <strong>{a.subject}</strong><small>{catLabel[a.category]||a.category} · {new Date(a.created_at).toLocaleString('zh-CN')} · {statusLabel[a.status]||a.status}</small>
     <p>{a.body}</p>
     {a.response&&<p role="status"><strong>审核反馈：</strong>{a.response}</p>}
    </article>)}
   </section>
  </>}
 </div></main>;
}
