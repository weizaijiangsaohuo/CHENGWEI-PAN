export type Profile = {
  id: string; handle: string; display_name: string; bio: string; avatar_url: string | null;
  created_at: string;
};
export type Post = {
  id: string; author_id: string; content: string; image_url: string | null; video_url: string | null; has_poll: boolean; has_gallery: boolean; parent_id: string | null;
  created_at: string; profiles?: Profile | Profile[] | null;
};
export type Notif = {
  id: string; recipient_id: string; actor_id: string; kind: string; post_id: string | null;
  read_at: string | null; created_at: string; profiles?: Profile | Profile[] | null;
};
export const unwrap = (val?: Profile | Profile[] | null): Profile | null => Array.isArray(val) ? (val[0] ?? null) : (val ?? null);
import type { Lang } from './i18n';
const langTag:Record<Lang,string> = {zh:'zh-CN',en:'en-US','zh-hk':'zh-HK',ko:'ko-KR',ja:'ja-JP','en-sg':'en-SG','en-gb':'en-GB',de:'de-DE',fr:'fr-FR'};
export const ago = (iso:string,lang:Lang='zh')=>{
  const elapsed=Math.max(0,Date.now()-new Date(iso).getTime());
  const locale=langTag[lang]??'en-US';
  if(elapsed>=86400000)return new Date(iso).toLocaleDateString(locale,{month:'short',day:'numeric'});
  const relative=new Intl.RelativeTimeFormat(locale,{numeric:'auto',style:'short'});
  if(elapsed<60000)return relative.format(0,'second');
  if(elapsed<3600000)return relative.format(-Math.floor(elapsed/60000),'minute');
  return relative.format(-Math.floor(elapsed/3600000),'hour');
};
