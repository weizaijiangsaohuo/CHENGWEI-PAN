'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, CalendarDays, Globe2, Info, Link2, MapPin, RefreshCcw, ShieldCheck, UserRound, AtSign } from 'lucide-react';
import { db, hasConfig } from '@/lib/supabase';
import { VerificationBadge, type VerificationKind } from './VerificationBadge';

type Person = { id: string; handle: string; display_name: string; avatar_url: string | null; created_at: string };
type Verification = { verification_type: VerificationKind; status: string; reviewed_at: string | null };
type Region = { country_code: string | null; last_seen_at: string | null; is_public: boolean };
type AccountData = { user: Person; verification: Verification | null; org: Person | null; region: Region | null; history: { total_changes: number; last_changed_at: string | null } | null };
const date = (value:string) => new Date(value).toLocaleDateString('zh-CN', {year:'numeric',month:'long'});
const regionName = (code:string|null|undefined) => {
  if (!code || code==='XX' || code==='ZZ' || code==='T1') return '未知';
  try { return new Intl.DisplayNames(['zh-CN'], {type:'region'}).of(code) || code; }
  catch { return code; }
};

export function StarflowAccountAbout({handle}:{handle:string}){
  const [info,setInfo]=useState<AccountData|null>(null);
  const [isOwner,setIsOwner]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');
  const [locationExplain,setLocationExplain]=useState(false);
  const load = useCallback(async()=>{
    if(!hasConfig()){setNotice('账号资料服务未配置。');setLoading(false);return}
    try{
      const client=db();
      const {data:profile,error}=await client.from('profiles').select('id,handle,display_name,avatar_url,created_at').eq('handle',handle).maybeSingle();
      if(error)throw error;
      if(!profile){setInfo(null);setNotice('找不到此账号，用户名可能已经修改。');return}
      const [verified,relation,where,history,auth] = await Promise.all([
        client.from('account_verifications').select('verification_type,status,reviewed_at').eq('profile_id',profile.id).eq('status','approved').maybeSingle(),
        client.from('organization_affiliations').select('org_id').eq('affiliate_id',profile.id).eq('status','active').limit(1).maybeSingle(),
        client.from('account_ip_country').select('country_code,last_seen_at,is_public').eq('user_id',profile.id).maybeSingle(),
        client.rpc('sf_account_handle_history',{p_account_id:profile.id}),
        client.auth.getUser(),
      ]);
      if(verified.error)throw verified.error;
      if(relation.error && auth.data.user)throw relation.error;
      if(where.error)throw where.error;
      let org:Person|null=null;
      if(relation.data?.org_id){
        const [orgProfile,orgVerification] = await Promise.all([
          client.from('profiles').select('id,handle,display_name,avatar_url,created_at').eq('id',relation.data.org_id).maybeSingle(),
          client.from('account_verifications').select('status,verification_type').eq('profile_id',relation.data.org_id).eq('status','approved').maybeSingle(),
        ]);
        if(!orgProfile.error && !orgVerification.error && orgProfile.data && ['gold','gray'].includes(orgVerification.data?.verification_type ?? '')) org=orgProfile.data as Person;
      }
      const summary=Array.isArray(history.data) ? history.data[0] : history.data;
      setInfo({user:profile as Person,verification:verified.data as Verification|null,org,region:where.data as Region|null,
        history:history.error?null:summary?{total_changes:Number(summary.total_changes)||0,last_changed_at:summary.last_changed_at}:null});
      setIsOwner(auth.data.user?.id===profile.id);
    }catch(e){setNotice(e instanceof Error?e.message:'账号资料暂时无法读取。')}
    finally{setLoading(false)}
  },[handle]);
  useEffect(()=>{void load()},[load]);

  async function updateCountry(){
    if(!isOwner||busy)return;
    setBusy(true);setNotice('');
    try{
      const session=await db().auth.getSession();
      const token=session.data.session?.access_token;
      if(!token)throw new Error('登录失效，请重新登录。');
      const res=await fetch('/api/account/location',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}',cache:'no-store'});
      const data=await res.json() as {country_code?:string;error?:string};
      if(!res.ok)throw new Error(data.error||'暂时无法识别国家／地区。');
      setNotice(`已更新国家／地区：${regionName(data.country_code)}。结果是 IP 近似推断。`);
      await load();
    }catch(e){setNotice(e instanceof Error?e.message:'更新失败。')}
    finally{setBusy(false)}
  }
  async function setVisibility(show:boolean){
    if(!isOwner||busy)return;
    setBusy(true);setNotice('');
    try{
      const {error}=await db().rpc('sf_set_account_country_public',{p_public:show});
      if(error)throw error;
      setNotice(show?'已允许公开国家／地区。需要点击「更新位置」获取最近的 IP 国家信息。':'已关闭公开显示，其他用户将看不到地区信息。');
      await load();
    }catch(e){setNotice(e instanceof Error?e.message:'更改设置失败。')}
    finally{setBusy(false)}
  }
  const v = info?.verification;
  const country=info?.region;
  const showCountry=!!(country?.is_public || isOwner);
  return <main className="sf-about-page">
    <header className="sf-about-top"><Link href={'/profile/'+encodeURIComponent(handle)} aria-label="返回个人主页">‹</Link><strong>关于此账号</strong><span/></header>
    {loading?<p className="sf-about-status" role="status">正在读取真实账号信息…</p>
    :!info?<p className="sf-about-status" role="alert">{notice||'找不到此账号。'}</p>
    :<div className="sf-about-body">
      <div className="sf-about-identity">
        <div className="sf-about-avatar">{info.user.avatar_url?<img src={info.user.avatar_url} alt=""/>:<span>{info.user.display_name.slice(0,1)}</span>}</div>
        <div className="sf-about-name">{info.user.display_name} {v && <VerificationBadge kind={v.verification_type} size={20} interactive={false}/>}</div>
        <div className="sf-about-handle">@{info.user.handle}</div>
        <div className="sf-about-site">Starflow <span>.AI</span></div>
      </div>
      <div className="sf-about-lines">
        <div className="sf-about-line"><CalendarDays/><div><strong>加入日期</strong><span>{date(info.user.created_at)}</span></div></div>
        <div className="sf-about-line"><MapPin/><div><strong>账号所在国家／地区</strong>
          <span>{showCountry ? regionName(country?.country_code) : '未公开'}</span>
          {showCountry&&country?.last_seen_at&&<small>最近识别：{new Date(country.last_seen_at).toLocaleDateString('zh-CN')}（IP 推断）</small>}
        </div><button className="sf-about-explain" onClick={()=>setLocationExplain(v=>!v)} aria-label="了解位置来源"><Info size={20}/></button></div>
        {locationExplain&&<div className="sf-about-note">仅根据访问 Starflow 的 IP 网络入口估算国家／地区，并非 GPS、精确坐标或实时跟踪。VPN、漫游、网络服务商及旅行均会影响结果。未取得有效数据时显示未知；用户可关闭公开。</div>}
        {v&&<div className="sf-about-line"><ShieldCheck/><div><strong>已认证 · {v.verification_type==='gold'?'金色':v.verification_type==='gray'?'灰色':'蓝色'}</strong><span>{v.reviewed_at?`自 ${date(v.reviewed_at)}`:'认证时间未记录'}</span><small>仅表示 Starflow 平台认证</small></div><Link className="sf-about-chevron" href="/verification">›</Link></div>}
        {info.org&&<div className="sf-about-line"><Link2/><div><strong>官方附属账号</strong><Link className="sf-about-org" href={'/profile/'+encodeURIComponent(info.org.handle)}>{info.org.avatar_url&&<img src={info.org.avatar_url} alt=""/>}@{info.org.handle} 的附属账号</Link></div></div>}
        <div className="sf-about-line"><AtSign/><div><strong>用户名变更</strong><span>{info.history?`${info.history.total_changes} 次（自启用记录起）`:'历史统计暂不可用'}</span>{info.history?.last_changed_at&&<small>最近变更：{date(info.history.last_changed_at)}</small>}<small>启用记录前的变更次数无法追溯</small></div></div>
        <div className="sf-about-line"><Globe2/><div><strong>连接来源</strong><span>暂未记录设备或客户端历史</span></div></div>
      </div>
      {isOwner&&<section className="sf-about-privacy"><h2>国家／地区公开设置</h2><label className="sf-about-toggle"><span>允许在「关于此账号」中展示 IP 推断国家／地区</span><input type="checkbox" disabled={busy} checked={!!country?.is_public} onChange={e=>void setVisibility(e.target.checked)}/></label>
        <button type="button" disabled={busy||!country?.is_public} onClick={()=>void updateCountry()}><RefreshCcw size={16}/> {busy?'处理中…':'根据本次访问 IP 更新国家／地区'}</button>
        <p>不会保存或公开你的原始 IP 地址。关闭后不显示国家／地区。此信息不能用于确认一个人的真实所在地。</p>
      </section>}
      {notice&&<p role="status" className="sf-about-notice">{notice}</p>}
      <div className="sf-about-footer">账号详情展示来自真实数据库的数据。Starflow 是独立社交平台。</div>
    </div>}
  </main>;
}
