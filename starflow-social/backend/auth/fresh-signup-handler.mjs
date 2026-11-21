// Server-only, request-scoped registration composition. Not mounted in Next or Worker.
// Trusted caller must supply independently attested DB connections and free-mail configuration.
import {betterAuth} from 'better-auth';
import {authOptions} from './auth.mjs';
const deny=(status=404)=>Response.json({error:'not_permitted'},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
async function readSignup(request){
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||!request.body)throw Error('invalid signup');
 const reader=request.clone().body.getReader(),chunks=[];let n=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>4096){void reader.cancel();throw Error('invalid signup');}chunks.push(value);}}finally{reader.releaseLock();}
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
 if(!data||Array.isArray(data)||typeof data!=='object'||Object.keys(data).sort().join(',')!=='email,name,password,username'||
 typeof data.email!=='string'||data.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(data.email)||
 typeof data.name!=='string'||!data.name.trim()||data.name.length>80||
 typeof data.username!=='string'||!/^[a-z0-9_]{3,24}$/.test(data.username)||
 typeof data.password!=='string'||data.password.length<15||data.password.length>128)throw Error('invalid signup');
 return data;
}
export function createFreshSignupHandler({enabled=false,database,origin,secret,admissions,mail,authorizePreview}={}){
 return async request=>{
  if(enabled!==true||typeof authorizePreview!=='function'||typeof admissions?.issueForNewSignup!=='function'||typeof mail?.sendVerificationEmail!=='function')return deny();
  let url;try{url=new URL(request.url);}catch{return deny();}
  if(url.origin!==origin||url.protocol!=='https:'||!/^[-a-z0-9]+-weizai\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname))return deny();
  const signup=request.method==='POST'&&url.pathname==='/api/identity/auth/sign-up/email';
  const verify=request.method==='GET'&&url.pathname==='/api/identity/auth/verify-email';
  if(!signup&&!verify)return deny();
  if(request.headers.has('origin')&&request.headers.get('origin')!==origin||signup&&request.headers.get('origin')!==origin)return deny(403);
  try{if(await authorizePreview(request)!==true)return deny(403);}catch{return deny(403);}
  let input;
  if(signup){
   if(url.search)return deny(400);
   try{input=await readSignup(request);}catch{return deny(400);}
  }else if(url.searchParams.getAll('token').length!==1||[...url.searchParams.keys()].some(k=>k!=='token')||! /^[A-Za-z0-9._~-]{1,1500}$/.test(url.searchParams.get('token')??''))return deny(400);
  try{
   const base=authOptions({database,origin,secret});let issued=false;
   const auth=betterAuth({...base,emailAndPassword:{...base.emailAndPassword,disableSignUp:!signup},emailVerification:{...base.emailVerification,
    sendOnSignUp:signup,sendVerificationEmail:async data=>{
     // This factory instance exists only for this explicitly authorized signup request.
     if(!signup||issued||data?.user?.email!==input.email.toLowerCase())return;
     issued=true;
     if(await admissions.issueForNewSignup(data.user)===true)await mail.sendVerificationEmail(data);
    }}});
   const headers=new Headers(request.headers);headers.delete('x-starflow-preview-key');headers.delete('cf-access-jwt-assertion');headers.delete('cf-access-authenticated-user-email');headers.delete('cf-access-client-id');headers.delete('cf-access-client-secret');
   const response=await auth.handler(new Request(request,{headers}));
   const out=new Headers(response.headers);out.set('Cache-Control','private, no-store');out.set('Referrer-Policy','no-referrer');out.set('X-Content-Type-Options','nosniff');
   return new Response(response.body,{status:response.status,headers:out});
  }catch{return deny(503);}
 };
}
