'use client';
import Link from 'next/link';
import {useCallback,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {db,hasConfig} from '@/lib/supabase';
import './StarflowExtras.css';

type Community={id:string;name:string;description:string;rules:string;owner_id:string;join_policy:'open'|'approval';created_at:string};
type JoinRequest={community_id:string;user_id:string;status:'pending'|'approved'|'rejected';created_at:string};
type CommunityMember={community_id:string;user_id:string;role:string};
type List={id:string;owner_id:string;name:string;description:string;visibility:string};
type Member={list_id:string;profile_id:string};
type Person={id:string;handle:string;display_name:string};
type FeedPost={id:string;author_id:string;content:string;created_at:string};

type Mode='communities'|'lists';
export function StarflowHub(){
 const [mode,setMode]=useState<Mode>('communities');
 const [userId,setUserId]=useState<string|null>(null);const [loading,setLoading]=useState(true);
 const [communities,setCommunities]=useState<Community[]>([]);
 const [members,setMembers]=useState<CommunityMember[]>([]);
 const [joinRequests,setJoinRequests]=useState<JoinRequest[]>([]);
 const [memberProfiles,setMemberProfiles]=useState<Record<string,Person>>({});
 const [lists,setLists]=useState<List[]>([]);const [listMembers,setListMembers]=useState<Member[]>([]);
 const [followed,setFollowed]=useState<Person[]>([]);
 const [selectedCommunity,setSelectedCommunity]=useState<string|null>(null);
 const [selectedList,setSelectedList]=useState<string|null>(null);
 const [name,setName]=useState('');const [description,setDescription]=useState('');const [rules,setRules]=useState('');
 const [privacy,setPrivacy]=useState<'public'|'private'>('private');
 const [postText,setPostText]=useState('');const [feed,setFeed]=useState<FeedPost[]>([]);
 const [feedProfiles,setFeedProfiles]=useState<Record<string,Person>>({});
 const [choice,setChoice]=useState('');const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
 const [showCreate,setShowCreate]=useState(false);
 const report=(msg:string)=>setNotice(msg);
 const refresh=useCallback(async()=>{
  if(!hasConfig()){setLoading(false);report('Supabase 尚未配置');return;}
  const client=db();const {data:{user}}=await client.auth.getUser();
  setUserId(user?.id||null);
  const [c,m,l,lm]=await Promise.all([
   client.from('communities').select('id,name,description,rules,owner_id,join_policy,created_at').order('created_at',{ascending:false}).limit(100),
   client.from('community_members').select('community_id,user_id,role').limit(1000),
   client.from('social_lists').select('id,name,description,visibility,owner_id').order('created_at',{ascending:false}).limit(100),
   client.from('social_list_members').select('list_id,profile_id').limit(1000),
  ]);
  setCommunities((c.data||[]) as Community[]);setMembers((m.data||[]) as CommunityMember[]);
  const {data:requests,error:requestError}=user?await client.from('community_join_requests').select('community_id,user_id,status,created_at').limit(200):{data:[],error:null};
  setJoinRequests((requests||[]) as JoinRequest[]);
  const memberIds=[...new Set((m.data||[]).map(x=>x.user_id))].slice(0,100);
  if(memberIds.length){const {data:people}=await client.from('profiles').select('id,handle,display_name').in('id',memberIds);
   setMemberProfiles(Object.fromEntries(((people||[]) as Person[]).map(x=>[x.id,x])))}else setMemberProfiles({});
  if(c.error||m.error||l.error||lm.error||requestError)report('社区数据尚未就绪：'+(c.error?.message||m.error?.message||l.error?.message||lm.error?.message||requestError?.message));
  setLists((l.data||[]) as List[]);setListMembers((lm.data||[]) as Member[]);
  if(user){
   const {data:f}=await client.from('follows').select('following_id').eq('follower_id',user.id).limit(100);
   const ids=(f||[]).map(x=>x.following_id);
   if(ids.length){const {data:people}=await client.from('profiles').select('id,handle,display_name').in('id',ids);
    setFollowed((people||[]) as Person[]);
   }else setFollowed([]);
  }
  setLoading(false);
 },[]);
 useEffect(()=>{void refresh()},[refresh]);
 const selected=mode==='communities'?communities.find(x=>x.id===selectedCommunity):lists.find(x=>x.id===selectedList);
 const joined=members.some(x=>x.community_id===selectedCommunity&&x.user_id===userId);
 const currentCommunity=communities.find(x=>x.id===selectedCommunity);
 const myRequest=joinRequests.find(x=>x.community_id===selectedCommunity&&x.user_id===userId&&x.status==='pending');
 const isCommunityOwner=currentCommunity?.owner_id===userId;
 const myRole=members.find(x=>x.community_id===selectedCommunity&&x.user_id===userId)?.role;
 const canModerate=myRole==='owner'||myRole==='moderator';
 const currentMembers=members.filter(x=>x.community_id===selectedCommunity);
 const pendingRequests=joinRequests.filter(x=>x.community_id===selectedCommunity&&x.status==='pending');
 useEffect(()=>{
  let active=true;const client=db();
  const show=async()=>{
   let ids:string[]=[];
   if(mode==='communities'&&selectedCommunity){const {data}=await client.from('community_posts').select('post_id').eq('community_id',selectedCommunity).order('created_at',{ascending:false}).limit(60);ids=(data||[]).map(x=>x.post_id)}
   if(mode==='lists'&&selectedList){
    const people=listMembers.filter(x=>x.list_id===selectedList).map(x=>x.profile_id);
    if(people.length){const {data}=await client.from('posts').select('id').in('author_id',people).is('parent_id',null).order('created_at',{ascending:false}).limit(60);ids=(data||[]).map(x=>x.id)}
   }
   if(ids.length===0){if(active){setFeed([]);setFeedProfiles({})}return;}
   const {data}=await client.from('posts').select('id,author_id,content,created_at').in('id',ids).order('created_at',{ascending:false}).limit(60);
   const rows=(data||[]) as FeedPost[];
   const authors=[...new Set(rows.map(x=>x.author_id))];
   const {data:profiles}=await client.from('profiles').select('id,handle,display_name').in('id',authors);
   if(active){setFeed(rows);setFeedProfiles(Object.fromEntries(((profiles||[]) as Person[]).map(x=>[x.id,x])))}
  };
  if(selectedCommunity||selectedList)void show();else{setFeed([]);setFeedProfiles({})}
  return()=>{active=false};
 },[mode,selectedCommunity,selectedList,listMembers]);
 async function create(e:FormEvent){
  e.preventDefault();if(!userId||busy)return;
  setBusy(true);setNotice('');
  if(mode==='communities'){
   const {data,error}=await db().rpc('create_community',{p_name:name.trim(),p_description:description.trim(),p_rules:rules.trim()});
   if(error)report('创建失败：'+error.message);else{setSelectedCommunity(String(data));report('社区创建成功');setShowCreate(false);setName('');setDescription('');setRules('')}
  }else{
   const {data,error}=await db().from('social_lists').insert({owner_id:userId,name:name.trim(),description:description.trim(),visibility:privacy}).select('id').single();
   if(error)report('创建失败：'+error.message);else{setSelectedList(data.id);report('列表创建成功');setShowCreate(false);setName('');setDescription('')}
  }
  await refresh();setBusy(false);
 }
 async function join(){
  if(!userId||!selectedCommunity||busy)return;
  setBusy(true);
  const result=joined||myRequest
   ?await db().rpc('sf_community_leave',{p_community:selectedCommunity})
   :await db().rpc('sf_community_join',{p_community:selectedCommunity});
  report(result.error?'操作失败：'+result.error.message:joined?'已退出社区':myRequest?'已撤回入群申请':result.data==='pending'?'申请已提交，等待社区创建者审核':'加入社区成功');
  await refresh();setBusy(false);
 }
 async function sendPost(e:FormEvent){
  e.preventDefault();if(!selectedCommunity||!userId||busy||!postText.trim())return;
  setBusy(true);const {error}=await db().rpc('publish_community_post',{p_community:selectedCommunity,p_content:postText.trim()});
  if(error)report('发布失败：'+error.message);else{setPostText('');report('社区帖子发布成功');setSelectedCommunity(null);setTimeout(()=>setSelectedCommunity(selectedCommunity),0)}
  setBusy(false);
 }
 async function changeMember(profileId:string,remove:boolean){
  if(!selectedList||!profileId||busy)return;
  setBusy(true);
  const {error}=remove?await db().from('social_list_members').delete().eq('list_id',selectedList).eq('profile_id',profileId):
   await db().from('social_list_members').insert({list_id:selectedList,profile_id:profileId});
  report(error?'更新失败：'+error.message:remove?'已移出列表':'已加入列表');await refresh();setBusy(false);
 }
 async function reviewJoin(targetUser:string,approve:boolean){
  if(!selectedCommunity||!isCommunityOwner||busy)return;
  setBusy(true);const r=await db().rpc('sf_community_review_join',{p_community:selectedCommunity,p_user:targetUser,p_approve:approve});
  report(r.error?'审核失败：'+r.error.message:r.data?'处理完成':'该申请已被处理');await refresh();setBusy(false);
 }
 async function changeCommunityPolicy(policy:'open'|'approval'){
  if(!selectedCommunity||!isCommunityOwner||busy)return;
  setBusy(true);const r=await db().from('communities').update({join_policy:policy}).eq('id',selectedCommunity).eq('owner_id',userId!);
  report(r.error?'保存失败：'+r.error.message:'入群规则已更新');await refresh();setBusy(false);
 }
 async function moderateMember(targetUser:string,action:'promote'|'demote'|'remove'){
  if(!selectedCommunity||!canModerate||busy||targetUser===userId)return;
  if(!window.confirm('确认修改这名社区成员的权限或成员资格？'))return;
  setBusy(true);
  const r=action==='remove'?await db().rpc('sf_community_remove_member',{p_community:selectedCommunity,p_user:targetUser})
   :await db().rpc('sf_community_set_moderator',{p_community:selectedCommunity,p_user:targetUser,p_moderator:action==='promote'});
  report(r.error?'操作失败：'+r.error.message:r.data?'操作已保存':'未找到可更改的成员');await refresh();setBusy(false);
 }
 const mineList=mode==='lists'&&selected&&'owner_id' in selected&&selected.owner_id===userId;
 return <div className="sf-hub"><div className="sf-hub-inner">
  <header><Link href="/">← 返回 Starflow</Link><Link href="/creator">创作者数据 →</Link></header>
  <h1>✦ Starflow 社区与列表</h1>
  <p className="sf-hub-help">公开社区讨论、管理关注分组和浏览专属信息流。这里没有用户私信。</p>
  <div className="sf-hub-tabs"><button className={mode==='communities'?'active':''} onClick={()=>{setMode('communities');setNotice('')}}>社区</button><button className={mode==='lists'?'active':''} onClick={()=>{setMode('lists');setNotice('')}}>关注列表</button></div>
  {notice&&<div className="sf-hub-status" role="status">{notice}</div>}
  {loading?<p>正在读取数据…</p>:<>
   {userId&&<div className="sf-hub-card"><button className="sf-hub-outline" onClick={()=>setShowCreate(!showCreate)}>{showCreate?'取消创建':'＋ 新建'+(mode==='communities'?'社区':'列表')}</button>
    {showCreate&&<form className="sf-hub-form" onSubmit={create} style={{marginTop:12}}>
     <input placeholder="名称" value={name} maxLength={80} required onChange={e=>setName(e.target.value)}/>
     <textarea placeholder="介绍" value={description} maxLength={mode==='communities'?500:240} onChange={e=>setDescription(e.target.value)}/>
     {mode==='communities'?<textarea placeholder="社区规则" value={rules} maxLength={1000} onChange={e=>setRules(e.target.value)}/>:<label>可见范围<select value={privacy} onChange={e=>setPrivacy(e.target.value as 'public'|'private')}><option value="private">私密列表</option><option value="public">公开列表</option></select></label>}
     <button className="sf-hub-btn" disabled={busy}>确认创建</button>
    </form>}
   </div>}
   <div className="sf-hub-card"><h2>{mode==='communities'?'发现社区':'关注列表'}</h2>
    {(mode==='communities'?communities:lists).length===0?<p className="sf-hub-help">暂时没有内容。登录后可以创建。</p>:
     (mode==='communities'?communities:lists).map(x=><button key={x.id} className="sf-hub-outline" style={{display:'block',width:'100%',textAlign:'left',margin:'8px 0'}}
       onClick={()=>mode==='communities'?setSelectedCommunity(x.id):setSelectedList(x.id)}><strong>{x.name}</strong> <small>{'visibility' in x?(x.visibility==='public'?'公开':'私密'):'社区'}</small><p className="sf-hub-help" style={{marginBottom:0}}>{x.description||'暂无介绍'}</p></button>)}
   </div>
   {selected&&<section className="sf-hub-card">
    <h2>{selected.name}</h2><p className="sf-hub-help">{selected.description}</p>
    {mode==='communities'&&'rules' in selected&&<p className="sf-hub-help">社区规则：{selected.rules||'遵守平台社区规范'}</p>}
    {mode==='communities'&&userId&&<button className="sf-hub-outline" disabled={busy||(selected.owner_id===userId)} onClick={()=>void join()}>{joined?'退出社区':myRequest?'撤回入群申请':currentCommunity?.join_policy==='approval'?'申请加入（需审核）':'加入社区'}</button>}
    {mode==='communities'&&<p className="sf-hub-help">入群方式：{currentCommunity?.join_policy==='approval'?'申请后由创建者审核':'公开加入'} · 成员 {currentMembers.length} 人</p>}
    {mode==='communities'&&isCommunityOwner&&<div className="sf-hub-form" style={{marginTop:14}}>
     <label>入群管理规则
      <select value={currentCommunity?.join_policy} disabled={busy} onChange={e=>void changeCommunityPolicy(e.target.value as 'open'|'approval')}>
       <option value="open">允许直接加入</option><option value="approval">加入前必须审核</option>
      </select>
     </label>
     <h3>待审核入群申请 · {pendingRequests.length}</h3>
     {pendingRequests.length===0?<p className="sf-hub-help">没有待审申请。</p>:pendingRequests.map(req=><div key={req.user_id} style={{padding:'8px 0'}}>
       <span>{memberProfiles[req.user_id]?.display_name||req.user_id.slice(0,8)} </span>
       <button type="button" className="sf-hub-outline" disabled={busy} onClick={()=>void reviewJoin(req.user_id,true)}>同意</button>
       <button type="button" className="sf-hub-outline" disabled={busy} onClick={()=>void reviewJoin(req.user_id,false)}>拒绝</button>
      </div>)}
    </div>}
    {mode==='communities'&&canModerate&&<div className="sf-hub-form" style={{marginTop:12}}>
     <h3>社区成员管理</h3>
     {currentMembers.map(member=><div key={member.user_id} style={{padding:'8px 0',borderBottom:'1px solid #eee'}}>
      <strong>{memberProfiles[member.user_id]?.display_name||member.user_id.slice(0,8)}</strong> <small>（{member.role==='owner'?'创建者':member.role==='moderator'?'管理员':'成员'}）</small>
      {member.role!=='owner'&&member.user_id!==userId&&<>
       {isCommunityOwner&&<button type="button" className="sf-hub-outline" disabled={busy} onClick={()=>void moderateMember(member.user_id,member.role==='moderator'?'demote':'promote')}>{member.role==='moderator'?'撤销管理':'设为管理'}</button>}
       {(isCommunityOwner||member.role==='member')&&<button type="button" className="sf-hub-outline" disabled={busy} onClick={()=>void moderateMember(member.user_id,'remove')}>移出</button>}
      </>}
     </div>)}
    </div>}
    {mode==='communities'&&userId&&joined&&<form className="sf-hub-form" onSubmit={sendPost} style={{marginTop:15}}>
     <textarea placeholder="分享社区动态（最多280字）" value={postText} maxLength={280} onChange={e=>setPostText(e.target.value)}/>
     <button className="sf-hub-btn" disabled={busy||!postText.trim()}>发布到社区</button>
    </form>}
    {mode==='lists'&&<>
     <h3>列表成员</h3>
     {listMembers.filter(m=>m.list_id===selectedList).map(m=><p key={m.profile_id}>
      {followed.find(f=>f.id===m.profile_id)?.display_name||m.profile_id.slice(0,8)}{' '}
      {mineList&&<button className="sf-hub-outline" disabled={busy} onClick={()=>void changeMember(m.profile_id,true)}>移除</button>}
     </p>)}
     {mineList&&<div className="sf-hub-form"><select value={choice} onChange={e=>setChoice(e.target.value)}><option value="">选择已关注的账号</option>{followed.filter(f=>!listMembers.some(m=>m.list_id===selectedList&&m.profile_id===f.id)).map(f=><option key={f.id} value={f.id}>{f.display_name} @{f.handle}</option>)}</select>
      <button className="sf-hub-btn" disabled={busy||!choice} onClick={()=>void changeMember(choice,false)}>添加成员</button></div>}
    </>}
    <h3 style={{marginTop:22}}>专属内容流</h3>
    {feed.length===0?<p className="sf-hub-help">这里暂时没有帖子。</p>:feed.map(p=><div className="sf-hub-feed" key={p.id}>
     <Link href={`/profile/${feedProfiles[p.author_id]?.handle||''}`}>{feedProfiles[p.author_id]?.display_name||'Starflow 用户'}</Link>
     <small> · {new Date(p.created_at).toLocaleString('zh-CN')}</small><p>{p.content}</p><Link href={`/post/${p.id}`}>查看帖子与回复 →</Link>
    </div>)}
   </section>}
  </>}
  {!userId&&!loading&&<div className="sf-hub-card">创建、加入和管理操作需要登录。<Link href="/">去登录 →</Link></div>}
 </div></div>;
}
