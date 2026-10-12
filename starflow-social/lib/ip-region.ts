// Coarse IP region only: CN province, other destinations country/area.
// Raw IP, GPS, city and latitude/longitude must never reach this module.
export const CN_PROVINCES:Record<string,string>={
 AH:'安徽',BJ:'北京',CQ:'重庆',FJ:'福建',GD:'广东',GS:'甘肃',
 GX:'广西',GZ:'贵州',HA:'河南',HB:'湖北',HE:'河北',HI:'海南',
 HL:'黑龙江',HN:'湖南',JL:'吉林',JS:'江苏',JX:'江西',LN:'辽宁',
 NM:'内蒙古',NX:'宁夏',QH:'青海',SC:'四川',SD:'山东',SH:'上海',
 SN:'陕西',SX:'山西',TJ:'天津',XJ:'新疆',XZ:'西藏',YN:'云南',ZJ:'浙江'
};
export type CoarseRegion={
 country_code:string|null; subdivision_code:string|null;
 source:'auto'|'reviewed';updated_at:string|null
};
export function sanitizeCountry(input:unknown):string|null{
 const c=typeof input==='string'?input.trim().toUpperCase():'';
 return /^[A-Z]{2}$/.test(c)&&!['XX','ZZ','T1'].includes(c)?c:null;
}
export function sanitizeSubdivision(country:string|null, input:unknown):string|null{
 if(country!=='CN'||typeof input!=='string')return null;
 const raw=input.trim().toUpperCase().replace(/^CN-/,'');
 return Object.prototype.hasOwnProperty.call(CN_PROVINCES,raw)?raw:null;
}
export function coarseRegionName(country:string|null|undefined,subdivision:string|null|undefined):string{
 const c=sanitizeCountry(country);
 if(!c)return '未知';
 if(c==='CN')return subdivision&&CN_PROVINCES[subdivision]?
  CN_PROVINCES[subdivision]:'中国（省份未知）';
 try{return new Intl.DisplayNames(['zh-CN'],{type:'region'}).of(c)||c;}
 catch{return c;}
}
