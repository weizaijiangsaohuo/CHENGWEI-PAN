'use client';

import {useEffect,useState} from 'react';
import {db} from '@/lib/supabase';

type Poll={id:string;question:string;expires_at:string};
type Option={id:string;label:string;position:number};
type Tally={option_id:string;votes:number;mine:boolean};

export function PollCard({postId}:{postId:string}){
 const [poll,setPoll]=useState<Poll|null>(null);
 const [options,setOptions]=useState<Option[]>([]);
 const [tallies,setTallies]=useState<Tally[]>([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [loading,setLoading]=useState(true);
 const fetchPoll=async()=>{
  const {data:p,error}=await db().from('post_polls').select('id,question,expires_at').eq('post_id',postId).maybeSingle();
  if(error||!p){setNotice(error?.message||'无法读取投票');setLoading(false);return;}
  setPoll(p as Poll);
  const [o,t]=await Promise.all([
   db().from('poll_options').select('id,label,position').eq('poll_id',p.id).order('position'),
   db().rpc('poll_option_tallies',{p_poll_id:p.id})
  ]);
  if(o.error||t.error)setNotice(o.error?.message||t.error?.message||'读取投票失败');
  setOptions((o.data||[]) as Option[]);setTallies((t.data||[]) as Tally[]);
  setLoading(false);
 };
 useEffect(()=>{void fetchPoll();/* stable post */},[postId]); // eslint-disable-line react-hooks/exhaustive-deps
 async function vote(optionId:string){
  if(!poll||busy)return;
  setBusy(true);setNotice('');
  const {data:{user}}=await db().auth.getUser();
  if(!user){setNotice('请先登录再投票');setBusy(false);return;}
  const {error}=await db().rpc('cast_poll_vote',{p_poll_id:poll.id,p_option_id:optionId});
  if(error)setNotice(error.message);else await fetchPoll();
  setBusy(false);
 }
 if(loading)return <div className="sf-poll">正在载入投票…</div>;
 if(!poll)return notice?<p className="sf-poll-error">{notice}</p>:null;
 const ended=new Date(poll.expires_at).getTime()<=Date.now();
 const voted=tallies.some(x=>x.mine);
 const total=tallies.reduce((sum,x)=>sum+Number(x.votes||0),0);
 return <section className="sf-poll" aria-label="帖子投票">
  <h3>{poll.question}</h3>
  {options.map(o=>{
   const tally=tallies.find(v=>v.option_id===o.id);const votes=Number(tally?.votes||0);
   const percentage=total?Math.round(votes*100/total):0;
   return <button key={o.id} type="button" className={`sf-poll-option ${tally?.mine?'selected':''}`}
    disabled={busy||ended||voted} onClick={()=>void vote(o.id)}>
    {(ended||voted)&&<span className="sf-poll-bar" style={{width:`${percentage}%`}}/>}
    <span>{o.label}{tally?.mine?' ✓':''}</span>{(ended||voted)&&<b>{percentage}%</b>}
   </button>;
  })}
  <p>{total} 票 · {ended?'投票已截止':`截止 ${new Date(poll.expires_at).toLocaleString('zh-CN')}`}</p>
  {notice&&<p role="alert" className="sf-poll-error">{notice}</p>}
 </section>;
}
