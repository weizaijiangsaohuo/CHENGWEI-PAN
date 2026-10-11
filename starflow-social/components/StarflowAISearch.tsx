'use client';

import {useEffect,useId,useMemo,useRef,useState} from 'react';
import type {KeyboardEvent} from 'react';
import Link from 'next/link';
import {ArrowUpRight,Clock3,Hash,Search,Sparkles,Trash2,X} from 'lucide-react';
import {db,hasConfig} from '@/lib/supabase';
import {buildAISuggestions,extractRecentHashtags,SEARCH_FALLBACK} from '@/lib/search-suggestions';
import type {SearchCatalogEntry,SearchHistoryEntry,SearchTopicEntry} from '@/lib/search-suggestions';
import './StarflowAISearch.css';

type Props={value:string;onChange:(value:string)=>void;onSearch:(value:string)=>void;compact?:boolean};
export function StarflowAISearch({value,onChange,onSearch,compact=false}:Props){
 const id=useId().replace(/:/g,'');
 const [viewerId,setViewerId]=useState<string|null>(null);
 const [open,setOpen]=useState(false);
 const [selected,setSelected]=useState(-1);
 const [catalog,setCatalog]=useState<SearchCatalogEntry[]>([...SEARCH_FALLBACK]);
 const [history,setHistory]=useState<SearchHistoryEntry[]>([]);
 const [topics,setTopics]=useState<SearchTopicEntry[]>([]);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState('');
 const request=useRef(0);
 const inputRef=useRef<HTMLInputElement>(null);
 const boxRef=useRef<HTMLDivElement>(null);

 useEffect(()=>{
  if(!hasConfig())return;
  let live=true;
  void db().auth.getUser().then(({data})=>{if(live)setViewerId(data.user?.id||null);})
   .catch(()=>{});
  return()=>{live=false};
 },[]);
 const query=value.trim().replace(/^#/,'').slice(0,48);
 useEffect(()=>{
  if(!hasConfig()){setCatalog([...SEARCH_FALLBACK]);return;}
  let valid=true;
  const order=++request.current;
  const timer=window.setTimeout(async()=>{
   setLoading(true);
   const safe=query.replace(/[\\%_]/g,'').slice(0,32);
   try{
    const client=db();
    const [terms,own,recent]=await Promise.all([
     client.from('sf_search_terms').select('term,relevance')
      .ilike('term',safe+'%').order('relevance',{ascending:false}).limit(20),
     viewerId?client.from('sf_search_history')
      .select('query,times_searched,last_searched_at').eq('user_id',viewerId)
      .ilike('query',safe+'%').order('last_searched_at',{ascending:false}).limit(15)
      :Promise.resolve({data:[],error:null}),
     // Only 120 recent public posts are sampled. This is not a global trending ranking.
     client.from('posts').select('content').is('parent_id',null)
      .order('created_at',{ascending:false}).limit(120),
    ]);
    if(!valid||order!==request.current)return;
    setCatalog(terms.error?[...SEARCH_FALLBACK]:(terms.data||[]) as SearchCatalogEntry[]);
    setHistory(own.error?[]:(own.data||[]) as SearchHistoryEntry[]);
    setTopics(recent.error?[]:extractRecentHashtags(
      (recent.data||[]).map(p=>typeof p.content==='string'?p.content:''),safe));
    setMessage('');
   }catch{
    if(valid&&order===request.current){setCatalog([...SEARCH_FALLBACK]);setTopics([]);setMessage('使用基础联想词');}
   }finally{if(valid&&order===request.current)setLoading(false);}
  },query?210:90);
  return()=>{valid=false;window.clearTimeout(timer);};
 },[query,viewerId]);

 const suggestions=useMemo(()=>buildAISuggestions(query,catalog,history,topics),[query,catalog,history,topics]);
 const sources:Record<string,string>={history:'你的搜索',topic:'站内话题',related:'猜你想搜'};
 function submit(raw:string){
  const cleaned=raw.trim().slice(0,48);
  if(!cleaned)return;
  onChange(cleaned);
  setOpen(false);
  setSelected(-1);
  onSearch(cleaned);
  if(viewerId&&hasConfig()){
   void db().rpc('sf_record_search',{p_query:cleaned})
    .then(({error})=>{
      if(!error)setHistory(prev=>[
        {query:cleaned,times_searched:(prev.find(h=>h.query===cleaned)?.times_searched||0)+1,last_searched_at:new Date().toISOString()},
        ...prev.filter(x=>x.query!==cleaned),
      ].slice(0,60));
    }).catch(()=>{});
  }
 }
 function onKey(event:KeyboardEvent<HTMLInputElement>){
  if(event.key==='ArrowDown'&&open&&suggestions.length){event.preventDefault();setSelected(n=>(n+1)%suggestions.length);}
  else if(event.key==='ArrowUp'&&open&&suggestions.length){event.preventDefault();setSelected(n=>(n+suggestions.length-1)%suggestions.length);}
  else if(event.key==='Escape'){setOpen(false);setSelected(-1);inputRef.current?.blur();}
  else if(event.key==='Enter'){event.preventDefault();submit(open&&selected>=0&&suggestions[selected]?suggestions[selected].term:value);}
 }
 async function clearHistory(){
  if(!viewerId||!hasConfig())return;
  const {error}=await db().from('sf_search_history').delete().eq('user_id',viewerId);
  if(error)setMessage('清除失败，请重试');
  else{setHistory([]);setMessage('搜索历史已清除');}
 }
 useEffect(()=>{
  function close(event:PointerEvent){
   if(boxRef.current&&!boxRef.current.contains(event.target as Node)){setOpen(false);setSelected(-1);}
  }
  document.addEventListener('pointerdown',close);
  return()=>document.removeEventListener('pointerdown',close);
 },[]);
 return <div ref={boxRef} className={'sf-ai-search '+(compact?'sf-ai-compact':'')} role="search" aria-label="星流 AI 搜索">
  <div className="sf-ai-heading">
   <Link className="sf-ai-identity" href="/" aria-label="星流 Starflow 首页">
    <img src="/starflow-official-mark.webp" width="38" height="38" alt="星流正式 Logo"/>
    <span>星流<small>STARFLOW</small></span>
   </Link>
   <span className="sf-ai-label"><Sparkles size={15}/> AI 搜索</span>
  </div>
  <div className="sf-ai-field">
   <Search size={19} aria-hidden="true"/>
   <input ref={inputRef} type="search" value={value} maxLength={48}
    placeholder="搜一搜，猜你想搜…" aria-label="星流 AI 搜索关键词"
    role="combobox" aria-autocomplete="list" aria-expanded={open&&suggestions.length>0}
    aria-controls={id+'-suggestions'}
    aria-activedescendant={open&&selected>=0?id+'-item-'+selected:undefined}
    autoComplete="off" onChange={e=>{onChange(e.target.value);setOpen(true);setSelected(-1);}}
    onFocus={()=>setOpen(true)} onKeyDown={onKey}/>
   {value&&<button type="button" className="sf-ai-clear" aria-label="清除搜索词" onClick={()=>{onChange('');setOpen(true);setSelected(-1);inputRef.current?.focus();}}><X size={16}/></button>}
   <button className="sf-ai-submit" type="button" disabled={!value.trim()} onClick={()=>submit(value)} aria-label="搜索"><ArrowUpRight size={19}/></button>
  </div>
  {open&&<div className="sf-ai-popover" id={id+'-suggestions'} role="listbox" aria-label="猜你想搜联想词">
   <div className="sf-ai-popover-head"><span><Sparkles size={15}/> 猜你想搜</span>
    {viewerId&&history.length>0&&<button type="button" className="sf-ai-history-clear" onClick={()=>void clearHistory()}><Trash2 size={13}/> 清除历史</button>}
   </div>
   {suggestions.length? suggestions.map((item,index)=><button
      key={item.term} type="button" id={id+'-item-'+index} role="option"
      aria-selected={selected===index} className={'sf-ai-suggestion '+(selected===index?'sf-ai-active':'')}
      onPointerDown={event=>event.preventDefault()}
      onClick={()=>submit(item.term)}>
       {item.source==='history'?<Clock3 size={16}/>:item.source==='topic'?<Hash size={16}/>:<Search size={16}/>}
       <span className="sf-ai-suggestion-text">{item.term}</span>
       <small>{sources[item.source]}</small><ArrowUpRight size={15}/>
     </button>)
    : <div className="sf-ai-empty">{loading?'正在查找相关词…':query?'暂无相关联想，可直接搜索关键词。':'试试搜索「美」「动漫」「旅行」…'}</div>}
   {message&&<p className="sf-ai-hint">{message}</p>}
   <p className="sf-ai-footnote">基于相关词、站内话题及本人历史智能排序；暂未使用生成式大模型。</p>
  </div>}
 </div>;
}
