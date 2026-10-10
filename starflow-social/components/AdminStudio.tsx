'use client';
import {useEffect,useState,useCallback} from 'react';
import Link from 'next/link';
import {db,hasConfig} from '@/lib/supabase';
import './StarflowExtras.css';

type Report={id:string;reason:string;post_id:string;created_at:string;reviewed_at:string|null};
export function AdminStudio(){
 const [authorized,setAuthorized]=useState<boolean|null>(null);
 const [userId,setUserId]=useState('');
 const [counts,setCounts]=useState({users:0,posts:0,reports:0});
 const [reports,setReports]=useState<Report[]>([]);
 const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  if(!hasConfig()){setAuthorized(false);return;}
  setBusy(true);
  const client=db();const {data:{user}}=await client.auth.getUser();
  if(!user){setAuthorized(false);setBusy(false);return;}
  setUserId(user.id);
  const {data:isAdmin,error:authError}=await client.rpc('is_platform_admin');
  if(authError||isAdmin!==true){setAuthorized(false);setBusy(false);return;}
  setAuthorized(true);
  const [u,p,r,queue]=await Promise.all([
   client.from('profiles').select('id',{head:true,count:'exact'}),
   client.from('posts').select('id',{head:true,count:'exact'}),
   client.from('reports').select('id',{head:true,count:'exact'}).is('reviewed_at',null),
   client.from('reports').select('id,reason,post_id,created_at,reviewed_at').is('reviewed_at',null).order('created_at',{ascending:false}).limit(50)
  ]);
  const firstError=u.error||p.error||r.error||queue.error;
  if(firstError)setNotice('读取管理数据失败：'+firstError.message);
  else{setCounts({users:u.count||0,posts:p.count||0,reports:r.count||0});setReports((queue.data||[]) as Report[])}
  setBusy(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 async function review(id:string){
  if(!confirm('确定标记这条举报已经完成审核吗？'))return;
  setBusy(true);
  const {error}=await db().from('reports').update({reviewed_at:new Date().toISOString()}).eq('id',id).is('reviewed_at',null);
  setNotice(error?'操作失败：'+error.message:'审核状态已经保存');await load();setBusy(false);
 }
 async function removePost(report:Report){
  if(!confirm('确认删除被举报的公开帖子吗？此操作会删除该帖子及其关联数据，不能直接撤回。'))return;
  setBusy(true);
  const {error}=await db().from('posts').delete().eq('id',report.post_id);
  if(error){setNotice('删除失败：'+error.message);setBusy(false);return;}
  const {error:markError}=await db().from('reports').update({reviewed_at:new Date().toISOString()}).eq('id',report.id);
  setNotice(markError?'帖子已删除，但举报审核状态更新失败：'+markError.message:'帖子已删除，举报审核已完成');await load();setBusy(false);
 }
 return <main className="sf-hub"><div className="sf-hub-inner">
  <header><Link href="/">← 返回 Starflow</Link><Link href="/admin/verifications">认证审核 →</Link></header>
  <h1>✦ Starflow 管理中心</h1>
  {authorized===null?<p>正在检查权限…</p>:authorized===false?<section className="sf-hub-card">
   <h2>需要管理员权限</h2><p className="sf-hub-help">账号必须由数据库所有者明确授权，普通用户不能自行获取管理员身份。</p>
   {userId&&<p className="sf-hub-help">当前登录账号 ID：<code style={{wordBreak:'break-all'}}>{userId}</code></p>}
   <Link href="/">返回首页</Link>
  </section>:<>
   <div className="sf-stat-grid">
    <div className="sf-stat"><span>注册用户</span><strong>{counts.users}</strong></div>
    <div className="sf-stat"><span>公开帖子</span><strong>{counts.posts}</strong></div>
    <div className="sf-stat"><span>待处理举报</span><strong>{counts.reports}</strong></div>
   </div>
   <section className="sf-hub-card"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><h2>内容举报审核</h2><button className="sf-hub-outline" disabled={busy} onClick={()=>void load()}>刷新</button></div>
    {reports.length===0?<p className="sf-hub-help">当前没有待审核举报。</p>:reports.map(r=><div key={r.id} className="sf-hub-feed">
     <strong>{r.reason}</strong><p className="sf-hub-help">举报时间：{new Date(r.created_at).toLocaleString('zh-CN')} · 帖子：<Link href={`/post/${r.post_id}`}>查看内容</Link></p>
     <div style={{display:'flex',flexWrap:'wrap',gap:8}}><button className="sf-hub-outline" disabled={busy} onClick={()=>void review(r.id)}>标记已审核</button><button className="sf-hub-outline" disabled={busy} onClick={()=>void removePost(r)}>删除违规内容</button></div>
    </div>)}
   </section>
   <section className="sf-hub-card"><h2>认证与角色管理</h2><p className="sf-hub-help">认证发放由受控服务端执行并记录审计日志。</p><Link href="/admin/verifications" className="sf-hub-btn" style={{display:'inline-block',textDecoration:'none'}}>打开蓝／金／灰审核队列</Link></section>
   <p className="sf-hub-help">审核及删除操作均须通过数据库管理员权限检查。</p>
  </>}
  {notice&&<div className="sf-hub-status" role="status">{notice}</div>}
 </div></main>;
}
