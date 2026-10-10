'use client';

import {useCallback,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import Link from 'next/link';
import {BadgeCheck,Building2,Check,Clock3,Link2,ShieldCheck,UserPlus,X} from 'lucide-react';
import {db,hasConfig} from '@/lib/supabase';

type P={id:string;handle:string;display_name:string;avatar_url:string|null};
type Rel={id:string;org_id:string;affiliate_id:string;affiliate_kind:'individual'|'organization';status:'pending'|'active'|'declined'|'revoked';invited_at:string};
const explain=(x:unknown)=>x instanceof Error?x.message:'操作未完成，请稍后重试。';

export function StarflowAffiliationManager(){
 const [viewer,setViewer]=useState<P|null>(null);
 const [canManage,setCanManage]=useState(false);
 const [connections,setConnections]=useState<Rel[]>([]);
 const [profiles,setProfiles]=useState<Record<string,P>>({});
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState('');
 const [error,setError]=useState('');
 const [hint,setHint]=useState('');
 const [handle,setHandle]=useState('');
 const [kind,setKind]=useState<'individual'|'organization'>('individual');
 const load=useCallback(async()=>{
  if(!hasConfig()){setError('数据库配置不可用。');setLoading(false);return}
  setLoading(true);setError('');
  try{
   const client=db();
   const {data:auth,error:authError}=await client.auth.getUser();
   if(authError||!auth.user)throw new Error('请登录后管理关联账号。');
   const id=auth.user.id;
   const [who,ver,orgRows,personalRows]=await Promise.all([
    client.from('profiles').select('id,handle,display_name,avatar_url').eq('id',id).single(),
    client.from('account_verifications').select('status,verification_type').eq('profile_id',id).maybeSingle(),
    client.from('organization_affiliations').select('id,org_id,affiliate_id,affiliate_kind,status,invited_at').eq('org_id',id).order('invited_at',{ascending:false}).limit(200),
    client.from('organization_affiliations').select('id,org_id,affiliate_id,affiliate_kind,status,invited_at').eq('affiliate_id',id).order('invited_at',{ascending:false}).limit(100)
   ]);
   if(who.error)throw who.error;
   if(ver.error)throw ver.error;
   if(orgRows.error)throw orgRows.error;
   if(personalRows.error)throw personalRows.error;
   const all=[...(orgRows.data??[]),...(personalRows.data??[])].filter((r,i,a)=>a.findIndex(x=>x.id===r.id)===i) as Rel[];
   const ids=[...new Set(all.flatMap(r=>[r.org_id,r.affiliate_id]).concat(id))];
   const {data:participants,error:profilesError}=await client.from('profiles').select('id,handle,display_name,avatar_url').in('id',ids);
   if(profilesError)throw profilesError;
   setViewer(who.data as P);
   setCanManage(ver.data?.status==='approved'&&['gold','gray'].includes(ver.data.verification_type));
   setConnections(all);setProfiles(Object.fromEntries((participants??[]).map(x=>[x.id,x as P])));
  }catch(e){setError(explain(e))}finally{setLoading(false)}
 },[]);
 useEffect(()=>{void load()},[load]);
 async function sendInvite(event:FormEvent){
  event.preventDefault();if(!handle.trim()||busy)return;
  setBusy('invite');setError('');setHint('');
  try{const {error}=await db().rpc('sf_invite_organization_affiliate',{p_handle:handle.trim().replace(/^@/,''),p_type:kind});if(error)throw error;
   setHandle('');setHint('邀请已发送，对方接受后才会显示官方关联徽章。');await load();
  }catch(e){setError(explain(e))}finally{setBusy('')}
 }
 async function respond(id:string,accept:boolean){
  if(busy)return;setBusy(id);setError('');setHint('');
  try{const {error}=await db().rpc('sf_respond_organization_affiliation',{p_affiliation:id,p_accept:accept});if(error)throw error;
   setHint(accept?'已接受邀请，官方关联徽章现已生效。':'已拒绝邀请。');await load();
  }catch(e){setError(explain(e))}finally{setBusy('')}
 }
 async function remove(id:string){
  if(busy||!window.confirm('确认解除此官方账号关联？解除后徽章将立即消失。'))return;
  setBusy(id);setError('');setHint('');
  try{const {error}=await db().rpc('sf_remove_organization_affiliation',{p_affiliation:id});if(error)throw error;
   setHint('关联已解除。');await load();
  }catch(e){setError(explain(e))}finally{setBusy('')}
 }
 const owner=viewer?connections.filter(r=>r.org_id===viewer.id&&['pending','active'].includes(r.status)):[];
 const mine=viewer?connections.filter(r=>r.affiliate_id===viewer.id&&['pending','active'].includes(r.status)):[];
 const active=owner.filter(r=>r.status==='active');
 function avatar(person:P|undefined){return person?.avatar_url?<img src={person.avatar_url} alt=""/>:<span>{(person?.display_name||'S').slice(0,1).toUpperCase()}</span>}
 function record(r:Rel,context:'owner'|'member'){
  const person=profiles[context==='owner'?r.affiliate_id:r.org_id];
  return <div className="sf-aff-person" key={r.id}>
    <div className="sf-aff-avatar">{avatar(person)}</div>
    <div className="sf-aff-person-info"><Link href={person?`/profile/${encodeURIComponent(person.handle)}`:'#'}>{person?.display_name||'Starflow 账号'}</Link>
      <small>@{person?.handle||'unknown'} · {r.affiliate_kind==='individual'?'个人账号':'组织账号'}</small>
      <small>{r.status==='active'?'已关联':'等待接受'} · {new Date(r.invited_at).toLocaleDateString('zh-CN')}</small>
    </div>
    {context==='member'&&r.status==='pending'?<div className="sf-aff-actions">
      <button disabled={!!busy} className="sf-aff-primary" onClick={()=>void respond(r.id,true)}><Check size={15}/>接受</button>
      <button disabled={!!busy} onClick={()=>void respond(r.id,false)}><X size={15}/>拒绝</button>
    </div>:<button disabled={!!busy} className="sf-aff-outline" onClick={()=>void remove(r.id)}>{r.status==='pending'?'取消邀请':'解除关联'}</button>}
  </div>;
 }
 return <main className="sf-aff-page"><div className="sf-aff-wrap">
   <Link className="sf-aff-back" href="/settings">← 返回设置</Link>
   <div className="sf-aff-page-head"><div className="sf-aff-icon"><Building2 size={25}/></div><h1>官方附属账号</h1><p>把官方组织与旗下品牌、成员或团队账号关联起来。附属标志是官方账号的头像，不是额外注册的账号。</p></div>
   {loading?<div className="sf-aff-card">正在读取账户关系…</div>:<>
    {error&&<p className="sf-aff-error" role="alert">{error}</p>}{hint&&<p className="sf-aff-hint" role="status">{hint}</p>}
    {canManage?<section className="sf-aff-card"><div className="sf-aff-title"><UserPlus size={21}/><h2>邀请附属账号</h2></div><p>你的组织已具备金色或灰色有效认证资格。被邀请者同意前，不会获得关联徽章。</p>
      <form className="sf-aff-invite" onSubmit={sendInvite}>
        <label>被邀请账号的用户名（@）<input autoComplete="off" maxLength={32} placeholder="例如 @starflow_support" value={handle} onChange={e=>setHandle(e.target.value)}/></label>
        <label>账号类型<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="individual">个人／员工（蓝色勾）</option><option value="organization">旗下品牌／部门（组织色勾）</option></select></label>
        <button type="submit" disabled={!!busy||!handle.trim()} className="sf-aff-primary"><UserPlus size={16}/>发送邀请</button>
      </form>
      <div className="sf-aff-note"><ShieldCheck size={18}/>只有关联到有效认证组织，且邀请经本人同意，徽章才显示。失效、撤销或拒绝的关系不会显示。</div>
    </section>:<section className="sf-aff-card sf-aff-unverified"><BadgeCheck size={23}/><div><strong>组织邀请管理</strong><p>只有通过 Starflow 金色或灰色组织认证的账号可以邀请附属账号。你仍然可以接受来自其他组织的邀请。</p><Link href="/verification">前往认证中心 →</Link></div></section>}
    <section className="sf-aff-card"><div className="sf-aff-title"><Building2 size={20}/><h2>我收到的邀请和关联</h2><span>{mine.length}</span></div>
      {mine.length?mine.map(r=>record(r,'member')):<p className="sf-aff-quiet">暂无待接受的邀请或有效的关联关系。</p>}
    </section>
    {canManage&&<section className="sf-aff-card"><div className="sf-aff-title"><Link2 size={20}/><h2>组织旗下账号</h2><span>{active.length} 已关联</span></div>
      {owner.length?owner.map(r=>record(r,'owner')):<p className="sf-aff-quiet">尚未邀请附属账号。发送邀请后会显示在这里。</p>}
    </section>}
    <section className="sf-aff-card"><div className="sf-aff-title"><Clock3 size={20}/><h2>关联说明</h2></div>
      <p>账号关系不转移密码、登录权限或原有内容。组织可以撤销邀请或关联；附属账号也可自行解除。附属徽章可以点击进入所属组织的个人主页。</p>
    </section>
   </>}
 </div></main>
}
