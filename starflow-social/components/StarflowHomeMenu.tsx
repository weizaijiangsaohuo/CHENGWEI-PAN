'use client';
import {useRef} from 'react';
import Link from 'next/link';
import {Bell,Bookmark,ChevronRight,Compass,FileText,Home,Menu,MessageCircle,PenLine,Settings,ShieldCheck,Sparkles,UserRound,Users,BookOpen,X} from 'lucide-react';
import {Brand} from './Brand';

export function StarflowHomeMenu(){
 const dialog=useRef<HTMLDialogElement>(null);
 const show=()=>{if(!dialog.current?.open)dialog.current?.showModal()};
 const close=()=>dialog.current?.close();
 const groups=[
  {heading:'探索社区',items:[
   {to:'/',label:'首页发现',icon:Home},
   {to:'/explore',label:'AI 搜索与探索',icon:Compass},
   {to:'/hub',label:'社区与关注列表',icon:Users},
   {to:'/notifications',label:'消息通知',icon:Bell},
  ]},
  {heading:'互动与创作',items:[
   {to:'/?compose=1',label:'发布新动态',icon:PenLine},
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
   {to:'/organization/affiliates',label:'组织附属账号',icon:Users},
  ]},
  {heading:'规则与帮助',items:[
   {to:'/guidelines',label:'社区公约',icon:BookOpen},
   {to:'/privacy',label:'隐私与数据',icon:ShieldCheck},
   {to:'/terms',label:'服务条款',icon:FileText},
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
    <nav className="sf-home-drawer-links" aria-label="星流功能入口">
     {groups.map(group=><section className="sf-home-drawer-group" key={group.heading}>
       <h2>{group.heading}</h2>
       {group.items.map(({to,label,icon:Icon})=><Link key={to} href={to} onClick={close}>
        <Icon size={19}/><span>{label}</span><ChevronRight size={16}/></Link>)}
     </section>)}
    </nav>
    <p className="sf-home-drawer-note">星流 STARFLOW · 发掘精彩，连接彼此</p>
  </dialog>
 </>;
}
