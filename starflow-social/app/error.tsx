'use client';

import {useEffect} from 'react';

export default function PageError({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
 useEffect(()=>{
  // Development visibility, with no sensitive details shown to visitors.
  console.error('[Starflow] Page render failed:',error);
 },[error]);
 return <main style={{minHeight:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:'linear-gradient(145deg,#fcf9ff,#f0e8ff)',color:'#2f2645',fontFamily:"-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif"}}>
  <section role="alert" style={{maxWidth:420,textAlign:'center',background:'#fff',border:'1px solid #e7dcf4',padding:'32px 24px',borderRadius:22,boxShadow:'0 12px 38px #4e328016'}}>
   <img src="/starflow-official-mark.webp" width="62" height="62" alt="星流 Logo" style={{borderRadius:18}}/>
   <h1 style={{fontSize:22,margin:'18px 0 10px'}}>加载遇到问题</h1>
   <p style={{color:'#867996',fontSize:14,lineHeight:1.9,margin:'0 0 22px'}}>页面暂时无法正常显示。可以重新尝试，或返回星流首页。</p>
   <div style={{display:'flex',justifyContent:'center',flexWrap:'wrap',gap:10}}>
    <button type="button" onClick={()=>{reset();window.location.reload()}} style={{border:0,borderRadius:13,background:'#8160d0',color:'#fff',fontSize:15,fontWeight:750,minHeight:44,padding:'10px 19px'}}>重新加载</button>
    <a href="/" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',borderRadius:13,background:'#f0ebf7',color:'#674b9a',fontSize:15,fontWeight:750,padding:'10px 19px',textDecoration:'none'}}>返回首页</a>
   </div>
  </section>
 </main>;
}
