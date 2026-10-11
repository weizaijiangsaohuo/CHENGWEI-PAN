'use client';

import {useState} from 'react';
import {Globe2,Heart,MessageCircle,RotateCcw,Sparkles,Users} from 'lucide-react';
import './StarflowAssemblyHero.css';

type Props={english:boolean};

/**
 * One carefully staged motion sequence:
 * four quadrants of the official symbol drift apart, follow star-like points,
 * and recombine in a fully readable community-interface mockup.
 * All animation is CSS; this component does not intercept gestures or scroll.
 */
export function StarflowAssemblyHero({english}:Props){
 const [replay,setReplay]=useState(0);
 const fragmentNames=['northwest','northeast','southwest','southeast'] as const;
 const dots=['a','b','c','d','e','f'] as const;
 return <div className="sf-assembly-visual" aria-label={english?'Starflow logo assembling into a community interface':'星流标志汇聚成社区界面的动态演示'}>
  <div className="sf-assembly-stage" key={replay} aria-hidden="true">
   <div className="sf-assembly-glow"/>
   <span className="sf-assembly-orbit sf-assembly-orbit-one"/>
   <span className="sf-assembly-orbit sf-assembly-orbit-two"/>
   <span className="sf-assembly-path sf-assembly-path-one"/>
   <span className="sf-assembly-path sf-assembly-path-two"/>
   {dots.map(name=><span key={name} className={'sf-assembly-dot sf-assembly-dot-'+name}/>)}
   {fragmentNames.map(name=><span key={name} className={'sf-assembly-fragment sf-assembly-'+name}/>)}

   <div className="sf-assembly-window">
    <div className="sf-assembly-window-header">
     <span className="sf-assembly-window-brand">
      <img src="/starflow-official-mark.webp" width="44" height="44" alt=""/>
      <strong>STARFLOW</strong>
     </span>
     <span className="sf-assembly-window-dots"><i/><i/><i/></span>
    </div>
    <div className="sf-assembly-window-main">
     <div className="sf-assembly-window-eyebrow">{english?'CONNECT / NOW':'连接 · 此刻'}</div>
     <h2>{english?'Where ideas meet.':'让想法相遇。'}</h2>
     <p>{english?'Share moments and discover new voices.':'分享日常，发现不同的声音。'}</p>
     <div className="sf-assembly-row sf-assembly-row-first">
      <span className="sf-assembly-row-icon"><Sparkles size={24}/></span>
      <span><strong>{english?'Everyone has a story':'每个人都有自己的故事'}</strong>
       <small>{english?'Your next connection begins here.':'你的下一段连接，从这里开始。'}</small></span>
     </div>
     <div className="sf-assembly-row sf-assembly-row-second">
      <span className="sf-assembly-row-icon"><Users size={23}/></span>
      <span><strong>{english?'Discover a wider world':'看见更广阔的世界'}</strong>
       <small>{english?'Explore what interests you.':'探索你感兴趣的话题。'}</small></span>
     </div>
    </div>
    <div className="sf-assembly-window-footer">
     <Sparkles size={21}/><MessageCircle size={21}/><Heart size={21}/><Globe2 size={21}/>
    </div>
   </div>
   <span className="sf-assembly-world-pill"><Globe2 size={19}/>{english?'Connect worldwide':'与世界连接'}</span>
  </div>
  <button type="button" className="sf-assembly-replay" onClick={()=>setReplay(n=>n+1)}
   aria-label={english?'Replay Starflow logo assembly animation':'重播星流 Logo 汇聚动画'}>
   <RotateCcw size={14}/>{english?'Replay':'重播动效'}
  </button>
 </div>;
}
