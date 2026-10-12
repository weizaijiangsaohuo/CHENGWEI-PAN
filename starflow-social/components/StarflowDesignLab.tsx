'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,BadgeCheck,Bell,Compass,Home,MessageCircle,Settings,Shield,Smartphone,UserRound} from 'lucide-react';
import {GlassButton,GlassSegmentedControl,GlassSurface} from './StarflowGlass';

type Theme='light'|'dark'|'system';
const paths=[
 {label:'首页 · 推荐 / 关注',url:'/',icon:Home},
 {label:'搜索与发现',url:'/explore',icon:Compass},
 {label:'公开个人主页 · @wei',url:'/profile/wei',icon:UserRound},
 {label:'私信与语音',url:'/messages',icon:MessageCircle},
 {label:'通知中心',url:'/notifications',icon:Bell},
 {label:'认证中心',url:'/verification',icon:BadgeCheck},
 {label:'账号与外观',url:'/settings',icon:Settings},
 {label:'超级管理后台',url:'/admin/console',icon:Shield}
];
export function StarflowDesignLab(){
 const [theme,setTheme]=useState<Theme>('system');
 const [sample,setSample]=useState<'default'|'active'|'disabled'>('default');
 useEffect(()=>{try{const v=localStorage.getItem('sf2-theme');setTheme(v==='dark'||v==='light'?v:'system')}catch{}},[]);
 function changeTheme(next:Theme){
  setTheme(next);
  const dark=next==='system'?window.matchMedia('(prefers-color-scheme:dark)').matches:next==='dark';
  document.documentElement.setAttribute('data-sf2-theme',dark?'dark':'light');
  try{localStorage.setItem('sf2-theme',next)}catch{}
 }
 return <main className="sf2-lab">
  <header className="sf2-lab-header"><Link href="/" aria-label="返回星流首页"><ArrowLeft size={19}/>返回星流</Link><b>STARFLOW / DESIGN SYSTEM</b><span>2.0</span></header>
  <GlassSurface level="overlay" className="sf2-lab-hero">
   <span className="sf2-lab-eyebrow">NEBULA GLASS · LIVE COMPONENTS</span>
   <h1>设计系统与交互验收</h1>
   <p>这里的主题按钮能够真实切换网站主题，页面链接直接指向星流已实现的功能。以下控制演示不会伪造用户、帖子或后台数据。</p>
   <div className="sf2-lab-controls">
    <GlassSegmentedControl<Theme> label="切换界面主题" value={theme} onChange={changeTheme}
      options={[{value:'system',label:'自动'},{value:'light',label:'浅色'},{value:'dark',label:'深色'}]}/>
   </div>
  </GlassSurface>
  <section className="sf2-lab-section sf2-lab-handoff">
   <h2>设计交付与实际网页</h2>
   <p>Figma 中的页面是可编辑的原型，下面的站内链接连接真实业务。设计交付和生产功能使用不同的验收标准。</p>
   <a href="https://www.figma.com/design/I4LzIPERJmtZtQMORfietK" target="_blank" rel="noopener noreferrer" className="sf2-lab-figma-link">打开 Starflow 2.0 Figma 设计文件 ↗</a>
  </section>
  <section className="sf2-lab-section">
   <h2>全站模块 · 真实操作入口</h2>
   <div className="sf2-lab-grid">
    {paths.map(item=>{const Icon=item.icon;return <Link href={item.url} key={item.label} className="sf2-lab-route"><Icon size={21}/><span>{item.label}</span><span aria-hidden>↗</span></Link>})}
   </div>
  </section>
  <section className="sf2-lab-section">
   <h2>控件状态与无障碍</h2>
   <p>实时演示按钮、状态、聚焦边框及减少动画的系统降级。材质仅用于工具层。</p>
   <GlassSegmentedControl label="玻璃按钮状态" value={sample} onChange={setSample} options={[
    {value:'default',label:'常规'},{value:'active',label:'已选择'},{value:'disabled',label:'禁用'}
   ]}/>
   <GlassSurface level="panel" className="sf2-lab-demo">
    <GlassButton type="button" disabled={sample==='disabled'} aria-pressed={sample==='active'}
     onClick={()=>setSample(p=>p==='active'?'default':'active')}>
      {sample==='disabled'?'当前不可操作':sample==='active'?'点击取消选中':'点击选中状态'}
    </GlassButton>
    <p>真实状态：{sample==='disabled'?'禁用':sample==='active'?'选中':'常规'}</p>
   </GlassSurface>
  </section>
  <section className="sf2-lab-section"><h2>交互与性能约束</h2><p><Smartphone size={17} style={{display:'inline-block',verticalAlign:'middle'}}/> 移动导航带跟随页面的玻璃选中层。大面积内容保持实体背景。目标移动端 60fps，需实机测量；减少动画、降低透明度与增强对比度优先于光学效果。</p></section>
  <footer><Link href="/settings">前往账号设置修改永久显示偏好 →</Link></footer>
 </main>;
}
