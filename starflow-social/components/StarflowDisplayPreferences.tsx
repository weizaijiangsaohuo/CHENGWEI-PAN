'use client';
import {useEffect,useState} from 'react';
import {MonitorSmartphone,MoveHorizontal} from 'lucide-react';
import './StarflowDisplayPreferences.css';

const REDUCE_KEY='sf-user-reduce-motion';
const COMPACT_KEY='sf-user-compact-layout';
const THEME_KEY='sf2-theme';
type Appearance='system'|'light'|'dark';
function applyTheme(value:Appearance){
 const resolved=value==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):value;
 document.documentElement.setAttribute('data-sf2-theme',resolved);
}
const clsMotion='sf-user-motion-off';
const clsCompact='sf-user-compact';
function applySettings(){
  try{
    document.documentElement.classList.toggle(clsMotion,localStorage.getItem(REDUCE_KEY)==='true');
    document.documentElement.classList.toggle(clsCompact,localStorage.getItem(COMPACT_KEY)==='true');
    const stored=localStorage.getItem(THEME_KEY);
    applyTheme(stored==='light'||stored==='dark'?stored:'system');
  }catch{applyTheme('system');/* Browser storage may be blocked. */}
}
// Hydrate browser-only presentation settings on every fresh page load.
export function StarflowExperienceBootstrap(){
  useEffect(()=>{
    applySettings();
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const onSystem=()=>{try{if(!localStorage.getItem(THEME_KEY)||localStorage.getItem(THEME_KEY)==='system')applyTheme('system');}catch{applyTheme('system')}};
    media.addEventListener?.('change',onSystem);
    return()=>media.removeEventListener?.('change',onSystem);
  },[]);
  return null;
}
export function StarflowDisplayPreferences(){
  const [reduced,setReduced]=useState(false);
  const [compact,setCompact]=useState(false);
  const [appearance,setAppearance]=useState<Appearance>('system');
  useEffect(()=>{
    try{
      setReduced(localStorage.getItem(REDUCE_KEY)==='true');
      setCompact(localStorage.getItem(COMPACT_KEY)==='true');
      const saved=localStorage.getItem(THEME_KEY);
      setAppearance(saved==='light'||saved==='dark'?saved:'system');
    }catch{/* Storage denied; defaults continue. */}
    applySettings();
  },[]);
  const update=(key:string,value:boolean,apply:(value:boolean)=>void)=>{
    apply(value);
    try{localStorage.setItem(key,String(value));}catch{/* Site continues without saving. */}
    document.documentElement.classList.toggle(key===REDUCE_KEY?clsMotion:clsCompact,value);
  };
  const updateTheme=(value:Appearance)=>{
    setAppearance(value);applyTheme(value);
    try{localStorage.setItem(THEME_KEY,value);}catch{/* Theme still changes for this visit. */}
  };
  return <section className="sf-display-options" aria-label="外观与动效偏好">
   <header><h3>外观与动效</h3><p>这里的偏好只改变你当前设备的显示，不会修改账号或隐私权限。</p></header>
   <label className="sf-display-item sf2-theme-preference">
    <span className="sf-display-item-icon"><MonitorSmartphone size={20}/></span>
    <span><strong>界面主题</strong><small>跟随系统或选择浅色、深色外观</small></span>
    <select aria-label="界面主题" value={appearance} onChange={event=>updateTheme(event.target.value as Appearance)}>
      <option value="system">跟随系统</option>
      <option value="light">浅色模式</option>
      <option value="dark">深色模式</option>
    </select>
   </label>
   <label className="sf-display-item">
    <span className="sf-display-item-icon"><MoveHorizontal size={20}/></span>
    <span><strong>减少界面动画</strong><small>关闭星流入场、跳动和卡片过渡动画</small></span>
    <input type="checkbox" role="switch" checked={reduced}
      onChange={e=>update(REDUCE_KEY,e.target.checked,setReduced)}
      aria-label="减少界面动画"/>
   </label>
   <label className="sf-display-item">
    <span className="sf-display-item-icon"><MonitorSmartphone size={20}/></span>
    <span><strong>紧凑布局</strong><small>缩短服务项目间距，更方便快速浏览</small></span>
    <input type="checkbox" role="switch" checked={compact}
      onChange={e=>update(COMPACT_KEY,e.target.checked,setCompact)}
      aria-label="紧凑布局"/>
   </label>
  </section>;
}
