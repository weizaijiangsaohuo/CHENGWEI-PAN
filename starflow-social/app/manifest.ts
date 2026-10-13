import type {MetadataRoute} from 'next';
// PWA shell metadata only. Private pages and account content are never cached here.
// Web Push requires a separately secured subscription + notification delivery service.
export default function manifest():MetadataRoute.Manifest{
 return {
  name:'星流 Starflow',short_name:'星流',description:'分享此刻，连接彼此',
  lang:'zh-CN',start_url:'/',scope:'/',display:'standalone',
  background_color:'#f8f5ff',theme_color:'#6842bc',
  icons:[{src:'/starflow-mail-logo.png',type:'image/png',purpose:'any'}],
  shortcuts:[
   {name:'探索话题',url:'/trending'},
   {name:'草稿与定时发布',url:'/drafts'},
   {name:'通知中心',url:'/notifications'},
  ]
 };
}
