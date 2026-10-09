'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,CheckCircle2,LayoutDashboard,ShieldCheck,Users,FileText,Flag,RefreshCw,LockKeyhole} from 'lucide-react';
import {db,hasConfig} from '@/lib/supabase';
import {LanguageSwitch,useLanguage} from './LanguageProvider';

type Report={id:string;reason:string;post_id:string;created_at:string;reviewed_at:string|null};
export function AdminStudio(){
 const {lang,t}=useLanguage(); const en=lang==='en';
 const [authorized,setAuthorized]=useState<boolean|null>(null);const [reports,setReports]=useState<Report[]>([]);
 const [stats,setStats]=useState({users:0,posts:0,reports:0});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const refresh=useCallback(async()=>{
  if(!hasConfig()){setAuthorized(false);return}
  setBusy(true);const client=db();
  try{
   const {data:{user}}=await client.auth.getUser();if(!user){setAuthorized(false);return}
   const {data:admin,error:roleError}=await client.rpc('is_platform_admin');if(roleError)throw roleError;
   if(!admin){setAuthorized(false);return}setAuthorized(true);
   const [u,p,r,queue]=await Promise.all([
    client.from('profiles').select('id',{count:'exact',head:true}),
    client.from('posts').select('id',{count:'exact',head:true}),
    client.from('reports').select('id',{count:'exact',head:true}).is('reviewed_at',null),
    client.from('reports').select('id,reason,post_id,created_at,reviewed_at').is('reviewed_at',null).order('created_at',{ascending:false}).limit(35)
   ]);
   if(u.error||p.error||r.error||queue.error)throw new Error(u.error?.message||p.error?.message||r.error?.message||queue.error?.message);
   setStats({users:u.count??0,posts:p.count??0,reports:r.count??0});setReports((queue.data||[]) as Report[]);
  }catch(err){setMessage(err instanceof Error?err.message:String(err));setAuthorized(false)}finally{setBusy(false)}
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 async function review(id:string){setBusy(true);const {error}=await db().from('reports').update({reviewed_at:new Date().toISOString()}).eq('id',id).is('reviewed_at',null);if(error){setMessage(error.message);setBusy(false)}else await refresh()}
 return <div className="sf-admin-app"><div className="sf-admin-top"><Link href="/" className="sf-admin-back"><ArrowLeft size={18}/>{t('home')}</Link><b>✦ starflow<span>.</span> <small>STUDIO</small></b><LanguageSwitch/></div>
  {authorized===null?<div className="sf-admin-message">{t('loading')}</div>:!authorized?<div className="sf-admin-message"><LockKeyhole size={30}/><h2>{en?'Admin access required':'需要管理员权限'}</h2><p>{en?'Only accounts explicitly authorized by the database owner can access this area.':'只有数据库所有者明确授权的账号可以访问管理中心。'}</p><Link href="/" className="btn btn-primary">{t('home')}</Link>{message&&<p>{message}</p>}</div>:<div className="sf-admin-container">
   <div className="sf-admin-hero"><div className="sf-admin-eyebrow"><LayoutDashboard size={15}/> STARFLOW · STUDIO</div><h1>{t('admin')}</h1><p>{en?'Manage your community with a clear view of activity and reported content.':'在统一的工作台查看社区数据、处理举报并维护平台秩序。'}</p></div>
   <div className="sf-admin-controls"><h2>{en?'Overview':'运营总览'}</h2><button className="btn btn-outline" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16}/>{en?'Refresh':'刷新数据'}</button></div>
   <div className="sf-admin-stats"><div><Users/><small>{en?'Total profiles':'用户总数'}</small><strong>{stats.users.toLocaleString()}</strong></div><div><FileText/><small>{en?'Total posts':'动态总数'}</small><strong>{stats.posts.toLocaleString()}</strong></div><div><Flag/><small>{en?'Open reports':'待审核举报'}</small><strong>{stats.reports.toLocaleString()}</strong></div></div>
   <div className="sf-admin-table"><div className="sf-admin-table-head"><h3><ShieldCheck size={19}/>{en?'Report review queue':'内容举报审核队列'}</h3><span>{en?'Live database':'真实数据库'}</span></div>{reports.length?reports.map(r=><div className="sf-admin-report" key={r.id}><div className="sf-admin-report-text"><strong>{r.reason}</strong><small>{new Date(r.created_at).toLocaleString(en?'en-US':'zh-CN')} · {r.post_id.slice(0,8)}…</small></div><button className="btn btn-outline" disabled={busy} onClick={()=>void review(r.id)}><CheckCircle2 size={15}/>{en?'Mark reviewed':'标记已审核'}</button></div>):<p className="sf-admin-empty">{en?'No pending reports.':'暂无待审核举报。'}</p>}</div>
   {message&&<p role="alert" className="form-error">{message}</p>}<p className="sf-admin-note">{en?'Administrative access and report updates are verified by Supabase RLS policies, not by hiding buttons in the UI.':'管理员权限和审核操作由 Supabase 数据库 RLS 策略验证，而不仅仅是隐藏页面按钮。'}</p>
  </div>}
 </div>
}
