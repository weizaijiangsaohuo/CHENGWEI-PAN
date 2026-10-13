'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {db,hasConfig} from '@/lib/supabase';
import './StarflowGrowth.css';
type Hashtag={tag:string;post_count:number;last_seen:string};
export function StarflowTrending(){
 const [topics,setTopics]=useState<Hashtag[]>([]);
 const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const refresh=async()=>{
  setLoading(true);setError('');
  try{
   if(!hasConfig())throw Error('账号服务尚未配置');
   const {data:{user},error:authError}=await db().auth.getUser();
   if(authError||!user)throw Error('请先登录 Starflow');
   const {data,error:dbError}=await db().rpc('sf_trending_hashtags');
   if(dbError)throw dbError;
   setTopics((data||[]) as Hashtag[]);
  }catch(e){setError(e instanceof Error?e.message:'暂时无法读取热搜');}
  finally{setLoading(false);}
 };
 useEffect(()=>{void refresh();},[]);
 return <main className="sf-growth-page"><div className="sf-growth-shell">
  <nav className="sf-growth-nav"><Link href="/">← 返回首页</Link><Link href="/explore">搜索</Link><Link href="/drafts">草稿箱</Link></nav>
  <h1>✦ 热门话题</h1>
  <p className="sf-growth-note">根据近7天最新最多5,000条公开主帖中出现的话题标签计算；按参与讨论的帖子数排序，同一帖子同一话题只计一次。不是购买的热搜或模拟数据。</p>
  <section className="sf-growth-card">
   <div className="sf-growth-actions" style={{justifyContent:'space-between'}}>
    <h2>七日话题榜</h2><button type="button" className="secondary" disabled={loading} onClick={()=>void refresh()}>{loading?'刷新中…':'刷新排行'}</button>
   </div>
   {error?<p role="alert" className="sf-growth-error">{error}</p>:loading?<p role="status">正在统计真实讨论…</p>:topics.length===0?<p>最近7天暂无带 #话题 标签的公开主帖。发一条带 #话题 的动态就可能进入榜单。</p>:
   <ol className="sf-trending-list">{topics.map((x,i)=><li key={x.tag}>
    <span className="sf-trending-rank">{i+1}</span>
    <div><Link href={'/explore?tag='+encodeURIComponent(x.tag)}><strong>#{x.tag}</strong></Link>
     <small>{x.post_count.toLocaleString('zh-CN')} 条讨论 · 最新 {new Date(x.last_seen).toLocaleString('zh-CN')}</small>
    </div><Link href={'/explore?tag='+encodeURIComponent(x.tag)} aria-label={'查看 #'+x.tag+' 话题'}>查看 →</Link>
   </li>)}</ol>}
  </section>
 </div></main>;
}
