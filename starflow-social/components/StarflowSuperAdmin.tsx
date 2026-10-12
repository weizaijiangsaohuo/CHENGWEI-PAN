'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import Link from 'next/link';
import {db,hasConfig} from '@/lib/supabase';
import './StarflowSuperAdmin.css';

type Tab='overview'|'accounts'|'content'|'verification'|'notices'|'announcements'|'staff'|'settings'|'audit';
type StaffRole='founder'|'super_admin'|'official'|'senior_admin'|'moderator'|'verification_reviewer'|'support'|'analyst';
type Account={id:string;handle:string;display_name:string;created_at:string;account_status:string;expires_at:string|null;staff_role:StaffRole|null;staff_enabled:boolean|null};
type Report={id:string;reason:string;post_id:string;created_at:string;reviewed_at:string|null};
type Announcement={id:string;title:string;body:string;published:boolean;created_at:string};
type Audit={id:string;action:string;actor_id:string;target_user_id:string|null;target_post_id:string|null;created_at:string;details:Record<string,unknown>};
type Staff={user_id:string;role:StaffRole;enabled:boolean;updated_at:string};
type Stats={users?:number;newUsers24h?:number;posts?:number;replies?:number;posts24h?:number;likes?:number;follows?:number;pendingReports?:number;pendingVerifications?:number;restrictedAccounts?:number;announcements?:number};
const rights=['admin.access','users.read','users.warn','users.restrict','content.moderate','reports.manage','verifications.manage','notices.send','announcements.manage','metrics.view','staff.manage','settings.manage','audit.view'];
const roleNames:Record<string,string>={founder:'平台创始人',super_admin:'超级管理员',official:'官方运营',senior_admin:'高级管理员',moderator:'内容审核员',verification_reviewer:'认证审核员',support:'客服管理员',analyst:'数据分析员'};
const tabLabels:Record<Tab,string>={overview:'总览',accounts:'用户账号',content:'内容与举报',verification:'认证审核',notices:'官方通知',announcements:'全站公告',staff:'管理员',settings:'平台设置',audit:'操作审计'};
const tabPerm:Record<Tab,string>={overview:'admin.access',accounts:'users.read',content:'content.moderate',verification:'verifications.manage',notices:'notices.send',announcements:'announcements.manage',staff:'staff.manage',settings:'settings.manage',audit:'audit.view'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date=(s:string|null|undefined)=>s?new Date(s).toLocaleString('zh-CN'):'—';
const formatCount=(n:number|undefined)=>typeof n==='number'?n.toLocaleString('zh-CN'):'—';

export function StarflowSuperAdmin(){
 const [ready,setReady]=useState(false);
 const [authorized,setAuthorized]=useState(false);
 const [role,setRole]=useState<StaffRole|null>(null);
 const [allowed,setAllowed]=useState<Record<string,boolean>>({});
 const [tab,setTab]=useState<Tab>('overview');
 const [loading,setLoading]=useState(false);
 const [info,setInfo]=useState('');
 const [error,setError]=useState('');
 const [stats,setStats]=useState<Stats>({});
 const [search,setSearch]=useState('');
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [selected,setSelected]=useState<Account|null>(null);
 const [accountAction,setAccountAction]=useState<'warn'|'suspend'|'ban'|'restore'>('warn');
 const [reason,setReason]=useState('');
 const [suspendDays,setSuspendDays]=useState('7');
 const [postId,setPostId]=useState('');
 const [postAction,setPostAction]=useState<'hide'|'restore'|'delete'>('hide');
 const [postReason,setPostReason]=useState('');
 const [reports,setReports]=useState<Report[]>([]);
 const [recipient,setRecipient]=useState('');
 const [noticeKind,setNoticeKind]=useState('system_announcement');
 const [noticeBody,setNoticeBody]=useState('');
 const [annTitle,setAnnTitle]=useState('');
 const [annBody,setAnnBody]=useState('');
 const [annPublished,setAnnPublished]=useState(true);
 const [announcements,setAnnouncements]=useState<Announcement[]>([]);
 const [staff,setStaff]=useState<Staff[]>([]);
 const [staffRole,setStaffRole]=useState<StaffRole>('moderator');
 const [staffEnabled,setStaffEnabled]=useState(true);
 const [settings,setSettings]=useState<Record<string,unknown>>({});
 const [audits,setAudits]=useState<Audit[]>([]);
 const [auditSearch,setAuditSearch]=useState('');
 const [refreshing,setRefreshing]=useState(false);
 const [refreshedAt,setRefreshedAt]=useState<string|null>(null);
 const postIdInput=useRef<HTMLInputElement|null>(null);
 const can=useCallback((name:string)=>allowed[name]===true,[allowed]);
 const permittedTabs=useMemo(()=> (Object.keys(tabLabels) as Tab[]).filter(x=>can(tabPerm[x])),[can]);
 const filteredAudits=useMemo(()=>{
  const query=auditSearch.trim().toLowerCase();
  return query?audits.filter(a=>[a.action,a.actor_id,a.target_user_id,a.target_post_id].some(v=>v?.toLowerCase().includes(query))):audits;
 },[audits,auditSearch]);

 const refresh=useCallback(async (p:Record<string,boolean>)=>{
  const client=db();
  const tasks:Promise<void>[]=[];
  if(p['metrics.view'])tasks.push((async()=>{const r=await client.rpc('sf_admin_metrics');if(r.error)throw r.error;setStats((r.data||{}) as Stats)})());
  if(p['users.read'])tasks.push((async()=>{const r=await client.rpc('sf_admin_find_users',{p_query:''});if(r.error)throw r.error;setAccounts((r.data||[]) as Account[])})());
  if(p['reports.manage'])tasks.push((async()=>{const r=await client.from('reports').select('id,reason,post_id,created_at,reviewed_at').is('reviewed_at',null).order('created_at',{ascending:false}).limit(50);if(r.error)throw r.error;setReports((r.data||[]) as Report[])})());
  if(p['announcements.manage'])tasks.push((async()=>{const r=await client.from('sf_platform_announcements').select('id,title,body,published,created_at').order('created_at',{ascending:false}).limit(50);if(r.error)throw r.error;setAnnouncements((r.data||[]) as Announcement[])})());
  if(p['staff.manage'])tasks.push((async()=>{const r=await client.from('sf_staff_roles').select('user_id,role,enabled,updated_at').order('updated_at',{ascending:false}).limit(100);if(r.error)throw r.error;setStaff((r.data||[]) as Staff[])})());
  if(p['settings.manage'])tasks.push((async()=>{const r=await client.from('sf_platform_settings').select('key,value');if(r.error)throw r.error;setSettings(Object.fromEntries((r.data||[]).map(x=>[x.key,x.value])))})());
  if(p['audit.view'])tasks.push((async()=>{const r=await client.from('sf_admin_activity').select('id,action,actor_id,target_user_id,target_post_id,created_at,details').order('created_at',{ascending:false}).limit(60);if(r.error)throw r.error;setAudits((r.data||[]) as Audit[])})());
  const results=await Promise.allSettled(tasks);
  const failures=results.filter(result=>result.status==='rejected') as PromiseRejectedResult[];
  if(failures.length)throw Error('部分后台数据暂时加载失败，请重试：'+failures.map(f=>f.reason instanceof Error?f.reason.message:'网络错误').join('；'));
  setRefreshedAt(new Date().toISOString());
 },[]);
 async function refreshNow(){
  if(refreshing||loading)return;
  setRefreshing(true);setError('');
  try{await refresh(allowed);}
  catch(e){setError(e instanceof Error?e.message:'后台刷新失败，请重试。');}
  finally{setRefreshing(false);}
 }

 useEffect(()=>{
  let alive=true;
  (async()=>{
   try{
    if(!hasConfig())throw Error('网站尚未配置数据库。');
    const client=db();
    const {data:{user},error:loginError}=await client.auth.getUser();
    if(loginError||!user)throw Error('请先登录平台管理员账号。');
    const permissions=await Promise.all(rights.map(async p=>{
     const result=await client.rpc('sf_admin_has_permission',{p_permission:p});
     return [p,!result.error&&result.data===true] as const;
    }));
    if(!alive)return;
    const p=Object.fromEntries(permissions) as Record<string,boolean>;
    if(!p['admin.access'])throw Error('当前账号没有授权的后台管理权限。');
    const roleResult=await client.from('sf_staff_roles').select('role').eq('user_id',user.id).maybeSingle();
    if(!alive)return;
    setRole((roleResult.data?.role||null) as StaffRole|null);
    setAllowed(p);
    setAuthorized(true);
    await refresh(p);
   }catch(e){if(alive)setError(e instanceof Error?e.message:'无法验证管理员身份');}
   finally{if(alive)setReady(true);}
  })();
  return()=>{alive=false};
 },[refresh]);

 async function doAction(action:()=>Promise<void>){
  if(loading)return;
  setInfo('');setError('');setLoading(true);
  try{await action();setInfo('操作成功，已由数据库权限校验并记录审计。');await refresh(allowed);}
  catch(e){setError(e instanceof Error?e.message:'操作失败，请重试');}
  finally{setLoading(false);}
 }
 async function invoke(name:string,args:Record<string,unknown>){
  const result=await db().rpc(name,args);
  if(result.error)throw Error(result.error.message);
  return result.data as unknown;
 }
 async function findAccounts(event?:FormEvent){
  event?.preventDefault();
  if(!can('users.read'))return;
  const query=search.replace(/^@/,'').trim().slice(0,40);
  const r=await db().rpc('sf_admin_find_users',{p_query:query});
  if(r.error)setError(r.error.message);
  else{setError('');setAccounts((r.data||[]) as Account[]);setSelected(null);}
 }
 function pick(a:Account){
  setSelected(a);setRecipient(a.handle);
  setStaffRole(a.staff_role||'moderator');setStaffEnabled(a.staff_enabled!==false);
 }
 function confirmAction(description:string){return window.confirm(description+'？\n此操作将作用于真实星流账号，并留下审计记录。');}
 function submitRestriction(event:FormEvent){
  event.preventDefault();
  if(!selected||!can(accountAction==='warn'?'users.warn':'users.restrict'))return;
  if(reason.trim().length<10){setError('请输入至少10个字符的处置说明。');return;}
  let expires:string|null=null;
  if(accountAction==='suspend'){
   const d=Number(suspendDays);
   if(!Number.isFinite(d)||d<1||d>365){setError('暂停期限必须为1–365天。');return;}
   expires=new Date(Date.now()+d*86400000).toISOString();
  }
  if(!confirmAction('确认对 @'+selected.handle+' 执行 '+accountAction))return;
  void doAction(async()=>{await invoke('sf_admin_restrict_user',{p_user_id:selected.id,p_action:accountAction,p_reason:reason.trim(),p_expires_at:expires});setReason('');});
 }
 function submitPost(event:FormEvent){
  event.preventDefault();
  if(!uuid.test(postId.trim())){setError('请输入有效的帖子 UUID。');return;}
  if(postReason.trim().length<10){setError('审核理由至少10个字符。');return;}
  if(!confirmAction('确认'+postAction+'这条帖子'))return;
  void doAction(async()=>{await invoke('sf_admin_moderate_post',{p_post_id:postId.trim(),p_action:postAction,p_reason:postReason.trim()});setPostReason('')});
 }
 function reviewReport(id:string){
  if(!confirmAction('标记举报已审核'))return;
  void doAction(async()=>{await invoke('sf_admin_review_report',{p_report_id:id})});
 }
 function sendNotice(event:FormEvent){
  event.preventDefault();
  if(noticeBody.trim().length<1||noticeBody.trim().length>1000){setError('通知为1–1000字。');return;}
  if(!confirmAction('确认发送官方通知'))return;
  void doAction(async()=>{
   const result=await db().from('profiles').select('id').eq('handle',recipient.trim().toLowerCase().replace(/^@/,'')).maybeSingle();
   if(result.error)throw Error(result.error.message);
   if(!result.data)throw Error('未找到该账号');
   await invoke('sf_admin_send_notice_v2',{p_recipient:result.data.id,p_kind:noticeKind,p_message:noticeBody.trim()});
   setNoticeBody('');
  });
 }
 function createAnnouncement(event:FormEvent){
  event.preventDefault();
  if(!confirmAction(annPublished?'发布全站公告':'保存公告草稿'))return;
  void doAction(async()=>{
   await invoke('sf_admin_save_announcement',{p_title:annTitle.trim(),p_body:annBody.trim(),p_published:annPublished,p_expires_at:null});
   setAnnTitle('');setAnnBody('');
  });
 }
 function archiveAnnouncement(id:string){
  if(!confirmAction('撤下这条全站公告'))return;
  void doAction(async()=>{await invoke('sf_admin_archive_announcement',{p_id:id})});
 }
 function updateStaff(event:FormEvent){
  event.preventDefault();
  if(!selected||!can('staff.manage'))return;
  if(!confirmAction('为 @'+selected.handle+' 设置 '+roleNames[staffRole]+'，状态为'+(staffEnabled?'启用':'停用')))return;
  void doAction(async()=>{await invoke('sf_admin_set_staff',{p_user_id:selected.id,p_role:staffRole,p_enabled:staffEnabled})});
 }
 function updateSetting(key:string,value:unknown){
  if(!confirmAction('更改设置 '+key))return;
  void doAction(async()=>{await invoke('sf_admin_update_setting',{p_key:key,p_value:value})});
 }
 const nav=(name:Tab)=><button type="button" key={name} aria-current={tab===name?'page':undefined}
  className={'sac-tab '+(tab===name?'active':'')} onClick={()=>setTab(name)}>{tabLabels[name]}</button>;
 const statItems:[keyof Stats,string][]=[['users','注册用户'],['newUsers24h','24小时新用户'],['posts','主帖子'],['replies','评论回复'],['posts24h','24小时新内容'],['likes','累计点赞'],['follows','关注关系'],['pendingReports','待处理举报'],['pendingVerifications','待审认证'],['restrictedAccounts','受限账号'],['announcements','已发布公告']];
 return <main className="sac-root"><div className="sac-shell">
  <header className="sac-top"><div className="sac-brand"><span className="sac-symbol">✦</span><div><strong>Starflow Admin Console</strong><small>星流 · 安全管理控制台</small></div></div>
   <nav><Link href="/admin">旧版后台</Link><Link href="/">返回星流</Link></nav>
  </header>
  <div className="sac-hero"><div><p>STARFLOW CONTROL CENTER</p><h1>星流超级管理中心</h1><span>角色分级 · 操作审计 · 账号治理 · 内容审核 · 全站运营</span></div>
   {role&&<span className="sac-role">{roleNames[role]||role}</span>}</div>
  {!ready?<section className="sac-card">正在验证管理员身份与权限…</section>:!authorized?<section className="sac-card"><h2>无权访问</h2><p>{error||'请使用经授权的管理员账号登录。'}</p><Link href="/">返回主页登录</Link></section>:<>
   <nav className="sac-tabs" aria-label="后台功能导航">{permittedTabs.map(nav)}</nav>
   {info&&<div className="sac-alert success" role="status">{info}</div>}
   {error&&<div className="sac-alert error" role="alert">{error}</div>}
   {tab==='overview'&&<section className="sac-card"><div className="sac-heading"><h2>平台实时数据库概览</h2><button type="button" onClick={()=>void refreshNow()} disabled={loading||refreshing} aria-busy={refreshing}>{refreshing?'刷新中…':'刷新'}</button></div>
    {can('metrics.view')?<div className="sac-stats">{statItems.map(([key,title])=><article key={key}><small>{title}</small><strong>{formatCount(stats[key])}</strong></article>)}</div>:<p>当前角色无统计读取权限。</p>}
    <p className="sac-muted">全部数字直接来自真实数据库，不使用模拟人数。浏览人数与独立活跃用户需另建统计口径。{refreshedAt&&' · 最近刷新：'+date(refreshedAt)}</p>
    <div className="sac-grid"><div><h3>已接入</h3><p>账号与权限、内容隐藏/删除、举报处理、认证审核、官方通知、公告、审计与实际行为限制。</p></div><div><h3>不提供越权访问</h3><p>不能读取用户私信正文、获取密码或绕过身份验证。高风险操作均要求服务端授权。</p></div></div>
   </section>}
   {tab==='accounts'&&<section className="sac-card">
    <h2>用户与账号管理</h2><form className="sac-search" onSubmit={findAccounts}><input aria-label="搜索用户" value={search} onChange={e=>setSearch(e.target.value)} maxLength={40} placeholder="搜索 @用户名或显示名称"/><button type="submit">搜索</button></form>
    <p className="sac-muted">最多显示50条，点击选择用户；官方与管理员账号受到保护。</p>
    <div className="sac-user-list">{accounts.map(a=><button type="button" key={a.id} className={selected?.id===a.id?'picked':''} onClick={()=>pick(a)}><b>@{a.handle}</b><small>{a.display_name} · {a.account_status} · {date(a.created_at)}</small></button>)}</div>
    {selected&&<div className="sac-subcard"><h3>管理 @{selected.handle}</h3><p className="sac-muted">ID: {selected.id} · 当前状态：{selected.account_status}{selected.staff_role?' · '+roleNames[selected.staff_role]:''}</p>
     {(can('users.warn')||can('users.restrict'))&&<form className="sac-form" onSubmit={submitRestriction}><label>处理类型<select value={accountAction} onChange={e=>setAccountAction(e.target.value as typeof accountAction)}>
      <option value="warn">发送违规警告</option>{can('users.restrict')&&<><option value="suspend">限期暂停</option><option value="ban">无限期封禁平台操作</option><option value="restore">恢复正常</option></>}</select></label>
      {accountAction==='suspend'&&<label>暂停天数<input type="number" min="1" max="365" value={suspendDays} onChange={e=>setSuspendDays(e.target.value)}/></label>}
      <label>处理理由（10–1000字）<textarea minLength={10} maxLength={1000} required value={reason} onChange={e=>setReason(e.target.value)} rows={3}/></label><button disabled={loading} type="submit">确认账号处置</button>
     </form>}
    </div>}
   </section>}
   {tab==='content'&&<section className="sac-card"><h2>内容与举报审核</h2>
    <form className="sac-form" onSubmit={submitPost}><label>帖子 UUID<input ref={postIdInput} value={postId} onChange={e=>setPostId(e.target.value)} placeholder="复制帖子完整 UUID" required/></label>
     <label>内容操作<select value={postAction} onChange={e=>setPostAction(e.target.value as typeof postAction)}><option value="hide">隐藏公开帖子</option><option value="restore">恢复公开展示</option><option value="delete">永久删除帖子</option></select></label>
     <label>理由（10–1000字）<textarea rows={3} minLength={10} maxLength={1000} value={postReason} onChange={e=>setPostReason(e.target.value)} required/></label><button disabled={loading}>执行审核</button>
    </form>
    <h3>待审核举报 · {reports.length}</h3>
    {reports.length===0?<p className="sac-muted">暂无待审核举报。</p>:reports.map(r=><div className="sac-list-line" key={r.id}><strong>{r.reason}</strong><small>{date(r.created_at)} · <Link href={'/post/'+r.post_id}>查看帖子</Link></small><div className="sac-actions"><button disabled={loading} onClick={()=>reviewReport(r.id)}>标记已处理</button><button type="button" onClick={()=>{setPostId(r.post_id);setPostAction('hide');postIdInput.current?.focus();postIdInput.current?.scrollIntoView({block:'center',behavior:'smooth'});}}>审核此帖</button></div></div>)}
   </section>}
   {tab==='verification'&&<section className="sac-card"><h2>蓝色 / 金色 / 灰色认证管理</h2><p>审核认证申请、审批原因、撤销认证、查询审核记录。认证必须依据真实资料审核。</p>
    <Link className="sac-primary-link" href="/admin/verifications">前往认证审核工作台 →</Link>
   </section>}
   {tab==='notices'&&<section className="sac-card"><h2>官方站内通知</h2><p className="sac-muted">向指定账号发送真实通知，后台将记录发送人、类型与接收人。</p>
    <form className="sac-form" onSubmit={sendNotice}>
     <label>接收账号 @用户名<input value={recipient} onChange={e=>setRecipient(e.target.value)} required placeholder="@username"/></label>
     <label>类型<select value={noticeKind} onChange={e=>setNoticeKind(e.target.value)}><option value="system_announcement">官方公告</option><option value="account_security">账号安全提醒</option><option value="account_warning">账号警告</option></select></label>
     <label>内容（1–1000字）<textarea value={noticeBody} onChange={e=>setNoticeBody(e.target.value)} rows={5} required maxLength={1000}/></label>
     <button disabled={loading}>确认发送通知</button>
    </form>
   </section>}
   {tab==='announcements'&&<section className="sac-card"><h2>全站公告</h2><p className="sac-muted">发布后会在网站的公告区域展示，无需向每名用户单独发送私信。</p>
    <form className="sac-form" onSubmit={createAnnouncement}><label>公告标题<input value={annTitle} minLength={2} maxLength={120} onChange={e=>setAnnTitle(e.target.value)} required/></label>
     <label>公告正文<textarea rows={5} value={annBody} minLength={2} maxLength={2000} onChange={e=>setAnnBody(e.target.value)} required/></label>
     <label className="sac-check"><input type="checkbox" checked={annPublished} onChange={e=>setAnnPublished(e.target.checked)}/>立即公开发布</label>
     <button disabled={loading}>保存公告</button></form>
    <h3>公告列表</h3>{announcements.map(a=><div className="sac-list-line" key={a.id}><strong>{a.title}</strong><small>{date(a.created_at)} · {a.published?'已公开':'草稿／已撤回'}</small><p>{a.body}</p>{a.published&&<button disabled={loading} onClick={()=>archiveAnnouncement(a.id)}>撤回公告</button>}</div>)}
   </section>}
   {tab==='staff'&&<section className="sac-card"><h2>管理员权限分配</h2><p className="sac-muted">只有创始人账号可任命或停用员工；不能修改自己的创始人身份。</p>
    {staff.map(s=><div className="sac-list-line" key={s.user_id}><strong>{roleNames[s.role]}</strong><small>{s.user_id} · {s.enabled?'启用':'停用'} · {date(s.updated_at)}</small></div>)}
    <h3>设置账号角色</h3><p className="sac-muted">先在「用户账号」中搜索并选中目标账号。</p>
    {selected?<form className="sac-form" onSubmit={updateStaff}><p>目标：@{selected.handle}</p>
     <label>分配角色<select value={staffRole} onChange={e=>setStaffRole(e.target.value as StaffRole)}>
      {(['super_admin','official','senior_admin','moderator','verification_reviewer','support','analyst'] as StaffRole[]).map(r=><option value={r} key={r}>{roleNames[r]}</option>)}
     </select></label><label className="sac-check"><input type="checkbox" checked={staffEnabled} onChange={e=>setStaffEnabled(e.target.checked)}/>角色启用</label><button disabled={loading}>保存角色权限</button>
    </form>:<button className="sac-secondary" onClick={()=>setTab('accounts')}>前往选择用户</button>}
   </section>}
   {tab==='settings'&&<section className="sac-card"><h2>平台系统设置</h2>
    <div className="sac-list-line"><strong>平台发帖开关</strong><small>已由数据库触发器强制执行</small><p>{settings.posting_enabled===false?'发帖已暂停':'允许发帖'}</p><button disabled={loading} onClick={()=>updateSetting('posting_enabled',settings.posting_enabled===false)}>切换发帖状态</button></div>
    <div className="sac-list-line"><strong>维护模式</strong><p className="sac-muted">仅保存设置值，访问阻断需另行接入路由中间件。</p><button disabled>{settings.maintenance_mode?'已配置开启':'未开启'} · 尚不可执行</button></div>
    <div className="sac-list-line"><strong>注册开关</strong><p className="sac-muted">必须接入 Supabase Auth 注册入口才能真正关闭注册，暂不可执行。</p><button disabled>{settings.registration_enabled===false?'已配置关闭':'已配置开放'} · 尚不可执行</button></div>
    <p className="sac-muted">Logo、首页设计、邮箱模板、部署密钥和数据库备份不在普通网页后台开放；应在安全的部署配置中管理。</p>
   </section>}
   {tab==='audit'&&<section className="sac-card"><h2>管理员操作审计</h2><p className="sac-muted">仅筛选已加载的最近60条后台操作记录，不展示任何用户私信正文。</p>
    <label className="sac-audit-search">筛选操作、操作者或目标账号 ID<input type="search" value={auditSearch}
     onChange={e=>setAuditSearch(e.target.value)} placeholder="输入关键字（只搜索当前列表）" maxLength={100}/></label>
    {filteredAudits.length===0?<p>{audits.length===0?'暂无操作记录。':'当前列表没有匹配的审计记录。'}</p>:filteredAudits.map(a=><div className="sac-list-line" key={a.id}><strong>{a.action}</strong><small>{date(a.created_at)} · 操作者：{a.actor_id}</small><p className="sac-muted">{a.target_user_id?'用户 '+a.target_user_id+' ':''}{a.target_post_id?'帖子 '+a.target_post_id:''}</p></div>)}
   </section>}
   <footer className="sac-footer">Starflow · 权限由 Supabase RLS 与受控 RPC 共同执行。严禁跨越数据最小权限边界。</footer>
  </>}
 </div></main>;
}
