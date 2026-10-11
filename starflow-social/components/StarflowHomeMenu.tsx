'use client';
import {useRef} from 'react';
import Link from 'next/link';
import {Bell,Bookmark,ChevronRight,Compass,Home,Menu,MessageCircle,Settings,ShieldCheck,Sparkles,UserRound,X} from 'lucide-react';
import {Brand} from './Brand';

type Layout='masonry'|'classic';

export function StarflowHomeMenu({layout,onLayoutChange}:{layout:Layout;onLayoutChange:(layout:Layout)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const show=()=>{if(!dialog.current?.open)dialog.current?.showModal()};
 const close=()=>dialog.current?.close();
 const groups=[
  {heading:'探索社区',items:[
   {to:'/',label:'首页发现',icon:Home},
   {to:'/explore',label:'AI 搜索与探索',icon:Compass},
   {to:'/hub',label:'社区与关注列表',icon:UserRound},
  ]},
  {heading:'互动与创作',items:[
   {to:'/creator',label:'创作者中心',icon:Sparkles},
   {to:'/bookmarks',label:'我的收藏',icon:Bookmark},
   {to:'/notifications',label:'通知中心',icon:Bell},
   {to:'/messages',label:'私信消息',icon:MessageCircle},
  ]},
  {heading:'账户服务',items:[
   {to:'/verification',label:'账号认证中心',icon:ShieldCheck},
   {to:'/settings',label:'账号设置',icon:Settings},
   {to:'/settings/security',label:'账户安全管理中心',icon:UserRound},
   {to:'/support',label:'星流 AI 客服',icon:Sparkles},
  ]},
 ];
 return <>
  <button type="button" className="sf-home-menu-trigger" aria-label="打开首页菜单"
    aria-haspopup="dialog" onClick={show}><Menu size={21}/></button>
  <dialog ref={dialog} className="sf-home-drawer" aria-label="星流首页功能菜单"
    onClick={event=>{if(event.target===event.currentTarget)close();}}>
    <header className="sf-home-drawer-head"><Brand/>
      <button type="button" aria-label="关闭菜单" onClick={close}><X size={20}/></button>
    </header>
    <div className="sf-home-drawer-mode"><strong>浏览模式</strong><p>选择你更喜欢的星流首页排版</p>
      <div role="group" aria-label="首页显示方式">
       <button type="button" aria-pressed={layout==='masonry'}
        onClick={()=>{onLayoutChange('masonry');close();}}>发现卡片</button>
       <button type="button" aria-pressed={layout==='classic'}
        onClick={()=>{onLayoutChange('classic');close();}}>经典动态</button>
      </div>
    </div>
    <nav className="sf-home-drawer-links" aria-label="星流功能入口">
     {groups.map(group=><section className="sf-home-drawer-group" key={group.heading}>
       <h2>{group.heading}</h2>
       {group.items.map(({to,label,icon:Icon})=><Link key={to} href={to} onClick={close}>
        <Icon size={19}/><span>{label}</span><ChevronRight size={16}/></Link>)}
     </section>)}
    </nav>
    <p className="sf-home-drawer-note">星流 STARFLOW · 你的探索空间</p>
  </dialog>
 </>;
}
