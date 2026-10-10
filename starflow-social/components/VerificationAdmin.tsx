'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {db,hasConfig} from '@/lib/supabase';
import './StarflowExtras.css';

type Application={id:string;user_id:string;verification_type:'blue'|'gold'|'gray';statement:string;status:string;submitted_at:string;reviewer_note:string|null};
const title:Record<string,string>={blue:'蓝色 Premium 资格',gold:'金色企业认证',gray:'灰色政府与组织认证'};
export function VerificationAdmin(){
 const [ready,setReady]=useState(false);const [authorized,setAuthorized]=useState(false);
 const [applications,setApplications]=useState<Application[]>([]);const [filter,setFilter]=useState('pending');
 const [activeBadges,setActiveBadges]=useState<string[]>([]);const [busy,setBusy]=useState<string|null>(null);const [notes,setNotes]=useState<Record<string,string>>({});const [notice,setNotice]=useState('');
 const load=async()=>{
  if(!hasConfig()){setReady(true);setNotice('服务尚未配置');return;}
  const {data:{user}}=await db().auth.getUser();if(!user){setReady(true);return;}
  const {data,isAdminError}=await (async()=>{const r=await db().rpc('is_platform_admin');return {data:r.data,isAdminError:r.error}})();
  if(isAdminError||data!==true){setReady(true);return;}
  setAuthorized(true);
  const {data:active}=await db().from('account_verifications').select('profile_id').eq('status','approved');
  setActiveBadges((active||[]).map(x=>x.profile_id));
  const {data:rows,error}=await db().from('verification_applications').select('id,user_id,verification_type,statement,status,submitted_at,reviewer_note').order('submitted_at',{ascending:false}).limit(100);
  if(error)setNotice('读取审核队列失败：'+error.message);else setApplications((rows||[]) as Application[]);
  setReady(true);
 };
 useEffect(()=>{void load()},[]); // eslint-disable-line react-hooks/exhaustive-deps
 async function review(a:Application,decision:'approved'|'rejected'){
  const description=decision==='approved'?'批准并正式发放认证':'拒绝认证申请';
  if(!confirm(`确定要${description}吗？此操作会记录审核日志。`))return;
  setBusy(a.id);setNotice('');
  const {error}=await db().rpc('review_verification_application',{p_application:a.id,p_decision:decision,p_note:(notes[a.id]||'').trim()});
  setNotice(error?'审核失败：'+error.message:'审核成功：数据库已记录决定及操作日志');await load();setBusy(null);
 }
 async function revoke(a:Application){
  const reason=prompt('请输入撤销认证原因（将记录审核日志）');if(reason===null)return;
  if(!reason.trim()){setNotice('请输入撤销理由');return;}
  if(!confirm('确认撤销该用户的认证标志吗？'))return;
  setBusy(a.id);const {error}=await db().rpc('revoke_account_verification',{p_profile_id:a.user_id,p_reason:reason.trim().slice(0,1000)});
  setNotice(error?'撤销失败：'+error.message:'认证已撤销，用户徽章将不再显示');await load();setBusy(null);
 }
 return <main className="sf-hub"><div className="sf-hub-inner"><header><Link href="/admin">← 返回管理后台</Link><Link href="/">Starflow 首页</Link></header>
  <h1>三色认证审核</h1><p className="sf-hub-help">认证必须由真实管理员核验资料后发放。普通账号不能批准自己的申请。蓝色认证不等于身份证明。</p>
  {!ready?<p>检查管理员权限…</p>:!authorized?<p role="alert" className="sf-hub-status">需要经过数据库授权的管理员账号。</p>:<>
   <div className="sf-hub-tabs">{['pending','approved','rejected','all'].map(x=><button key={x} onClick={()=>setFilter(x)} className={filter===x?'active':''}>{({pending:'待审核',approved:'已批准',rejected:'已拒绝',all:'全部'} as Record<string,string>)[x]}</button>)}</div>
   {notice&&<p className="sf-hub-status" role="status">{notice}</p>}
   {applications.filter(a=>filter==='all'||a.status===filter).length===0?<div className="sf-hub-card">没有符合条件的申请。</div>:
    applications.filter(a=>filter==='all'||a.status===filter).map(a=><section key={a.id} className="sf-hub-card">
      <h2>{title[a.verification_type]}</h2><p className="sf-hub-help">申请账号：{a.user_id} · {new Date(a.submitted_at).toLocaleString('zh-CN')}</p>
      <p style={{whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{a.statement}</p><p>状态：{a.status}</p>
      {a.status==='pending'&&<><textarea aria-label="审核备注" maxLength={1000} placeholder="填写审批原因或复核说明" value={notes[a.id]||''} onChange={e=>setNotes(p=>({...p,[a.id]:e.target.value}))}/>
       <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:10}}><button className="sf-hub-btn" disabled={busy!==null} onClick={()=>void review(a,'approved')}>批准并发放</button><button className="sf-hub-outline" disabled={busy!==null} onClick={()=>void review(a,'rejected')}>拒绝申请</button></div></>}
      {a.status==='approved'&&activeBadges.includes(a.user_id)&&<button className="sf-hub-outline" disabled={busy!==null} onClick={()=>void revoke(a)}>撤销认证</button>}
      {a.reviewer_note&&<p>审核意见：{a.reviewer_note}</p>}
     </section>)}
  </>}
 </div></main>;
}
