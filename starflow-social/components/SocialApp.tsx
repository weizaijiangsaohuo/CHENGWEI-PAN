'use client';
import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { Bell, Bookmark, LayoutDashboard, BarChart3, Camera, Check, ChevronLeft, Compass, Ellipsis, Eye, Heart, Home, ImagePlus, Video, LogOut, MessageCircle, PenLine, Repeat2, Search, Send, Settings, Shield, Share2, Sparkles, Trash2, UserRound, UserPlus, X } from 'lucide-react';
import { db, hasConfig } from '@/lib/supabase';
import { ensureWelcomeEmail } from '@/lib/welcome';
import { Avatar, Brand } from './Brand';
import { AuthPortal } from './AuthPortal';
import { useLanguage } from './LanguageProvider';
import {isEnglishLocale,LANGUAGE_OPTIONS} from '@/lib/i18n';
import { VerificationBadge, type VerificationKind } from './VerificationBadge';
import { PollCard } from './PollCard';
import { StarflowMasonryFeed } from './StarflowMasonryFeed';
import { StarflowHomeMenu } from './StarflowHomeMenu';
import { StarflowMobileNavigation } from './StarflowMobileNavigation';
import { StarflowServicesPanel } from './StarflowServicesPanel';
import { StarflowDisplayPreferences } from './StarflowDisplayPreferences';
import { PostGallery } from './PostGallery';
import './StarflowExtras.css';
import type { Notif, Post, Profile } from '@/lib/types';
import { ago, unwrap } from '@/lib/types';
import {notificationLabel,notificationTarget,visibleNotifications} from '@/lib/notification-experience';
import type {NotificationGroup} from '@/lib/notification-experience';

type View = 'home' | 'explore' | 'notifications' | 'bookmarks' | 'settings' | 'profile' | 'post';
type Metrics = Record<string,{likes:number; reposts:number; replies:number; views:number; liked:boolean; reposted:boolean; saved:boolean}>;
const postFields='id,author_id,content,image_url,video_url,has_poll,has_gallery,parent_id,created_at,profiles!posts_author_id_fkey(id,handle,display_name,bio,avatar_url,created_at)';

// A verified user can be reused briefly during same-tab route transitions.
// No user/token is stored in localStorage or serialized into page HTML.
// Every new page still calls getUser() to revalidate; Supabase RLS remains authoritative.
const VERIFIED_ROUTE_USER_TTL = 90_000;
let verifiedRouteUser: {user: User; checkedAt: number}|null = null;
export function readVerifiedRouteUser(): User|null {
  const entry = verifiedRouteUser;
  return entry && Date.now()-entry.checkedAt < VERIFIED_ROUTE_USER_TTL ? entry.user : null;
}
function rememberVerifiedRouteUser(user: User|null) {
  verifiedRouteUser = user ? {user,checkedAt:Date.now()} : null;
}
const nav = [
  {to:'/',name:'home',icon:Home}, {to:'/explore',name:'explore',icon:Compass}, {to:'/notifications',name:'notifications',icon:Bell},
  {to:'/bookmarks',name:'bookmarks',icon:Bookmark}, {to:'/settings',name:'settings',icon:Settings}
];

export function SocialApp({view,target}:{view:View;target?:string}){
  const router=useRouter();
  const {t,lang}=useLanguage();
  const [user,setUser]=useState<User|null>(null);const [self,setSelf]=useState<Profile|null>(null);
  const [checking,setChecking]=useState(true);const [loading,setLoading]=useState(false);
  // Flush a freshly verified same-tab session before the next paint: no purple
  // splash between settings, affiliate management and timeline pages.
  useLayoutEffect(()=>{
    const cached=readVerifiedRouteUser();
    if(cached){setUser(cached);setChecking(false)}
  },[]);
  const [posts,setPosts]=useState<Post[]>([]);const [metrics,setMetrics]=useState<Metrics>({});
  const [verified,setVerified]=useState<Record<string,VerificationKind>>({});
  const [profileLookup,setProfileLookup]=useState<{handle:string;status:'found'|'missing'|'error';data:Profile|null}|null>(null);const [following,setFollowing]=useState<string[]>([]);
  const profile=view==='profile' && profileLookup?.handle===(target||'')?profileLookup.data:null;
  const profileStatus=view==='profile' && profileLookup?.handle===(target||'')?profileLookup.status:'loading';
  const [tab,setTab]=useState<'all'|'following'>('all');const [search,setSearch]=useState('');
  const [settledSearch,setSettledSearch]=useState('');
  const [searchFilter,setSearchFilter]=useState<'all'|'posts'|'people'>('all');
  const [notificationFilter,setNotificationFilter]=useState<NotificationGroup>('all');
  const searchPending=view==='explore'&&search.trim()!==settledSearch.trim();
  const [homeComposerOpen,setHomeComposerOpen]=useState(false);
  const pendingToggles=useRef<Set<string>>(new Set());
  const pendingFollows=useRef<Set<string>>(new Set());
  const [followBusyTarget,setFollowBusyTarget]=useState<string|null>(null);
  const loadEpoch=useRef(0);
  useEffect(()=>{
    if(view!=='home')return;
    const focusComposer=()=>{
      setHomeComposerOpen(true);
      window.setTimeout(()=>{
        const field=document.querySelector<HTMLTextAreaElement>('.app-frame .composer textarea');
        field?.scrollIntoView({behavior:'smooth',block:'center'});
        field?.focus({preventScroll:true});
      },100);
    };
    window.addEventListener('sf-open-home-composer',focusComposer);
    const query=new URLSearchParams(window.location.search);
    if(query.get('compose')==='1'){
      focusComposer();query.delete('compose');
      window.history.replaceState(window.history.state,'',window.location.pathname+(query.size?'?'+query.toString():''));
    }
    return()=>window.removeEventListener('sf-open-home-composer',focusComposer);
  },[view]);
  const openPublish=()=>{if(view==='home')window.dispatchEvent(new Event('sf-open-home-composer'));else router.push('/?compose=1');};
  const [accounts,setAccounts]=useState<Profile[]>([]);const [notifs,setNotifs]=useState<Notif[]>([]);
  const [message,setMessage]=useState('');const [draft,setDraft]=useState('');
  const [image,setImage]=useState<File|null>(null);const [imagePreview,setImagePreview]=useState<string|null>(null);
  const [video,setVideo]=useState<File|null>(null);const [videoPreview,setVideoPreview]=useState<string|null>(null);
  const [galleryFiles,setGalleryFiles]=useState<File[]>([]);const [galleryPreviews,setGalleryPreviews]=useState<string[]>([]);
  const [pollOpen,setPollOpen]=useState(false);const [pollQuestion,setPollQuestion]=useState('');
  const [pollOptions,setPollOptions]=useState(['','']);const [pollHours,setPollHours]=useState(24);
  const [draftHydrated,setDraftHydrated]=useState(false);
  const [sending,setSending]=useState(false);
  const [display,setDisplay]=useState('');const [bio,setBio]=useState('');const [handle,setHandle]=useState('');
  const [unread,setUnread]=useState(0);const [dmUnread,setDmUnread]=useState(0);const [isAdmin,setIsAdmin]=useState(false);
  const inputRef=useRef<HTMLInputElement>(null);
  const videoInputRef=useRef<HTMLInputElement>(null);
  const showMessage=(msg:string)=>{setMessage(msg);window.setTimeout(()=>setMessage(''),6500)};
  useEffect(()=>{
    if(!user)return;
    setDraftHydrated(false);
    try{setDraft(localStorage.getItem(`sf-draft-${user.id}-${view}-${target||''}`)||'')}catch{}
    setDraftHydrated(true);
  },[user?.id,view,target]);
  useEffect(()=>{
    if(!user||!draftHydrated)return;
    try{localStorage.setItem(`sf-draft-${user.id}-${view}-${target||''}`,draft)}catch{}
  },[draft,user?.id,view,target,draftHydrated]);
  useEffect(()=>{
    if(view!=='explore')return;
    const tag=new URLSearchParams(window.location.search).get('tag');
    if(tag){const normalized='#'+tag.slice(0,50);setSearch(normalized);setSettledSearch(normalized);}
  },[view]);
  // Search requests are debounced; a user typing a 10-character query no
  // longer triggers 10 separate post + engagement metric fetches.
  useEffect(()=>{
    if(view!=='explore')return;
    const timer=window.setTimeout(()=>setSettledSearch(search.trim()),350);
    return()=>window.clearTimeout(timer);
  },[search,view]);

  useEffect(()=>{
    if(!hasConfig()){rememberVerifiedRouteUser(null);setChecking(false);return;}
    let active=true;
    let signedOut=false;
    const client=db();
    // Keep the page shell visible while the cached, *previously verified*
    // identity is rechecked in the background. Never cache an unverified JWT.
    client.auth.getUser().then(({data:{user},error})=>{
      if(!active||signedOut)return;
      const next=error?null:user;
      rememberVerifiedRouteUser(next);
      setUser(next);setChecking(false);
    }).catch(()=>{
      if(!active||signedOut)return;
      rememberVerifiedRouteUser(null);
      setUser(null);setChecking(false);
    });
    const {data:{subscription}}=client.auth.onAuthStateChange((event,session)=>{
      if(!active)return;
      if(event==='SIGNED_OUT'){
        signedOut=true;rememberVerifiedRouteUser(null);
        setUser(null);setChecking(false);
      }else if(event==='SIGNED_IN'&&session?.user){
        // Account switching invalidates the verified cross-route cache.
        if(verifiedRouteUser?.user.id!==session.user.id)rememberVerifiedRouteUser(null);
        setUser(session.user);setChecking(false);
      }else if(event==='USER_UPDATED'){
        rememberVerifiedRouteUser(null);
        setUser(session?.user??null);
      }
    });
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
      else if(error)showMessage((isEnglishLocale(lang)?'Cannot load account profile. Check database migrations: ':'无法读取账户资料，请确认数据库迁移已执行：')+error.message);
    });
  },[user]);

  // DM badge counts unread conversations from private, RLS-filtered participant rows.
  useEffect(()=>{
    if(!user){setDmUnread(0);return;}
    let mounted=true;
    const client=db();
    const check=async()=>{
      if(document.visibilityState==='hidden')return;
      const [inbox,receipts]=await Promise.all([
        client.from('dm_conversations')
          .select('id,last_message_at,last_sender_id')
          .or('user_low.eq.'+user.id+',user_high.eq.'+user.id)
          .not('last_message_at','is',null).limit(1000),
        client.from('dm_read_state').select('conversation_id,last_read_at').eq('user_id',user.id),
      ]);
      if(!mounted||inbox.error||receipts.error)return;
      const seen=new Map((receipts.data||[]).map(item=>[item.conversation_id,item.last_read_at]));
      const count=(inbox.data||[]).filter(item=>item.last_message_at
        &&item.last_sender_id!==user.id
        &&(!seen.get(item.id)||item.last_message_at>seen.get(item.id)!)).length;
      setDmUnread(count);
    };
    void check();
    const channel=client.channel('sf-dm-badge-'+user.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'dm_conversations',filter:'user_low=eq.'+user.id},()=>{void check()})
      .on('postgres_changes',{event:'*',schema:'public',table:'dm_conversations',filter:'user_high=eq.'+user.id},()=>{void check()})
      .on('postgres_changes',{event:'*',schema:'public',table:'dm_read_state',filter:'user_id=eq.'+user.id},()=>{void check()})
      .subscribe(status=>{if(status==='SUBSCRIBED')void check()});
    const resume=()=>{if(document.visibilityState==='visible')void check()};
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('focus',resume);
    window.addEventListener('online',resume);
    const interval=window.setInterval(()=>{void check();},12000);
    return()=>{
      mounted=false;window.clearInterval(interval);
      document.removeEventListener('visibilitychange',resume);
      window.removeEventListener('focus',resume);
      window.removeEventListener('online',resume);
      void client.removeChannel(channel);
    };
  },[user?.id]);

  // Keep the notification badge live even when the notification page is closed.
  useEffect(()=>{
    if(!user){setUnread(0);return;}
    let mounted=true;
    const client=db();
    const check=async()=>{
      if(document.visibilityState==='hidden')return;
      const {count,error}=await client.from('notifications').select('id',{head:true,count:'exact'})
        .eq('recipient_id',user.id).is('read_at',null);
      if(mounted&&!error)setUnread(count??0);
    };
    void check();
    const channel=client.channel('sf-notice-badge-'+user.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:'recipient_id=eq.'+user.id},()=>{void check()})
      .subscribe(status=>{if(status==='SUBSCRIBED')void check()});
    const resume=()=>{if(document.visibilityState==='visible')void check()};
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('focus',resume);
    window.addEventListener('online',resume);
    window.addEventListener('sf-notifications-updated',resume);
    const interval=window.setInterval(()=>{void check()},12000);
    return()=>{
      mounted=false;window.clearInterval(interval);
      document.removeEventListener('visibilitychange',resume);
      window.removeEventListener('focus',resume);
      window.removeEventListener('online',resume);
      window.removeEventListener('sf-notifications-updated',resume);
      void client.removeChannel(channel);
    };
  },[user?.id]);

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
    const epoch=++loadEpoch.current;
    const client=db();setLoading(true);
    try{
      const {data:fs}=await client.from('follows').select('following_id').eq('follower_id',user.id);
      if(epoch!==loadEpoch.current)return;
      const followIds=(fs||[]).map((row:{following_id:string})=>row.following_id);
      setFollowing(followIds);
      const {count}=await client.from('notifications').select('id',{head:true,count:'exact'}).eq('recipient_id',user.id).is('read_at',null);
      if(epoch!==loadEpoch.current)return;
      setUnread(count??0);
      let query=client.from('posts').select(postFields);
      let currentProfile:Profile|null=null;
      if(view==='home'||view==='explore'){
        query=query.is('parent_id',null).order('created_at',{ascending:false}).limit(80);
        if(view==='explore'&&settledSearch.trim()){ 
          const term=settledSearch.trim().slice(0,50).replace(/[%_\\]/g,'');
          if(term)query=query.ilike('content',`%${term}%`);
        }
        if(view==='home' && tab==='following'){
          const only=[...new Set([...followIds,user.id])];
          query=query.in('author_id',only);
        }
      }
      else if(view==='profile'){
        const {data:p,error:pe}=await client.from('profiles').select('*').eq('handle',target||'').maybeSingle();
        if(pe)throw pe;
        if(epoch!==loadEpoch.current)return;
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
        if(epoch!==loadEpoch.current)return;
        if(ne)throw ne;setNotifs((n||[]) as unknown as Notif[]);
        await loadBadges((n||[]).map(x=>x.actor_id));
        setLoading(false);return;
      } else {setLoading(false);return;}
      const {data:rows,error}=await query;
      if(epoch!==loadEpoch.current)return;
      if(error)throw error;
      const result=(rows||[]) as unknown as Post[];
      setPosts(result);
      if (view==='post' && target && result.some(p=>p.id===target)) {
        // Record one genuine authenticated viewer when opening post details.
        // The server enforces one count per account/post pair.
        await client.rpc('sf_record_post_view', {p_post_id:target});
      }
      await loadBadges([...result.map(p=>p.author_id),...(currentProfile?[currentProfile.id]:[]),user.id]);
      const ids=result.map(p=>p.id);
      if(ids.length){
        const [l,r,b,c,v]=await Promise.all([
          client.from('likes').select('post_id,user_id').in('post_id',ids),
          client.from('reposts').select('post_id,user_id').in('post_id',ids),
          client.from('bookmarks').select('post_id,user_id').in('post_id',ids),
          client.from('posts').select('parent_id').in('parent_id',ids),
          client.rpc('sf_post_view_counts',{p_post_ids:ids}),
        ]);
        if(epoch!==loadEpoch.current)return;
        const collectedViews = new Map<string, number>(((v.data||[]) as {post_id:string;views:number|string}[]).map((row)=>[row.post_id,Number(row.views)||0]));
        const collect:Metrics={};
        for(const id of ids){const ls=(l.data||[]).filter(x=>x.post_id===id),rs=(r.data||[]).filter(x=>x.post_id===id),bs=(b.data||[]).filter(x=>x.post_id===id);
          collect[id]={likes:ls.length,reposts:rs.length,replies:(c.data||[]).filter(x=>x.parent_id===id).length,views:collectedViews.get(id)||0,
            liked:ls.some(x=>x.user_id===user.id),reposted:rs.some(x=>x.user_id===user.id),saved:bs.some(x=>x.user_id===user.id)};
        }setMetrics(collect);
      }else setMetrics({});
      if(view==='explore'){
        const needle=settledSearch.trim().replace(/^[@#]/,'').slice(0,50);
        if(needle){const {data:u}=await client.from('profiles').select('*').or(`handle.ilike.%${needle.replace(/[^\p{L}\p{N}._\- ]/gu,'')}%,display_name.ilike.%${needle.replace(/[%_,()]/g,'')}%`).limit(8);
          if(epoch!==loadEpoch.current)return;
          setAccounts((u||[]) as Profile[]);
          await loadBadges((u||[]).map(x=>x.id));}
        else setAccounts([]);
      }
    }catch(e){if(epoch!==loadEpoch.current)return;if(view==='profile')setProfileLookup(prev=>prev?.handle===(target||'')&&prev.status==='found'?prev:{handle:target||'',status:'error',data:null});showMessage(e instanceof Error?e.message:(isEnglishLocale(lang)?'Loading failed. Please retry.':'加载失败，请稍后重试'));}
    finally{if(epoch===loadEpoch.current)setLoading(false)}
  },[user,view,target,settledSearch,tab,loadBadges]);
  useEffect(()=>{if(user)void load();},[load,user]);

  const ordered=useMemo(()=>{
    let list=posts;
    if(view==='home'&&tab==='following')list=list.filter(p=>following.includes(p.author_id)||p.author_id===user?.id);
    if(view==='explore'&&settledSearch.trim()){ 
      const needle=settledSearch.trim().toLocaleLowerCase();
      list=list.filter(p=>p.content.toLocaleLowerCase().includes(needle)||unwrap(p.profiles)?.display_name.toLocaleLowerCase().includes(needle));
    }
    if(view==='post')list=[...list].sort((a,b)=>a.id===target?-1:b.id===target?1:new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
    return list;
  },[posts,view,tab,following,user?.id,settledSearch,target]);

  async function toggle(table:'likes'|'reposts'|'bookmarks',post:Post){
    if(!user)return;
    const lockKey=table+':'+post.id;
    if(pendingToggles.current.has(lockKey))return;
    pendingToggles.current.add(lockKey);
    const fallback={likes:0,reposts:0,replies:0,views:0,liked:false,reposted:false,saved:false};
    const old=metrics[post.id]||fallback;
    const property=table==='likes'?'liked':table==='reposts'?'reposted':'saved';
    const countProperty=table==='likes'?'likes':table==='reposts'?'reposts':null;
    const was=Boolean(old[property]);
    // Optimistic feedback lets a tap visibly react before network round trips.
    setMetrics(previous=>{
      const current=previous[post.id]||fallback;
      return {...previous,[post.id]:{
        ...current,[property]:!was,
        ...(countProperty?{[countProperty]:Math.max(0,current[countProperty]+(was?-1:1))}:{}),
      }};
    });
    try{
      const client=db();
      const {error}=was?
        await client.from(table).delete().eq('post_id',post.id).eq('user_id',user.id):
        await client.from(table).insert({post_id:post.id,user_id:user.id});
      if(error)throw error;
      // Bookmark listings need to remove unsaved posts; homepage must not jump/reload after every tap.
      if(view==='bookmarks')void load();
    }catch(error){
      setMetrics(previous=>({...previous,[post.id]:old}));
      showMessage(error instanceof Error?error.message:'操作失败，请重试');
    }finally{pendingToggles.current.delete(lockKey);}
  }
  function chooseImage(e:ChangeEvent<HTMLInputElement>){
    const files=Array.from(e.currentTarget.files||[]);
    if(!files.length)return;
    if(files.length>4||files.some(f=>f.size===0||f.size>5*1024*1024||!['image/jpeg','image/png','image/webp','image/gif'].includes(f.type))){
      showMessage('最多选择4张图片，每张不超过5 MB（JPG、PNG、WebP、GIF）');e.currentTarget.value='';return;
    }
    galleryPreviews.forEach(u=>URL.revokeObjectURL(u));
    if(imagePreview)URL.revokeObjectURL(imagePreview);
    const previews=files.map(f=>URL.createObjectURL(f));
    setGalleryFiles(files);setGalleryPreviews(previews);setImage(files[0]);setImagePreview(null);
    setVideo(null);if(videoPreview)URL.revokeObjectURL(videoPreview);setVideoPreview(null);
    setPollOpen(false);
    e.currentTarget.value='';
  }
  function chooseVideo(e:ChangeEvent<HTMLInputElement>){
    const file=e.currentTarget.files?.[0];if(!file)return;
    if(file.size>50*1024*1024 || file.size===0 || !['video/mp4','video/webm','video/quicktime'].includes(file.type)){
      showMessage(isEnglishLocale(lang)?'Video must be MP4, WebM or MOV and no larger than 50 MB.':'请选择 50 MB 以内的 MP4、WebM 或 MOV 视频');
      e.currentTarget.value='';return;
    }
    if(videoPreview)URL.revokeObjectURL(videoPreview);
    setVideo(file);setVideoPreview(URL.createObjectURL(file));
    setImage(null);if(imagePreview)URL.revokeObjectURL(imagePreview);setImagePreview(null);
    galleryPreviews.forEach(u=>URL.revokeObjectURL(u));setGalleryFiles([]);setGalleryPreviews([]);setPollOpen(false);
    e.currentTarget.value='';
  }
  async function publish(e:FormEvent){
    e.preventDefault();if(!user||sending)return;
    if(!draft.trim()&&!image&&!video&&!pollOpen){showMessage(t('mustPost'));return;}
    if(Array.from(draft).length>280){showMessage(t('postLimit'));return;}
    setSending(true);
    try{
      let image_url:string|null=null;let video_url:string|null=null;const client=db();
      if(pollOpen){
        const valid=pollOptions.map(x=>x.trim()).filter(Boolean);
        if(!pollQuestion.trim()||valid.length<2||valid.length>4)throw new Error('请填写投票问题和2至4个选项');
        const {error:pollError}=await client.rpc('create_poll_post',{
          p_content:draft.trim(),p_question:pollQuestion.trim(),p_options:valid,p_hours:pollHours
        });
        if(pollError)throw pollError;
      }else{
      const files=galleryFiles.length?galleryFiles:image?[image]:[];
      const urls:string[]=[];
      for(const file of files){
        const ext:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
        const path=`${user.id}/${crypto.randomUUID()}.${ext[file.type]}`;
        const {error:uploadError}=await client.storage.from('post-media').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
        if(uploadError)throw uploadError;
        urls.push(client.storage.from('post-media').getPublicUrl(path).data.publicUrl);
      }
      image_url=urls[0]||null;
      if(video){
        const ext:Record<string,string>={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
        const path=`${user.id}/${crypto.randomUUID()}.${ext[video.type]}`;
        const {error:videoUploadError}=await client.storage.from('post-videos').upload(path,video,{contentType:video.type,upsert:false,cacheControl:'3600'});
        if(videoUploadError)throw videoUploadError;
        video_url=client.storage.from('post-videos').getPublicUrl(path).data.publicUrl;
      }
      if(urls.length>1){
        const {error:galleryError}=await client.rpc('create_gallery_post',{p_content:draft.trim(),p_urls:urls,p_parent_id:view==='post'?target:null});
        if(galleryError)throw galleryError;
      }else{
        const {error}=await client.from('posts').insert({author_id:user.id,content:draft.trim(),image_url,video_url,parent_id:view==='post'?target:null});
        if(error)throw error;
      }
      }
      setDraft('');setImage(null);if(imagePreview)URL.revokeObjectURL(imagePreview);setImagePreview(null);
      galleryPreviews.forEach(u=>URL.revokeObjectURL(u));setGalleryFiles([]);setGalleryPreviews([]);
      setPollOpen(false);setPollQuestion('');setPollOptions(['','']);
      setVideo(null);if(videoPreview)URL.revokeObjectURL(videoPreview);setVideoPreview(null);
      showMessage(t('posted'));
      if(view==='home'||view==='profile'||view==='post')void load();else router.push('/');
    }catch(e){showMessage(e instanceof Error?e.message:(isEnglishLocale(lang)?'Failed to publish':'发布失败'));}
    finally{setSending(false);}
  }
  async function follow(id:string){
    if(!user||id===user.id||pendingFollows.current.has(id))return;
    pendingFollows.current.add(id);
    setFollowBusyTarget(id);
    const exists=following.includes(id);
    // Show prompt feedback immediately, then reconcile against the database.
    setFollowing(current=>exists?current.filter(item=>item!==id):
      [...new Set([...current,id])]);
    try{
      const {error}=exists?
        await db().from('follows').delete().eq('follower_id',user.id).eq('following_id',id):
        await db().from('follows').insert({follower_id:user.id,following_id:id});
      if(error)throw error;
      window.dispatchEvent(new CustomEvent('sf-profile-follow-changed',{detail:{profileId:id}}));
    }catch(error){
      setFollowing(current=>exists?[...new Set([...current,id])]:current.filter(item=>item!==id));
      showMessage(error instanceof Error?error.message:'关注操作失败，请重试');
    }finally{
      pendingFollows.current.delete(id);
      setFollowBusyTarget(previous=>previous===id?null:previous);
    }
  }
  async function sharePost(post:Post){
    const address=new URL('/post/'+encodeURIComponent(post.id),window.location.origin).toString();
    try{
      if(typeof navigator.share==='function'){
        await navigator.share({title:'星流 Starflow',url:address});
        return;
      }
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(address);
        showMessage(isEnglishLocale(lang)?'Post link copied.':'动态链接已复制。');
      }else{
        // Unsupported/non-secure browser: let users copy the actual URL manually.
        window.prompt(isEnglishLocale(lang)?'Copy this post link:':'复制动态链接：',address);
      }
    }catch(error){
      if(error instanceof DOMException&&error.name==='AbortError')return;
      showMessage(isEnglishLocale(lang)?'Share failed. Open the post to copy its URL.':'分享失败，请打开帖子详情后复制链接。');
    }
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
    showMessage(error?(isEnglishLocale(lang)?'Report failed: ':'举报提交失败：')+error.message:(isEnglishLocale(lang)?'Report submitted. Moderators must review it.':'举报已记录，网站运营者需设置后台审核流程。'));
  }
  async function saveProfile(e:FormEvent){
    e.preventDefault();if(!user)return;
    const cleaned=handle.toLowerCase().trim();if(!/^[a-z0-9_]{3,24}$/.test(cleaned))return showMessage((isEnglishLocale(lang)?'Username: 3–24 lowercase letters, numbers or underscores':'用户名只能使用 3–24 位小写英文、数字或下划线'));
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
    {galleryPreviews.length>0&&<div className="sf-gallery-preview">{galleryPreviews.map((src,index)=><div key={src}><img src={src} alt={`待发布图片${index+1}`}/><button type="button" disabled={sending} aria-label={`移除第${index+1}张图片`} onClick={()=>{
      URL.revokeObjectURL(src);const updated=galleryFiles.filter((_,i)=>i!==index);
      setGalleryFiles(updated);setGalleryPreviews(galleryPreviews.filter((_,i)=>i!==index));setImage(updated[0]||null);
    }}><X size={16}/></button></div>)}</div>}
    {videoPreview&&<div className="upload-preview"><video src={videoPreview} controls playsInline preload="metadata" style={{width:'100%',maxHeight:290,background:'#231d2b',borderRadius:15}}/><button type="button" disabled={sending} onClick={()=>{setVideo(null);URL.revokeObjectURL(videoPreview);setVideoPreview(null)}} aria-label={isEnglishLocale(lang)?'Remove video':'移除视频'}><X size={16}/></button></div>}
    {pollOpen&&<div className="sf-poll-editor"><strong>创建投票</strong><input value={pollQuestion} onChange={e=>setPollQuestion(e.target.value)} placeholder="投票问题（最多160字）" maxLength={160}/>
     {pollOptions.map((choice,index)=><div key={index}><input value={choice} maxLength={100} placeholder={`选项${index+1}`} onChange={e=>setPollOptions(v=>v.map((x,i)=>i===index?e.target.value:x))}/>{pollOptions.length>2&&<button type="button" onClick={()=>setPollOptions(v=>v.filter((_,i)=>i!==index))} aria-label="删除选项"><X size={16}/></button>}</div>)}
     <div><button type="button" className="btn btn-outline" disabled={pollOptions.length>=4} onClick={()=>setPollOptions(v=>[...v,''])}>＋ 添加选项</button><select value={pollHours} onChange={e=>setPollHours(Number(e.target.value))}><option value={1}>1小时</option><option value={6}>6小时</option><option value={24}>24小时</option><option value={72}>3天</option><option value={168}>7天</option></select></div>
    </div>}
    <div className="composer-actions"><div className="composer-tools"><input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={chooseImage}/>
    <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" className="sr-only" onChange={chooseVideo}/>
    <button type="button" title={t('photo')} aria-label={t('photo')} disabled={sending||pollOpen} onClick={()=>inputRef.current?.click()}><ImagePlus size={21}/></button>
    <button type="button" title={isEnglishLocale(lang)?'Select video (max 50 MB)':'选择视频（最多 50 MB）'} aria-label={isEnglishLocale(lang)?'Select video':'选择视频'} disabled={sending||pollOpen} onClick={()=>videoInputRef.current?.click()}><Video size={21}/></button>
    <button type="button" title="发布投票" aria-label="发布投票" disabled={sending||reply||!!video||galleryFiles.length>0} onClick={()=>setPollOpen(v=>!v)}><BarChart3 size={21}/></button><span className="muted small">{t('shareMoment')}</span></div>
    <span className={Array.from(draft).length>280?'char-count over':'char-count'}>{280-Array.from(draft).length}</span>
    <button className="btn btn-primary publish-btn" disabled={sending||(!draft.trim()&&!image&&!video&&!pollOpen)||Array.from(draft).length>280}>{sending?t('posting'):reply?t('reply'):t('post')}<Send size={15}/></button></div></div>
  </form>;
  const card=(post:Post)=>{
    const a=unwrap(post.profiles);const m=metrics[post.id]||{likes:0,reposts:0,replies:0,views:0,liked:false,reposted:false,saved:false};
    return <article className="post" key={post.id}>
      <Link href={a?`/profile/${a.handle}`:'/'} className="post-avatar"><Avatar name={a?.display_name||'用户'} image={a?.avatar_url}/></Link>
      <div className="post-body"><div className="post-head"><Link href={a?`/profile/${a.handle}`:'/'} className="post-name">{a?.display_name||'星流用户'}</Link><VerificationBadge kind={verified[post.author_id]} size={16}/>
      <span className="post-handle">@{a?.handle||'unknown'} · {ago(post.created_at,lang)}</span>
      <div className="post-menu">{user?.id===post.author_id?<button title={t('deletePost')} aria-label={t('deletePost')} onClick={()=>deletePost(post)}><Trash2 size={17}/></button>:<button title={t('report')} aria-label={t('report')} onClick={()=>reportPost(post)}><Ellipsis size={19}/></button>}</div></div>
      <div className="post-content">{post.content.split(/(#[\p{L}\p{N}_]+)/gu).map((part,index)=>part.startsWith('#')?<Link key={index} href={`/explore?tag=${encodeURIComponent(part.slice(1))}`} style={{color:'#8854c5'}}>{part}</Link>:<span key={index}>{part}</span>)}</div>
      {post.has_gallery?<PostGallery postId={post.id} fallback={post.image_url}/>:post.image_url&&<a className="post-photo" href={post.image_url} target="_blank" rel="noopener noreferrer"><img src={post.image_url} alt={isEnglishLocale(lang)?'Post image':'动态配图'} loading="lazy"/></a>}
      {post.has_poll&&<PollCard postId={post.id}/>}
      {post.video_url&&<div style={{margin:'12px 0 16px',maxWidth:'100%'}}><video src={post.video_url} controls playsInline preload="metadata" style={{display:'block',width:'100%',maxHeight:520,background:'#231d2b',borderRadius:15}} aria-label={isEnglishLocale(lang)?'Post video':'帖子视频'}/></div>}
      <div className="post-actions"><button title={t('comments')} aria-label={t('comments')} onClick={()=>{router.push(`/post/${post.id}`)}}><MessageCircle size={18}/><span>{m.replies||''}</span></button>
      <button type="button" className={m.reposted?'action-green':''} title={t('repost')} aria-label={m.reposted?t('undoRepost'):t('repost')} aria-pressed={m.reposted} onClick={()=>void toggle('reposts',post)}><Repeat2 size={19}/><span>{m.reposts||''}</span></button>
      <button type="button" className={m.liked?'action-red':''} title={t('like')} aria-label={m.liked?t('unlike'):t('like')} aria-pressed={m.liked} onClick={()=>void toggle('likes',post)}><Heart size={19} fill={m.liked?'currentColor':'none'}/><span>{m.likes||''}</span></button>
      <span className="sf-post-unique-views" title="打开帖子详情的不同登录用户数"><Eye size={17}/><span>{m.views} 浏览</span></span>
      <button type="button" className={m.saved?'action-green':''} title={t('saveBookmark')} aria-label={m.saved?t('undoBookmark'):t('saveBookmark')} aria-pressed={m.saved} onClick={()=>void toggle('bookmarks',post)}><Bookmark size={18} fill={m.saved?'currentColor':'none'}/></button>
      <button type="button" className="sf2-post-share" title={isEnglishLocale(lang)?'Share post':'分享动态'} aria-label={isEnglishLocale(lang)?'Share post':'分享动态'} onClick={()=>void sharePost(post)}><Share2 size={18}/></button>
      </div></div></article>;
  };
  const renderContent=()=>{
    if(view==='notifications')return <>
      <div className="section-heading">
       <h2>{t('notifications')}</h2>
       {unread>0&&<button type="button" className="text-action" onClick={()=>void markRead()}>{t('allRead')}</button>}
      </div>
      <div className="sf2-notification-tabs" role="group"
       aria-label={isEnglishLocale(lang)?'Notification categories':'通知分类'}>
       {(['all','interaction','follow','verification','system'] as NotificationGroup[]).map(group=>
        <button key={group} type="button" aria-pressed={notificationFilter===group}
         className={notificationFilter===group?'selected':''} onClick={()=>setNotificationFilter(group)}>
          {isEnglishLocale(lang)?({
           all:'All',interaction:'Interactions',follow:'Follows',verification:'Verification',system:'System'
          }[group]):({
           all:'全部',interaction:'互动',follow:'关注',verification:'认证',system:'系统'
          }[group])}
        </button>)}
      </div>
      {visibleNotifications(notifs,notificationFilter).length>0?
       visibleNotifications(notifs,notificationFilter).map(note=>{
        const actor=unwrap(note.profiles);
        const isOfficial=!['like','reply','repost','mention','follow','direct_message'].includes(note.kind);
        const target=notificationTarget(note,actor);
        return <button type="button" key={note.id}
         className={`notification ${note.read_at?'':'unread'}`}
         onClick={()=>{void markRead(note.id);router.push(target);}}>
         <Avatar name={isOfficial?'星流官方':actor?.display_name||'星流用户'}
          image={isOfficial?null:actor?.avatar_url}/>
         <span><strong>{isOfficial?(isEnglishLocale(lang)?'Starflow':'星流官方'):
          actor?.display_name||(isEnglishLocale(lang)?'Starflow user':'星流用户')}</strong>
          {' '}{notificationLabel(note.kind,isEnglishLocale(lang))}
          <small>{ago(note.created_at,lang)}</small></span>
         {!note.read_at&&<span className="unread-dot" aria-label={isEnglishLocale(lang)?'Unread':'未读'}/>}
        </button>;
       }):
       !loading&&<Empty text={t('emptyNotifications')}
        detail={notificationFilter==='all'?t('notificationSub'):
         (isEnglishLocale(lang)?'No notifications in this category.':'当前分类暂无通知。')}/>}
    </>;
    if(view==='settings')return <><div className="section-heading"><h2>{t('settingsTitle')}</h2></div><div className="settings-content"><div className="settings-icon"><Shield size={24}/></div><h3>{t('profileEdit')}</h3><p className="muted">{t('settingsIntro')}</p>
      <form onSubmit={saveProfile} className="stack"><label>{t('name')}<input className="text-input" value={display} onChange={e=>setDisplay(e.target.value)} required minLength={1} maxLength={60}/></label><label>{t('handle')}<input className="text-input" value={handle} onChange={e=>setHandle(e.target.value)} pattern="[a-z0-9_]{3,24}" required/></label>
      <label>{t('bio')}<textarea className="text-input" rows={4} maxLength={160} value={bio} onChange={e=>setBio(e.target.value)}/></label><button className="btn btn-primary" type="submit">{t('save')}</button></form>
      
<StarflowServicesPanel isAdmin={isAdmin}/>
      <StarflowDisplayPreferences/>
      <div className="settings-divider"/><h3>{t('security')}</h3><p className="muted">{t('securityDesc')}</p><button className="btn btn-outline" onClick={async()=>{if(!user?.email)return;const {error}=await db().auth.resetPasswordForEmail(user.email,{redirectTo:`${location.origin}/auth/reset`});showMessage(error?error.message:t('resetSent'));}}>{t('resetMail')}</button>
     <button className="btn btn-outline signout" onClick={logout}><LogOut size={16}/> {t('logout')}</button></div></>;
    if(view==='profile')return <><div className="section-heading"><button className="back-button" aria-label={isEnglishLocale(lang)?'Back':'返回'} onClick={()=>router.back()}><ChevronLeft size={21}/></button><h2>{profile?.display_name||(profileStatus==='loading'?t('loading'):profileStatus==='error'?(isEnglishLocale(lang)?'Unable to load profile':'资料加载失败'):t('profileMissing'))}</h2></div>
      {profile?<><div className="profile-cover"/><div className="profile-info"><div className="profile-top"><Avatar name={profile.display_name} size={84} image={profile.avatar_url}/>
      {profile.id===user?.id?<button className="btn btn-outline" onClick={()=>router.push('/settings')}>{t('edit')}</button>:<div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><button type="button" className={`btn ${following.includes(profile.id)?'btn-outline':'btn-primary'}`} disabled={followBusyTarget===profile.id} aria-busy={followBusyTarget===profile.id} aria-pressed={following.includes(profile.id)} onClick={()=>void follow(profile.id)}>{following.includes(profile.id)?t('unfollow'):<><UserPlus size={16}/> {t('follow')}</>}</button><Link className="btn btn-outline" href={'/messages?to='+encodeURIComponent(profile.handle)}><MessageCircle size={16}/> 私信</Link></div>}</div>
      <div style={{display:'flex',alignItems:'center',gap:6}}><h2>{profile.display_name}</h2><VerificationBadge kind={verified[profile.id]} size={24}/></div><div className="muted">@{profile.handle}</div><p>{profile.bio||t('missingBio')}</p><p className="muted small">{new Date(profile.created_at).toLocaleDateString(LANGUAGE_OPTIONS.find(option=>option.code===lang)?.htmlLang??'zh-CN')} {t('joined')}</p>
      {profile.id===user?.id&&<div className="sf-own-profile-quicklinks" aria-label="我的主页快捷入口">
       <Link href="/bookmarks"><Bookmark size={19}/><strong>我的收藏</strong><small>查看保存的动态</small></Link>
       <Link href="/creator"><BarChart3 size={19}/><strong>创作者中心</strong><small>发布与数据管理</small></Link>
       <Link href="/settings/security"><Shield size={19}/><strong>账号安全</strong><small>绑定与找回方式</small></Link>
      </div>}</div><div className="tab-line">{t('posts')}</div></>:profileStatus==='loading'?<div className="loading-text" role="status"><div className="spinner"/> {t('loading')}</div>:profileStatus==='error'?<div className="loading-text" role="alert">{isEnglishLocale(lang)?'Unable to load profile. Please try again.':'资料加载失败，请稍后重试。'}</div>:<Empty text="用户不存在" detail={isEnglishLocale(lang)?'This username may have changed.':'此用户名可能已经被修改。'}/>}</>;
    if(view==='post')return <><div className="section-heading"><button className="back-button" onClick={()=>router.back()} aria-label={isEnglishLocale(lang)?'Back':'返回'}><ChevronLeft size={22}/></button><h2>{t('thread')}</h2></div>{posts.some(p=>p.id===target)&&<div className="reply-area"><h3>{t('discuss')}</h3>{composer(true)}</div>}</>;
    if(view==='bookmarks')return <div className="section-heading"><h2>{t('bookmarksTitle')}</h2><p>{t('bookmarksIntro')}</p></div>;
    if(view==='explore')return <>
      <div className="section-heading"><h2>{t('explore')}</h2><p>{t('exploreSub')}</p></div>
      <form role="search" className="search-bar sf2-explore-search" onSubmit={event=>{event.preventDefault();setSettledSearch(search.trim());}}>
       <Search size={21} aria-hidden="true"/>
       <input type="search" aria-label={isEnglishLocale(lang)?'Search posts and users':'搜索帖子与用户'}
        placeholder={t('search')} value={search} maxLength={50} autoComplete="off"
        onChange={event=>setSearch(event.target.value)}/>
       {search&&<button type="button" className="sf2-explore-clear" aria-label={isEnglishLocale(lang)?'Clear search':'清空搜索'}
        onClick={()=>{setSearch('');setSettledSearch('');setSearchFilter('all');}}><X size={17}/></button>}
       <button type="submit" className="sf2-explore-submit" disabled={searchPending===false&&loading}
         aria-label={isEnglishLocale(lang)?'Search':'搜索'}>{isEnglishLocale(lang)?'Search':'搜索'}</button>
      </form>
      <div className="sf2-explore-filters" role="group" aria-label={isEnglishLocale(lang)?'Filter search results':'筛选搜索结果'}>
       {(['all','posts','people'] as const).map(group=><button key={group} type="button"
        aria-pressed={searchFilter===group} className={searchFilter===group?'selected':''}
        onClick={()=>setSearchFilter(group)}>
        {isEnglishLocale(lang)?({all:'All',posts:'Posts',people:'People'}[group]):({all:'全部',posts:'帖子',people:'用户'}[group])}
       </button>)}
      </div>
      {(searchPending||loading)&&<p className="sf2-explore-search-status" role="status">
       {isEnglishLocale(lang)?'Searching…':'正在搜索…'}
      </p>}
      {settledSearch.trim()&&searchFilter!=='posts'&&!searchPending&&!loading&&(
       accounts.length>0?<div className="search-people"><strong>{t('people')} · {accounts.length}</strong>
        {accounts.map(a=><Link key={a.id} href={`/profile/${encodeURIComponent(a.handle)}`}>
         <Avatar name={a.display_name} size={36} image={a.avatar_url}/><span><b>{a.display_name}</b><small>@{a.handle}</small></span>
        </Link>)}</div>:
       !loading&&searchFilter==='people'&&<p className="sf2-explore-search-status" role="status">
        {isEnglishLocale(lang)?'No matching users in these results.':'本次搜索没有匹配的用户。'}
       </p>
      )}
     </>;
    return <>
      <div className="sf-home-minihead">
        <div><h1>发现精彩</h1>
          <p>分享生活、探索兴趣、遇见同好</p></div>
        <Link href="/explore"><Sparkles size={15}/> AI 搜索</Link>
      </div>
      <div className="sf-home-channels">
        <div className="home-tabs" role="group" aria-label="首页内容筛选">
          <button type="button" aria-pressed={tab==='all'} className={tab==='all'?'active':''} onClick={()=>setTab('all')}>推荐</button>
          <button type="button" aria-pressed={tab==='following'} className={tab==='following'?'active':''} onClick={()=>setTab('following')}>关注</button>
        </div>

      </div>
      {homeComposerOpen?<div className="sf-home-compose-expanded">
          <button className="sf-home-compose-dismiss" type="button" onClick={()=>setHomeComposerOpen(false)}>收起发布框</button>
          {composer()}
         </div>:
         <div className="sf-home-composer-collapsed">
          <button type="button" onClick={()=>{
            setHomeComposerOpen(true);
            window.setTimeout(()=>document.querySelector<HTMLTextAreaElement>('.sf-home-compose-expanded textarea')?.focus(),30);
          }}>
            <Avatar name={self?.display_name||'星'} image={self?.avatar_url} size={31}/>
            <strong>分享这一刻的美好…</strong><ImagePlus size={19}/>
          </button>
          <Link href="/hub">社区 →</Link>
         </div>}
    </>;
  };

  // Only initial cold auth verification uses a loading state. Normal in-app
  // navigation reuses the recently verified user and skips the full-screen
  // gradient / "switching page" interstitial altogether.
  if(checking)return <main className="sf2-route-loading sf2-auth-route-loading"
    role="status" aria-live="polite" aria-busy="true" aria-label="正在验证登录状态">
    <div className="sf2-route-loading-header"><span/><span/><span/></div>
    <div className="sf2-route-loading-content">
      {Array.from({length:3},(_,index)=><div className="sf2-route-loading-post" key={index}
        aria-hidden="true"><i/><div><b/><span/><span/></div></div>)}
    </div>
   </main>;
  if(!hasConfig()||!user)return <AuthPortal/>;
  return <div className={'app-frame'+(view==='home'?' sf-xhs-home':'')}><div className="app-layout">
    <aside className="left-sidebar"><Brand compact/><nav className="main-nav">{nav.map(item=>{const Icon=item.icon;return <Link key={item.to} href={item.to} className={(view===item.to.slice(1)||view==='home'&&item.to==='/')?'nav-active':''}><Icon size={25}/><span>{t(item.name as 'home'|'explore'|'notifications'|'bookmarks'|'settings')}</span>{item.to==='/notifications'&&unread>0&&<b className="count-bubble">{unread>9?'9+':unread}</b>}</Link>})}<Link href="/messages"><MessageCircle size={25}/><span>私信</span>{dmUnread>0&&<b className="count-bubble">{dmUnread>9?'9+':dmUnread}</b>}</Link><Link href={self?`/profile/${self.handle}`:'/settings'} className={view==='profile'&&profile?.id===user.id?'nav-active':''}><UserRound size={25}/><span>{t('profile')}</span></Link><Link href="/hub"><UserPlus size={25}/><span>社区 / 列表</span></Link><Link href="/creator"><BarChart3 size={25}/><span>数据中心</span></Link>{isAdmin&&<Link href="/admin/console"><LayoutDashboard size={25}/><span>超级管理中心</span></Link>}</nav>
      <button className="btn btn-primary sidebar-publish" onClick={()=>{router.push('/');setTimeout(()=>document.querySelector('.composer textarea')?.scrollIntoView({behavior:'smooth',block:'center'}),200)}}><PenLine size={19}/> {t('newPost')}</button>
      <Link href={self?`/profile/${self.handle}`:'/settings'} className="my-account"><Avatar name={self?.display_name||'我'} image={self?.avatar_url}/><span><strong>{self?.display_name||user.email?.split('@')[0]}</strong><small>@{self?.handle||'account'}</small></span><Ellipsis size={18}/></Link>
    </aside>
    <main className="feed-panel">
      <div className="sf-top-utility">
        <StarflowHomeMenu isAdmin={isAdmin}/>
        <Brand/><span className="sf-home-quiet-mark" aria-hidden="true">✦ 发现美好</span>
      </div>
      {renderContent()}
      {!['notifications','settings'].includes(view)&&!(view==='profile'&&profileStatus!=='found')&&(
        view==='home'?
         (tab==='all'?
           <div className="posts-list sf-masonry-feed-wrapper" aria-label="推荐发现信息流">
            <StarflowMasonryFeed posts={ordered} metrics={metrics} verified={verified} loading={loading}
              lang={lang} onLike={post=>void toggle('likes',post)}
              onBookmark={post=>void toggle('bookmarks',post)}
              onOpenPost={post=>router.push('/post/'+encodeURIComponent(post.id))}/>
           </div>:
           <div className="posts-list sf2-following-list" aria-label="关注的用户时间线" aria-busy={loading}>
            {loading&&ordered.length===0?<div className="sf2-feed-skeleton" aria-label="正在加载关注动态">
              {Array.from({length:3},(_,i)=><div className="sf2-feed-skeleton-post" key={i}><i/><span><b/><b/><b/></span></div>)}
            </div>:null}
            {!loading&&ordered.length===0&&<Empty text="关注的人还没有新动态" detail="关注感兴趣的账号，查看他们最近发布的内容。"/>}
            {ordered.map(card)}
           </div>):
         view==='explore'&&searchFilter==='people'?null:
         <div className="posts-list" aria-busy={loading||searchPending}>
          {loading&&(view==='explore'||ordered.length===0)&&<div className="sf2-feed-skeleton" role="status" aria-label={t('loading')}>
           {Array.from({length:3},(_,index)=><div key={index} className="sf2-feed-skeleton-post"><i/><span><b/><b/><b/></span></div>)}
          </div>}
          {!loading&&!searchPending&&ordered.length===0&&!(view==='profile'&&!profile)&&<Empty
           text={view==='bookmarks'?t('emptyBook'):view==='post'?t('emptyPost'):t('emptyFeed')}
           detail={view==='explore'?(isEnglishLocale(lang)?'Try a different search term.':'试试其他搜索关键词。'):t('emptyHint')}/>}
          {!searchPending&&(!loading||view!=='explore')&&ordered.map(card)}
         </div>
      )}
      <div className="feed-end">© 2026 Starflow · {t('independent')}</div>
    </main>
    <aside className="right-sidebar"><div className="right-card"><div className="right-card-eyebrow"><Sparkles size={15}/> {t('rightHeadline')}</div><h3>{t('rightTitle')}</h3><p>{t('rightDesc')}</p><Link href="/explore" className="discover-link">{t('exploreLink')} <span>↗</span></Link></div>
      <div className="right-card tips-card"><h3>{t('rules')}</h3><div>✦ {t('ruleOne')}</div><div>✦ {t('ruleTwo')}</div><div>✦ {t('ruleThree')}</div></div>
      <div className="footer-links"><Link href="/terms">{t('terms')}</Link><Link href="/privacy">{t('privacy')}</Link><span>© 2026 Starflow</span></div>
    </aside>
    <StarflowMobileNavigation view={view} profileUrl={self?'/profile/'+encodeURIComponent(self.handle):'/settings'} unread={unread+dmUnread} onPublish={openPublish}/>
    {message&&<div className="toast" role="status"><span>{message}</span><button onClick={()=>setMessage('')} aria-label={t('close')}><X size={16}/></button></div>}
  </div></div>;
}
function Empty({text,detail}:{text:string;detail:string}){const {t}=useLanguage();return <div className="empty-state"><div className="empty-icon">✳</div><h3>{text}</h3><p>{detail}</p><Link href="/explore">{t('discoverCommunity')}</Link></div>}
