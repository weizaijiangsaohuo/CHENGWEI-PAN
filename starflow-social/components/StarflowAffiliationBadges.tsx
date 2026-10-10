'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Building2,Link2,ShieldCheck} from 'lucide-react';
import {db,hasConfig} from '@/lib/supabase';

type Person={id:string;handle:string;display_name:string;avatar_url:string|null};
type Relation={org_id:string;affiliate_id:string;affiliate_kind:'individual'|'organization';status:string};
type Affiliate={org:Person;kind:'individual'|'organization';color:'gold'|'gray';extraCheck:'blue'|'gold'|'gray'|null};
type Slot={element:HTMLElement;handle:string;key:string};

/** Public affiliate signals are derived only from authenticated, approved organization records. */
export function StarflowAffiliationBadges(){
 const pathname=usePathname()??'';
 const [byHandle,setByHandle]=useState<Record<string,Affiliate>>({});
 const [orgMembers,setOrgMembers]=useState<Record<string,Person[]>>({});
 const [viewerId,setViewerId]=useState('');
 const [orgIds,setOrgIds]=useState<string[]>([]);
 const [slots,setSlots]=useState<Slot[]>([]);
 const refSlots=useRef('');
 const sync=useCallback(async()=>{
  if(!hasConfig())return;
  try{
   const client=db();
   const [auth,rels]=await Promise.all([
     client.auth.getUser(),
     client.from('organization_affiliations').select('org_id,affiliate_id,affiliate_kind,status').eq('status','active').limit(1000),
   ]);
   if(rels.error)throw rels.error;
   setViewerId(auth.data.user?.id??'');
   const data=(rels.data??[]) as Relation[];
   const ids=[...new Set(data.flatMap(r=>[r.org_id,r.affiliate_id]))];
   if(!ids.length){setByHandle({});setOrgMembers({});setOrgIds([]);return}
   const organizations=[...new Set(data.map(r=>r.org_id))];
   const [persons,checks]=await Promise.all([
    client.from('profiles').select('id,handle,display_name,avatar_url').in('id',ids),
    client.from('account_verifications').select('profile_id,verification_type,status').in('profile_id',ids).eq('status','approved'),
   ]);
   if(persons.error)throw persons.error;
   if(checks.error)throw checks.error;
   const people=Object.fromEntries(((persons.data??[]) as Person[]).map(p=>[p.id,p]));
   const approved=Object.fromEntries((checks.data??[]).filter(v=>['blue','gold','gray'].includes(v.verification_type))
     .map(v=>[v.profile_id,v.verification_type as 'blue'|'gold'|'gray']));
   const next:Record<string,Affiliate>={};
   const members:Record<string,Person[]>={};
   for(const r of data){const organization=people[r.org_id],affiliate=people[r.affiliate_id],color=approved[r.org_id];
     if(!organization||!affiliate||(color!=='gold'&&color!=='gray'))continue;
     next[affiliate.handle.toLowerCase()]={org:organization,kind:r.affiliate_kind,color,extraCheck:approved[r.affiliate_id]?null:(r.affiliate_kind==='individual'?'blue':color)};
     (members[organization.handle.toLowerCase()]??=[]).push(affiliate);
   }
   setByHandle(next);setOrgMembers(members);setOrgIds(organizations.filter(id=>approved[id]==='gold'||approved[id]==='gray'));
  }catch(e){console.warn('Starflow affiliation display unavailable:',e)}
 },[]);
 useEffect(()=>{void sync()},[sync,pathname]);
 useEffect(()=>{
  const host=document.querySelector('.app-frame');
  if(!host)return;
  let raf=0;
  const collect=()=>{
   const list:Slot[]=[];
   const anchors=host.querySelectorAll<HTMLElement>('.post-head a.post-name, .sf2-person-row a[href^="/profile/"], .profile-info h2');
   anchors.forEach((node,i)=>{
     const raw=node.getAttribute('href')|| (node.matches('.profile-info h2')?pathname:'');
     const match=/^\/profile\/([^/?#]+)/.exec(raw);
     if(!match)return;
     let handle='';try{handle=decodeURIComponent(match[1]).toLowerCase()}catch{return}
     const aff=byHandle[handle];
     if(!aff)return;
     const p=node.parentElement;if(!p)return;
     let span=node.nextElementSibling as HTMLElement|null;
     if(!span?.classList.contains('sf-aff-badge-anchor')){
       span=document.createElement('span');span.className='sf-aff-badge-anchor';
       node.insertAdjacentElement('afterend',span);
     }
     list.push({element:span,handle,key:handle+':'+i});
   });
   const signature=list.map(s=>s.key+':'+(s.element.isConnected?s.element.outerHTML.slice(0,50):'x')).join('|');
   if(signature!==refSlots.current){refSlots.current=signature;setSlots(list)}
  };
  const schedule=()=>{if(raf)cancelAnimationFrame(raf);raf=requestAnimationFrame(collect)};
  collect();const observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:true});
  return()=>{observer.disconnect();if(raf)cancelAnimationFrame(raf);refSlots.current='';setSlots([])};
 },[pathname,byHandle]);
 const profileHandle=useMemo(()=>{
  const m=/^\/profile\/([^/?#]+)/.exec(pathname);
  if(!m)return '';try{return decodeURIComponent(m[1]).toLowerCase()}catch{return ''}
 },[pathname]);
 const [profileHost,setProfileHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{
  if(!profileHandle){setProfileHost(null);return}
  let raf=0;
  const measure=()=>{
   const found=document.querySelector<HTMLElement>('.app-frame .profile-info');
   if(!found)return;
   let box=found.querySelector<HTMLElement>('.sf-aff-profile-portal');
   if(!box){box=document.createElement('div');box.className='sf-aff-profile-portal';found.appendChild(box)}
   setProfileHost(box);
  };
  measure();const observer=new MutationObserver(()=>{if(raf)cancelAnimationFrame(raf);raf=requestAnimationFrame(measure)});
  const main=document.querySelector('.app-frame main.feed-panel');if(main)observer.observe(main,{childList:true,subtree:true});
  return()=>{observer.disconnect();if(raf)cancelAnimationFrame(raf);setProfileHost(null)};
 },[profileHandle]);
 const memberList=orgMembers[profileHandle]??[];
 const isOrgOwner=orgIds.includes(viewerId)&&pathname==='/profile/'+encodeURIComponent(profileHandle);
 const profileAffiliate=byHandle[profileHandle];
 const [settingsHost,setSettingsHost]=useState<HTMLElement|null>(null);
 const [noticeHost,setNoticeHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{
  if(pathname!=='/settings'&&pathname!=='/settings/'){setSettingsHost(null);return}
  let raf=0;
  const locate=()=>{
    const box=document.querySelector<HTMLElement>('.app-frame .settings-content');
    if(!box)return;
    let slot=box.querySelector<HTMLElement>('.sf-aff-settings-slot');
    if(!slot){slot=document.createElement('div');slot.className='sf-aff-settings-slot';box.appendChild(slot)}
    setSettingsHost(slot);
  };
  locate();const host=document.querySelector('.app-frame');
  const observer=new MutationObserver(()=>{if(raf)cancelAnimationFrame(raf);raf=requestAnimationFrame(locate)});
  if(host)observer.observe(host,{childList:true,subtree:true});
  return()=>{observer.disconnect();if(raf)cancelAnimationFrame(raf);setSettingsHost(null)};
 },[pathname]);
 useEffect(()=>{
  if(pathname!=='/notifications'&&pathname!=='/notifications/'){setNoticeHost(null);return}
  let raf=0;
  const locate=()=>{
    const page=document.querySelector<HTMLElement>('.app-frame .sf2-notifications');
    if(!page)return;
    let slot=page.querySelector<HTMLElement>('.sf-aff-notice-slot');
    if(!slot){slot=document.createElement('div');slot.className='sf-aff-notice-slot';const tabs=page.querySelector('.sf2-tabs');if(tabs)tabs.insertAdjacentElement('afterend',slot);else page.prepend(slot)}
    setNoticeHost(slot);
  };
  locate();const host=document.querySelector('.app-frame');
  const observer=new MutationObserver(()=>{if(raf)cancelAnimationFrame(raf);raf=requestAnimationFrame(locate)});
  if(host)observer.observe(host,{childList:true,subtree:true});
  return()=>{observer.disconnect();if(raf)cancelAnimationFrame(raf);setNoticeHost(null)};
 },[pathname]);
 return <>
  {slots.map(s=>{
   const a=byHandle[s.handle];return a&&s.element.isConnected?createPortal(<AffiliationChip data={a}/>,s.element,s.key):null;
  })}
  {settingsHost&&createPortal(<Link className="sf-aff-settings-link" href="/organization/affiliates"><ShieldCheck size={20}/><span><strong>官方附属账号</strong><small>邀请成员、接受组织邀请、管理关联徽章</small></span><span aria-hidden="true">›</span></Link>,settingsHost)}
  {noticeHost&&createPortal(<Link className="sf-aff-notice-link" href="/organization/affiliates"><Building2 size={18}/>组织附属邀请与关联管理 <span aria-hidden="true">→</span></Link>,noticeHost)}
  {profileHost&&(memberList.length>0||profileAffiliate||isOrgOwner)&&createPortal(<div className="sf-aff-profile-block">
   {profileAffiliate&&<div className="sf-aff-profile-parent"><span>关联组织</span><AffiliationChip data={profileAffiliate} showLabel/></div>}
   {memberList.length>0&&<div className="sf-aff-profile-network"><div className="sf-aff-profile-network-title"><Building2 size={16}/> 官方附属账号 <b>{memberList.length}</b></div>
     <div className="sf-aff-profile-grid">{memberList.slice(0,12).map(p=><Link href={'/profile/'+encodeURIComponent(p.handle)} key={p.id}>
       <span className="sf-aff-mini-avatar">{p.avatar_url?<img src={p.avatar_url} alt=""/>:p.display_name.slice(0,1)}</span>
       <span><strong>{p.display_name}</strong><small>@{p.handle}</small></span></Link>)}</div>
   </div>}
   {isOrgOwner&&<Link className="sf-aff-manage-link" href="/organization/affiliates"><Link2 size={15}/> 管理官方附属账号 →</Link>}
  </div>,profileHost)}
 </>;
}

function AffiliationChip({data,showLabel=false}:{data:Affiliate;showLabel?:boolean}){
 const org=data.org;
 return <span className="sf-aff-chip-group">
  {data.extraCheck&&<svg className="sf-aff-derived-check" width="20" height="20" viewBox="0 0 32 32" role="img" aria-label={'Starflow 组织附属账号认证：'+(data.extraCheck==='blue'?'蓝色':data.extraCheck==='gold'?'金色':'灰色')}>
   <path d="M16 1.7 19.25 3.6 22.85 3.25 25.0 6.3 28.4 7.4 28.9 11.2 31 14.0 29.4 17.4 30 21.0 26.7 23.1 25.1 26.6 21.3 26.8 18.6 29.2 15.3 27.5 11.8 28.8 9.3 25.9 5.6 25.1 4.7 21.4 1.9 19.0 2.8 15.3 1.8 12.2 4.0 9.2 4.8 5.6 8.7 5.3 11.1 2.4 14.3 3.8Z" fill={data.extraCheck==='blue'?'#3594e8':data.extraCheck==='gold'?'#d4aa32':'#8995a5'}/>
   <path d="m9 16 4.3 4.2 9.6-9.6" stroke="#fff" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>}
  <Link href={'/profile/'+encodeURIComponent(org.handle)} className={'sf-aff-chip'+(showLabel?' sf-aff-chip-label':'')}
   aria-label={'关联至 '+org.display_name+'（Starflow 官方组织）'} title={'隶属于 '+org.display_name} onClick={e=>e.stopPropagation()}>
   <span className="sf-aff-chip-logo">{org.avatar_url?<img src={org.avatar_url} alt=""/>:<Building2 size={13}/>}</span>
   {showLabel&&<span>{org.display_name}</span>}
  </Link></span>;
}
