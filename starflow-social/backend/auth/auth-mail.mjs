// Internal Better Auth callback composition only, not a public route or live sender.
// Neither request-provided recipient nor redirect targets can reach the transport.
import {randomUUID} from 'node:crypto';
import {createMailDispatcher} from '../services/mail-dispatch.mjs';
import {createBrevoFreeDispatcher} from '../services/brevo-free.mjs';
import {createMailBudgetReservation} from './mail-budget.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function fixedAuthMailLink({origin,purpose,url,token}){
 if(typeof token!=='string'||!/^[A-Za-z0-9._~-]{1,1500}$/.test(token)||typeof url!=='string'||url.length>4096)throw Error('invalid auth link');
 const base=new URL(origin),source=new URL(url);
 if(base.protocol!=='https:'||base.origin!==origin||source.origin!==origin||source.username||source.password||source.hash)throw Error('invalid auth link');
 if(purpose==='verify'){
  if(source.pathname!=='/api/identity/auth/verify-email'||source.searchParams.getAll('token').length!==1||source.searchParams.get('token')!==token||
   [...source.searchParams.keys()].some(k=>!['token','callbackURL'].includes(k))||source.searchParams.getAll('callbackURL').length>1)throw Error('invalid verification link');
 }else if(purpose==='reset'){
  if(source.pathname!=='/api/identity/auth/reset-password/'+token||
   [...source.searchParams.keys()].some(k=>k!=='callbackURL')||source.searchParams.getAll('callbackURL').length>1)throw Error('invalid reset link');
 }else throw Error('invalid purpose');
 // Better Auth has already produced the token; never forward the original callbackURL.
 const fixed=new URL(purpose==='verify'?'/api/identity/auth/verify-email':'/reset-password',origin);
 fixed.searchParams.set('token',token);return fixed.href;
}
function composeCallbacks({enabled=false,pool,origin,allowRecipient,...config}={},dispatcherFactory){
 async function send(purpose,data){
  if(enabled!==true||typeof allowRecipient!=='function')return {status:'disabled'};
  try{
   const user=data?.user;
   if(!user||typeof user.id!=='string'||!uuid.test(user.id)||typeof user.email!=='string'||user.email.length>254)return {status:'rejected'};
   if(purpose==='reset'&&(user.emailVerified!==true||user.twoFactorEnabled!==false))return {status:'rejected'};
   if(purpose==='verify'&&user.emailVerified!==false)return {status:'rejected'};
   const link=fixedAuthMailLink({origin,purpose,url:data.url,token:data.token});
   // The subject and email originate from trusted Better Auth callbacks only.
   const subject=Object.freeze({id:user.id,email:user.email,purpose});
   const event=Object.freeze({eventId:randomUUID(),purpose,link});
   const dispatch=dispatcherFactory({...config,origin,enabled:true,
    reserve:createMailBudgetReservation(pool),
    authorize:async candidate=>candidate===event&&await allowRecipient(subject)===true?subject.email:null});
   return await dispatch(event);
  }catch{return {status:'unconfirmed'};}
 }
 return Object.freeze({
  // Return no provider outcome to auth callers; no receipt or account-existence signal.
  sendVerificationEmail:async data=>{await send('verify',data);},
  sendResetPassword:async data=>{await send('reset',data);}
 });
}

// Existing isolated reset-ceremony laboratory only. Never mount these callbacks as
// the new account-recovery route; email-only reset is incompatible with the new policy.
export function createAuthMailCallbacks(config){
 return composeCallbacks(config,createMailDispatcher);
}
// New registration path: only email ownership verification, not password recovery.
// Requires trusted admission-recipient eligibility and independently verified free billing.
// No public handler, live credentials or default provider transport.
export function createFreshRegistrationMail(config){
 const {sendVerificationEmail}=composeCallbacks({...config,recheckRecipient:true},createBrevoFreeDispatcher);
 return Object.freeze({sendVerificationEmail});
}
