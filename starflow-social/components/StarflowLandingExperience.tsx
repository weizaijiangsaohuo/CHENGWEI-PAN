'use client';

import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowDown,ArrowRight,BookOpen,Check,ChevronDown,Compass,Globe2,Heart,LockKeyhole,Menu,MessageCircle,Play,Settings2,ShieldCheck,Sparkles,Users,X} from 'lucide-react';
import {LanguageSwitch,useLanguage} from './LanguageProvider';
import {siteText} from '@/lib/site-copy';
import type {Lang} from '@/lib/i18n';
import './StarflowLandingExperience.css';

type Copy={
  navExplore:string;navWorld:string;navHelp:string;more:string;enter:string;scroll:string;
  stageLabel:string;previewHeadline:string;previewBody:string;previewTime:string;
  sectionEyebrow:string;sectionTitle:string;sectionSubtitle:string;
  tabShare:string;tabExplore:string;tabSafe:string;
  cardShare:string;cardShareBody:string;cardExplore:string;cardExploreBody:string;cardSafe:string;cardSafeBody:string;
  worldLabel:string;worldTitle:string;worldBody:string;worldTag1:string;worldTag2:string;worldTag3:string;
  helpLabel:string;helpTitle:string;helpBody:string;support:string;terms:string;privacy:string;rules:string;
  endingLabel:string;endingTitle:string;endingBody:string;footerBody:string;
  motion:string;motionDesc:string;compact:string;compactDesc:string;quickLinks:string;signIn:string;
};
const en:Copy={
  navExplore:'Explore',navWorld:'Our world',navHelp:'Support',more:'More',enter:'Join Starflow',scroll:'Scroll to discover',
  stageLabel:'A NEW SPACE TO CONNECT',previewHeadline:'A moment worth sharing',previewBody:'Your next conversation starts with one thought.',previewTime:'Just now',
  sectionEyebrow:'THE EXPERIENCE',sectionTitle:'More than a timeline.',sectionSubtitle:'Discover the things that matter, at your own pace.',
  tabShare:'Share',tabExplore:'Discover',tabSafe:'Connect',
  cardShare:'Let your ideas take shape.',cardShareBody:'Share a thought, a photo or a fresh perspective. Every story starts somewhere.',
  cardExplore:'Find unexpected connections.',cardExploreBody:'Follow conversations and discover people with something new to say.',
  cardSafe:'A space built with care.',cardSafeBody:'Respectful interactions and thoughtful controls help make the community yours.',
  worldLabel:'EXPLORE THE UNIVERSE',worldTitle:'Your world keeps moving.',worldBody:'From passing thoughts to lasting connections. A community that feels alive, without getting in your way.',
  worldTag1:'Ideas',worldTag2:'Stories',worldTag3:'Conversations',
  helpLabel:'HELP & RESOURCES',helpTitle:'Everything in reach.',helpBody:'Find support and clear guidance as you explore Starflow.',
  support:'AI support · no sign-in needed',terms:'Terms of service',privacy:'Privacy & data',rules:'Community guidelines',
  endingLabel:'YOUR NEXT CHAPTER',endingTitle:'The next moment is yours.',endingBody:'Come as you are. Make every connection count.',
  footerBody:'An independent community for authentic connections.',motion:'Reduce motion',motionDesc:'Minimize movement and animated effects',
  compact:'Compact layout',compactDesc:'Use tighter spacing in the experience',quickLinks:'Explore Starflow',signIn:'Sign in / Register'
};
const zh:Copy={
  navExplore:'发现星流',navWorld:'我们的世界',navHelp:'帮助中心',more:'更多',enter:'加入星流',scroll:'向下探索',
  stageLabel:'让每一种连接，都有意义',previewHeadline:'值得分享的此刻',previewBody:'下一段交流，从一句真实想法开始。',previewTime:'刚刚',
  sectionEyebrow:'星流体验',sectionTitle:'不止于一条时间线。',sectionSubtitle:'在自己的节奏里，发现值得关注的一切。',
  tabShare:'分享',tabExplore:'探索',tabSafe:'连接',
  cardShare:'让你的想法，自由生长。',cardShareBody:'分享一句心情、一张照片，或一个独特视角。每个故事都有自己的起点。',
  cardExplore:'遇见意想不到的共鸣。',cardExploreBody:'关注真诚的对话，发现有趣的人和全新的观点。',
  cardSafe:'用心构筑的交流空间。',cardSafeBody:'让尊重与清晰的社区规则，守护每一次表达。',
  worldLabel:'探索你的宇宙',worldTitle:'你的世界，始终鲜活。',worldBody:'从转瞬即逝的想法，到长久的共鸣。动态与内容自然流动，不打断你的体验。',
  worldTag1:'灵感',worldTag2:'故事',worldTag3:'对话',
  helpLabel:'帮助与资源',helpTitle:'你需要的，都触手可及。',helpBody:'轻松找到客服支持和使用指南。',
  support:'AI 客服 · 无需登录',terms:'服务条款',privacy:'隐私与数据',rules:'社区规范',
  endingLabel:'下一章，由你书写',endingTitle:'新的故事，从此刻开始。',endingBody:'带着真实的自己，让每次连接都值得期待。',
  footerBody:'为真实交流而构建的独立社区。',motion:'减少动效',motionDesc:'减少页面移动与动画效果',
  compact:'紧凑布局',compactDesc:'缩小章节与卡片之间的间距',quickLinks:'探索星流',signIn:'登录 / 注册'
};
const zhHK:Copy={
  navExplore:'探索星流',navWorld:'我們的世界',navHelp:'幫助中心',more:'更多',enter:'加入星流',scroll:'向下探索',
  stageLabel:'讓每一種連繫都有意義',previewHeadline:'值得分享的此刻',previewBody:'下一段交流，從一句真實想法開始。',previewTime:'剛剛',
  sectionEyebrow:'星流體驗',sectionTitle:'不止於一條時間線。',sectionSubtitle:'按照自己的步伐，發現值得關注的一切。',
  tabShare:'分享',tabExplore:'探索',tabSafe:'連繫',
  cardShare:'讓想法自由成長。',cardShareBody:'分享心情、相片或獨特視角。每個故事都有自己的起點。',
  cardExplore:'遇見意想不到的共鳴。',cardExploreBody:'追蹤真誠對話，發現有趣的人和新觀點。',
  cardSafe:'用心建立的交流空間。',cardSafeBody:'讓尊重與清晰的社群守則，守護每一次表達。',
  worldLabel:'探索你的宇宙',worldTitle:'你的世界，始終鮮活。',worldBody:'從短暫想法到長久共鳴，內容自然流動，不打斷你的體驗。',
  worldTag1:'靈感',worldTag2:'故事',worldTag3:'對話',
  helpLabel:'幫助與資源',helpTitle:'你需要的，觸手可及。',helpBody:'輕鬆找到客服支援及使用指南。',
  support:'AI 客服 · 無需登入',terms:'服務條款',privacy:'私隱與資料',rules:'社群守則',
  endingLabel:'下一章，由你書寫',endingTitle:'新的故事，從此刻開始。',endingBody:'以真實的自己，讓每次連繫都值得期待。',
  footerBody:'為真實交流而建立的獨立社群。',motion:'減少動效',motionDesc:'減少頁面移動及動畫',
  compact:'緊湊版面',compactDesc:'縮小章節及卡片間距',quickLinks:'探索星流',signIn:'登入 / 註冊'
};
const ja:Copy={
  navExplore:'見つける',navWorld:'私たちの世界',navHelp:'サポート',more:'もっと見る',enter:'Starflowに参加',scroll:'スクロールして発見',
  stageLabel:'心がつながる、新しい場所',previewHeadline:'共有したい、この瞬間',previewBody:'次の会話は、ひとつの思いから始まります。',previewTime:'たった今',
  sectionEyebrow:'新しい体験',sectionTitle:'タイムラインの、その先へ。',sectionSubtitle:'自分のペースで、大切なものと出会おう。',
  tabShare:'共有',tabExplore:'発見',tabSafe:'つながる',
  cardShare:'あなたの思いを形に。',cardShareBody:'思いや写真、新しい視点を共有しよう。すべての物語には始まりがあります。',
  cardExplore:'思いがけない出会いを。',cardExploreBody:'会話をフォローして、さまざまな人や考え方を見つけよう。',
  cardSafe:'大切に育てるコミュニティ。',cardSafeBody:'お互いを尊重するルールで、安心して交流できる場所を。',
  worldLabel:'世界を探検',worldTitle:'あなたの世界は、動き続ける。',worldBody:'ふとした思いから深いつながりまで。流れるような体験を。',
  worldTag1:'ひらめき',worldTag2:'物語',worldTag3:'会話',
  helpLabel:'ヘルプとサポート',helpTitle:'必要なものは、すぐそこに。',helpBody:'サポートや利用ガイドを簡単に見つけられます。',
  support:'AIサポート · ログイン不要',terms:'利用規約',privacy:'プライバシー',rules:'コミュニティガイドライン',
  endingLabel:'あなたの次の章',endingTitle:'次の瞬間は、あなたのもの。',endingBody:'ありのままの自分で、新しいつながりを。',
  footerBody:'心がつながる独立したSNSコミュニティ。',motion:'動きを減らす',motionDesc:'動きやアニメーションを最小限に',
  compact:'コンパクト表示',compactDesc:'セクションやカードの間隔を狭くする',quickLinks:'Starflowを見る',signIn:'ログイン / 登録'
};
const ko:Copy={
  navExplore:'탐색',navWorld:'우리의 세계',navHelp:'고객지원',more:'더 보기',enter:'Starflow 참여',scroll:'스크롤하여 둘러보기',
  stageLabel:'진정한 연결을 위한 새로운 공간',previewHeadline:'공유하고 싶은 순간',previewBody:'다음 대화는 하나의 생각에서 시작됩니다.',previewTime:'방금',
  sectionEyebrow:'새로운 경험',sectionTitle:'타임라인 그 이상.',sectionSubtitle:'나만의 속도로 소중한 순간을 발견하세요.',
  tabShare:'공유',tabExplore:'탐색',tabSafe:'연결',
  cardShare:'생각을 자유롭게 표현하세요.',cardShareBody:'생각과 사진, 새로운 시각을 나누세요. 모든 이야기에는 시작이 있습니다.',
  cardExplore:'예상치 못한 만남.',cardExploreBody:'대화를 팔로우하고 새로운 사람과 생각을 발견하세요.',
  cardSafe:'서로를 배려하는 공간.',cardSafeBody:'서로 존중하는 규칙으로 편안한 커뮤니티를 만듭니다.',
  worldLabel:'세상을 탐험하세요',worldTitle:'당신의 세상은 계속 움직입니다.',worldBody:'스쳐 가는 생각부터 오래 남을 연결까지. 자연스럽게 이어지는 경험.',
  worldTag1:'영감',worldTag2:'이야기',worldTag3:'대화',
  helpLabel:'도움말 및 지원',helpTitle:'필요한 도움을 한곳에서.',helpBody:'고객지원과 사용 안내를 쉽게 찾으세요.',
  support:'AI 고객지원 · 로그인 불필요',terms:'이용약관',privacy:'개인정보 보호',rules:'커뮤니티 가이드라인',
  endingLabel:'당신의 다음 이야기',endingTitle:'다음 순간은 당신의 것입니다.',endingBody:'있는 그대로의 모습으로 새로운 연결을 만드세요.',
  footerBody:'진정한 연결을 위한 독립 커뮤니티.',motion:'동작 줄이기',motionDesc:'움직임과 애니메이션 최소화',
  compact:'간결한 레이아웃',compactDesc:'섹션과 카드 간격 줄이기',quickLinks:'Starflow 둘러보기',signIn:'로그인 / 가입'
};
const de:Copy={
  navExplore:'Entdecken',navWorld:'Unsere Welt',navHelp:'Hilfe',more:'Mehr',enter:'Starflow beitreten',scroll:'Weiter entdecken',
  stageLabel:'EIN NEUER ORT FÜR VERBINDUNGEN',previewHeadline:'Ein Moment zum Teilen',previewBody:'Dein nächstes Gespräch beginnt mit einem Gedanken.',previewTime:'Gerade eben',
  sectionEyebrow:'DAS ERLEBNIS',sectionTitle:'Mehr als eine Timeline.',sectionSubtitle:'Entdecke, was dir wichtig ist – in deinem Tempo.',
  tabShare:'Teilen',tabExplore:'Entdecken',tabSafe:'Verbinden',
  cardShare:'Gib deinen Ideen Raum.',cardShareBody:'Teile Gedanken, Fotos und neue Perspektiven. Jede Geschichte beginnt irgendwo.',
  cardExplore:'Unerwartete Begegnungen.',cardExploreBody:'Folge Gesprächen und entdecke Menschen mit neuen Ideen.',
  cardSafe:'Ein Ort mit Rücksicht.',cardSafeBody:'Respektvolle Begegnungen und klare Regeln machen diesen Raum zu deinem.',
  worldLabel:'ENTDECKE DAS UNIVERSUM',worldTitle:'Deine Welt bleibt in Bewegung.',worldBody:'Aus flüchtigen Gedanken werden echte Verbindungen. Ohne deinen Rhythmus zu unterbrechen.',
  worldTag1:'Ideen',worldTag2:'Geschichten',worldTag3:'Gespräche',
  helpLabel:'HILFE & RESSOURCEN',helpTitle:'Alles in Reichweite.',helpBody:'Finde Hilfe und klare Antworten.',
  support:'KI-Support · Ohne Anmeldung',terms:'Nutzungsbedingungen',privacy:'Datenschutz',rules:'Community-Regeln',
  endingLabel:'DEIN NÄCHSTES KAPITEL',endingTitle:'Der nächste Moment gehört dir.',endingBody:'Sei du selbst. Jede Verbindung zählt.',
  footerBody:'Eine unabhängige Community für echte Verbindungen.',motion:'Animationen reduzieren',motionDesc:'Bewegungen und Animationen minimieren',
  compact:'Kompakte Ansicht',compactDesc:'Abstände zwischen Bereichen verringern',quickLinks:'Starflow entdecken',signIn:'Anmelden / Registrieren'
};
const fr:Copy={
  navExplore:'Découvrir',navWorld:'Notre univers',navHelp:'Assistance',more:'Plus',enter:'Rejoindre Starflow',scroll:'Faire défiler pour découvrir',
  stageLabel:'UN NOUVEL ESPACE POUR SE RETROUVER',previewHeadline:'Un instant à partager',previewBody:'Votre prochaine conversation commence par une idée.',previewTime:'À l’instant',
  sectionEyebrow:'L’EXPÉRIENCE',sectionTitle:'Au-delà du fil d’actualité.',sectionSubtitle:'Découvrez ce qui compte, à votre rythme.',
  tabShare:'Partager',tabExplore:'Découvrir',tabSafe:'Échanger',
  cardShare:'Donnez vie à vos idées.',cardShareBody:'Partagez une pensée, une photo ou un nouveau point de vue. Chaque histoire a un début.',
  cardExplore:'Des rencontres inattendues.',cardExploreBody:'Suivez les conversations et découvrez de nouvelles voix.',
  cardSafe:'Un espace bienveillant.',cardSafeBody:'Des échanges respectueux et des règles claires pour chacun.',
  worldLabel:'EXPLOREZ L’UNIVERS',worldTitle:'Votre monde reste en mouvement.',worldBody:'Des idées passagères aux liens durables. Une expérience fluide et vivante.',
  worldTag1:'Idées',worldTag2:'Histoires',worldTag3:'Conversations',
  helpLabel:'AIDE & RESSOURCES',helpTitle:'Tout à portée de main.',helpBody:'Accédez facilement à l’assistance et aux informations.',
  support:'Assistance IA · Sans connexion',terms:'Conditions d’utilisation',privacy:'Confidentialité',rules:'Règles de la communauté',
  endingLabel:'VOTRE PROCHAIN CHAPITRE',endingTitle:'Le prochain instant est à vous.',endingBody:'Soyez vous-même. Chaque lien compte.',
  footerBody:'Une communauté indépendante pour des liens authentiques.',motion:'Réduire les animations',motionDesc:'Limiter les mouvements et effets animés',
  compact:'Affichage compact',compactDesc:'Réduire les espacements entre les sections',quickLinks:'Explorer Starflow',signIn:'Connexion / Inscription'
};
const localeCopy:Record<string,Copy>={zh,'zh-hk':zhHK,en,'en-sg':en,'en-gb':en,ja,ko,de,fr};

/** Shared Starflow wave mark, matching the signed-in brand rather than a generic sparkle. */
function StarflowMark({size=44}:{size?:number}){
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <rect x="1" y="1" width="46" height="46" rx="14" fill="#171534"/>
    <path d="M10 27.5C17 28 18 13 26 15.5C32 17.5 29 28 37 20" stroke="#F7E9FF" strokeWidth="4" strokeLinecap="round"/>
    <path d="M8 34L17 31.5" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" opacity=".75"/>
    <circle cx="35.8" cy="31.5" r="3.6" fill="#B9ACFF"/>
    <path d="M33.5 9L35 12.5L38.5 14L35 15.5L33.5 19L32 15.5L28.5 14L32 12.5L33.5 9Z" fill="#FFFFFF" opacity=".93"/>
  </svg>;
}

const experiences=[
  {key:'share' as const,Icon:MessageCircle},
  {key:'explore' as const,Icon:Compass},
  {key:'safe' as const,Icon:ShieldCheck}
];
export function StarflowLandingExperience({onJoin}:{onJoin:()=>void}){
  const {lang}=useLanguage();
  const locale=lang.toLowerCase();
  const localeKey=locale.startsWith('ja')?'ja':locale.startsWith('ko')?'ko':locale.startsWith('de')?'de':locale.startsWith('fr')?'fr':locale;
  const c=localeCopy[localeKey]??en;
  const [more,setMore]=useState(false);
  const [active,setActive]=useState(0);
  const [reduced,setReduced]=useState(false);
  const [compact,setCompact]=useState(false);
  const [ready,setReady]=useState(false);
  const [intro,setIntro]=useState(false);
  const [introComplete,setIntroComplete]=useState(false);
  const container=useRef<HTMLDivElement>(null);
  const menu=useRef<HTMLDivElement>(null);
  const systemReduced=useRef(false);

  useEffect(()=>{
    try{
      systemReduced.current=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setReduced(systemReduced.current||localStorage.getItem('sf-landing-reduced-motion')==='true');
      setCompact(localStorage.getItem('sf-landing-compact')==='true');
      if(!systemReduced.current&&!sessionStorage.getItem('sf-landing-intro-shown')){
        sessionStorage.setItem('sf-landing-intro-shown','1');
        setIntro(true);
      }else setIntroComplete(true);
    }catch{setIntroComplete(true)}
    setReady(true);
  },[]);
  useEffect(()=>{
    if(!intro)return;
    if(reduced){setIntro(false);setIntroComplete(true);return}
    const id=window.setTimeout(()=>{setIntro(false);setIntroComplete(true)},1700);
    return()=>window.clearTimeout(id);
  },[intro,reduced]);
  useEffect(()=>{
    if(!ready||reduced||!container.current)return;
    const items=container.current.querySelectorAll<HTMLElement>('.sf-cinema-reveal');
    if(!('IntersectionObserver' in window)){items.forEach(item=>item.classList.add('sf-cinema-seen'));return}
    const observer=new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('sf-cinema-seen');observer.unobserve(entry.target)}})
    },{threshold:0.11,rootMargin:'0px 0px -5% 0px'});
    items.forEach(item=>observer.observe(item));
    return()=>observer.disconnect();
  },[ready,reduced,active]);
  useEffect(()=>{
    if(!more)return;
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!menu.current?.contains(event.target))setMore(false)};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMore(false)};
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
  },[more]);
  const changeReduced=(value:boolean)=>{
    setReduced(value);
    try{localStorage.setItem('sf-landing-reduced-motion',String(value))}catch{}
  };
  const changeCompact=(value:boolean)=>{
    setCompact(value);
    try{localStorage.setItem('sf-landing-compact',String(value))}catch{}
  };
  const item=experiences[active];
  const detailTitle=active===0?c.cardShare:active===1?c.cardExplore:c.cardSafe;
  const detailBody=active===0?c.cardShareBody:active===1?c.cardExploreBody:c.cardSafeBody;
  return <div ref={container} className={`sf-cinema ${ready&&!reduced?'sf-cinema-motion':''} ${reduced?'sf-cinema-reduced':''} ${compact?'sf-cinema-compact':''}`}>
    {intro&&!introComplete&&<div className="sf-cinema-intro" role="status" aria-label="Starflow">
      <div className="sf-cinema-intro-mark"><img src="/starflow-official-mark.webp" width="84" height="84" alt=""/></div><b>starflow<span>.</span></b>
      <button type="button" onClick={()=>{setIntro(false);setIntroComplete(true)}} aria-label="Skip introduction"><X size={17}/></button>
    </div>}
    <div className="sf-cinema-space" aria-hidden="true"/>
    <header className="sf-cinema-header">
      <Link className="sf-cinema-brand" href="/" aria-label="Starflow home"><span aria-hidden="true"><img src="/starflow-official-mark.webp" width="44" height="44" alt=""/></span>starflow<span className="sf-cinema-dot">.</span></Link>
      <nav className="sf-cinema-mainnav" aria-label="Starflow">
        <a href="#sf-cinema-experience">{c.navExplore}</a>
        <a href="#sf-cinema-world">{c.navWorld}</a>
        <a href="#sf-cinema-resources">{c.navHelp}</a>
      </nav>
      <div className="sf-cinema-actions">
        <LanguageSwitch/>
        <div className="sf-cinema-menu-anchor" ref={menu}>
          <button type="button" className="sf-cinema-more" aria-label={c.more} aria-haspopup="menu" aria-expanded={more} onClick={()=>setMore(value=>!value)}>
            <Menu size={20}/><span>{c.more}</span><ChevronDown size={14}/>
          </button>
          {more&&<div className="sf-cinema-popover" role="menu" aria-label={c.more}>
            <div className="sf-cinema-popover-label">{c.quickLinks}</div>
            <a role="menuitem" href="#sf-cinema-experience" onClick={()=>setMore(false)}><Compass size={17}/>{c.navExplore}</a>
            <Link role="menuitem" href="/support" onClick={()=>setMore(false)}><MessageCircle size={17}/>{c.support}</Link>
            <Link role="menuitem" href="/terms" onClick={()=>setMore(false)}><BookOpen size={17}/>{c.terms}</Link>
            <Link role="menuitem" href="/privacy" onClick={()=>setMore(false)}><LockKeyhole size={17}/>{c.privacy}</Link>
            <div className="sf-cinema-popover-label"><Settings2 size={15}/> {lang==='zh'?'显示偏好':lang==='zh-HK'?'顯示偏好':lang==='ja-JP'?'表示設定':lang==='ko-KR'?'화면 설정':lang==='de-DE'?'Anzeige':lang==='fr-FR'?'Affichage':'Display preferences'}</div>
            <label className="sf-cinema-toggle"><span><strong>{c.motion}</strong><small>{c.motionDesc}</small></span><input type="checkbox" checked={reduced} onChange={e=>changeReduced(e.target.checked)}/></label>
            <label className="sf-cinema-toggle"><span><strong>{c.compact}</strong><small>{c.compactDesc}</small></span><input type="checkbox" checked={compact} onChange={e=>changeCompact(e.target.checked)}/></label>
          </div>}
        </div>
        <button type="button" className="sf-cinema-join sf-cinema-navjoin" onClick={onJoin}>{c.enter}<ArrowRight size={16}/></button>
      </div>
    </header>

    <main>
      <section className="sf-cinema-hero" aria-labelledby="sf-cinema-title">
        <div className="sf-cinema-hero-copy">
          <div className="sf-cinema-kicker"><i/>{c.stageLabel}</div>
          <h1 id="sf-cinema-title">{siteText(lang,'homeTitle1')}<span>{siteText(lang,'homeTitle2')}</span></h1>
          <p>{siteText(lang,'homeIntro')}</p>
          <div className="sf-cinema-hero-buttons">
            <button type="button" className="sf-cinema-join" onClick={onJoin}>{c.enter}<ArrowRight size={18}/></button>
            <a className="sf-cinema-outline" href="#sf-cinema-experience"><Play size={17} fill="currentColor"/>{siteText(lang,'learn')}</a>
          </div>
          <a className="sf-cinema-scroll" href="#sf-cinema-experience"><span><ArrowDown size={18}/></span>{c.scroll}</a>
        </div>
        <div className="sf-cinema-universe" aria-hidden="true">
          <div className="sf-cinema-nebula"/>
          <div className="sf-cinema-orbit sf-cinema-orbit-one"/>
          <div className="sf-cinema-orbit sf-cinema-orbit-two"/>
          <div className="sf-cinema-orbit sf-cinema-orbit-three"/>
          <div className="sf-cinema-core"><span>✦</span></div>
          <div className="sf-cinema-float sf-cinema-float-top"><Sparkles size={19}/><span>{c.worldTag1}<strong>STARFLOW / 01</strong></span></div>
          <div className="sf-cinema-float sf-cinema-float-bottom"><Heart size={18}/><span>{c.previewHeadline}<strong>{c.previewTime}</strong></span></div>
        </div>
      </section>

      <section id="sf-cinema-experience" className="sf-cinema-section sf-cinema-experience">
        <div className="sf-cinema-section-heading sf-cinema-reveal">
          <div className="sf-cinema-label"><span/> {c.sectionEyebrow}</div>
          <h2>{c.sectionTitle}</h2><p>{c.sectionSubtitle}</p>
        </div>
        <div className="sf-cinema-experience-grid">
          <div className="sf-cinema-tabs sf-cinema-reveal" role="tablist" aria-label={c.sectionEyebrow}>
            {experiences.map((tab,index)=>{
              const Icon=tab.Icon;
              const title=index===0?c.tabShare:index===1?c.tabExplore:c.tabSafe;
              return <button key={tab.key} role="tab" type="button" aria-selected={active===index} aria-controls="sf-cinema-feature-panel" id={`sf-cinema-tab-${index}`}
                className={active===index?'sf-cinema-tab-selected':''} onClick={()=>setActive(index)}><Icon size={23}/><span>{title}</span><ArrowRight size={18}/></button>
            })}
          </div>
          <div className="sf-cinema-demo sf-cinema-reveal" role="tabpanel" id="sf-cinema-feature-panel" aria-labelledby={`sf-cinema-tab-${active}`} key={active}>
            <div className="sf-cinema-demo-top"><span>✦ starflow.</span><span>● ● ●</span></div>
            <div className="sf-cinema-demo-avatar">✦</div>
            <div className="sf-cinema-demo-label">{active===0?c.tabShare:active===1?c.tabExplore:c.tabSafe} / 0{active+1}</div>
            <h3>{detailTitle}</h3><p>{detailBody}</p>
            <div className="sf-cinema-demo-card"><span className="sf-cinema-demo-mini">✧</span><div><strong>{c.previewHeadline}</strong><small>{c.previewBody}</small></div><Heart size={19}/></div>
            <div className="sf-cinema-demo-line"><i/><i/><i/></div>
          </div>
        </div>
      </section>

      <section id="sf-cinema-world" className="sf-cinema-section sf-cinema-world">
        <div className="sf-cinema-world-art sf-cinema-reveal" aria-hidden="true"><div className="sf-cinema-world-planet"><span>✦</span></div><span className="sf-cinema-star star-a">✧</span><span className="sf-cinema-star star-b">✦</span><span className="sf-cinema-star star-c">✧</span></div>
        <div className="sf-cinema-world-copy sf-cinema-reveal">
          <div className="sf-cinema-label"><span/>{c.worldLabel}</div>
          <h2>{c.worldTitle}</h2><p>{c.worldBody}</p>
          <div className="sf-cinema-tags"><span>{c.worldTag1}</span><span>{c.worldTag2}</span><span>{c.worldTag3}</span></div>
          <button type="button" className="sf-cinema-outline" onClick={onJoin}>{c.enter}<ArrowRight size={16}/></button>
        </div>
      </section>

      <section id="sf-cinema-resources" className="sf-cinema-section sf-cinema-resources">
        <div className="sf-cinema-section-heading sf-cinema-reveal"><div className="sf-cinema-label"><span/>{c.helpLabel}</div><h2>{c.helpTitle}</h2><p>{c.helpBody}</p></div>
        <div className="sf-cinema-resource-grid sf-cinema-reveal">
          <Link href="/support"><span><MessageCircle size={24}/></span><strong>{c.support}</strong><ArrowRight size={19}/></Link>
          <Link href="/terms"><span><BookOpen size={24}/></span><strong>{c.terms}</strong><ArrowRight size={19}/></Link>
          <Link href="/privacy"><span><LockKeyhole size={24}/></span><strong>{c.privacy}</strong><ArrowRight size={19}/></Link>
          <Link href="/guidelines"><span><ShieldCheck size={24}/></span><strong>{c.rules}</strong><ArrowRight size={19}/></Link>
        </div>
      </section>

      <section className="sf-cinema-ending"><div className="sf-cinema-reveal">
        <div className="sf-cinema-label"><span/>{c.endingLabel}</div><h2>{c.endingTitle}</h2><p>{c.endingBody}</p>
        <button type="button" className="sf-cinema-join" onClick={onJoin}>{c.enter}<ArrowRight size={19}/></button>
      </div></section>
    </main>
    <footer className="sf-cinema-footer"><strong>✦ starflow<span>.</span></strong><span>{c.footerBody}</span><small>© 2026 Starflow · WEIZAI</small></footer>
  </div>;
}
