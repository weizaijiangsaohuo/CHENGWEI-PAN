'use client';
import {useEffect,useState} from 'react';
import {db} from '@/lib/supabase';
export function PostGallery({postId,fallback}:{postId:string;fallback:string|null}){
 const [images,setImages]=useState<string[]>(fallback?[fallback]:[]);
 const [active,setActive]=useState<number|null>(null);
 useEffect(()=>{
  let active=true;
  db().from('post_media').select('media_url').eq('post_id',postId).order('position').then(({data,error})=>{
   if(active&&!error&&data&&data.length)setImages(data.map(x=>x.media_url));
  });return()=>{active=false};
 },[postId]);
 useEffect(()=>{
  if(active===null)return;
  const fn=(e:KeyboardEvent)=>{if(e.key==='Escape')setActive(null);if(e.key==='ArrowRight')setActive(i=>i===null?null:(i+1)%images.length);if(e.key==='ArrowLeft')setActive(i=>i===null?null:(i-1+images.length)%images.length)};
  document.addEventListener('keydown',fn);return()=>document.removeEventListener('keydown',fn);
 },[active,images.length]);
 if(!images.length)return null;
 return <>
  <div className={`sf-gallery ${images.length>1?'sf-gallery-grid':''}`}>
   {images.map((src,i)=><button key={src} type="button" onClick={()=>setActive(i)} aria-label={`查看第${i+1}张图片`}><img src={src} alt={`帖子图片 ${i+1}`} loading="lazy"/></button>)}
  </div>
  {active!==null&&<div className="sf-lightbox" role="dialog" aria-modal="true" aria-label="图片浏览器" onClick={()=>setActive(null)}>
   <button className="sf-lightbox-close" onClick={()=>setActive(null)} aria-label="关闭">×</button>
   <img src={images[active]} alt={`帖子图片 ${active+1}`} onClick={e=>e.stopPropagation()}/>
   {images.length>1&&<div className="sf-lightbox-nav" onClick={e=>e.stopPropagation()}>
    <button onClick={()=>setActive((active-1+images.length)%images.length)} aria-label="上一张">‹</button>
    <span>{active+1} / {images.length}</span>
    <button onClick={()=>setActive((active+1)%images.length)} aria-label="下一张">›</button>
   </div>}
  </div>}
 </>;
}
