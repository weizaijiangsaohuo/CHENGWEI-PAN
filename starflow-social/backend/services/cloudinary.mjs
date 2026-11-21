import {createHash} from 'node:crypto';
// Server-side form preparation only. Never issue the signature or API secret to a browser.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const matches=(b,a)=>a.every((n,i)=>b[i]===n);
export function inspectImage(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<16||bytes.length>2*1024*1024)throw Error('Image size rejected');
 if(matches(bytes,[255,216,255]))return 'jpeg';
 if(matches(bytes,[137,80,78,71,13,10,26,10]))return 'png';
 if(matches(bytes,[82,73,70,70])&&matches(bytes.slice(8),[87,69,66,80]))return 'webp';
 throw Error('Unsupported media');
}
export function prepareAuthenticatedImage({cloud,apiKey,apiSecret,assetId,bytes,now=Math.floor(Date.now()/1000)}){
 if(!/^[a-z0-9_-]{1,80}$/i.test(cloud)||!/^\d{5,30}$/.test(apiKey)||typeof apiSecret!=='string'||!apiSecret||!uuid.test(assetId)||!Number.isSafeInteger(now)||now<=0)throw Error('Invalid media configuration');
 const format=inspectImage(bytes);
 // Initial image signature sniff is not a full decoder. Actual route must decode/re-encode and strip EXIF before this.
 const fields={overwrite:'false',public_id:'starflow-v2/'+assetId,timestamp:String(now),type:'authenticated'};
 const signature=createHash('sha256').update(Object.entries(fields).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('&')+apiSecret).digest('hex');
 const form=new FormData();
 for(const [k,v] of Object.entries(fields))form.set(k,v);
 form.set('api_key',apiKey);form.set('signature',signature);
 form.set('file',new Blob([bytes],{type:'image/'+format}),assetId+'.'+format);
 return {url:'https://api.cloudinary.com/v1_1/'+cloud+'/image/upload',options:{method:'POST',redirect:'error',body:form}};
}
