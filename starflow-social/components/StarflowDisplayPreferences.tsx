'use client';
import {useEffect,useState} from 'react';
import {MonitorSmartphone,MoveHorizontal} from 'lucide-react';
import './StarflowDisplayPreferences.css';

const REDUCE_KEY='sf-user-reduce-motion';
const COMPACT_KEY='sf-user-compact-layout';
const clsMotion='sf-user-motion-off';
const clsCompact='sf-user-compact';
function applySettings(){
  try{
    document.documentElement.classList.toggle(clsMotion,localStorage.getItem(REDUCE_KEY)==='true');
    document.documentElement.classList.toggle(clsCompact,localStorage.getItem(COMPACT_KEY)==='true');
  }catch{/* Private browsing may block localStorage; settings remain optional. */}
}
// Hydrate browser-only presentation settings on every fresh page load.
export function StarflowExperienceBootstrap(){
  useEffect(()=>{applySettings()},[]);
  return null;
}
export function StarflowDisplayPreferences(){
  const [reduced,setReduced]=useState(false);
  const [compact,setCompact]=useState(false);
  useEffect(()=>{
    try{
      setReduced(localStorage.getItem(REDUCE_KEY)==='true');
      setCompact(localStorage.getItem(COMPACT_KEY)==='true');
    }catch{/* Storage denied; defaults continue. */}
    applySettings();
  },[]);
  const update=(key:string,value:boolean,apply:(value:boolean)=>void)=>{
    apply(value);
    try{localStorage.setItem(key,String(value));}catch{/* Site continues without saving. */}
    document.documentElement.classList.toggle(key===REDUCE_KEY?clsMotion:clsCompact,value);
  };
  return <section className="sf-display-options" aria-label="外观与动效偏好">
   <header><h3>外观与动效</h3><p>这里的偏好只改变你当前设备的显示，不会修改账号或隐私权限。</p></header>
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
