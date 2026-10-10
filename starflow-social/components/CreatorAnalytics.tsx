'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {db,hasConfig} from '@/lib/supabase';
import './StarflowExtras.css';

type Stats={post_count:number;likes_received:number;reposts_received:number;replies_received:number;follower_count:number};
type Point={date:string;count:number};
export function CreatorAnalytics(){
 const [days,setDays]=useState(30);const [stats,setStats]=useState<Stats|null>(null);const [points,setPoints]=useState<Point[]>([]);
 const [loading,setLoading]=useState(true);const [message,setMessage]=useState('');const [authed,setAuthed]=useState(true);
 useEffect(()=>{
  let active=true;
  const go=async()=>{
   if(!hasConfig()){setMessage('Supabase 尚未配置');setLoading(false);return;}
   setLoading(true);
   const {data:{user}}=await db().auth.getUser();if(!user){if(active){setAuthed(false);setLoading(false)}return;}
   const [result,postResult]=await Promise.all([
    db().rpc('creator_summary',{p_days:days}),
    db().from('posts').select('created_at').eq('author_id',user.id).gte('created_at',new Date(Date.now()-days*86400000).toISOString()).order('created_at',{ascending:true}).limit(2000)
   ]);
   if(!active)return;
   if(result.error){setMessage('统计服务尚未就绪：'+result.error.message);setStats(null)}
   else setStats(((result.data||[])[0]||null) as Stats|null);
   const counts=new Map<string,number>();
   for(let d=days-1;d>=0;d--){const date=new Date(Date.now()-d*86400000).toISOString().slice(0,10);counts.set(date,0)}
   for(const post of postResult.data||[]){const date=post.created_at.slice(0,10);if(counts.has(date))counts.set(date,(counts.get(date)||0)+1)}
   setPoints([...counts].map(([date,count])=>({date,count})));
   setLoading(false);
  };void go();return()=>{active=false};
 },[days]);
 const max=Math.max(1,...points.map(x=>x.count));
 return <main className="sf-hub"><div className="sf-hub-inner">
  <header><Link href="/">← 返回 Starflow</Link><Link href="/hub">社区与列表 →</Link></header>
  <h1>✦ 创作者数据中心</h1>
  <p className="sf-hub-help">所有指标均由真实帖子与互动记录统计。尚未接入的浏览量、收益不会显示虚构数字。</p>
  <label>统计周期：<select value={days} style={{maxWidth:170}} onChange={e=>setDays(Number(e.target.value))}><option value={7}>近7天</option><option value={30}>近30天</option><option value={90}>近90天</option></select></label>
  {loading?<p>正在载入统计…</p>:!authed?<div className="sf-hub-card">需要登录后查看个人创作者数据。<Link href="/">登录 →</Link></div>:message?<p className="sf-hub-status" role="alert">{message}</p>:stats?<>
   <section className="sf-stat-grid" style={{marginTop:18}}>
    {([['发布帖子',stats.post_count],['收到点赞',stats.likes_received],['收到转发',stats.reposts_received],['收到回复',stats.replies_received],['当前粉丝',stats.follower_count]] as const).map(([label,value])=><div key={label} className="sf-stat"><span>{label}</span><strong>{Number(value||0).toLocaleString()}</strong></div>)}
   </section>
   <section className="sf-hub-card"><h2>每日发帖趋势</h2><div style={{display:'flex',alignItems:'end',gap:2,height:155,paddingBottom:10,borderBottom:'1px solid #e7d8ee'}} aria-label="每日帖子柱状图">
    {points.map(p=><div key={p.date} title={`${p.date}：${p.count}篇`} style={{flex:1,height:`${Math.max(2,p.count/max*100)}%`,background:'linear-gradient(180deg,#ec9bca,#a28cde)',borderRadius:'4px 4px 0 0',minWidth:1}}/>)}
   </div><p className="sf-hub-help">仅统计当前账号在所选周期内的帖子。数据有可能受查询分页上限影响。</p></section>
  </>:null}
 </div></main>;
}
