'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { Bell, Bookmark, LayoutDashboard, Camera, Check, ChevronLeft, Compass, Ellipsis, Heart, Home, ImagePlus, Video, LogOut, MessageCircle, PenLine, Repeat2, Search, Send, Settings, Shield, Sparkles, Trash2, UserRound, UserPlus, X } from 'lucide-react';
import { db, hasConfig } from '@/lib/supabase';
import { ensureWelcomeEmail } from '@/lib/welcome';
import { Avatar, Brand } from './Brand';
import { AuthPortal } from './AuthPortal';
import { LanguageSwitch, useLanguage } from './LanguageProvider';
import { VerificationBadge, type VerificationKind } from './VerificationBadge';
import type { Notif, Post, Profile } from '@/lib/types';
import { ago, unwrap } from '@/lib/types';

type View = 'home' | 'explore' | 'notifications' | 'bookmarks' | 'settings' | 'profile' | 'post';
type Metrics = Record<string,{likes:number; reposts:number; replies:number; liked:boolean; reposted:boolean; saved:boolean}>;
const postFields='id,author_id,content,image_url,video_url,parent_id,created_at,profiles!posts_author_id_fkey(id,handle,display_name,bio,avatar_url,created_at)';
const nav = [
  {to:'/',name:'home',icon:Home}, {to:'/explore',name:'explore',icon:Compass}, {to:'/notifications',name:'notifications',icon:Bell},
  {to:'/bookmarks',name:'bookmarks',icon:Bookmark}, {to:'/settings',name:'settings',icon:Settings}
];

export function SocialApp({view,target}:{view:View;target?:string}){
  const router=useRouter();
  const {t,lang}=useLanguage();
  const [user,setUser]=useState<User|null>(null);const [self,setSelf]=useState<Profile|null>(null);
  const [checking,setChecking]=useState(true);const [loading,setLoading]=useState(false);
  const [posts,setPosts]=useState<Post[]>([]);const [metrics,setMetrics]=useState<Metrics>({});
  const [verified,setVerified]=useState<Record<string,VerificationKind>>({});
  const [profileLookup,setProfileLookup]=useState<{handle:string;status:'found'|'missing'|'error';data:Profile|null}|null>(null);const [following,setFollowing]=useState<string[]>([]);
  const profile=view==='profile' && profileLookup?.handle===(target||'')?profileLookup.data:null;
  const profileStatus=view==='profile' && profileLookup?.handle===(target||'')?profileLookup.status:'loading';
  const [tab,setTab]=useState<'all'|'following'>('all');const [search,setSearch]=useState('');
  const [accounts,setAccounts]=useState<Profile[]>([]);const [notifs,setNotifs]=useState<Notif[]>([]);
  const [message,setMessage]=useState('');const [draft,setDraft]=useState('');
  const [image,setImage]=useState<File|null>(null);const [imagePreview,setImagePreview]=useState<string|null>(null);
  const [video,setVideo]=useState<File|null>(null);const [videoPreview,setVideoPreview]=useState<string|null>(null);
  const [sending,setSending]=useState(false);
  const [display,setDisplay]=useState('');const [bio,setBio]=useState('');const [handle,setHandle]=useState('');
  const [unread,setUnread]=useState(0);const [isAdmin,setIsAdmin]=useState(false);
  const inputRef=useRef<HTMLInputElement>(null);
  const videoInputRef=useRef<HTMLInputElement>(null);
  const showMessage=(msg:string)=>{setMessage(msg);window.setTimeout(()=>setMessage(''),6500)};

  useEffect(()=>{
    if(!hasConfig()){setChecking(false);return;}
    let active=true;
    const client=db();
    client.auth.getUser().then(({data:{user},error})=>{
      if(!active)return;
      setUser(error?null:user);setChecking(false);
    }).catch(()=>{if(active)setChecking(false)});
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{if(active)setUser(session?.user??null)});
    return()=>{active=false;subscription.unsubscribe()};
  },[]);
  useEffect(()=>{
    if(user?.email_confirmed_at || user?.confirmed_at) void ensureWelcomeEmail(user.id);
  },[user?.id, user?.email_confirmed_at, user?.confirmed_at]);
  useEffect(()=>{if(!user){setIsAdmin(false);return;}
    db().rpc('is_platform_admin').then(({data,error})=>{setIsAdmin(!error&&data===true)},()=>setIsAdmin(false));
  },[user?.id]);
  useEffect(()=>{
    if(!user){setSelf(null);return;}
    db().from('profiles').select('*').eq('id',user.id).single().then(({data,error})=>{
      if(data){const p=data as Profile;setSelf(p);setDisplay(p.display_name);setBio(p.bio);setHandle(p.handle)}
      else if(error)showMessage((lang==='en'?'Cannot load account profile. Check database migrations: ':'无法读取账户资料，请确认数据库迁移已执行：')+error.message);
    });
  },[user]);

  // Only server-approved account verification records can produce badges.
  // RLS permits public reads of approved records; no client-side approval path exists.
  const loadBadges=useCallback(async (profileIds:string[])=>{
    const unique=[...new Set(profileIds.filter(Boolean))];
    if(!unique.length)return;
    const {data,error}=await db().from('account_verifications')
      .select('profile_id,verification_type').eq('status','approved').in('profile_id',unique);
    if(error)return;
    setVerified(previous=>{
      const next={...previous};
      for(const id of unique)delete next[id];
      for(const item of data||[]){
        if(item.verification_type==='blue'||item.verification_type==='gold'||item.verification_type==='gray'){
          next[item.profile_id]=item.verification_type as VerificationKind;
        }
      }
      return next;
    });
  },[]);

  const load=useCallback(async()=>{
    if(!user)return;
    const client=db();setLoading(true);
    try{
      const {data:fs}=await client.from('follows').select('following_id').eq('follower_id',user.id);
      const followIds=(fs||[]).map((row:{following_id:string})=>row.following_id);
      setFollowing(followIds);
      const {count}=await client.from('notifications').select('id',{head:true,count:'exact'}).eq('recipient_id',user.id).is('read_at',null);
      setUnread(count??0);
      let query=client.from('posts').select(postFields);
      let currentProfile:Profile|null=null;
      if(view==='home'||view==='explore'){
        query=query.is('parent_id',null).order('created_at',{ascending:false}).limit(80);
        if(view==='home' && tab==='following'){
          const only=[...new Set([...followIds,user.id])];
          query=query.in('author_id',only);
        }
      }
      else if(view==='profile'){
        const {data:p,error:pe}=await client.from('profiles').select('*').eq('handle',target||'').maybeSingle();
        if(pe)throw pe;
        currentProfile=p as Profile|null;setProfileLookup({handle:target||'',status:currentProfile?'found':'missing',data:currentProfile});
        if(currentProfile)query=query.eq('author_id',currentProfile.id).is('parent_id',null).order('created_at',{ascending:false}).limit(80);
        else {setPosts([]);setLoading(false);return;}
      }
      else if(view==='post')query=query.or(`id.eq.${target},parent_id.eq.${target}`).order('created_at',{ascending:true}).limit(101);
      else if(view==='bookmarks'){
        const {data:bks}=await client.from('bookmarks').select('post_id').eq('user_id',user.id).limit(150);
        const ids=(bks||[]).map((b:{post_id:string})=>b.post_id);
        if(!ids.length){setPosts([]);setLoading(false);return;}
        query=query.in('id',ids).order('created_at',{ascending:false}).limit(80);
      } else if(view==='notifications'){
        const {data:n,error:ne}=await client.from('notifications').select('id,recipient_id,actor_id,kind,post_id,read_at,created_at,profiles!notifications_actor_id_fkey(id,handle,display_name,bio,avatar_url,created_at)').eq('recipient_id',user.id).order('created_at',{ascending:false}).limit(60);
        if(ne)throw ne;setNotifs((n||[]) as unknown as Notif[]);
        await loadBadges((n||[]).map(x=>x.actor_id));
        setLoading(false);return;
      } else {setLoading(false);return;}
      const {data:rows,error}=await query;
      if(error)throw error;
      const result=(rows||[]) as unknown as Post[];
      setPosts(result);
      await loadBadges([...result.map(p=>p.author_id),...(currentProfile?[currentProfile.id]:[]),user.id]);
      const ids=result.map(p=>p.id);
      if(ids.length){
        const [l,r,b,c]=await Promise.all([
          client.from('likes').select('post_id,user_id').in('post_id',ids),
          client.from('reposts').select('post_id,user_id').in('post_id',ids),
          client.from('bookmarks').select('post_id,user_id').in('post_id',ids),
          client.from('posts').select('parent_id').in('parent_id',ids),
        ]);
        const collect:Metrics={};
        for(const id of ids){const ls=(l.data||[]).filter(x=>x.post_id===id),rs=(r.data||[]).filter(x=>x.post_id===id),bs=(b.data||[]).filter(x=>x.post_id===id);
          collect[id]={likes:ls.length,reposts:rs.length,replies:(c.data||[]).filter(x=>x.parent_id===id).length,
            liked:ls.some(x=>x.user_id===user.id),reposted:rs.some(x=>x.user_id===user.id),saved:bs.some(x=>x.user_id===user.id)};
        }setMetrics(collect);
      }else setMetrics({});
      if(view==='explore'){
        const needle=search.trim().slice(0,50);
        if(needle){const {data:u}=await client.from('profiles').select('*').or(`handle.ilike.%${needle.replace(/[%_,()]/g,'')}%,display_name.ilike.%${needle.replace(/[%_,()]/g,'')}%`).limit(8);
          setAccounts((u||[]) as Profile[]);
          await loadBadges((u||[]).map(x=>x.id));}
        else setAccounts([]);
      }
    }catch(e){if(view==='profile')setProfileLookup(prev=>prev?.handle===(target||'')&&prev.status==='found'?prev:{handle:target||'',status:'error',data:null});showMessage(e instanceof Error?e.message:(lang==='en'?'Loading failed. Please retry.':'加载失败，请稍后重试'));}
    finally{setLoading(false)}
  },[user,view,target,search,tab,loadBadges]);
  useEffect(()=>{if(user)void load();},[load,user]);

  const ordered=useMemo(()=>{
    let list=posts;
    if(view==='home'&&tab==='following')list=list.filter(p=>following.includes(p.author_id)||p.author_id===user?.id);
    if(view==='explore'&&search.trim()){
      const needle=search.trim().toLocaleLowerCase();
      list=list.filter(p=>p.content.toLocaleLowerCase().includes(needle)||unwrap(p.profiles)?.display_name.toLocaleLowerCase().includes(needle));
    }
    if(view==='post')list=[...list].sort((a,b)=>a.id===target?-1:b.id===target?1:new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
    return list;
  },[posts,view,tab,following,user?.id,search,target]);

  async function toggle(table:'likes'|'reposts'|'bookmarks',post:Post){
    if(!user)return;
    const existing=metrics[post.id] || {liked:false,reposted:false,saved:false};
    const key=table==='likes'?'liked':table==='reposts'?'reposted':'saved';
    const has=Boolean(existing[key]);
    const client=db();const {error}=has?
      await client.from(table).delete().eq('post_id',post.id).eq('user_id',user.id):
      await client.from(table).insert({post_id:post.id,user_id:user.id});
    if(error)showMessage(error.message);else void load();
  }
  function chooseImage(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>5*1024*1024||!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)){showMessage(t('onlyImage'));return;}
    setImage(file);if(imagePreview)URL.revokeObjectURL(imagePreview);setImagePreview(URL.createObjectURL(file));
    // A post may contain an image or a video, not both.
    setVideo(null);if(videoPreview)URL.revokeObjectURL(videoPreview);setVideoPreview(null);
    e.currentTarget.value='';
  }
  function chooseVideo(e:ChangeEvent<HTMLInputElement>){
    const file=e.currentTarget.files?.[0];if(!file)return;
    if(file.size>50*1024*1024 || file.size===0 || !['video/mp4','video/webm','video/quicktime'].includes(file.type)){
      showMessage(lang==='en'?'Video must be MP4, WebM or MOV and no larger than 50 MB.':'请选择 50 MB 以内的 MP4、WebM 或 MOV 视频');
      e.currentTarget.value='';return;
    }
    if(videoPreview)URL.revokeObjectURL(videoPreview);
    setVideo(file);setVideoPreview(URL.createObjectURL(file));
    setImage(null);if(imagePreview)URL.revokeObjectURL(imagePreview);setImagePreview(null);
    e.currentTarget.value='';
  }
  async function publish(e:FormEvent){
    e.preventDefault();if(!user||sending)return;
    if(!draft.trim()&&!image&&!video){showMessage(t('mustPost'));return;}
    if(Array.from(draft).length>280){showMessage(t('postLimit'));return;}
    setSending(true);
    try{
      let image_url:string|null=null;let video_url:string|null=null;const client=db();
      if(image){const ext:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
        const path=`${user.id}/${crypto.randomUUID()}.${ext[image.type]}`;
        const {error:uploadError}=await client.storage.from('post-media').upload(path,image,{contentType:image.type,upsert:false,cacheControl:'3600'});
        if(uploadError)throw uploadError;
        image_url=client.storage.from('post-media').getPublicUrl(path).data.publicUrl;
      }
      if(video){
        const ext:Record<string,string>={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
        const path=`${user.id}/${crypto.randomUUID()}.${ext[video.type]}`;
        const {error:videoUploadError}=await client.storage.from('post-videos').upload(path,video,{contentType:video.type,upsert:false,cacheControl:'3600'});
        if(videoUploadError)throw videoUploadError;
        video_url=client.storage.from('post-videos').getPublicUrl(path).data.publicUrl;
      }
      const {error}=await client.from('posts').insert({author_id:user.id,content:draft.trim(),image_url,video_url,parent_id:view==='post' ? target : null});
      if(error)throw error;
      setDraft('');setImage(null);if(imagePreview)URL.revokeObjectURL(imagePreview);setImagePreview(null);
      setVideo(null);if(videoPreview)URL.revokeObjectURL(videoPreview);setVideoPreview(null);
      showMessage(t('posted'));
      if(view==='home'||view==='profile'||view==='post')void load();else router.push('/');
    }catch(e){showMessage(e instanceof Error?e.message:(lang==='en'?'Failed to publish':'发布失败'));}
    finally{setSending(false);}
  }
  async function follow(id:string){
    if(!user||id===user.id)return;
    const exists=following.includes(id);const {error}=exists?
      await db().from('follows').delete().eq('follower_id',user.id).eq('following_id',id):
      await db().from('follows').insert({follower_id:user.id,following_id:id});
    if(error)showMessage(error.message);else setFollowing(s=>exists?s.filter(i=>i!==id):[...s,id]);
  }
  async function deletePost(post:Post){
    if(!user||post.author_id!==user.id||!confirm(t('deletedConfirm')))return;
    const {error}=await db().from('posts').delete().eq('id',post.id).eq('author_id',user.id);
    if(error)showMessage(error.message);else void load();
  }
  async function reportPost(post:Post){
    if(!user)return;
    const reason=prompt(t('reportReason'));
    if(!reason)return;if(reason.trim().length<5)return showMessage(t('reportMin'));
    const {error}=await db().from('reports').insert({reporter_id:user.id,post_id:post.id,reason:reason.trim().slice(0,500)});
    showMessage(error?(lang==='en'?'Report failed: ':'举报提交失败：')+error.message:(lang==='en'?'Report submitted. Moderators must review it.':'举报已记录，网站运营者需设置后台审核流程。'));
  }
  async function saveProfile(e:FormEvent){
    e.preventDefault();if(!user)return;
    const cleaned=handle.toLowerCase().trim();if(!/^[a-z0-9_]{3,24}$/.test(cleaned))return showMessage((lang==='en'?'Username: 3–24 lowercase letters, numbers or underscores':'用户名只能使用 3–24 位小写英文、数字或下划线'));
    const {error}=await db().from('profiles').update({display_name:display.trim(),bio:bio.trim(),handle:cleaned}).eq('id',user.id);
    if(error)showMessage(error.message);else{setSelf(self?{...self,display_name:display.trim(),bio:bio.trim(),handle:cleaned}:null);showMessage(t('profileSaved'));if(view==='profile')router.push(`/profile/${cleaned}`);}
  }
  async function logout(){await db().auth.signOut();setUser(null);router.push('/');router.refresh();}
  async function markRead(id?:string){
    if(!user)return;
    let q=db().from('notifications').update({read_at:new Date().toISOString()}).eq('recipient_id',user.id).is('read_at',null);
    if(id)q=q.eq('id',id);
    const {error}=await q;if(error)showMessage(error.message);else void load();
  }
  const composer=(reply=false)=><form className="composer" onSubmit={publish}>
    <Avatar name={self?.display_name||'我'} size={42} image={self?.avatar_url}/>
    <div className="composer-main"><textarea placeholder={reply?t('replyPlaceholder'):t('compose')} value={draft} onChange={e=>setDraft(e.target.value)} rows={reply?3:2} maxLength={560}/>
    {imagePreview&&<div className="upload-preview"><img src={imagePreview} alt={t('photo')}/><button type="button" disabled={sending} onClick={()=>{setImage(null);URL.revokeObjectURL(imagePreview);setImagePreview(null)}} aria-label={t('removePhoto')}><X size={16}/></button></div>}
    {videoPreview&&<div className="upload-preview"><video src={videoPreview} controls playsInline preload="metadata" style={{width:'100%',maxHeight:290,background:'#231d2b',borderRadius:15}}/><button type="button" disabled={sending} onClick={()=>{setVideo(null);URL.revokeObjectURL(videoPreview);setVideoPreview(null)}} aria-label={lang==='en'?'Remove video':'移除视频'}><X size={16}/></button></div>}
    <div className="composer-actions"><div className="composer-tools"><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={chooseImage}/>
    <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" className="sr-only" onChange={chooseVideo}/>
    <button type="button" title={t('photo')} aria-label={t('photo')} disabled={sending} onClick={()=>inputRef.current?.click()}><ImagePlus size={21}/></button>
    <button type="button" title={lang==='en'?'Select video (max 50 MB)':'选择视频（最多 50 MB）'} aria-label={lang==='en'?'Select video':'选择视频'} disabled={sending} onClick={()=>videoInputRef.current?.click()}><Video size={21}/></button><span className="muted small">{t('shareMoment')}</span></div>
    <span className={Array.from(draft).length>280?'char-count over':'char-count'}>{280-Array.from(draft).length}</span>
    <button className="btn btn-primary publish-btn" disabled={sending||(!draft.trim()&&!image&&!video)||Array.from(draft).length>280}>{sending?t('posting'):reply?t('reply'):t('post')}<Send size={15}/></button></div></div>
  </form>;
  const card=(post:Post)=>{
    const a=unwrap(post.profiles);const m=metrics[post.id]||{likes:0,reposts:0,replies:0,liked:false,reposted:false,saved:false};
    return <article className="post" key={post.id}>
      <Link href={a?`/profile/${a.handle}`:'/'} className="post-avatar"><Avatar name={a?.display_name||'用户'} image={a?.avatar_url}/></Link>
      <div className="post-body"><div className="post-head"><Link href={a?`/profile/${a.handle}`:'/'} className="post-name">{a?.display_name||'星流用户'}</Link><VerificationBadge kind={verified[post.author_id]} size={16}/>
      <span className="post-handle">@{a?.handle||'unknown'} · {ago(post.created_at,lang)}</span>
      <div className="post-menu">{user?.id===post.author_id?<button title={t('deletePost')} aria-label={t('deletePost')} onClick={()=>deletePost(post)}><Trash2 size={17}/></button>:<button title={t('report')} aria-label={t('report')} onClick={()=>reportPost(post)}><Ellipsis size={19}/></button>}</div></div>
      <Link href={`/post/${post.parent_id || post.id}`} className="post-content">{post.content}</Link>
      {post.image_url&&<a className="post-photo" href={post.image_url} target="_blank" rel="noopener noreferrer"><img src={post.image_url} alt={lang==='en'?'Post image':'动态配图'} loading="lazy"/></a>}
      {post.video_url&&<div style={{margin:'12px 0 16px',maxWidth:'100%'}}><video src={post.video_url} controls playsInline preload="metadata" style={{display:'block',width:'100%',maxHeight:520,background:'#231d2b',borderRadius:15}} aria-label={lang==='en'?'Post video':'帖子视频'}/></div>}
      <div className="post-actions"><button title={t('comments')} aria-label={t('comments')} onClick={()=>{router.push(`/post/${post.id}`)}}><MessageCircle size={18}/><span>{m.replies||''}</span></button>
      <button className={m.reposted?'action-green':''} title={t('repost')} aria-label={m.reposted?t('undoRepost'):t('repost')} onClick={()=>toggle('reposts',post)}><Repeat2 size={19}/><span>{m.reposts||''}</span></button>
      <button className={m.liked?'action-red':''} title={t('like')} aria-label={m.liked?t('unlike'):t('like')} onClick={()=>toggle('likes',post)}><Heart size={19} fill={m.liked?'currentColor':'none'}/><span>{m.likes||''}</span></button>
      <button className={m.saved?'action-green':''} title={t('saveBookmark')} aria-label={m.saved?t('undoBookmark'):t('saveBookmark')} onClick={()=>toggle('bookmarks',post)}><Bookmark size={18} fill={m.saved?'currentColor':'none'}/></button>
      </div></div></article>;
  };
  const renderContent=()=>{
    if(view==='notifications')return <><div className="section-heading"><h2>{t('notifications')}</h2>{unread>0&&<button className="text-action" onClick={()=>markRead()}>{t('allRead')}</button>}</div>
      {notifs.length?notifs.map(n=>{const a=unwrap(n.profiles);const kind:Record<string,string>={like:t('likedYour'),reply:t('repliedYou'),follow:t('followedYou'),repost:t('repostedYou')};
        return <button key={n.id} className={`notification ${n.read_at?'':'unread'}`} onClick={()=>{void markRead(n.id);router.push(n.post_id?`/post/${n.post_id}`:a?`/profile/${a.handle}`:'/')}}>
          <Avatar name={a?.display_name||'用户'} image={a?.avatar_url}/><span><strong>{a?.display_name||'星流用户'}</strong> {kind[n.kind]||t('interacted')}<small>{ago(n.created_at,lang)}</small></span>{!n.read_at&&<span className="unread-dot"/>}
        </button>}) : !loading&&<Empty text={t('emptyNotifications')} detail={t('notificationSub')}/>}</>;
    if(view==='settings')return <><div className="section-heading"><h2>{t('settingsTitle')}</h2></div><div className="settings-content"><div className="settings-icon"><Shield size={24}/></div><h3>{t('profileEdit')}</h3><p className="muted">{t('settingsIntro')}</p>
      <form onSubmit={saveProfile} className="stack"><label>{t('name')}<input className="text-input" value={display} onChange={e=>setDisplay(e.target.value)} required minLength={1} maxLength={60}/></label><label>{t('handle')}<input className="text-input" value={handle} onChange={e=>setHandle(e.target.value)} pattern="[a-z0-9_]{3,24}" required/></label>
      <label>{t('bio')}<textarea className="text-input" rows={4} maxLength={160} value={bio} onChange={e=>setBio(e.target.value)}/></label><button className="btn btn-primary" type="submit">{t('save')}</button></form>
      
<Link href="/support" className="btn btn-outline" style={{display:'flex',justifyContent:'center',margin:'16px 0',padding:'14px',borderRadius:16}}>✦ AI 客服中心 · 无需登录</Link>
<Link href="/verification" className="btn btn-outline" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,margin:'12px 0',padding:'14px',borderRadius:16}}><Shield size={16}/> 账号认证中心 · 蓝 / 金 / 灰</Link>

      <div className="settings-divider"/><h3>{t('language')}</h3><div className="sf-pref-language"><LanguageSwitch/></div><div className="settings-divider"/><h3>{t('security')}</h3><p className="muted">{t('securityDesc')}</p><button className="btn btn-outline" onClick={async()=>{if(!user?.email)return;const {error}=await db().auth.resetPasswordForEmail(user.email,{redirectTo:`${location.origin}/auth/reset`});showMessage(error?error.message:t('resetSent'));}}>{t('resetMail')}</button>
     <button className="btn btn-outline signout" onClick={logout}><LogOut size={16}/> {t('logout')}</button></div></>;
    if(view==='profile')return <><div className="section-heading"><button className="back-button" aria-label={lang==='en'?'Back':'返回'} onClick={()=>router.back()}><ChevronLeft size={21}/></button><h2>{profile?.display_name||(profileStatus==='loading'?t('loading'):profileStatus==='error'?(lang==='en'?'Unable to load profile':'资料加载失败'):t('profileMissing'))}</h2></div>
      {profile?<><div className="profile-cover"/><div className="profile-info"><div className="profile-top"><Avatar name={profile.display_name} size={84} image={profile.avatar_url}/>
      {profile.id===user?.id?<button className="btn btn-outline" onClick={()=>router.push('/settings')}>{t('edit')}</button>:<button className={`btn ${following.includes(profile.id)?'btn-outline':'btn-primary'}`} onClick={()=>follow(profile.id)}>{following.includes(profile.id)?t('unfollow'):<><UserPlus size={16}/> {t('follow')}</>}</button>}</div>
      <div style={{display:'flex',alignItems:'center',gap:6}}><h2>{profile.display_name}</h2><VerificationBadge kind={verified[profile.id]} size={24}/></div><div className="muted">@{profile.handle}</div><p>{profile.bio||t('missingBio')}</p><p className="muted small">{new Date(profile.created_at).toLocaleDateString(lang==='en'?'en-US':'zh-CN')} {t('joined')}</p></div><div className="tab-line">{t('posts')}</div></>:profileStatus==='loading'?<div className="loading-text" role="status"><div className="spinner"/> {t('loading')}</div>:profileStatus==='error'?<div className="loading-text" role="alert">{lang==='en'?'Unable to load profile. Please try again.':'资料加载失败，请稍后重试。'}</div>:<Empty text="用户不存在" detail={lang==='en'?'This username may have changed.':'此用户名可能已经被修改。'}/>}</>;
    if(view==='post')return <><div className="section-heading"><button className="back-button" onClick={()=>router.back()} aria-label={lang==='en'?'Back':'返回'}><ChevronLeft size={22}/></button><h2>{t('thread')}</h2></div>{posts.some(p=>p.id===target)&&<div className="reply-area"><h3>{t('discuss')}</h3>{composer(true)}</div>}</>;
    if(view==='bookmarks')return <div className="section-heading"><h2>{t('bookmarksTitle')}</h2><p>{t('bookmarksIntro')}</p></div>;
    if(view==='explore')return <><div className="section-heading"><h2>{t('explore')}</h2><p>{t('exploreSub')}</p></div><div className="search-bar"><Search size={21}/><input placeholder={t('search')} value={search} onChange={e=>setSearch(e.target.value)}/></div>
      {accounts.length>0&&<div className="search-people"><strong>{t('people')}</strong>{accounts.map(a=><Link key={a.id} href={`/profile/${a.handle}`}><Avatar name={a.display_name} size={36} image={a.avatar_url}/><span><b>{a.display_name}</b><small>@{a.handle}</small></span></Link>)}</div>}</>;
    return <><div className="section-heading"><h2>{t('home')} <span className="live-mark">✦</span></h2><p>{t('yourWorld')}</p></div><div className="home-tabs"><button className={tab==='all'?'active':''} onClick={()=>setTab('all')}>{t('forYou')}</button><button className={tab==='following'?'active':''} onClick={()=>setTab('following')}>{t('following')}</button></div>{composer()}
<Link href="/support" style={{display:'block',margin:16,padding:16,borderRadius:18,background:'#f5e5ff',color:'#7a3d6a',textAlign:'center',fontWeight:700,textDecoration:'none'}}>✦ AI 客服中心 · 点击咨询 →</Link>
</>;
  };

  if(checking)return <main className="center-screen"><div className="spinner" aria-label="加载中"/></main>;
  if(!hasConfig()||!user)return <AuthPortal/>;
  return <div className="app-frame"><div className="app-layout">
    <aside className="left-sidebar"><Brand compact/><nav className="main-nav">{nav.map(item=>{const Icon=item.icon;return <Link key={item.to} href={item.to} className={(view===item.to.slice(1)||view==='home'&&item.to==='/')?'nav-active':''}><Icon size={25}/><span>{t(item.name as 'home'|'explore'|'notifications'|'bookmarks'|'settings')}</span>{item.to==='/notifications'&&unread>0&&<b className="count-bubble">{unread>9?'9+':unread}</b>}</Link>})}<Link href={self?`/profile/${self.handle}`:'/settings'} className={view==='profile'&&profile?.id===user.id?'nav-active':''}><UserRound size={25}/><span>{t('profile')}</span></Link>{isAdmin&&<Link href="/admin"><LayoutDashboard size={25}/><span>{t('admin')}</span></Link>}</nav>
      <button className="btn btn-primary sidebar-publish" onClick={()=>{router.push('/');setTimeout(()=>document.querySelector('.composer textarea')?.scrollIntoView({behavior:'smooth',block:'center'}),200)}}><PenLine size={19}/> {t('newPost')}</button>
      <Link href={self?`/profile/${self.handle}`:'/settings'} className="my-account"><Avatar name={self?.display_name||'我'} image={self?.avatar_url}/><span><strong>{self?.display_name||user.email?.split('@')[0]}</strong><small>@{self?.handle||'account'}</small></span><Ellipsis size={18}/></Link>
    </aside>
    <main className="feed-panel"><div className="sf-top-utility"><span className="sf-top-logo">✦ <b>starflow<span>.</span></b></span><LanguageSwitch/></div>{renderContent()}{!['notifications','settings'].includes(view)&&!(view==='profile'&&profileStatus!=='found')&&<div className="posts-list">
      {loading&&<div className="loading-text"><div className="spinner"/> {t('loading')}</div>}
      {!loading&&ordered.length===0&&!(view==='profile'&&!profile)&&<Empty text={view==='bookmarks'?t('emptyBook'):view==='post'?t('emptyPost'):tab==='following'&&view==='home'?t('emptyFollowing'):t('emptyFeed')} detail={t('emptyHint')}/>}
      {ordered.map(card)}
    </div>}<div className="feed-end">© 2026 Starflow · {t('independent')}</div></main>
    <aside className="right-sidebar"><div className="right-card"><div className="right-card-eyebrow"><Sparkles size={15}/> {t('rightHeadline')}</div><h3>{t('rightTitle')}</h3><p>{t('rightDesc')}</p><Link href="/explore" className="discover-link">{t('exploreLink')} <span>↗</span></Link></div>
      <div className="right-card tips-card"><h3>{t('rules')}</h3><div>✦ {t('ruleOne')}</div><div>✦ {t('ruleTwo')}</div><div>✦ {t('ruleThree')}</div></div>
      <div className="footer-links"><Link href="/terms">{t('terms')}</Link><Link href="/privacy">{t('privacy')}</Link><span>© 2026 Starflow</span></div>
    </aside>
    <nav className="mobile-nav" aria-label={lang==='en'?'Mobile navigation':'移动端导航'}>{nav.map(item=>{const Icon=item.icon;return <Link key={item.to} href={item.to} aria-label={t(item.name as 'home'|'explore'|'notifications'|'bookmarks'|'settings')}><Icon size={23} strokeWidth={view===item.to.slice(1)||view==='home'&&item.to==='/'?2.8:2}/>{item.to==='/notifications'&&unread>0&&<i/>}</Link>})}<Link href={self?`/profile/${self.handle}`:'/settings'} aria-label={t('profile')}><UserRound size={23}/></Link></nav>
    {message&&<div className="toast" role="status"><span>{message}</span><button onClick={()=>setMessage('')} aria-label={t('close')}><X size={16}/></button></div>}
  </div></div>;
}
function Empty({text,detail}:{text:string;detail:string}){const {t}=useLanguage();return <div className="empty-state"><div className="empty-icon">✳</div><h3>{text}</h3><p>{detail}</p><Link href="/explore">{t('discoverCommunity')}</Link></div>}
