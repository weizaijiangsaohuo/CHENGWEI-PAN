'use client';

import {useState} from 'react';
import type {Lang} from '@/lib/i18n';
import {siteText} from '@/lib/site-language';
import {RotateCcw, Sparkles} from 'lucide-react';
import './StarflowAssemblyHero.css';

type Props={english:boolean;locale?:Lang};

/** A brand constellation, never a fake application window.
 * CSS-driven assembly: four portions of the official mark flow together
 * into the actual mark; typography appears after convergence.
 * No scroll listeners, timers, requestAnimationFrame, WebGL or video. */
export function StarflowAssemblyHero({english,locale}:Props){
 const l=(en:string,zh:string)=>siteText(locale??(english?'en':'zh'),en,zh);
 const [replay,setReplay]=useState(0);
 const shards=['northwest','northeast','southwest','southeast'] as const;
 const stars=['a','b','c','d','e','f','g'] as const;
 return <div className="sf-constellation" aria-label={l("Starflow brand constellation","星流品牌星轨汇聚动效")}>
  <div className="sf-constellation-scene" key={replay}>
   <span className="sf-cosmos-aurora" aria-hidden="true"/>
   <span className="sf-cosmos-orbit sf-cosmos-orbit-a" aria-hidden="true"/>
   <span className="sf-cosmos-orbit sf-cosmos-orbit-b" aria-hidden="true"/>
   <span className="sf-cosmos-orbit sf-cosmos-orbit-c" aria-hidden="true"/>
   <span className="sf-cosmos-trail sf-cosmos-trail-a" aria-hidden="true"/>
   <span className="sf-cosmos-trail sf-cosmos-trail-b" aria-hidden="true"/>
   <span className="sf-cosmos-trail sf-cosmos-trail-c" aria-hidden="true"/>
   {stars.map(star=><span key={star} aria-hidden="true" className={'sf-cosmos-star sf-cosmos-star-'+star}/>)}
   <div className="sf-cosmos-symbol" aria-hidden="true">
    {shards.map(shard=><span key={shard} className={'sf-cosmos-shard sf-cosmos-shard-'+shard}/>)}
    <img className="sf-cosmos-mark" src="/starflow-official-mark.webp" width="164" height="164" alt=""/>
   </div>
   <div className="sf-cosmos-caption">
    <span className="sf-cosmos-kicker"><Sparkles size={13}/>{l("EVERY CONNECTION BEGINS WITH A SPARK","让每一次相遇，都有自己的星光")}</span>
    <h2>{l("STARFLOW","星流")}</h2>
    <strong>{l("星流 · CONNECT YOUR UNIVERSE","STARFLOW")}</strong>
    <p>{l("Your universe, coming together.","万千星光，在此汇聚。")}</p>
   </div>
   <span aria-hidden="true" className="sf-cosmos-aside sf-cosmos-aside-left">01 / DISCOVER</span>
   <span aria-hidden="true" className="sf-cosmos-aside sf-cosmos-aside-right">02 / CONNECT</span>
  </div>
  <button type="button" className="sf-cosmos-replay" onClick={()=>setReplay(value=>value+1)}
   aria-label={l("Replay Starflow constellation animation","重新播放星流汇聚动效")}>
   <RotateCcw size={14}/>{l("Replay motion","重播星流动效")}
  </button>
 </div>;
}
