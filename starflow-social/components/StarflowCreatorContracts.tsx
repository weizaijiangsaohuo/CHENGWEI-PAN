'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {db,hasConfig} from '@/lib/supabase';
import './StarflowContract.css';

type Contract={
 id:string;creator_id:string;invited_by:string;source_post_id:string|null;
 title:string;platform_legal_entity:string;agreement_body:string;agreement_hash:string;
 selection_note:string;status:string;created_at:string;expires_at:string;
 creator_signature:string|null;creator_signed_at:string|null;
 platform_signature:string|null;platform_signed_at:string|null;completed_at:string|null;
};
type Event={id:string;event_kind:string;occurred_at:string;agreement_hash:string};
const status:Record<string,string>={invited:'等待你审阅',creator_signed:'你已签署，等待平台复签',completed:'双方签署完成',declined:'已拒绝',withdrawn:'平台已撤回'};
const eventNames:Record<string,string>={invited:'平台发送邀请',creator_signed:'创作者确认签署',platform_signed:'平台复签完成',declined:'创作者拒绝',withdrawn:'平台撤回',viewed:'已查看'};
const fmt=(value:string|null)=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'尚未签署';

export function StarflowCreatorContracts({contractId}:{contractId?:string}){
 const [uid,setUid]=useState('');
 const [contracts,setContracts]=useState<Contract[]>([]);
 const [events,setEvents]=useState<Event[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [name,setName]=useState('');
 const [agree,setAgree]=useState(false);
 const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const refresh=useCallback(async(userId:string)=>{
  const query=db().from('sf_creator_contracts')
   .select('id,creator_id,invited_by,source_post_id,title,platform_legal_entity,agreement_body,agreement_hash,selection_note,status,created_at,expires_at,creator_signature,creator_signed_at,platform_signature,platform_signed_at,completed_at')
   .eq('creator_id',userId).order('created_at',{ascending:false}).limit(80);
  const res=await query;if(res.error)throw res.error;
  const rows=(res.data||[]) as Contract[];
  setContracts(rows);
  if(contractId&&rows.some(x=>x.id===contractId)){
   const history=await db().from('sf_creator_contract_events')
    .select('id,event_kind,occurred_at,agreement_hash').eq('contract_id',contractId)
    .order('occurred_at',{ascending:true});
   if(history.error)throw history.error;
   setEvents((history.data||[]) as Event[]);
  }
 },[contractId]);
 useEffect(()=>{
  let active=true;
  if(!hasConfig()){setError('暂时无法连接账号系统');setLoading(false);return;}
  db().auth.getUser().then(async ({data:{user},error:e})=>{
   if(!active)return;
   if(e||!user){setError('请先登录 Starflow');return;}
   setUid(user.id);await refresh(user.id);
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'读取签约记录失败')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[refresh]);
 const selected=contracts.find(x=>x.id===contractId);
 const decide=async(action:'sign'|'decline')=>{
  if(!selected||busy)return;
  if(action==='sign'&&(name.trim().length<2||!agree)){setError('需要填写签署姓名并主动确认全部协议内容');return;}
  if(!window.confirm(action==='sign'?'确认对当前版本的完整协议作出签署意思表示？操作将记录签署时间与协议指纹。':'确定拒绝这次签约邀请？'))return;
  setBusy(true);setError('');setNotice('');
  try{
   const {data,error:e}=await db().rpc('sf_contract_creator_decide',{
    p_id:selected.id,p_action:action,p_legal_name:action==='sign'?name.trim():null,p_agreed:action==='sign'?agree:false
   });
   if(e||data!==true)throw Error(e?.message||'未能处理签约请求');
   await refresh(uid);
   setAgree(false);setName('');
   setNotice(action==='sign'?'你已确认签署。协议保持原文不变，现在等待平台复签。':'已拒绝邀请，平台会收到通知。');
  }catch(e){setError(e instanceof Error?e.message:'签约操作失败');}
  finally{setBusy(false);}
 };
 return <main className="sf-contract-page"><div className="sf-contract-shell">
  <nav className="sf-contract-nav"><Link href="/creator">← 创作者中心</Link><Link href="/contracts">我的签约</Link><Link href="/">平台首页</Link></nav>
  <header className="sf-contract-intro"><span className="sf-contract-kicker">STARFLOW · CREATOR PARTNERSHIP</span>
   <h1>我的创作者签约</h1><p>平台经人工筛选后向创作者发出邀请。是否接受完全由你决定；只有双方明确确认后才显示为「双方签署完成」。</p>
  </header>
  {loading?<p role="status">正在安全载入你的协议…</p>:!uid?<p role="alert" className="sf-contract-error">{error||'需要登录'}</p>:<>
   {error&&<p role="alert" className="sf-contract-error">{error}</p>}
   {notice&&<p role="status" className="sf-contract-success">{notice}</p>}
   {contractId?selected?<article className="sf-contract-paper">
    <div className="sf-contract-meta"><span>{status[selected.status]||selected.status}</span><span>协议编号：{selected.id}</span></div>
    <h2>{selected.title}</h2>
    <p><strong>平台签约主体：</strong>{selected.platform_legal_entity}</p>
    <p><strong>创作者：</strong>{selected.creator_signature||'待创作者自行填写真实签署姓名'}</p>
    <p><strong>邀请发出时间：</strong>{fmt(selected.created_at)}</p>
    <p><strong>确认截止时间：</strong>{fmt(selected.expires_at)}</p>
    {selected.source_post_id&&<p><strong>所选作品：</strong><Link href={'/post/'+selected.source_post_id}>查看所选作品</Link></p>}
    <div className="sf-contract-terms"><h3>完整合作协议正文</h3><div>{selected.agreement_body}</div></div>
    <div className="sf-contract-fingerprint"><strong>协议完整性 SHA-256：</strong><code>{selected.agreement_hash}</code>
     <p>本指纹用于核对已发出协议文本是否一致。仅保存指纹不等于第三方可信时间戳或司法认证。</p>
    </div>
    <div className="sf-contract-signatures">
     <div><h3>创作者签署</h3><p>{selected.creator_signature||'尚未签署'}</p><small>{fmt(selected.creator_signed_at)}</small></div>
     <div><h3>平台复签</h3><p>{selected.platform_signature||'尚未复签'}</p><small>{fmt(selected.platform_signed_at)}</small></div>
    </div>
    {selected.status==='invited'&&new Date(selected.expires_at)>new Date()&&<div className="sf-contract-action">
     <h3>确认签署</h3><p>请完整审阅上方协议，包括作品权利、授权范围、分成或报酬、期限、终止条件及争议解决条款。不接受可直接拒绝。</p>
     <label htmlFor="sf-contract-signer">你的真实签署姓名（2–100字）</label>
     <input id="sf-contract-signer" value={name} maxLength={100} autoComplete="name" onChange={e=>setName(e.target.value)} placeholder="请输入本人签署姓名"/>
     <label className="sf-contract-check"><input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)}/>
      <span>我已阅读并理解本次完整协议，自愿同意以已登录账号和上述输入姓名确认此版本的合作协议，知悉平台尚需复签。</span>
     </label>
     <div className="sf-contract-buttons">
      <button type="button" disabled={busy||!agree||name.trim().length<2} onClick={()=>void decide('sign')}>确认并签署此协议</button>
      <button type="button" className="secondary" disabled={busy} onClick={()=>void decide('decline')}>拒绝签约邀请</button>
     </div>
    </div>}
    {selected.status==='invited'&&new Date(selected.expires_at)<=new Date()&&<p className="sf-contract-error">本次邀请已过确认期限，请联系平台发送新邀请。</p>}
    <section className="sf-contract-history"><h3>不可由用户修改的操作历史</h3>
     {events.map(e=><p key={e.id}><strong>{eventNames[e.event_kind]||e.event_kind}</strong> · {fmt(e.occurred_at)}</p>)}
    </section>
    <div className="sf-contract-buttons sf-no-print"><button className="secondary" type="button" onClick={()=>window.print()}>打印 / 保存此协议存档</button></div>
    <p className="sf-contract-help">平台内签署记录可作为意思表示和操作记录，但不自动等同于经过实名认证、权威数字证书或可信时间戳认证的电子签名。正式商业合作的法律效力、主体资质和证据规则应另行审核。</p>
   </article>:<p role="alert">协议不存在、你无权查看，或已从账号记录中移除。</p>:
   <section className="sf-contract-paper"><h2>收到的签约邀请与协议</h2>
    {contracts.length===0?<p>暂时还没有收到平台发来的合作邀请。作品与粉丝数据仅用于平台人工筛选，不代表自动获得签约资格。</p>:
    contracts.map(item=><article className="sf-contract-list-item" key={item.id}>
     <h3>{item.title}</h3><p>{item.platform_legal_entity} · {status[item.status]||item.status}</p>
     <small>邀请：{fmt(item.created_at)} · 截止：{fmt(item.expires_at)}</small>
     <Link href={'/contracts/'+item.id}>查看协议全文与签署记录 →</Link>
    </article>)}
   </section>}
  </>}
 </div></main>;
}
