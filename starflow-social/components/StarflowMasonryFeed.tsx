'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {Bookmark,Heart,ImageIcon,MessageCircle,Play,RefreshCw,Video} from 'lucide-react';
import type {Post} from '@/lib/types';
import {ago,unwrap} from '@/lib/types';
import {Avatar} from './Brand';
import {VerificationBadge,type VerificationKind} from './VerificationBadge';
import './StarflowMasonryFeed.css';

export type MasonryMetrics={
  likes:number;replies:number;reposts:number;
  liked:boolean;saved:boolean;reposted:boolean;
};
type Props={
  posts:Post[];
  metrics:Record<string,MasonryMetrics>;
  verified:Record<string,VerificationKind>;
  loading:boolean;
  lang:'zh'|'en';
  onLike:(post:Post)=>void;
  onBookmark:(post:Post)=>void;
  onOpenPost:(post:Post)=>void;
};
type Filter='all'|'life'|'food'|'style'|'trip'|'game'|'tech'|'video'|'text';
const filters:{id:Filter;name:string;match?:RegExp}[]=[
 {id:'all',name:'推荐'},
 {id:'life',name:'日常',match:/日常|生活|心情|分享|记录|周末|治愈/i},
 {id:'food',name:'美食',match:/美食|吃|咖啡|甜品|餐厅|料理|烘焙|火锅/i},
 {id:'style',name:'穿搭',match:/穿搭|妆|护肤|时尚|衣服|裙|发型|美甲/i},
 {id:'trip',name:'旅行',match:/旅游|旅行|风景|出游|景点|打卡|城市|酒店/i},
 {id:'game',name:'游戏',match:/游戏|电竞|主播|手游|攻略|主机/i},
 {id:'tech',name:'科技',match:/科技|数码|AI|手机|软件|电脑|编程/i},
 {id:'video',name:'视频'},
 {id:'text',name:'文字'},
];

function filteredPosts(posts:Post[],filter:Filter):Post[]{
 if(filter==='all')return posts;
 if(filter==='video')return posts.filter(post=>Boolean(post.video_url));
 if(filter==='text')return posts.filter(post=>!post.image_url&&!post.video_url&&!post.has_gallery);
 const matcher=filters.find(item=>item.id===filter)?.match;
 return matcher?posts.filter(post=>matcher.test(post.content)):posts;
}

export function StarflowMasonryFeed({posts,metrics,verified,loading,lang,onLike,onBookmark,onOpenPost}:Props){
 const [filter,setFilter]=useState<Filter>('all');
 const [visibleCount,setVisibleCount]=useState(16);
 const sentinel=useRef<HTMLDivElement|null>(null);
 const filtered=useMemo(()=>filteredPosts(posts,filter),[posts,filter]);
 const visible=useMemo(()=>filtered.slice(0,visibleCount),[filtered,visibleCount]);
 const more=visibleCount<filtered.length;
 useEffect(()=>{setVisibleCount(16)},[filter]);
 useEffect(()=>{
  const node=sentinel.current;
  if(!node||!more||loading||typeof IntersectionObserver==='undefined')return;
  const observer=new IntersectionObserver(entries=>{
   if(entries[0]?.isIntersecting){
    setVisibleCount(count=>Math.min(count+12,filtered.length));
   }
  },{rootMargin:'400px 0px'});
  observer.observe(node);
  return()=>observer.disconnect();
 },[visibleCount,filtered.length,more,loading]);
 return <section className="sf-masonry-experience" aria-label="星流发现卡片">
  <div className="sf-masonry-interests" role="group" aria-label="筛选内容分类">
   {filters.map(item=><button type="button" key={item.id}
      className={'sf-masonry-interest'+(filter===item.id?' is-active':'')}
      aria-pressed={filter===item.id}
      onClick={()=>setFilter(item.id)}>{item.name}</button>)}
  </div>
  {loading&&posts.length===0?
   <div className="sf-masonry-grid sf-masonry-skeleton" aria-label="正在加载内容" aria-busy="true">
    {Array.from({length:8},(_,index)=><div className="sf-masonry-placeholder" key={index}>
     <div style={{aspectRatio:index%3===0?'3 / 4':'4 / 5'}}/>
     <span/><small/></div>)}
   </div>:
   filtered.length===0?<div className="sf-masonry-empty">
    <ImageIcon size={27}/><strong>{posts.length?'这个分类暂时没有内容':'还没有发布的动态'}</strong>
    <p>{posts.length?'换个分类看看，或者去发布你的第一条相关内容。':'你可以成为第一个分享精彩瞬间的人。'}</p>
    {filter!=='all'&&<button type="button" onClick={()=>setFilter('all')}>查看全部动态</button>}
    <Link href="/explore">探索社区 →</Link>
   </div>:
   <>
    <div className="sf-masonry-grid">
     {visible.map((post,index)=>{
      const profile=unwrap(post.profiles);
      const summary=post.content.trim();
      const m=metrics[post.id]||{likes:0,reposts:0,replies:0,liked:false,reposted:false,saved:false};
      const isMedia=Boolean(post.image_url||post.video_url);
      return <article key={post.id} className="sf-masonry-card" aria-label={summary.slice(0,50)||'动态'}>
       <Link className="sf-masonry-preview" href={'/post/'+encodeURIComponent(post.id)} aria-label={'查看动态：'+(summary.slice(0,36)||'媒体内容')}>
        {post.image_url?
         <img src={post.image_url} alt={summary.slice(0,70)||'用户动态图片'}
           loading={index<4?'eager':'lazy'} decoding="async"/>:
         post.video_url?
          <div className="sf-masonry-video-poster">
           <video src={post.video_url} preload="metadata" playsInline muted
             aria-label="视频预览（点击打开播放）"/>
           <span className="sf-masonry-play"><Play size={19} fill="currentColor"/></span>
          </div>:
          <div className="sf-masonry-text-poster"><span>{summary.slice(0,120)||'点击查看动态'}</span></div>}
        {post.video_url&&post.image_url&&<span className="sf-masonry-video-label"><Video size={14}/> 视频</span>}
        {post.has_gallery&&<span className="sf-masonry-gallery-label"><ImageIcon size={14}/> 图集</span>}
       </Link>
       <div className="sf-masonry-card-content">
        {isMedia&&<Link href={'/post/'+encodeURIComponent(post.id)} className="sf-masonry-card-title">
         {summary|| (post.video_url?'分享了一段视频':'分享了一张图片')}
        </Link>}
        {!isMedia&&<Link href={'/post/'+encodeURIComponent(post.id)} className="sf-masonry-text-hint">查看完整动态 →</Link>}
        <div className="sf-masonry-meta">
         <Link href={profile?'/profile/'+encodeURIComponent(profile.handle):'/explore'} className="sf-masonry-person">
          <Avatar name={profile?.display_name||'星'} image={profile?.avatar_url} size={23}/>
          <span>{profile?.display_name||'星流用户'}</span>
         </Link>
         <VerificationBadge kind={verified[post.author_id]} size={16}/>
         <span className="sf-masonry-time">{ago(post.created_at,lang)}</span>
        </div>
        <div className="sf-masonry-actions">
         <button type="button" onClick={()=>onLike(post)} className={m.liked?'is-liked':''}
          aria-pressed={m.liked} aria-label={(m.liked?'取消点赞':'点赞')+'，当前'+m.likes+'个赞'}>
          <Heart size={17} fill={m.liked?'currentColor':'none'}/><span>{m.likes||'赞'}</span>
         </button>
         <button type="button" onClick={()=>onOpenPost(post)}
          aria-label={'查看 '+m.replies+' 条评论'}>
          <MessageCircle size={16}/><span>{m.replies||'评论'}</span>
         </button>
         <button type="button" onClick={()=>onBookmark(post)}
          className={m.saved?'is-saved':''} aria-pressed={m.saved}
          aria-label={m.saved?'取消收藏':'收藏'}>
          <Bookmark size={16} fill={m.saved?'currentColor':'none'}/>
         </button>
        </div>
       </div>
      </article>;
     })}
    </div>
    <div ref={sentinel} className="sf-masonry-load-more">
     {more?<button type="button" onClick={()=>setVisibleCount(count=>Math.min(count+12,filtered.length))}>
       <RefreshCw size={15}/> 查看更多
      </button>:<span>已经看到本批全部动态 · 继续探索更多精彩</span>}
    </div>
   </>}
 </section>;
}
