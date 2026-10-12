'use client';
import {useEffect,useState} from 'react';
import {db,hasConfig} from '@/lib/supabase';
type Item={id:string;title:string;body:string};
export function StarflowPublicAnnouncements(){
 const [item,setItem]=useState<Item|null>(null);
 const [dismissed,setDismissed]=useState(false);
 useEffect(()=>{
  if(!hasConfig())return;
  let active=true;
  db().from('sf_platform_announcements').select('id,title,body')
   .eq('published',true).order('created_at',{ascending:false}).limit(1)
   .then(({data,error})=>{if(active&&!error&&data?.length)setItem(data[0] as Item)});
  return()=>{active=false};
 },[]);
 if(!item||dismissed)return null;
 return <aside role="status" aria-label="Starflow 官方公告" style={{display:'flex',alignItems:'start',justifyContent:'space-between',gap:12,padding:'12px 18px',background:'linear-gradient(102deg,#ffeff6,#f0e7ff,#edf7ff)',borderBottom:'1px solid #e7d8ef',color:'#5e426f',fontSize:13,position:'relative',zIndex:15}}>
  <div style={{maxWidth:1150,margin:'0 auto',flex:1,overflowWrap:'anywhere'}}>
   <strong style={{marginRight:8}}>✦ 官方公告 · {item.title}</strong><span style={{whiteSpace:'pre-wrap'}}>{item.body}</span>
  </div>
  <button type="button" aria-label="关闭公告" onClick={()=>setDismissed(true)} style={{border:0,background:'transparent',fontSize:20,color:'#8c6aa2',cursor:'pointer'}}>×</button>
 </aside>;
}
