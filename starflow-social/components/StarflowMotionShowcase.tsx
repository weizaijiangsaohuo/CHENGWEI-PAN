import Link from 'next/link';
import type {Lang} from '@/lib/i18n';
import {siteText} from '@/lib/site-language';
import {ArrowRight, BookOpen, Compass, HeartHandshake, MessageCircle, PencilLine, ShieldCheck, Sparkles} from 'lucide-react';
import './StarflowMotionShowcase.css';

type Props={onJoin:()=>void;english:boolean;locale?:Lang};
const experiences=[
 {title:'瞬间分享',en:'Share moments',detail:'记录生活',to:'#discover',tone:'violet',Icon:PencilLine},
 {title:'发现同好',en:'Find your people',detail:'兴趣相遇',to:'#discover',tone:'blue',Icon:Compass},
 {title:'真实交流',en:'Real conversations',detail:'自在表达',to:'#discover',tone:'pink',Icon:MessageCircle},
 {title:'友善社区',en:'A safer space',detail:'尊重彼此',to:'/guidelines',tone:'green',Icon:HeartHandshake},
 {title:'账号守护',en:'Your privacy',detail:'安心连接',to:'/privacy',tone:'indigo',Icon:ShieldCheck},
 {title:'星流帮助',en:'Help center',detail:'服务指引',to:'/support',tone:'rose',Icon:Sparkles},
 {title:'社区规范',en:'Our guidelines',detail:'了解规则',to:'/terms',tone:'gold',Icon:BookOpen},
] as const;

export function StarflowMotionShowcase({onJoin,english,locale}:Props){
 const l=(en:string,zh:string)=>siteText(locale??(english?'en':'zh'),en,zh);
 const tiles=(duplicate:boolean)=>experiences.map(({title,en,detail,to,tone,Icon},index)=>(
  <Link className={'sf-motion-tile sf-motion-'+tone} key={(duplicate?'copy-':'')+title}
    href={to} tabIndex={duplicate?-1:0}>
   <span className="sf-motion-tile-number">0{index+1} / STARFLOW</span>
   <span className="sf-motion-tile-shape" aria-hidden="true"><Icon size={52} strokeWidth={1.35}/></span>
   <span className="sf-motion-tile-bottom"><strong>{l(en,title)}</strong>
     <span>{l('Explore Starflow',detail)}<ArrowRight size={15}/></span>
   </span>
  </Link>
 ));
 return <section id="showcase" className="sf-motion-section" aria-label={l("Explore Starflow experiences","星流体验展示")}>
  <div className="sf-motion-section-header">
   <div><span className="sf-motion-eyebrow"><i/> STARFLOW / EXPLORE</span>
    <h2>{l("Discover a more fluid world.","精彩，不止一种流动。")}</h2>
    <p>{l("Share what matters, discover new people and keep every connection meaningful.","发现感兴趣的世界，分享想法，连接彼此。")}</p>
   </div>
   <a href="#resources">{l("Explore services","了解更多服务")}<ArrowRight size={17}/></a>
  </div>
  <div className="sf-motion-featured">
   <div className="sf-motion-featured-art" aria-hidden="true">
    <span className="sf-featured-ring sf-featured-ring-one"/>
    <span className="sf-featured-ring sf-featured-ring-two"/>
    <span className="sf-featured-blur"/>
    <span className="sf-featured-float sf-float-one">✦</span>
    <span className="sf-featured-float sf-float-two">✧</span>
    <img src="/starflow-official-mark.webp" width="104" height="104" alt=""/>
   </div>
   <div className="sf-motion-featured-body">
    <span className="sf-motion-label">{l("A PLACE FOR EVERY VOICE","星流 · STARFLOW")} <span>OFFICIAL</span></span>
    <h3>{l('Every moment, a new connection.','每一个瞬间，都值得被看见。')}</h3>
    <p>{l("More than a feed. A space for your stories, communities and meaningful connections.","不仅是浏览内容，更是让每一种想法都拥有自己的位置。")}</p>
    <button type="button" onClick={onJoin}>{l("Join Starflow","立即体验星流")}<ArrowRight size={18}/></button>
   </div>
  </div>
  <div className="sf-motion-rail-intro">
    <span>{l("FIND WHAT MOVES YOU","发现属于你的精彩")} <i aria-hidden="true">✦</i></span>
    <span>{l("Browse categories below","探索更多可能")} <ArrowRight size={15}/></span>
  </div>
  <div className="sf-motion-marquee" aria-label={l("Starflow experiences","星流功能与社区内容")}>
   <div className="sf-motion-track">
    <div className="sf-motion-set">{tiles(false)}</div>
    <div className="sf-motion-set" aria-hidden="true" inert>{tiles(true)}</div>
   </div>
  </div>
 </section>;
}
