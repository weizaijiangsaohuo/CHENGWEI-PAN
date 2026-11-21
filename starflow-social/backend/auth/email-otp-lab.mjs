// Offline laboratory only. Do not mount this handler on a production route.
import {betterAuth} from 'better-auth';
import {emailOTP} from 'better-auth/plugins';
import {createHmac} from 'node:crypto';
import {authOptions} from './auth.mjs';
export function createEmailOtpLab({database,origin,secret,otpSecret,send,allowSubject,allowSignup=false}){
 if(typeof otpSecret!=='string'||otpSecret.length<32||otpSecret===secret||typeof send!=='function'||typeof allowSubject!=='function')throw Error('isolated OTP configuration required');
 const base=authOptions({database,origin,secret});
 const auth=betterAuth({...base,plugins:[...base.plugins,emailOTP({
  otpLength:6,expiresIn:300,allowedAttempts:3,resendStrategy:'rotate',disableSignUp:!allowSignup,
  storeOTP:{hash:async value=>createHmac('sha256',otpSecret).update('starflow-email-otp:'+value).digest('base64url')},
  rateLimit:{window:60,max:3},
  sendVerificationOTP:async({email,otp,type})=>{
   if(type!=='sign-in')throw Error('operation disabled');
   await send({email,otp});
  }
 })],databaseHooks:{session:{create:{before:async(session,ctx)=>{
  // The OTP path does not automatically run the built-in TOTP sign-in hook.
  // Never mint an OTP session for MFA-protected or privileged users.
  if(ctx?.path!=='/sign-in/email-otp')return false;
  const user=await ctx.context.internalAdapter.findUserById(session.userId);
  if(!user||user.emailVerified!==true||user.twoFactorEnabled!==false)return false;
  if(await allowSubject(session.userId)!==true)return false;
 }}}}});
 const routes=new Set(['/api/identity/auth/email-otp/send-verification-otp','/api/identity/auth/sign-in/email-otp']);
 const deny=(status=403)=>Response.json({error:'not_permitted'},{status,headers:{'Cache-Control':'private, no-store'}});
 return {handle:async request=>{
  const url=new URL(request.url);
  if(url.origin!==origin||request.headers.get('origin')!==origin||request.method!=='POST'||url.search||!routes.has(url.pathname))return deny();
  if(request.headers.get('content-type')?.split(';')[0].toLowerCase()!=='application/json'||!request.body)return deny(400);
  const reader=request.body.getReader();let size=0;const chunks=[];
  try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>4096){await reader.cancel();return deny(400);}chunks.push(x.value);}}
  finally{reader.releaseLock();}
  let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return deny(400);}
  if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.email!=='string'||data.email.length>254)return deny(400);
  const sending=url.pathname.endsWith('send-verification-otp');
  if(sending?(data.type!=='sign-in'||Object.keys(data).length!==2):
   (typeof data.otp!=='string'||!/^\d{6}$/.test(data.otp)||Object.keys(data).some(k=>!['email','otp','name'].includes(k))||
    (data.name!==undefined&&(typeof data.name!=='string'||data.name.length>60))))return deny(400);
  const headers=new Headers(request.headers);headers.delete('content-length');
  const res=await auth.handler(new Request(request.url,{method:'POST',headers,body:JSON.stringify(data)}));
  const out=new Headers(res.headers);out.set('Cache-Control','private, no-store');
  return new Response(res.body,{status:res.status,headers:out});
 }};
}
