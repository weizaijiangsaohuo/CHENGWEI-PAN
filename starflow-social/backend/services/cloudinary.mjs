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

// Internal, dependency-injected laboratory dispatcher. No live transport or public route.
// sanitize must fully decode/re-encode in a bounded local decoder, strip all metadata,
// and report the actual decoded dimensions. reserve must commit a durable shared budget.
// Neither callback may be provided by the client; all are required, with no defaults.
export function createPrivateImageDispatcher({enabled=false,cloud,apiKey,apiSecret,authorize,sanitize,confirmFreePlan,reserve,transport}={}){
 const configured=enabled===true&&[authorize,sanitize,confirmFreePlan,reserve,transport].every(fn=>typeof fn==='function');
 return async input=>{
  if(!configured)return {status:'disabled'};
  try{
   if(!input||typeof input.assetId!=='string'||!uuid.test(input.assetId))return {status:'rejected'};
   inspectImage(input.bytes);
   const subject=Object.freeze({assetId:input.assetId});
   if(await authorize(subject)!==true||await confirmFreePlan()!==true)return {status:'rejected'};
   const clean=await sanitize(new Uint8Array(input.bytes),{maxBytes:2*1024*1024,maxPixels:12000000,maxSide:4096});
   if(!clean||!Number.isSafeInteger(clean.width)||!Number.isSafeInteger(clean.height)||clean.width<1||clean.height<1||
      clean.width>4096||clean.height>4096||clean.width*clean.height>12000000)return {status:'rejected'};
   const bytes=new Uint8Array(clean.bytes instanceof Uint8Array?clean.bytes:[]);
   const format=inspectImage(bytes);
   const request=prepareAuthenticatedImage({cloud,apiKey,apiSecret,assetId:subject.assetId,bytes});
   if(await reserve(Object.freeze({assetId:subject.assetId,bytes:bytes.byteLength}))!==true)return {status:'quota_denied'};
   // Never refund an attempt from this function, including an uncertain response.
   if(await authorize(subject)!==true)return {status:'rejected'};
   const res=await transport(request.url,{...request.options,signal:AbortSignal.timeout(15000)});
   if(res?.status!==200||res.redirected||!res.body||res.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return {status:'unconfirmed'};
   const reader=res.body.getReader(),chunks=[];let size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>16384){void reader.cancel().catch(()=>{});return {status:'unconfirmed'};}chunks.push(value);}}
   finally{reader.releaseLock();}
   const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
   if(data?.public_id!=='starflow-v2/'+subject.assetId||data.resource_type!=='image'||data.type!=='authenticated'||
      data.width!==clean.width||data.height!==clean.height||!Number.isSafeInteger(data.bytes)||data.bytes<1||data.bytes>2*1024*1024||
      !(data.format===format||(format==='jpeg'&&data.format==='jpg')))return {status:'unconfirmed'};
   // A receipt is not proof of private delivery. Do not expose provider URLs or signatures.
   return {status:'accepted',assetId:subject.assetId};
  }catch{return {status:'unconfirmed'};}
 };
}
