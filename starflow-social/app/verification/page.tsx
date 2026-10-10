
'use client';

import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {db,hasConfig} from '@/lib/supabase';
import {VerificationBadge,type VerificationKind} from '@/components/VerificationBadge';

type Application={id:string;verification_type:VerificationKind;status:string;submitted_at:string;reviewer_note:string|null};

const TYPES: {value:VerificationKind;title:string;desc:string}[]=[
 {value:'blue',title:'蓝色认证',desc:'Premium 订阅资格。不是身份证明；目前不提供虚拟付款或自动发放。'},
 {value:'gold',title:'金色认证',desc:'企业、品牌或组织申请；需提供真实注册与组织信息。'},
 {value:'gray',title:'灰色认证',desc:'政府部门、政府人员或符合资格的多边组织。'}
];

const LABELS:Record<string,string>={pending:'审核中',approved:'已批准',rejected:'已拒绝',withdrawn:'已撤回'};

export default function VerificationPage(){
 const [user,setUser]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [kind,setKind]=useState<VerificationKind>('blue');
 const [statement,setStatement]=useState('');
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [applications,setApplications]=useState<Application[]>([]);

 const reload=useCallback(async(id:string)=>{
   const {data,error}=await db().from('verification_applications')
     .select('id,verification_type,status,submitted_at,reviewer_note').eq('user_id',id)
     .order('submitted_at',{ascending:false}).limit(20);
   if(error)setNotice('读取申请记录失败：'+error.message);
   else setApplications((data||[]) as Application[]);
 },[]);

 useEffect(()=>{
   if(!hasConfig()){setNotice('认证服务尚未配置');setLoading(false);return;}
   let active=true;
   db().auth.getUser().then(({data:{user},error})=>{
     if(!active)return;
     const id=error?null:user?.id??null;setUser(id);setLoading(false);
     if(id)void reload(id);
   }).catch(()=>{if(active){setNotice('暂时无法验证登录状态');setLoading(false)}});
   return()=>{active=false};
 },[reload]);

 async function submit(event:FormEvent<HTMLFormElement>){
   event.preventDefault();if(!user||busy)return;
   const value=statement.trim();if(value.length<20||value.length>2000){setNotice('申请说明应为 20～2000 字');return}
   setBusy(true);setNotice('');
   try{
     const {error}=await db().from('verification_applications').insert({user_id:user,verification_type:kind,statement:value});
     if(error)throw error;
     setStatement('');setNotice('申请已提交，等待平台审核。提交不代表已获得认证。');
     await reload(user);
   }catch(e){setNotice('提交失败：'+(e instanceof Error?e.message:'请稍后重试'))}
   finally{setBusy(false)}
 }

 return <main style={{minHeight:'100dvh',background:'linear-gradient(145deg,#fffafe,#f7e9fa,#eee4ff)',padding:'24px 16px 80px',color:'#252137'}}>
  <div style={{maxWidth:650,margin:'0 auto'}}>
   <Link href="/" style={{display:'inline-block',marginBottom:22,fontWeight:700,color:'#7552b0'}}>← 返回 Starflow</Link>
   <h1 style={{fontSize:28,margin:'0 0 7px'}}>账号认证中心</h1>
   <p style={{color:'#776f8a',lineHeight:1.8}}>三类认证分别审核。只有平台批准且状态有效的账号会显示认证标志。</p>

   <section style={{background:'rgba(255,255,255,.85)',border:'1px solid #eaddec',borderRadius:23,padding:22,marginTop:23}}>
    <h2 style={{fontSize:18}}>认证类型</h2>
    {TYPES.map(x=><div key={x.value} style={{display:'flex',gap:12,padding:'14px 0',borderBottom:'1px solid #f1e7f0',alignItems:'flex-start'}}>
      <VerificationBadge kind={x.value} size={24}/>
      <div><b>{x.title}</b><p style={{fontSize:13,lineHeight:1.7,margin:'5px 0',color:'#726d7d'}}>{x.desc}</p></div>
    </div>)}
   </section>

   <section style={{background:'rgba(255,255,255,.87)',border:'1px solid #eaddec',borderRadius:23,padding:22,marginTop:17}}>
    <h2 style={{fontSize:18}}>提交认证申请</h2>
    {loading?<p>正在检查登录状态…</p>:!user?<p>需要登录后才可以提交认证申请。<Link href="/" style={{color:'#734cba',fontWeight:700}}>返回首页登录 →</Link></p>:
    <form onSubmit={submit} style={{display:'grid',gap:15}}>
     <label style={{display:'grid',gap:8}}>申请类型
      <select value={kind} onChange={e=>setKind(e.target.value as VerificationKind)} style={{padding:13,borderRadius:12,border:'1px solid #e1cde9',background:'#fff'}}>
        {TYPES.map(x=><option key={x.value} value={x.value}>{x.title}</option>)}
      </select>
     </label>
     <label style={{display:'grid',gap:8}}>申请说明
      <textarea value={statement} onChange={e=>setStatement(e.target.value)} required minLength={20} maxLength={2000} rows={6}
       placeholder="请说明账号、所属企业或组织、申请资格，以及可供后续核验的信息（不要填写身份证号等敏感资料）。"
       style={{padding:13,borderRadius:12,border:'1px solid #e1cde9',resize:'vertical',background:'#fff'}}/>
     </label>
     <button disabled={busy} type="submit" style={{border:0,padding:'14px 20px',borderRadius:999,background:'linear-gradient(115deg,#ee8bc7,#ab92eb)',color:'#fff',fontWeight:800,cursor:'pointer'}}>{busy?'提交中…':'提交审核申请'}</button>
    </form>}
    {notice&&<p role="status" style={{color:'#874d91'}}>{notice}</p>}
   </section>

   {user&&<section style={{background:'rgba(255,255,255,.87)',border:'1px solid #eaddec',borderRadius:23,padding:22,marginTop:17}}>
    <h2 style={{fontSize:18}}>我的申请</h2>
    {applications.length===0?<p>暂无申请记录。</p>:applications.map(x=><div key={x.id} style={{padding:'12px 0',borderBottom:'1px solid #eee3ef'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
       <strong>{TYPES.find(t=>t.value===x.verification_type)?.title||x.verification_type}</strong>
       <span>{LABELS[x.status]||x.status}</span>
      </div>
      <small style={{color:'#8a8295'}}>{new Date(x.submitted_at).toLocaleString('zh-CN')}</small>
      {x.reviewer_note&&<p>{x.reviewer_note}</p>}
    </div>)}
   </section>}
  </div>
 </main>;
}
