'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {FormEvent,TouchEvent} from 'react';
import {ArrowLeft,Bookmark,ChevronLeft,ChevronRight,Eye,Heart,MessageCircle,Repeat2,Send,Share2,Trash2,X} from 'lucide-react';
import type {User} from '@supabase/supabase-js';
import {db,hasConfig} from '@/lib/supabase';
import type {Post,Profile} from '@/lib/types';
import {ago,unwrap} from '@/lib/types';
import {Avatar} from './Brand';
import {PostGallery} from './PostGallery';
import {PollCard} from './PollCard';
import {VerificationBadge,type VerificationKind} from './VerificationBadge';
import './StarflowPostDetail.css';

const fields='id,author_id,content,image_url,video_url,has_poll,has_gallery,parent_id,created_at,profiles!posts_author_id_fkey(id,handle,display_name,bio,avatar_url,created_at)';
type Counts={likes:number;comments:number;reposts:number;views:number;liked:boolean;reposted:boolean;saved:boolean};
type CommentLike={count:number;mine:boolean};
const zero:Counts={likes:0,comments:0,reposts:0,views:0,liked:false,reposted:false,saved:false};
const unique=(values:string[])=>[...new Set(values.filter(Boolean))];

export function StarflowPostDetail({postId}:{postId:string}){
 const router=useRouter();
 const [user,setUser]=useState<User|null>(null);
 const [authPending,setAuthPending]=useState(true);
 const [post,setPost]=useState<Post|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [feedback,setFeedback]=useState('');
 const [images,setImages]=useState<string[]>([]);
 const [imageIndex,setImageIndex]=useState(0);
 const [lightbox,setLightbox]=useState(false);
 const [comments,setComments]=useState<Post[]>([]);
 const [commentLikes,setCommentLikes]=useState<Record<string,CommentLike>>({});
 const [commentsLoading,setCommentsLoading]=useState(true);
 const [commentsError,setCommentsError]=useState('');
 const [counts,setCounts]=useState<Counts>(zero);
 const [following,setFollowing]=useState(false);
 const [badge,setBadge]=useState<VerificationKind|undefined>();
 const [commentText,setCommentText]=useState('');
 const [replyTo,setReplyTo]=useState<Profile|null>(null);
 const [sending,setSending]=useState(false);
 const [busy,setBusy]=useState(false);
 const [followBusy,setFollowBusy]=useState(false);
 const composer=useRef<HTMLTextAreaElement|null>(null);
 const recorded=useRef<string|null>(null);
 const touchStart=useRef<number|null>(null);
 const noticeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const notify=(message:string)=>{setFeedback(message);if(noticeTimer.current)clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setFeedback(''),4600);};
 const author=unwrap(post?.profiles);

 const goBack=()=>{if(window.history.length>1)router.back();else router.push('/');};
 const openComments=()=>{document.getElementById('sf-detail-comments')?.scrollIntoView({behavior:'smooth',block:'start'});};
 const focusComposer=()=>{composer.current?.focus();composer.current?.scrollIntoView({behavior:'smooth',block:'nearest'});};
 const paginateImage=(direction:number)=>setImageIndex(index=>(index+direction+images.length)%images.length);
 const onTouchStart=(event:TouchEvent)=>{touchStart.current=event.changedTouches[0]?.clientX??null;};
 const onTouchEnd=(event:TouchEvent)=>{const from=touchStart.current;const to=event.changedTouches[0]?.clientX;touchStart.current=null;if(from!=null&&to!=null&&Math.abs(to-from)>45)paginateImage(from>to?1:-1);};

 useEffect(()=>{
   if(!hasConfig()){setAuthPending(false);setError('站点暂时无法连接到数据服务。');setLoading(false);return;}
   let live=true;
   const client=db();
   void client.auth.getUser().then(({data})=>{if(live){setUser(data.user??null);setAuthPending(false);}}).catch(()=>{if(live){setAuthPending(false);setError('登录状态读取失败，请刷新后重试。');setLoading(false);}});
   const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{if(live){setUser(session?.user??null);setAuthPending(false);}});
   return()=>{live=false;subscription.unsubscribe();if(noticeTimer.current)clearTimeout(noticeTimer.current);};
 },[]);

 const loadStats=useCallback(async(currentId:string,currentUser:string)=>{
  const client=db();
  const [likes,reposts,bookmarks,myLike,myRepost,mySave,views,commentCount]=await Promise.all([
   client.from('likes').select('post_id',{head:true,count:'exact'}).eq('post_id',currentId),
   client.from('reposts').select('post_id',{head:true,count:'exact'}).eq('post_id',currentId),
   client.from('bookmarks').select('post_id',{head:true,count:'exact'}).eq('post_id',currentId),
   client.from('likes').select('post_id').eq('post_id',currentId).eq('user_id',currentUser).maybeSingle(),
   client.from('reposts').select('post_id').eq('post_id',currentId).eq('user_id',currentUser).maybeSingle(),
   client.from('bookmarks').select('post_id').eq('post_id',currentId).eq('user_id',currentUser).maybeSingle(),
   client.rpc('sf_post_view_counts',{p_post_ids:[currentId]}),
   client.from('posts').select('id',{head:true,count:'exact'}).eq('parent_id',currentId),
  ]);
  const record=Array.isArray(views.data)?views.data[0]:null;
  setCounts({
   likes:likes.count??0,reposts:reposts.count??0,comments:commentCount.count??0,views:Number(record?.views)||0,
   liked:!!myLike.data,reposted:!!myRepost.data,saved:!!mySave.data,
  });
 },[]);

 const loadComments=useCallback(async(id:string,selfId:string)=>{
  setCommentsLoading(true);setCommentsError('');
  try{
   const client=db();
   const {data,error}=await client.from('posts').select(fields)
     .eq('parent_id',id).order('created_at',{ascending:false}).limit(100);
   if(error)throw error;
   const rows=(data??[]) as unknown as Post[];
   setComments(rows);
   const ids=rows.map(p=>p.id);
   if(!ids.length){setCommentLikes({});return;}
   const {data:reactions}=await client.from('likes').select('post_id,user_id').in('post_id',ids).limit(2000);
   const next:Record<string,CommentLike>={};
   for(const commentId of ids){
    const on=(reactions??[]).filter(item=>item.post_id===commentId);
    next[commentId]={count:on.length,mine:on.some(item=>item.user_id===selfId)};
   }
   setCommentLikes(next);
  }catch(reason){setCommentsError(reason instanceof Error?reason.message:'评论加载失败。');}
  finally{setCommentsLoading(false);}
 },[]);

 useEffect(()=>{
  if(!user || !postId)return;
  let active=true;
  setLoading(true);setError('');setPost(null);setImages([]);setComments([]);
  const run=async()=>{
   try{
    const client=db();
    const {data,error:postError}=await client.from('posts').select(fields).eq('id',postId).maybeSingle();
    if(postError)throw postError;
    if(!data){if(active)setError('这条动态不存在，或者已被删除。');return;}
    const result=data as unknown as Post;
    if(!active)return;
    setPost(result);
    const owner=unwrap(result.profiles);
    const [media,badges,follow]=await Promise.all([
      result.has_gallery?client.from('post_media').select('media_url').eq('post_id',postId).order('position'):Promise.resolve({data:[],error:null}),
      client.from('account_verifications').select('verification_type').eq('profile_id',result.author_id).eq('status','approved').maybeSingle(),
      client.from('follows').select('following_id').eq('follower_id',user.id).eq('following_id',result.author_id).maybeSingle(),
    ]);
    if(!active)return;
    setImages(unique([...(media.error?[]:(media.data??[]).map(item=>item.media_url)),...(result.image_url?[result.image_url]:[])]));
    if(badges.data && ['blue','gold','gray'].includes(badges.data.verification_type))setBadge(badges.data.verification_type as VerificationKind);
    setFollowing(Boolean(follow.data));
    if(recorded.current!==postId){
      recorded.current=postId;
      // Server counts only the first view by this authenticated account.
      await client.rpc('sf_record_post_view',{p_post_id:postId});
    }
    if(active){void loadStats(postId,user.id);void loadComments(postId,user.id);}
    if(!owner && active)notify('发布者资料暂不可用。');
   }catch(reason){if(active)setError(reason instanceof Error?reason.message:'动态加载失败，请重试。');}
   finally{if(active)setLoading(false);}
  };
  void run();
  return()=>{active=false;};
 },[postId,user?.id,loadStats,loadComments]);

 async function toggleAction(kind:'likes'|'reposts'|'bookmarks'){
  if(!user||!post||busy)return;
  setBusy(true);
  const prop=kind==='likes'?'liked':kind==='reposts'?'reposted':'saved';
  const previous=counts;
  const was=previous[prop];
  setCounts(current=>({
   ...current,[prop]:!was,
   ...(kind==='likes'?{likes:Math.max(0,current.likes+(was?-1:1))}:{}),
   ...(kind==='reposts'?{reposts:Math.max(0,current.reposts+(was?-1:1))}:{}),
  }));
  const client=db();
  const {error}=was
   ?await client.from(kind).delete().eq('post_id',post.id).eq('user_id',user.id)
   :await client.from(kind).insert({post_id:post.id,user_id:user.id});
  if(error){setCounts(previous);notify(error.message||'操作失败，请重试。');}
  setBusy(false);
 }

 async function toggleFollow(){
  if(!user||!post||followBusy||user.id===post.author_id)return;
  setFollowBusy(true);
  const was=following;setFollowing(!was);
  const client=db();
  const {error}=was
   ?await client.from('follows').delete().eq('follower_id',user.id).eq('following_id',post.author_id)
   :await client.from('follows').insert({follower_id:user.id,following_id:post.author_id});
  if(error){setFollowing(was);notify(error.message);}
  setFollowBusy(false);
 }

 async function sendComment(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const message=commentText.trim();
  if(!user||!post||!message||sending)return;
  if(Array.from(message).length>280){notify('评论最多 280 个字符。');return;}
  setSending(true);
  try{
   const {error}=await db().from('posts').insert({
     author_id:user.id, parent_id:post.id,
     content:replyTo?'@'+replyTo.handle+' '+message:message,
   });
   if(error)throw error;
   setCommentText('');setReplyTo(null);
   await Promise.all([loadComments(post.id,user.id),loadStats(post.id,user.id)]);
   openComments();
   notify('评论已发布');
  }catch(reason){notify(reason instanceof Error?reason.message:'评论发送失败，请重试。');}
  finally{setSending(false);}
 }

 async function likeComment(item:Post){
  if(!user||busy)return;
  const old=commentLikes[item.id]??{count:0,mine:false};
  setBusy(true);
  setCommentLikes(previous=>({...previous,[item.id]:{count:Math.max(0,old.count+(old.mine?-1:1)),mine:!old.mine}}));
  const client=db();
  const {error}=old.mine
   ?await client.from('likes').delete().eq('post_id',item.id).eq('user_id',user.id)
   :await client.from('likes').insert({post_id:item.id,user_id:user.id});
  if(error){setCommentLikes(prev=>({...prev,[item.id]:old}));notify(error.message);}
  setBusy(false);
 }

 async function deleteComment(item:Post){
  if(!user||!post||item.author_id!==user.id)return;
  if(!window.confirm('确定删除这条评论吗？'))return;
  const {error}=await db().from('posts').delete().eq('id',item.id).eq('author_id',user.id);
  if(error){notify(error.message);return;}
  await Promise.all([loadComments(post.id,user.id),loadStats(post.id,user.id)]);
 }

 async function share(){
  if(!post)return;
  const address=window.location.href;
  try{
   if(navigator.share)await navigator.share({title:'星流动态',url:address});
   else{await navigator.clipboard.writeText(address);notify('动态链接已复制');}
  }catch(reason){
   if(!(reason instanceof DOMException && reason.name==='AbortError'))notify('分享失败，可复制网页地址发送给朋友。');
  }
 }

 if(authPending)return <main className="sf-detail-shell"><p className="sf-detail-status" role="status">正在读取登录状态…</p></main>;
 if(!user)return <main className="sf-detail-shell"><header className="sf-detail-nav"><button onClick={goBack} aria-label="返回"><ArrowLeft/></button><b>动态详情</b></header><div className="sf-detail-status"><h2>登录后查看完整动态</h2><p>登录后即可浏览图片或视频、评论、点赞和收藏。</p><Link href="/">前往登录</Link></div></main>;

 return <main className="sf-detail-shell">
  <header className="sf-detail-nav">
   <button type="button" onClick={goBack} aria-label="返回发现页"><ArrowLeft size={23}/></button>
   <span className="sf-detail-wordmark">星流 <small>STARFLOW</small></span>
   <b>动态详情</b>
   <button type="button" onClick={()=>router.push('/')} aria-label="关闭详情返回首页"><X size={21}/></button>
  </header>
  {loading?<div className="sf-detail-status" role="status">正在打开动态…</div>
   :error?<div className="sf-detail-status" role="alert"><h2>无法打开动态</h2><p>{error}</p><button type="button" onClick={()=>window.location.reload()}>重新加载</button><Link href="/">返回发现</Link></div>
   :post&&<div className="sf-detail-layout">
    <article className="sf-detail-post">
     <div className="sf-detail-author">
      <Link href={author?'/profile/'+encodeURIComponent(author.handle):'/explore'} className="sf-detail-author-link">
       <Avatar name={author?.display_name||'星流用户'} image={author?.avatar_url} size={44}/>
       <span><strong>{author?.display_name||'星流用户'}</strong><small>@{author?.handle||'unknown'} · {ago(post.created_at)}</small></span>
      </Link>
      <VerificationBadge kind={badge} size={16} interactive={false}/>
      {post.author_id!==user.id&&<button type="button" className="sf-detail-follow" disabled={followBusy} onClick={()=>void toggleFollow()}>{following?'已关注':'+ 关注'}</button>}
     </div>
     {post.video_url&&<div className="sf-detail-media sf-detail-video"><video src={post.video_url} controls playsInline preload="metadata" poster={post.image_url??undefined}/></div>}
     {!post.video_url && images.length>0&&<div className="sf-detail-media sf-detail-images" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <button type="button" className="sf-detail-image-open" onClick={()=>setLightbox(true)} aria-label="查看大图">
       <img src={images[imageIndex]} alt={'动态图片 '+(imageIndex+1)}/>
      </button>
      {images.length>1&&<><button className="sf-detail-img-prev" type="button" onClick={()=>paginateImage(-1)} aria-label="上一张图片"><ChevronLeft size={22}/></button>
       <button className="sf-detail-img-next" type="button" onClick={()=>paginateImage(1)} aria-label="下一张图片"><ChevronRight size={22}/></button>
       <span className="sf-detail-image-pagination">{imageIndex+1} / {images.length}</span></>}
     </div>}
     {!post.video_url&&!images.length&&<div className="sf-detail-text-head"><span>分享此刻的想法</span></div>}
     <div className="sf-detail-body">
      <p className="sf-detail-content">{post.content||'分享了一段精彩瞬间'}</p>
      {post.has_poll&&<PollCard postId={post.id}/>}
      <div className="sf-detail-date">{new Date(post.created_at).toLocaleString('zh-CN')} · <Eye size={14}/> {counts.views} 次浏览</div>
     </div>
     <section id="sf-detail-comments" className="sf-detail-comments" aria-label="动态评论">
      <div className="sf-detail-comments-title"><h2>评论 <small>{counts.comments}</small></h2><span>一起聊聊这条动态</span></div>
      {commentsLoading?<p className="sf-detail-comment-state" role="status">正在加载评论…</p>:
       commentsError?<p className="sf-detail-comment-state" role="alert">{commentsError} <button onClick={()=>void loadComments(post.id,user.id)}>重试</button></p>:
       comments.length===0?<div className="sf-detail-comment-empty"><MessageCircle size={25}/><p>还没有评论，来发表第一条吧</p><button onClick={focusComposer}>写评论</button></div>:
       <div className="sf-detail-comment-list">{comments.map(item=>{
        const person=unwrap(item.profiles);
        const reaction=commentLikes[item.id]||{count:0,mine:false};
        return <div className="sf-detail-comment" key={item.id}>
         <Link href={person?'/profile/'+encodeURIComponent(person.handle):'/explore'}><Avatar name={person?.display_name||'用户'} image={person?.avatar_url} size={37}/></Link>
         <div className="sf-detail-comment-main"><div className="sf-detail-comment-name"><Link href={person?'/profile/'+encodeURIComponent(person.handle):'/explore'}>{person?.display_name||'星流用户'}</Link>{person?.id===post.author_id&&<span>作者</span>}</div>
          <p>{item.content}</p>
          <div className="sf-detail-comment-actions"><span>{ago(item.created_at)}</span>
           <button onClick={()=>{setReplyTo(person);focusComposer();}} type="button">回复</button>
           <button type="button" aria-label="点赞这条评论" aria-pressed={reaction.mine} onClick={()=>void likeComment(item)}><Heart size={14} fill={reaction.mine?'currentColor':'none'}/>{reaction.count||''}</button>
           {item.author_id===user.id&&<button type="button" onClick={()=>void deleteComment(item)} aria-label="删除我的评论"><Trash2 size={14}/> 删除</button>}
          </div>
         </div>
        </div>;
       })}{comments.length>=100&&<p className="sf-detail-comment-state">当前显示最近 100 条评论。</p>}</div>}
     </section>
    </article>
    <aside className="sf-detail-aside"><h2>星流 · 发现精彩</h2><p>好内容值得停留。你可以查看这条动态的全部内容，也可以在下方参与讨论。</p><button type="button" onClick={focusComposer}><MessageCircle size={19}/> 参与讨论</button><Link href="/">发现更多动态 →</Link></aside>
   </div>}
  {post&&!loading&&!error&&<form className="sf-detail-dock" onSubmit={event=>void sendComment(event)}>
    <div className="sf-detail-dock-input">
     {replyTo&&<button type="button" className="sf-detail-replying" onClick={()=>setReplyTo(null)} title="取消回复">@{replyTo.handle} ×</button>}
     <textarea ref={composer} value={commentText} rows={1} maxLength={280} placeholder={replyTo?'回复 '+replyTo.display_name+'…':'说点什么，参与讨论…'}
      aria-label="发表动态评论" onChange={event=>setCommentText(event.target.value)}/>
     {commentText.trim()&&<button className="sf-detail-send" type="submit" disabled={sending} aria-label="发送评论"><Send size={18}/></button>}
    </div>
    <button className={counts.liked?'is-active':''} type="button" disabled={busy} onClick={()=>void toggleAction('likes')} aria-label="点赞" aria-pressed={counts.liked}><Heart size={21} fill={counts.liked?'currentColor':'none'}/><small>{counts.likes}</small></button>
    <button type="button" onClick={openComments} aria-label="查看评论"><MessageCircle size={21}/><small>{counts.comments}</small></button>
    <button className={counts.saved?'is-active':''} type="button" disabled={busy} onClick={()=>void toggleAction('bookmarks')} aria-label="收藏" aria-pressed={counts.saved}><Bookmark size={21} fill={counts.saved?'currentColor':'none'}/></button>
    <button className={counts.reposted?'is-active':''} type="button" disabled={busy} onClick={()=>void toggleAction('reposts')} aria-label="转发" aria-pressed={counts.reposted}><Repeat2 size={21}/></button>
    <button type="button" onClick={()=>void share()} aria-label="分享动态"><Share2 size={21}/></button>
   </form>}
  {feedback&&<div className="sf-detail-toast" role="status">{feedback}</div>}
  {lightbox&&images.length>0&&<div className="sf-detail-lightbox" role="dialog" aria-modal="true" aria-label="大图浏览" onClick={()=>setLightbox(false)}>
   <button type="button" className="sf-detail-lightbox-exit" onClick={()=>setLightbox(false)} aria-label="关闭大图"><X/></button>
   <img src={images[imageIndex]} alt={'大图 '+(imageIndex+1)} onClick={event=>event.stopPropagation()}/>
   {images.length>1&&<div className="sf-detail-lightbox-nav" onClick={event=>event.stopPropagation()}>
    <button type="button" onClick={()=>paginateImage(-1)} aria-label="上一张"><ChevronLeft/></button><span>{imageIndex+1}/{images.length}</span><button type="button" onClick={()=>paginateImage(1)} aria-label="下一张"><ChevronRight/></button>
   </div>}
  </div>}
 </main>;
}
