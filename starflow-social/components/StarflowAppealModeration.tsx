'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {db,hasConfig} from '@/lib/supabase';
import './StarflowGrowth.css';
type Item={id:string;user_id:string;category:string;subject:string;body:string;created_at:string};
export function StarflowAppealModeration(){
 const [authorized,setAuthorized]=useState(false);
 const [loading,setLoading]=useState(true);
 const [items,setItems]=useState<Item[]>([]);
 const [selected,setSelected]=useState('');
 const [decision,setDecision]=useState<'approved'|'rejected'>('approved');
 const [response,setResponse]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');const [notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true;
  if(!hasConfig()){setError('数据库尚未配置');setLoading(false);return;}
  (async()=>{
   const client=db();
   const {data:{user},error:err}=await client.auth.getUser();
   if(err||!user)throw Error('请先登录获授权的管理员账号');
   const role=await client.from('sf_staff_roles').select('role,enabled').eq('user_id',user.id).maybeSingle();
   if(role.error||!role.data?.enabled||!['founder','super_admin'].includes(role.data.role))throw Error('只有创始人与超级管理员可以审核申诉');
   if(!active)return;setAuthorized(true);
   const queue=await client.from('sf_user_appeals').select('id,user_id,category,subject,body,created_at')
    .eq('status','pending').order('created_at',{ascending:true}).limit(100);
   if(queue.error)throw queue.error;
   if(active)setItems((queue.data||[]) as Item[]);
  })().catch(e=>{if(active)setError(e instanceof Error?e.message:'无法读取审核队列')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false;};
 },[]);
 async function review(){
  if(!selected||busy||response.trim().length<10)return;
  if(!window.confirm('确认'+(decision==='approved'?'认可':'驳回')+'这条真实用户申诉？这会产生审计与站内通知。'))return;
  setBusy(true);setError('');setNotice('');
  try{
   const {data,error:e}=await db().rpc('sf_admin_review_appeal',{
    p_appeal_id:selected,p_decision:decision,p_response:response.trim()
   });
   if(e||data!==true)throw Error(e?.message||'审核未成功');
   setItems(previous=>previous.filter(x=>x.id!==selected));setSelected('');setResponse('');
   setNotice('申诉已处理，数据库记录审计，并向当事用户发送站内通知。');
  }catch(e){setError(e instanceof Error?e.message:'审核失败');}
  finally{setBusy(false);}
 }
 return <main className="sf-growth-page"><div className="sf-growth-shell">
  <nav className="sf-growth-nav"><Link href="/admin/console">← 返回超级管理中心</Link><Link href="/">Starflow 首页</Link></nav>
  <h1>✦ 用户申诉审核</h1>
  <p className="sf-growth-note">仅创始人与超级管理员可处理申诉。审核意见不会自动解除账号封禁，解除限制仍需使用现有受控操作。</p>
  {loading?<p role="status">正在验证管理员权限…</p>:!authorized?<p role="alert" className="sf-growth-error">{error||'无权访问'}</p>:<>
   {notice&&<p className="sf-growth-notice" role="status">{notice}</p>}
   {error&&<p className="sf-growth-error" role="alert">{error}</p>}
   <section className="sf-growth-card"><h2>待审核申诉 · {items.length}</h2>
    {items.length===0?<p>当前没有待审申诉。</p>:items.map(item=><article key={item.id} className="sf-growth-item">
      <p><strong>{item.subject}</strong></p>
      <small>类型：{item.category} · 用户 ID：{item.user_id} · {new Date(item.created_at).toLocaleString('zh-CN')}</small>
      <p>{item.body}</p>
      <button type="button" disabled={busy} className="secondary" onClick={()=>{setSelected(item.id);setResponse('');}}>审核这条申诉</button>
    </article>)}
   </section>
   {selected&&<section className="sf-growth-card"><h2>填写审核决定</h2>
    <label htmlFor="sf-appeal-decision">处理结果</label>
    <select id="sf-appeal-decision" value={decision} onChange={e=>setDecision(e.target.value as 'approved'|'rejected')}>
     <option value="approved">认可申诉</option><option value="rejected">不予认可</option>
    </select>
    <label htmlFor="sf-appeal-admin-response">给用户的说明（10–1000字）</label>
    <textarea id="sf-appeal-admin-response" value={response} minLength={10} maxLength={1000} rows={4} onChange={e=>setResponse(e.target.value)} required/>
    <div className="sf-growth-actions">
     <button type="button" disabled={busy||response.trim().length<10} onClick={()=>void review()}>确认处理并通知用户</button>
     <button type="button" className="secondary" onClick={()=>setSelected('')}>取消</button>
    </div>
   </section>}
  </>}
 </div></main>;
}
