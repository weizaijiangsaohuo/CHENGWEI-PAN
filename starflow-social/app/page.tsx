'use client';
import {useEffect,useLayoutEffect,useState} from 'react';
import type {CSSProperties,FormEvent} from 'react';
import Link from 'next/link';
import {ArrowRight,BookOpen,Globe2,LockKeyhole,MessageCircle,ShieldCheck,Sparkles,Users,ChevronRight,X,Send} from 'lucide-react';
import {SocialApp,readVerifiedRouteUser} from '@/components/SocialApp';
import {useLanguage} from '@/components/LanguageProvider';
import {isEnglishLocale} from '@/lib/i18n';
import {siteText} from '@/lib/site-language';
import {db,hasConfig} from '@/lib/supabase';
import styles from './landing.module.css';
import { StarflowAiWidget } from '@/components/StarflowAiWidget';
import { StarflowMotionShowcase } from '@/components/StarflowMotionShowcase';
import { StarflowAssemblyHero } from '@/components/StarflowAssemblyHero';
type Screen='checking'|'landing'|'auth'|'member';
type AiLine={role:'user'|'assistant';content:string};
const glass:CSSProperties={background:'rgba(255,255,255,.83)',backdropFilter:'blur(28px) saturate(160%)',WebkitBackdropFilter:'blur(28px) saturate(160%)',border:'1px solid rgba(255,255,255,.82)',boxShadow:'0 16px 54px rgba(49,66,135,.19),inset 0 1px 0 rgba(255,255,255,.98)'};

function LegacyStarflowAiWidget({signedIn,onSignIn,en}:{signedIn:boolean;onSignIn:()=>void;en:boolean}){
  const [open,setOpen]=useState(false);
  const [input,setInput]=useState('');
  const [lines,setLines]=useState<AiLine[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!open)return;
    function closeOnEscape(event:KeyboardEvent){if(event.key==='Escape')setOpen(false)}
    document.addEventListener('keydown',closeOnEscape);
    return()=>document.removeEventListener('keydown',closeOnEscape);
  },[open]);

  async function send(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const message=input.trim();
    if(!signedIn||!message||busy||message.length>600)return;
    setLines(previous=>[...previous,{role:'user',content:message}]);
    setInput('');setError('');setBusy(true);
    try{
      const {data:{session},error:sessionError}=await db().auth.getSession();
      if(sessionError||!session?.access_token)throw new Error(en?'Please sign in again.':'登录状态已失效，请重新登录。');
      const response=await fetch('/api/ai',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
        body:JSON.stringify({message})
      });
      const result:unknown=await response.json();
      const data=result as {reply?:unknown;error?:unknown};
      if(!response.ok)throw new Error(typeof data?.error==='string'?data.error:(en?'Unable to reach AI.':'AI 暂时无法连接。'));
      if(typeof data?.reply!=='string'||!data.reply.trim())throw new Error(en?'No response received.':'AI 没有返回有效回复。');
      setLines(previous=>[...previous,{role:'assistant',content:data.reply as string}]);
    }catch(caught){setError(caught instanceof Error?caught.message:(en?'Something went wrong.':'请求失败，请稍后重试。'))}
    finally{setBusy(false)}
  }

  return <>
    <style>{`
      .sfai-launcher{position:fixed;z-index:90;right:18px;bottom:calc(82px + env(safe-area-inset-bottom));border:1px solid rgba(255,255,255,.76);border-radius:999px;padding:11px 17px;display:flex;align-items:center;gap:9px;background:linear-gradient(117deg,rgba(63,125,238,.96),rgba(119,93,222,.95) 60%,rgba(174,109,226,.94));color:white;font-weight:760;font-size:13px;box-shadow:0 12px 30px rgba(72,79,185,.33),inset 0 1px 0 rgba(255,255,255,.43);cursor:pointer;transition:transform .2s,box-shadow .2s}
      .sfai-launcher:active{transform:scale(.96)}
      .sfai-panel{position:fixed;z-index:91;right:14px;bottom:calc(145px + env(safe-area-inset-bottom));width:min(392px,calc(100vw - 28px));max-height:min(580px,calc(100dvh - 175px));display:flex;flex-direction:column;border-radius:28px;overflow:hidden;color:#202843}
      .sfai-header{display:flex;align-items:center;gap:11px;padding:15px 16px;border-bottom:1px solid rgba(140,157,210,.18)}
      .sfai-symbol{width:44px;height:44px;flex:none;display:grid;place-items:center;color:#fff;font-size:28px;border-radius:15px;background:linear-gradient(130deg,#57d4e9,#5e85f1 48%,#b777e7);box-shadow:0 5px 14px rgba(99,114,232,.25)}
      .sfai-close{margin-left:auto;border:0;background:rgba(112,130,186,.1);width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#59617a}
      .sfai-body{padding:21px 16px;overflow:auto;min-height:150px;flex:1}
      .sfai-welcome{font-size:14px;line-height:1.8;text-align:center;font-weight:550;margin:4px 0 20px}
      .sfai-primary{border:0;color:#fff;background:linear-gradient(120deg,#4f81e9,#866ee6);min-height:44px;padding:12px 20px;border-radius:999px;font-weight:750;cursor:pointer;width:100%}
      .sfai-secondary{display:block;width:100%;border:0;background:none;padding:13px;color:#727990;cursor:pointer}
      .sfai-chatline{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;padding:11px 13px;border-radius:16px;margin-bottom:12px;font-size:13px}
      .sfai-userline{background:#e6e9ff;margin-left:30px;border-bottom-right-radius:5px}
      .sfai-botline{background:rgba(255,255,255,.86);border:1px solid rgba(132,148,218,.18);margin-right:25px;border-bottom-left-radius:5px}
      .sfai-inputrow{display:flex;gap:8px;padding:12px 13px;border-top:1px solid rgba(132,148,218,.18)}
      .sfai-inputrow input{min-width:0;flex:1;border:1px solid rgba(115,139,208,.25);background:rgba(255,255,255,.8);border-radius:999px;padding:12px 14px;outline:0;color:#202843}
      .sfai-inputrow button{border:0;border-radius:50%;width:43px;display:grid;place-items:center;background:#6078e2;color:white}
      .sfai-inputrow button:disabled{opacity:.5}
      .sfai-error{margin:0 15px 9px;color:#aa3949;font-size:12px;line-height:1.5}
      @media(min-width:651px){.sfai-launcher{bottom:24px;right:24px}.sfai-panel{bottom:89px;right:24px}}
      @media(prefers-reduced-motion:reduce){.sfai-launcher{transition:none}}
    `}</style>
    {open&&<section className="sfai-panel" role="dialog" aria-modal="false" aria-label="Starflow AI" style={glass}>
      <div className="sfai-header">
        <div className="sfai-symbol" aria-hidden="true">✦</div>
        <div><strong style={{fontSize:16}}>Starflow AI</strong><div style={{color:'#828ba6',fontSize:11,marginTop:4}}>{en?'Official AI Assistant':'星流官方智能助手'}</div></div>
        <button type="button" className="sfai-close" onClick={()=>setOpen(false)} aria-label={en?'Close':'关闭'}><X size={18}/></button>
      </div>
      {!signedIn?<div className="sfai-body" style={{textAlign:'center'}}>
        <p className="sfai-welcome">{en?'You haven’t signed in or registered yet~':'小主，你还没登录/注册呢～'}</p>
        <button type="button" className="sfai-primary" onClick={()=>{setOpen(false);onSignIn()}}>{en?'Sign in / Register':'登录 / 注册'}</button>
        <button type="button" className="sfai-secondary" onClick={()=>setOpen(false)}>{en?'Maybe later':'稍后再说'}</button>
      </div>:<>
        <div className="sfai-body" aria-live="polite">
          {lines.length===0&&<p style={{color:'#626c8c',fontSize:13,lineHeight:1.8,margin:'5px 0'}}>{en?'Hello! I’m the Starflow AI assistant (text beta). How can I help?':'你好！我是 ✦ Starflow AI 智能助手，全世界最强大的AI模型，你可以直接输入问题。'}</p>}
          {lines.map((line,index)=><div key={index} className={`sfai-chatline ${line.role==='user'?'sfai-userline':'sfai-botline'}`}>{line.content}</div>)}
          {busy&&<div style={{fontSize:12,color:'#69759c'}} role="status">{en?'AI is thinking…':'AI 正在思考…'}</div>}
        </div>
        {error&&<p className="sfai-error" role="alert">{error}</p>}
        <form className="sfai-inputrow" onSubmit={send}>
          <input value={input} onChange={event=>setInput(event.target.value)} maxLength={600} placeholder={en?'Ask a question…':'输入你的问题…'} aria-label={en?'Your message':'你的问题'}/>
          <button type="submit" disabled={busy||!input.trim()} aria-label={en?'Send':'发送'}><Send size={17}/></button>
        </form>
      </>}
    </section>}
    <button type="button" className="sfai-launcher" onClick={()=>setOpen(previous=>!previous)} aria-label={en?'Open Starflow AI':'打开 Starflow AI'}><Sparkles size={19}/> ✦ Starflow AI</button>
  </>;
}

export default function Home(){
  const [screen,setScreen]=useState<Screen>('checking');
  const [showInitialLogo,setShowInitialLogo]=useState(false);
  const {lang}=useLanguage();
  const en=isEnglishLocale(lang);
  // This is the same short-lived, server-verified in-memory identity used by
  // SocialApp. Reuse it before paint when returning to / from another app route.
  // The independent getUser() request below still validates the active session.
  useLayoutEffect(()=>{
    if(readVerifiedRouteUser())setScreen('member');
  },[]);
  useEffect(()=>{
    // One true branded startup per browser tab. Returning from inner routes
    // must never replay the intro or interrupt the active navigation.
    try {
      const first=!sessionStorage.getItem('sf-entry-logo-seen');
      setShowInitialLogo(first);
      sessionStorage.setItem('sf-entry-logo-seen','1');
    }catch{setShowInitialLogo(false);}
  },[]);
  useEffect(()=>{
    const node=document.querySelector('.sf-public-landing');
    if(!node||window.matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver'in window))return;
    const targets=node.querySelectorAll<HTMLElement>('[data-sf-reveal]');
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){
        (entry.target as HTMLElement).classList.remove('sf-reveal-pending');
        observer.unobserve(entry.target);
      }
    },{threshold:0.08,rootMargin:'0px 0px -35px 0px'});
    targets.forEach(element=>{
      if(element.getBoundingClientRect().top>window.innerHeight-30){
        element.classList.add('sf-reveal-pending');
        observer.observe(element);
      }
    });
    return()=>observer.disconnect();
  },[screen]);
  useEffect(()=>{
    if(!hasConfig()){setScreen('landing');return;}
    let active=true;
    const client=db();
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
      if(active&&session?.user)setScreen('member');
    });
    client.auth.getUser().then(({data:{user}})=>{
      if(active)setScreen(current=>current==='auth'?current:(user?'member':'landing'));
    }).catch(()=>{if(active)setScreen('landing')});
    return()=>{active=false;subscription.unsubscribe()};
  },[]);
  if(screen==='checking'&&!showInitialLogo)return <main className="sf-section-loading sf-root-auth-loading" role="status"><span className="sf-section-loading-dot"/> 正在进入星流…</main>;
  if(screen==='checking')return <main className={styles.loading+' sf-boot-screen'} role="status" aria-live="polite">
  <img src="/starflow-official-mark.webp" width="76" height="76" alt="" />
  <strong>星流 <span>STARFLOW</span></strong>
  <p className="sf-boot-tagline">{en?'Your world, happening now.':'你的世界，此刻正在发生'}</p>
  <small className="sf-boot-status">{en?'Connecting to Starflow…':'正在连接星流…'}</small>
 </main>;
  const enter=()=>setScreen('auth');
  const l=(english:string,chinese:string)=>siteText(lang,english,chinese);
  return <>
    {screen==='member'||screen==='auth'?<SocialApp view="home"/>:<div className={styles.page+' sf-public-landing'}>
    <header className={styles.nav}>
      <Link href="/" className={styles.brand} aria-label={l("Refresh Starflow home","刷新星流首页")} onClick={event=>{
        if(window.location.pathname==='/'){event.preventDefault();window.location.reload();}
      }}><span className={styles.logoSymbol}><img src="/starflow-official-mark.webp" width="40" height="40" alt="星流正式 Logo"/></span><span className={styles.brandName}><b>星流</b><small>STARFLOW</small></span></Link>
      <nav className={styles.navLinks} aria-label={l("Main navigation","主导航")}>
        <a href="#discover">{l("Discover","探索星流")}</a>
        <a href="#resources">{l("Resources","指南与资源")}</a>
        <button type="button" className={styles.navSignin} onClick={enter}>{l("Sign in","登录")}</button>
      </nav>
      <div className={styles.navRight} aria-label="注册入口">
        <button type="button" className={styles.navJoin} onClick={enter}>{l("Join","加入星流")} <ArrowRight size={15}/>
        </button></div>
    </header>

    <main>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}><span className={styles.liveDot}/>{l("A space for real connection","连接每一种可能")}</span>
          <h1><span>{l("Your world,","你关心的世界，")}</span><br/><em>{l("in the moment.","此刻正在发生。")}</em></h1>
          <p className={styles.heroDescription}>{l("Share your thoughts, discover new voices, and connect through the moments that matter.","分享真实想法，遇见有趣的人，让每一次连接，都值得期待。")}</p>
          <div className={styles.heroActions}>
            <button type="button" onClick={enter} className={styles.primaryAction}>{l("Get started","立即加入")} <ArrowRight size={18}/></button>
            <a className={styles.outlineAction} href="#showcase">{l("Explore Starflow","了解星流")} <ChevronRight size={17}/></a>
          </div>
          <div className={styles.heroDiscover}>
            <span className={styles.heroDiscoverSparkle} aria-hidden="true">✦</span>
            <span>{l("Every story has a universe.","让每一个故事，都有自己的星光。")}</span>
            <a href="#showcase">{l("Scroll to discover","向下发现精彩")} <ArrowRight size={14}/></a>
          </div>

        </div>
        <StarflowAssemblyHero english={en} locale={lang}/>
      </section>

      <StarflowMotionShowcase english={en} locale={lang} onJoin={enter}/>

      <section id="discover" className={styles.introSection} data-sf-reveal="discover">
        <div className={styles.sectionHeading}>
          <span className={styles.sectionKicker}><Sparkles size={15} strokeWidth={1.7}/>{l("DISCOVER STARFLOW / 01","发现星流 / 01")}</span>
          <h2>{l("Share. Discover. Connect.","分享、发现、连接。")}</h2>
          <p>{l("Everything begins with a thought worth sharing.","从一句话开始，让交流自然发生。")}</p>
        </div>
        <div className={styles.features}>
          <article className={styles.feature}><span className={styles.featureIndex}>01 / MOMENTS</span><div className={styles.featureIcon}><MessageCircle size={22} strokeWidth={1.75}/></div><h3>{l("Share your moments","分享此刻")}</h3><p>{l("Post thoughts and images, and join conversations.","发布想法和图片，参与真诚的交流。")}</p></article>
          <article className={styles.feature}><span className={styles.featureIndex}>02 / DISCOVER</span><div className={styles.featureIcon}><Users size={22} strokeWidth={1.75}/></div><h3>{l("Find your people","发现同好")}</h3><p>{l("Follow people and discover perspectives that matter to you.","关注感兴趣的人，发现不同视角。")}</p></article>
          <article className={styles.feature}><span className={styles.featureIndex}>03 / TRUST</span><div className={styles.featureIcon}><ShieldCheck size={22} strokeWidth={1.75}/></div><h3>{l("Build with care","尊重与安全")}</h3><p>{l("A community shaped by clear rules and respect.","以明确的社区规则推动友善交流。")}</p></article>
        </div>
      </section>

      <section id="resources" className={styles.resourcesSection} data-sf-reveal="resources">
        <div className={styles.sectionHeading}>
         <span className={styles.sectionKicker}><ShieldCheck size={15}/>{l("HELP & RESOURCES / 02","帮助与资源 / 02")}</span>
         <h2>{l("Explore confidently.","了解星流，安心使用。")}</h2>
         <p>{l("Clear community standards. More confident connections.","规则透明，隐私有度，让每一次交流都有安心的边界。")}</p>
        </div>
        <div className={styles.resourceGrid}>
          <Link href="/terms" className={styles.resource}><div className={styles.resourceIcon}><BookOpen size={22} strokeWidth={1.75}/></div><div className={styles.resourceContent}><span className={styles.resourceIndex}>01 / POLICY</span><h3>{l("Terms of Service","服务条款")}</h3><p>{l("Your account, rights, responsibilities and service rules.","了解账号规则、用户权利与服务条件。")}</p></div><ChevronRight className={styles.cardArrow} size={20}/></Link>
          <Link href="/privacy" className={styles.resource}><div className={styles.resourceIcon}><LockKeyhole size={22} strokeWidth={1.75}/></div><div className={styles.resourceContent}><span className={styles.resourceIndex}>02 / DATA</span><h3>{l("Privacy & Data","隐私与数据使用")}</h3><p>{l("How data may be collected, used and protected.","了解个人信息处理方式和隐私权利。")}</p></div><ChevronRight className={styles.cardArrow} size={20}/></Link>
          <Link href="/guidelines" className={styles.resource}><div className={styles.resourceIcon}><ShieldCheck size={22} strokeWidth={1.75}/></div><div className={styles.resourceContent}><span className={styles.resourceIndex}>03 / COMMUNITY</span><h3>{l("Community Guidelines","社区规范")}</h3><p>{l("What is welcome, and what is not allowed.","了解内容边界、举报与申诉原则。")}</p></div><ChevronRight className={styles.cardArrow} size={20}/></Link>
          <Link href="/privacy#section-13" className={styles.resource}><div className={styles.resourceIcon}><Globe2 size={22} strokeWidth={1.75}/></div><div className={styles.resourceContent}><span className={styles.resourceIndex}>04 / RIGHTS</span><h3>{l("Your Privacy Rights","用户隐私权利")}</h3><p>{l("Learn about access, correction and deletion requests.","查看访问、更正、删除等权利说明。")}</p></div><ChevronRight className={styles.cardArrow} size={20}/></Link>
        </div>
      </section>

      <section className={styles.cta} data-sf-reveal="join"><span className={styles.ctaOrbit} aria-hidden="true"/><span className={styles.ctaSparkle} aria-hidden="true">✦</span><Sparkles size={25}/><h2>{l("A new connection starts here.","下一次相遇，从星流开始。")}</h2><p>{l("Join the conversation and share what matters.","用真实想法，连接更广阔的世界。")}</p><button onClick={enter} type="button">{l("Join Starflow","加入 Starflow")} <ArrowRight size={18}/></button></section>
    </main>
    <footer className={styles.footer}><div className={styles.footerTop}><div><b className="sf-footer-brand"><img src="/starflow-official-mark.webp" width="30" height="30" alt=""/> 星流 <span>STARFLOW</span></b><p>{l("An independent space for authentic connections.","一个为真实交流而构建的独立社区。")}</p></div><div className={styles.footerLinks}><Link href="/terms">{l("Terms","服务条款")}</Link><Link href="/privacy">{l("Privacy","隐私政策")}</Link><Link href="/guidelines">{l("Guidelines","社区规范")}</Link></div></div><div className={styles.footerBottom}><span>© 2026 Starflow · WEIZAI</span><span>{l("Web platform · International community","面向全球的网络社区")}</span></div>
     <div className={styles.footerHelp}><div><Sparkles size={18}/><span><strong>{l("Need help?","遇到问题？")}</strong><small>{l("Our AI help center is open without sign-in.","星流 AI 帮助中心，无需登录即可使用。")}</small></span></div>
       <Link href="/support">{l("Open AI help center","前往 AI 客服中心")} <ArrowRight size={17}/></Link>
     </div></footer>
  </div>}
    {screen==='member'&&<StarflowAiWidget signedIn onSignIn={enter} en={en}/>}

  </>;
}
