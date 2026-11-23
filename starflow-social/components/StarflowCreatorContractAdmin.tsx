'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {db,hasConfig} from '@/lib/supabase';
import './StarflowContract.css';

type Candidate={user_id:string;handle:string;display_name:string;posts_90d:number;likes_90d:number;followers:number};
type Agreement={
 id:string;creator_id:string;title:string;platform_legal_entity:string;status:string;
 agreement_body:string;agreement_hash:string;selection_note:string;
 created_at:string;expires_at:string;creator_signature:string|null;creator_signed_at:string|null;
 platform_signature:string|null;platform_signed_at:string|null;completed_at:string|null;
};
const fmt=(date:string|null)=>date?new Date(date).toLocaleString('zh-CN',{hour12:false}):'—';
const statuses:Record<string,string>={invited:'已邀请，等待创作者',creator_signed:'创作者已签，待平台复签',completed:'双方签署完成',declined:'创作者拒绝',withdrawn:'邀请已撤回'};
export function StarflowCreatorContractAdmin(){
 const [role,setRole]=useState('');
 const [loading,setLoading]=useState(true);
 const [query,setQuery]=useState('');
 const [candidates,setCandidates]=useState<Candidate[]>([]);
 const [contracts,setContracts]=useState<Agreement[]>([]);
 const [selected,setSelected]=useState<Candidate|null>(null);
 const [title,setTitle]=useState('');const [entity,setEntity]=useState('');
 const [body,setBody]=useState('');const [reason,setReason]=useState('');
 const [sourcePost,setSourcePost]=useState('');const [expiryDays,setExpiryDays]=useState(14);
 const [platformName,setPlatformName]=useState('');
 const [confirm,setConfirm]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');const [error,setError]=useState('');
 const isSigner=role==='founder'||role==='super_admin';
 const reload=useCallback(async(search:string)=>{
  const client=db();
  const [profiles,agreements]=await Promise.all([
   client.rpc('sf_contract_candidates',{p_query:search.trim().slice(0,50)}),
   client.from('sf_creator_contracts')
    .select('id,creator_id,title,platform_legal_entity,status,agreement_body,agreement_hash,selection_note,created_at,expires_at,creator_signature,creator_signed_at,platform_signature,platform_signed_at,completed_at')
    .order('created_at',{ascending:false}).limit(80)
  ]);
  if(profiles.error)throw profiles.error;
  if(agreements.error)throw agreements.error;
  setCandidates((profiles.data||[]) as Candidate[]);
  setContracts((agreements.data||[]) as Agreement[]);
 },[]);
 useEffect(()=>{
  let alive=true;
  if(!hasConfig()){setError('账号服务未配置');setLoading(false);return;}
  (async()=>{
   const client=db();
   const {data:{user},error:e}=await client.auth.getUser();
   if(e||!user)throw Error('请登录管理员账号');
   const s=await client.from('sf_staff_roles').select('role,enabled').eq('user_id',user.id).maybeSingle();
   if(s.error||!s.data?.enabled||!['founder','super_admin','official','senior_admin'].includes(s.data.role))throw Error('仅授权运营管理员可以查看创作者筛选台');
   if(!alive)return;
   setRole(s.data.role);
   await reload('');
  })().catch(e=>{if(alive)setError(e instanceof Error?e.message:'无法读取签约管理台')})
   .finally(()=>{if(alive)setLoading(false)});
  return()=>{alive=false};
 },[reload]);
 const perform=async(fn:()=>Promise<void>,success:string)=>{
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{await fn();await reload(query);setMessage(success);}
  catch(e){setError(e instanceof Error?e.message:'操作没有成功');}
  finally{setBusy(false);}
 };
 const invite=()=>perform(async()=>{
  if(!isSigner||!selected)throw Error('只有创始人与超级管理员能发送签约邀请');
  if(!window.confirm('将向选定创作者发送此份不可修改的正式协议邀请。请先确认平台法定主体、授权范围、报酬期限与法律条款已审核。'))return;
  const {data,error:e}=await db().rpc('sf_contract_invite',{
   p_creator:selected.user_id,p_title:title.trim(),p_entity:entity.trim(),
   p_terms:body.trim(),p_reason:reason.trim(),p_source_post:sourcePost.trim()||null,p_expiry_days:expiryDays
  });
  if(e||!data)throw Error(e?.message||'邀请未发出');
  setSelected(null);setTitle('');setBody('');setReason('');setSourcePost('');
 },'签约邀请已通过站内通知发送。该创作者现在可在「我的签约」看到协议全文。');
 const decide=(item:Agreement,action:'sign'|'withdraw')=>perform(async()=>{
  if(!isSigner)throw Error('只有创始人及超级管理员能复签或撤回');
  if(!window.confirm(action==='sign'?'确认创作者已签署且法务审阅无误，平台现在复签并完成此协议？':'确认撤回该未完成签署的协议邀请？'))return;
  const {data,error:e}=await db().rpc('sf_contract_admin_decide',{
   p_id:item.id,p_action:action,p_signer_name:action==='sign'?platformName.trim():null,p_confirm:action==='sign'?confirm:false
  });
  if(e||data!==true)throw Error(e?.message||'操作未成功');
  setPlatformName('');setConfirm(false);
 },action==='sign'?'平台已完成复签；创作者已收到站内通知，双方可保留协议。':'已撤回未完成的邀请并通知创作者。');
 return <main className="sf-contract-page"><div className="sf-contract-shell">
  <nav className="sf-contract-nav"><Link href="/admin/console">← 平台管理中心</Link><Link href="/contracts">我的签约</Link><Link href="/">网站首页</Link></nav>
  <header className="sf-contract-intro"><span className="sf-contract-kicker">STARFLOW · PARTNERSHIP STUDIO</span>
   <h1>星流 · 创作者签约管理</h1>
   <p>根据真实作品与活跃度人工筛选创作者，一键发出站内合作邀请。创作者阅读签署后，平台授权人员复签并存档。</p>
  </header>
  {loading?<p role="status">正在验证管理权限与载入创作者…</p>:!role?<p role="alert" className="sf-contract-error">{error||'无权访问'}</p>:<>
   {message&&<p role="status" className="sf-contract-success">{message}</p>}
   {error&&<p role="alert" className="sf-contract-error">{error}</p>}
   <section className="sf-contract-paper">
    <h2>一、筛选潜力创作者</h2><p className="sf-contract-help">下列数字来自真实账号：近90天原创主帖、近90天作品获赞、累计关注者。指标仅供初筛，真实性和作品质量需要人工复核。</p>
    <div className="sf-contract-actions"><input aria-label="按昵称搜索创作者" value={query} maxLength={50} placeholder="搜索昵称 / 账号" onChange={e=>setQuery(e.target.value)}/>
     <button type="button" disabled={busy} onClick={()=>void perform(()=>reload(query),'筛选数据已刷新')}>筛选 / 搜索</button>
    </div>
    {candidates.length===0?<p>暂无可筛选的创作者。</p>:
     <div className="sf-contract-candidates">{candidates.map(c=><article key={c.user_id} className={'sf-contract-candidate '+(selected?.user_id===c.user_id?'selected':'')}>
      <strong>{c.display_name||c.handle}</strong><small>@{c.handle}</small>
      <div className="sf-contract-metrics"><span>{Number(c.posts_90d).toLocaleString('zh-CN')} 篇作品</span><span>{Number(c.likes_90d).toLocaleString('zh-CN')} 次获赞</span><span>{Number(c.followers).toLocaleString('zh-CN')} 位粉丝</span></div>
      <div className="sf-contract-buttons"><Link href={'/profile/'+encodeURIComponent(c.handle)} target="_blank" rel="noopener noreferrer">查看作者主页 ↗</Link>
       {isSigner&&<button type="button" className="secondary" onClick={()=>setSelected(c)}>选择并联系</button>}
      </div>
     </article>)}</div>}
   </section>
   {isSigner&&selected&&<section className="sf-contract-paper">
    <h2>二、向创作者发出签约邀请</h2>
    <p>邀请对象：<strong>{selected.display_name||selected.handle} (@{selected.handle})</strong></p>
    <p className="sf-contract-help">发送会在该账号生成私密邀请和站内通知。正文发出后不可直接修改；如需改条款，请撤回未完成的邀请并重新发出。</p>
    <div className="sf-contract-form">
     <label htmlFor="sf-contract-title">协议标题（8–120字）</label>
     <input id="sf-contract-title" value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} placeholder="例如：原创作品专项合作协议"/>
     <label htmlFor="sf-contract-entity">平台实际签约法律主体（必填）</label>
     <input id="sf-contract-entity" value={entity} maxLength={160} onChange={e=>setEntity(e.target.value)} placeholder="必须填写具有签约资格的公司或个人法定名称"/>
     <label htmlFor="sf-contract-reason">人工筛选理由（10–500字）</label>
     <textarea id="sf-contract-reason" rows={3} value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="说明作品原创性、质量、粉丝真实影响力等依据"/>
     <label htmlFor="sf-contract-source">代表作品 ID（可选）</label>
     <input id="sf-contract-source" value={sourcePost} onChange={e=>setSourcePost(e.target.value)} placeholder="可填创作者自己的作品 UUID"/>
     <label htmlFor="sf-contract-expiry">邀请有效期</label>
     <select id="sf-contract-expiry" value={expiryDays} onChange={e=>setExpiryDays(Number(e.target.value))}>
      <option value={7}>7天</option><option value={14}>14天</option><option value={30}>30天</option>
     </select>
     <label htmlFor="sf-contract-body">正式协议完整正文（250–16000字）</label>
     <textarea id="sf-contract-body" rows={15} maxLength={16000} value={body} onChange={e=>setBody(e.target.value)}
      placeholder="请粘贴经审核的完整协议：签约主体、合作作品和原创保证、授权权利及是否独家、期限和地域、收益分配与支付日期、双方义务、终止违约、个人信息处理、争议解决及适用法律等。"/>
     <small>已填写 {body.trim().length} 字。协议正文必须由平台实际签约主体审核，不能把空白示例作为生效合同。</small>
     <div className="sf-contract-buttons"><button type="button" disabled={busy||title.trim().length<8||entity.trim().length<2||reason.trim().length<10||body.trim().length<250}
      onClick={()=>void invite()}>一键发送签约邀请与站内联系</button>
      <button type="button" className="secondary" onClick={()=>setSelected(null)}>取消选择</button></div>
    </div>
   </section>}
   <section className="sf-contract-paper"><h2>三、邀请审核与平台复签</h2>
    {!isSigner&&<p className="sf-contract-help">当前运营角色可查看创作者公开表现数据。正式协议审阅和签约权限仅开放给创始人及超级管理员。</p>}
    {contracts.length===0?<p>目前没有已发送的签约邀请。</p>:contracts.map(item=><article key={item.id} className="sf-contract-list-item">
     <h3>{item.title}</h3><small>创作者 ID：{item.creator_id}</small>
     <p><strong>{statuses[item.status]||item.status}</strong> · 邀请 {fmt(item.created_at)}</p>
     <p>平台签约主体：{item.platform_legal_entity} · 指纹 {item.agreement_hash.slice(0,14)}…</p>
     <details><summary>审阅不可修改的协议全文</summary><div className="sf-contract-terms">{item.agreement_body}</div>
      <p>创作者签署：{item.creator_signature||'未签署'} · {fmt(item.creator_signed_at)}</p>
      <p>平台复签：{item.platform_signature||'未签署'} · {fmt(item.platform_signed_at)}</p>
      <p>完整 SHA-256：<code>{item.agreement_hash}</code></p>
     </details>
     {isSigner&&item.status==='creator_signed'&&<div className="sf-contract-action">
      <label htmlFor={'platform-'+item.id}>平台授权签署人姓名</label>
      <input id={'platform-'+item.id} value={platformName} maxLength={100} onChange={e=>setPlatformName(e.target.value)} placeholder="填写真实授权代表姓名"/>
      <label className="sf-contract-check"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>
       <span>已核对创作者签署、平台法律主体和完整协议条款，同意代表平台作出复签意思表示。</span></label>
      <button type="button" disabled={busy||!confirm||platformName.trim().length<2} onClick={()=>void decide(item,'sign')}>平台确认复签，完成协议</button>
     </div>}
     {isSigner&&['invited','creator_signed'].includes(item.status)&&<button type="button" className="secondary" disabled={busy} onClick={()=>void decide(item,'withdraw')}>撤回未完成邀请</button>}
    </article>)}
   </section>
  </>}
 </div></main>;
}
