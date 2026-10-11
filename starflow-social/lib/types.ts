import {LANGUAGE_OPTIONS} from './i18n';
import type {Lang} from './i18n';

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
export const ago = (iso: string, lang:Lang='zh'):string => {
  const elapsed=Math.max(0,Date.now()-new Date(iso).getTime());
  const selected=LANGUAGE_OPTIONS.find(item=>item.code===lang);
  const locale=selected?.htmlLang??'zh-CN';
  const isEn=lang==='en'||lang==='en-GB'||lang==='en-SG';
  const isZh=lang==='zh'||lang==='zh-HK';
  if(elapsed<60000){
    return isEn?'now':lang==='zh'?'刚刚':lang==='zh-HK'?'剛剛':new Intl.RelativeTimeFormat(locale,{numeric:'auto'}).format(0,'second');
  }
  const unit=elapsed<3600000?'minute':'hour';
  const value=Math.floor(elapsed/(unit==='minute'?60000:3600000));
  if(elapsed<86400000){
    if(isEn)return value+(unit==='minute'?'m':'h');
    if(isZh)return value+(unit==='minute'?(lang==='zh-HK'?' 分鐘':' 分钟'):(lang==='zh-HK'?' 小時':' 小时'));
    return new Intl.RelativeTimeFormat(locale,{numeric:'auto',style:'short'}).format(-value,unit);
  }
  return new Date(iso).toLocaleDateString(locale,{month:'short',day:'numeric'});
};
