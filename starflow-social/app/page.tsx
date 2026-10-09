'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowRight,BookOpen,Globe2,LockKeyhole,MessageCircle,ShieldCheck,Sparkles,Users,ChevronRight} from 'lucide-react';
import {SocialApp} from '@/components/SocialApp';
import {LanguageSwitch,useLanguage} from '@/components/LanguageProvider';
import {db,hasConfig} from '@/lib/supabase';
import styles from './landing.module.css';

type Screen='checking'|'landing'|'auth'|'member';
export default function Home(){
  const [screen,setScreen]=useState<Screen>('checking');
  const {lang}=useLanguage();
  const en=lang==='en';
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
  if(screen==='member'||screen==='auth')return <SocialApp view="home"/>;
  if(screen==='checking')return <main className={styles.loading} role="status" aria-live="polite"><span className={styles.logoSymbol}>✦</span>{en?'Loading Starflow…':'正在进入星流…'}</main>;
  const enter=()=>setScreen('auth');
  return <div className={styles.page}>
    <header className={styles.nav}>
      <Link href="/" className={styles.brand} aria-label="Starflow home"><span className={styles.logoSymbol}>✦</span><span className={styles.brandName}><b>星流</b><small>STARFLOW</small></span></Link>
      <nav className={styles.navLinks} aria-label={en?'Main navigation':'主导航'}>
        <a href="#discover">{en?'Discover':'探索星流'}</a>
        <a href="#resources">{en?'Resources':'指南与资源'}</a>
        <button type="button" className={styles.navSignin} onClick={enter}>{en?'Sign in':'登录'}</button>
      </nav>
      <div className={styles.navRight}><LanguageSwitch/><button type="button" className={styles.navJoin} onClick={enter}>{en?'Join':'加入星流'} <ArrowRight size={15}/></button></div>
    </header>

    <main>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}><span className={styles.liveDot}/>{en?'A space for real connection':'连接每一种可能'}</span>
          <h1>{en?<>Your world,<br/><em>in the moment.</em></>:<>你关心的世界，<br/><em>此刻正在发生。</em></>}</h1>
          <p className={styles.heroDescription}>{en?'Share your thoughts, discover new voices, and connect through the moments that matter.':'分享真实想法，遇见有趣的人，让每一次连接，都值得期待。'}</p>
          <div className={styles.heroActions}>
            <button type="button" onClick={enter} className={styles.primaryAction}>{en?'Get started':'立即加入'} <ArrowRight size={18}/></button>
            <a className={styles.outlineAction} href="#resources">{en?'Learn more':'了解星流'} <ChevronRight size={17}/></a>
          </div>
          <p className={styles.heroHint}>{en?'Web experience · Chinese & English · Independent platform':'网页端现已开放 · 中文 / English · 独立社交平台'}</p>
        </div>
        <div className={styles.heroVisual} aria-label={en?'Illustration of Starflow features':'星流功能示意图'}>
          <div className={styles.previewGlow}/>
          <div className={styles.mockup}>
            <div className={styles.mockupHeader}><span className={styles.mockupBrand}>✦ <b>STARFLOW</b></span><span className={styles.mockupDots}><i/><i/><i/></span></div>
            <div className={styles.mockupBody}>
              <div className={styles.mockupLabel}>{en?'CONNECTION / 01':'连接 · 此刻'}</div>
              <div className={styles.mockupHeadline}>{en?'Find your voice.':'让想法相遇。'}</div>
              <div className={styles.mockupDesc}>{en?'Thoughts, moments and new perspectives.':'分享日常，发现不同的声音。'}</div>
              <div className={styles.mockupExample}><span className={styles.exampleAvatar}>✦</span><span><b>{en?'A place for you':'每个人都有自己的故事'}</b><small>{en?'Your next connection starts here.':'你的下一段连接，从这里开始。'}</small></span></div>
              <div className={styles.mockupExample}><span className={styles.exampleAvatarAlt}>☼</span><span><b>{en?'Discover new perspectives':'看见更广阔的世界'}</b><small>{en?'Explore what matters to you.':'探索你感兴趣的话题。'}</small></span></div>
            </div>
            <div className={styles.mockupFooter}><span>✧</span><span>☷</span><span>♡</span><span>◉</span></div>
          </div>
          <span className={styles.floatingChip}><Globe2 size={16}/>{en?'Connect worldwide':'与世界连接'}</span>
        </div>
      </section>

      <section id="discover" className={styles.introSection}>
        <div className={styles.sectionHeading}><span>{en?'WHY STARFLOW':'发现星流'}</span><h2>{en?'A simpler way to stay connected.':'分享、发现、连接。'}</h2><p>{en?'Everything begins with a thought worth sharing.':'从一句话开始，让交流自然发生。'}</p></div>
        <div className={styles.features}>
          <article className={styles.feature}><div className={styles.featureIcon}><MessageCircle size={23}/></div><h3>{en?'Share your moments':'分享此刻'}</h3><p>{en?'Post thoughts and images, and join conversations.':'发布想法和图片，参与真诚的交流。'}</p></article>
          <article className={styles.feature}><div className={styles.featureIcon}><Users size={23}/></div><h3>{en?'Find your people':'发现同好'}</h3><p>{en?'Follow people and discover perspectives that matter to you.':'关注感兴趣的人，发现不同视角。'}</p></article>
          <article className={styles.feature}><div className={styles.featureIcon}><ShieldCheck size={23}/></div><h3>{en?'Build with care':'尊重与安全'}</h3><p>{en?'A community shaped by clear rules and respect.':'以明确的社区规则推动友善交流。'}</p></article>
        </div>
      </section>

      <section id="resources" className={styles.resourcesSection}>
        <div className={styles.sectionHeading}><span>{en?'HELP & RESOURCES':'帮助与资源'}</span><h2>{en?'Understand Starflow.':'了解星流，安心使用。'}</h2></div>
        <div className={styles.resourceGrid}>
          <Link href="/terms" className={styles.resource}><div className={styles.resourceIcon}><BookOpen size={23}/></div><h3>{en?'Terms of Service':'服务条款'}</h3><p>{en?'Your account, rights, responsibilities and service rules.':'了解账号规则、用户权利与服务条件。'}</p><ChevronRight className={styles.cardArrow} size={20}/></Link>
          <Link href="/privacy" className={styles.resource}><div className={styles.resourceIcon}><LockKeyhole size={23}/></div><h3>{en?'Privacy & Data':'隐私与数据使用'}</h3><p>{en?'How data may be collected, used and protected.':'了解个人信息处理方式和隐私权利。'}</p><ChevronRight className={styles.cardArrow} size={20}/></Link>
          <Link href="/guidelines" className={styles.resource}><div className={styles.resourceIcon}><ShieldCheck size={23}/></div><h3>{en?'Community Guidelines':'社区规范'}</h3><p>{en?'What is welcome, and what is not allowed.':'了解内容边界、举报与申诉原则。'}</p><ChevronRight className={styles.cardArrow} size={20}/></Link>
          <Link href="/privacy#section-13" className={styles.resource}><div className={styles.resourceIcon}><Globe2 size={23}/></div><h3>{en?'Your Privacy Rights':'用户隐私权利'}</h3><p>{en?'Learn about access, correction and deletion requests.':'查看访问、更正、删除等权利说明。'}</p><ChevronRight className={styles.cardArrow} size={20}/></Link>
        </div>
      </section>

      <section className={styles.cta}><Sparkles size={25}/><h2>{en?'A new connection starts here.':'下一次相遇，从星流开始。'}</h2><p>{en?'Join the conversation and share what matters.':'用真实想法，连接更广阔的世界。'}</p><button onClick={enter} type="button">{en?'Join Starflow':'加入 Starflow'} <ArrowRight size={18}/></button></section>
    </main>
    <footer className={styles.footer}><div className={styles.footerTop}><div><b>✦ 星流 <span>STARFLOW</span></b><p>{en?'An independent space for authentic connections.':'一个为真实交流而构建的独立社区。'}</p></div><div className={styles.footerLinks}><Link href="/terms">{en?'Terms':'服务条款'}</Link><Link href="/privacy">{en?'Privacy':'隐私政策'}</Link><Link href="/guidelines">{en?'Guidelines':'社区规范'}</Link></div></div><div className={styles.footerBottom}><span>© 2026 Starflow · WEIZAI</span><span>{en?'Web platform · International community':'面向全球的网络社区'}</span></div></footer>
  </div>;
}
