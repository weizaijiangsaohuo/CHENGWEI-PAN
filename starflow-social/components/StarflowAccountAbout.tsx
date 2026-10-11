'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AtSign, BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, Info, Link2, MapPin, RefreshCcw, Settings2 } from 'lucide-react';
import { db, hasConfig } from '@/lib/supabase';
import { VerificationBadge, type VerificationKind } from './VerificationBadge';

type Person = { id: string; handle: string; display_name: string; avatar_url: string | null; created_at: string };
type Verification = { verification_type: VerificationKind; status: string; reviewed_at: string | null };
type Region = { country_code: string | null; last_seen_at: string | null; is_public: boolean };
type AccountData = { user: Person; verification: Verification | null; derived: { verification_type: 'gold' | 'gray'; started_at: string | null } | null; org: Person | null; region: Region | null; history: { total_changes: number; last_changed_at: string | null } | null };
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
  const [verificationExplain,setVerificationExplain]=useState(false);
  const [privacyOpen,setPrivacyOpen]=useState(false);
  const load = useCallback(async()=>{
    if(!hasConfig()){setNotice('账号资料服务未配置。');setLoading(false);return}
    try{
      const client=db();
      const {data:profile,error}=await client.from('profiles').select('id,handle,display_name,avatar_url,created_at').eq('handle',handle).maybeSingle();
      if(error)throw error;
      if(!profile){setInfo(null);setNotice('找不到此账号，用户名可能已经修改。');return}
      const [verified,relation,where,history,auth] = await Promise.all([
        client.from('account_verifications').select('verification_type,status,reviewed_at').eq('profile_id',profile.id).eq('status','approved').maybeSingle(),
        client.from('organization_affiliations').select('org_id,affiliate_kind,responded_at').eq('affiliate_id',profile.id).eq('status','active').limit(1).maybeSingle(),
        client.from('account_ip_country').select('country_code,last_seen_at,is_public').eq('user_id',profile.id).maybeSingle(),
        client.rpc('sf_account_handle_history',{p_account_id:profile.id}),
        client.auth.getUser(),
      ]);
      if(verified.error)throw verified.error;
      if(relation.error && auth.data.user)throw relation.error;
      if(where.error)throw where.error;
      let org:Person|null=null;
      let derived:AccountData['derived']=null;
      if(relation.data?.org_id){
        const [orgProfile,orgVerification] = await Promise.all([
          client.from('profiles').select('id,handle,display_name,avatar_url,created_at').eq('id',relation.data.org_id).maybeSingle(),
          client.from('account_verifications').select('status,verification_type').eq('profile_id',relation.data.org_id).eq('status','approved').maybeSingle(),
        ]);
        if(!orgProfile.error && !orgVerification.error && orgProfile.data && (orgVerification.data?.verification_type==='gold'||orgVerification.data?.verification_type==='gray')) {
          org=orgProfile.data as Person;
          // A valid organization affiliate can display the parent organization's derived seal.
          // This does NOT create or imply a separate verification approval for the affiliate.
          if(!verified.data && relation.data.affiliate_kind==='organization') {
            derived={verification_type:orgVerification.data.verification_type as 'gold'|'gray',started_at:relation.data.responded_at};
          }
        }
      }
      const summary=Array.isArray(history.data) ? history.data[0] : history.data;
      setInfo({user:profile as Person,verification:verified.data as Verification|null,derived,org,region:where.data as Region|null,
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
  const derived=info?.derived;
  const effectiveBadge=v?.verification_type ?? derived?.verification_type;
  const country=info?.region;
  const showCountry=!!(country?.is_public || isOwner);
  const verificationNames: Record<VerificationKind,string> = {gold:'金色认证',blue:'蓝色认证',gray:'灰色认证'};
  const verificationExplanations: Record<VerificationKind,string> = {
    gold: '由 Starflow 审核通过的企业、品牌或组织账号。仅代表 Starflow 平台内的认证，不代表 X 或其他机构认证。',
    gray: '由 Starflow 审核通过的政府或符合条件的公共机构账号。',
    blue: '由 Starflow 按平台规则审核通过的账号，不等于身份证件核验。',
  };
  return <main className="sf-about-page">
    <header className="sf-about-top">
      <Link href={'/profile/'+encodeURIComponent(handle)} aria-label="返回个人主页"><ChevronLeft size={26}/></Link>
      <h1>关于此账号</h1><span aria-hidden="true"/>
    </header>
    {loading?<p className="sf-about-status" role="status">正在加载账号资料…</p>
    :!info?<p className="sf-about-status" role="alert">{notice||'找不到此账号。'}</p>
    :<div className="sf-about-body">
      <section className="sf-about-identity" aria-label="账号身份">
        <div className="sf-about-avatar">{info.user.avatar_url?<img src={info.user.avatar_url} alt=""/>:<span>{info.user.display_name.slice(0,1).toUpperCase()}</span>}</div>
        <div className="sf-about-name">
          <strong>{info.user.display_name}</strong>
          {effectiveBadge&&<VerificationBadge kind={effectiveBadge} size={20} interactive={false}/>}
          {info.org&&<Link className="sf-about-name-org" href={'/profile/'+encodeURIComponent(info.org.handle)}
            aria-label={'所属认证组织：'+info.org.display_name} title={'隶属于 '+info.org.display_name}>
            {info.org.avatar_url?<img src={info.org.avatar_url} alt=""/>:<span>{info.org.display_name.slice(0,1)}</span>}
          </Link>}
        </div>
        <p className="sf-about-handle">@{info.user.handle}</p>
      </section>
      <section className="sf-about-lines" aria-label="账号资料">
        <div className="sf-about-line"><CalendarDays aria-hidden="true"/><div><strong>加入日期</strong><span>{date(info.user.created_at)}</span></div></div>
        <div className="sf-about-line"><MapPin aria-hidden="true"/><div><strong>账号所在国家／地区</strong>
          <span>{showCountry ? regionName(country?.country_code) : '未公开'}</span>
          {showCountry&&country?.last_seen_at&&<small>上次识别：{new Date(country.last_seen_at).toLocaleDateString('zh-CN')}</small>}
        </div><button type="button" className="sf-about-info-button" onClick={()=>setLocationExplain(v=>!v)} aria-expanded={locationExplain} aria-label="查看账号位置说明"><Info size={21}/></button></div>
        {locationExplain&&<p className="sf-about-inline-note">国家／地区基于最近主动更新时的访问 IP 近似推断，不是 GPS 或实时定位；VPN、旅行、移动网络可能影响结果。账号持有人可以选择不公开。</p>}
        {(v||derived)&&<>
          <button type="button" className="sf-about-line sf-about-line-action" onClick={()=>setVerificationExplain(open=>!open)} aria-expanded={verificationExplain} aria-label="查看账号认证详情">
            <BadgeCheck aria-hidden="true"/>
            <span className="sf-about-line-body"><strong>已验证</strong><span>{v?(v.reviewed_at?`自 ${date(v.reviewed_at)}`:'验证日期未记录'):(derived?.started_at?`组织关联自 ${date(derived.started_at)}`:'组织关联时间未记录')}</span></span>
            <ChevronRight className={verificationExplain?'sf-about-rotated':''} aria-hidden="true"/>
          </button>
          {verificationExplain&&<div className="sf-about-verification-detail" role="region" aria-label="认证详情">
            <div className="sf-about-detail-heading"><VerificationBadge kind={effectiveBadge} size={20} interactive={false}/><strong>{effectiveBadge ? verificationNames[effectiveBadge] : ''}</strong></div>
            <p>{v ? verificationExplanations[v.verification_type] : `此账号已接受认证组织 @${info.org?.handle ?? ''} 的官方附属邀请，因此获得组织关联的金色／灰色认证标志。该标志不代表此账号独立通过对应的组织认证审核。`}</p>
            <Link href="/verification">查看 Starflow 认证规则 <ChevronRight size={16}/></Link>
          </div>}
        </>}
        {info.org&&<div className="sf-about-line"><Link2 aria-hidden="true"/><div><strong>官方附属账号</strong><Link className="sf-about-org" href={'/profile/'+encodeURIComponent(info.org.handle)}>{info.org.avatar_url&&<img src={info.org.avatar_url} alt=""/>}@{info.org.handle} 的附属账号 <ChevronRight size={16}/></Link></div></div>}
        <div className="sf-about-line"><AtSign aria-hidden="true"/><div><strong>用户名变更</strong><span>{info.history?`${info.history.total_changes} 次`:'暂无可用记录'}</span>
          {info.history?.last_changed_at&&<small>最近一次：{date(info.history.last_changed_at)}</small>}
          <small>仅统计启用记录后的更改，之前的历史无法追溯</small>
        </div></div>
      </section>
      {isOwner&&<section className="sf-about-privacy">
        <button className="sf-about-privacy-trigger" type="button" onClick={()=>setPrivacyOpen(o=>!o)} aria-expanded={privacyOpen}>
          <Settings2 size={19}/><span>国家／地区隐私设置</span><ChevronRight className={privacyOpen?'sf-about-rotated':''} size={20}/>
        </button>
        {privacyOpen&&<div className="sf-about-privacy-content">
          <label className="sf-about-toggle"><span>允许其他用户查看 IP 推断的国家／地区</span><input type="checkbox" disabled={busy} checked={!!country?.is_public} onChange={e=>void setVisibility(e.target.checked)}/></label>
          <button type="button" className="sf-about-country-refresh" disabled={busy||!country?.is_public} onClick={()=>void updateCountry()}><RefreshCcw size={16}/>{busy?'处理中…':'更新本次访问的国家／地区'}</button>
          <p>仅记录国家／地区代码，不公开原始 IP。该数据不能确定真实所在地；功能未配置时会说明原因。</p>
        </div>}
      </section>}
      {notice&&<p role="status" className="sf-about-notice">{notice}</p>}
    </div>}
  </main>;
}
