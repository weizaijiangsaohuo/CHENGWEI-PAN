'use client';

import {useEffect,useRef,useState} from 'react';

/** Server-issued verification only. The caller MUST supply a server-read approved status. */
export type VerificationKind = 'blue'|'gold'|'gray';

const INFO={
  blue:{name:'蓝色认证',explanation:'符合要求的 Premium 订阅账号，不等同于身份核验。',color:'#499AE5'},
  gold:{name:'金色认证',explanation:'官方认证的企业或组织账号。',color:'#D7B344'},
  gray:{name:'灰色认证',explanation:'政府机构、政府官员及符合条件的多边组织账号。',color:'#8B99A8'}
} as const;

export function VerificationBadge({kind,size=20}:{kind:VerificationKind|null|undefined;size?:16|20|24|32}){
  const [open,setOpen]=useState(false);
  const host=useRef<HTMLSpanElement>(null);
  useEffect(()=>{
    if(!open)return;
    const onOutside=(event:PointerEvent)=>{if(event.target instanceof Node&&!host.current?.contains(event.target))setOpen(false)};
    const onEsc=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
    document.addEventListener('pointerdown',onOutside);document.addEventListener('keydown',onEsc);
    return()=>{document.removeEventListener('pointerdown',onOutside);document.removeEventListener('keydown',onEsc)};
  },[open]);
  if(!kind||!(kind in INFO))return null;
  const info=INFO[kind];
  return <span ref={host} className="sf-badge" style={{display:'inline-flex',alignItems:'center',position:'relative',verticalAlign:'middle',flexShrink:0}}>
    <button type="button" aria-label={info.name} title={info.name} aria-haspopup="dialog" aria-expanded={open} onClick={(event)=>{event.preventDefault();event.stopPropagation();setOpen(v=>!v)}} style={{display:'inline-grid',placeItems:'center',width:size+6,height:size+6,background:'transparent',border:0,borderRadius:7,padding:0,cursor:'pointer',color:'inherit'}}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path fill={info.color} d="M16 1.5 20.1 4 24.9 4.1 27.1 8.2 31 10.9 29.8 15.6 31 20.1 27.2 22.8 25 27.1 20.1 27.4 16 30 11.9 27.4 7 27.1 4.8 22.8 1 20.1 2.2 15.6 1 10.9 4.9 8.2 7.1 4.1 11.9 4Z"/>
        <path d="m9.2 16.1 4.4 4.4 9.2-9.4" stroke="#fff" strokeWidth="3.15" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
    {open&&<span role="dialog" aria-label={info.name} onClick={event=>event.stopPropagation()} style={{position:'absolute',top:'calc(100% + 7px)',left:0,zIndex:200,width:260,maxWidth:'80vw',boxShadow:'0 12px 40px rgba(40,20,60,.15)',padding:15,border:'1px solid #eadced',background:'#fffafd',borderRadius:15,color:'#2b2535',fontSize:13,lineHeight:1.7,textAlign:'left'}}>
      <span style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}><strong>{info.name}</strong><button type="button" aria-label="关闭认证说明" onClick={()=>setOpen(false)} style={{border:0,background:'transparent',fontSize:18,cursor:'pointer',color:'inherit'}}>×</button></span>
      <span style={{display:'block',marginTop:6}}>{info.explanation}</span>
    </span>}
  </span>;
}
