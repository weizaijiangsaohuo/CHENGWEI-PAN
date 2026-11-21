// Internal transport only. No public route, auth callback or automatic retry.
// reserve() MUST commit the shared database budget before returning true.
// authorize() MUST resolve an eligible recipient from trusted authentication state.
// confirmFreePlan() MUST verify the account has no paid credits/auto-upgrade.
// These callbacks are server-only; never construct them from request input.
import {prepareBrevoRequest,prepareBrevoOtpRequest} from './brevo.mjs';
import {createHmac} from 'node:crypto';
export function createMailDispatcher({enabled=false,apiKey,sender,origin,recipientSecret,reserve,authorize,confirmFreePlan,transport}={}){
 const configured=enabled===true&&typeof recipientSecret==='string'&&recipientSecret.length>=32&&recipientSecret!==apiKey&&
  [reserve,authorize,confirmFreePlan,transport].every(fn=>typeof fn==='function');
 return async function dispatch(event){
  if(!configured)return {status:'disabled'};
  try{
   if(!event||!['verify','reset','otp'].includes(event.purpose))return {status:'rejected'};
   // Envelopes are constructed only from a trusted recipient lookup and fixed sender.
   const recipient=await authorize(event);
   if(typeof recipient!=='string')return {status:'rejected'};
   const input={sender,recipient,eventId:event.eventId};
   const request=event.purpose==='otp'
    ?prepareBrevoOtpRequest({...input,otp:event.otp},apiKey)
    :prepareBrevoRequest({...input,origin,purpose:event.purpose,link:event.link},apiKey);
   if(await confirmFreePlan()!==true)return {status:'disabled'};
   const recipientKey=createHmac('sha256',recipientSecret).update('starflow-security-mail:'+recipient.trim().toLowerCase()).digest('hex');
   if(await reserve({eventId:event.eventId,recipientKey,purpose:event.purpose})!==true)return {status:'quota_denied'};
   // One committed attempt. Never refund on timeout or uncertain provider response.
   const response=await transport(request.url,{...request.options,signal:AbortSignal.timeout(10000)});
   // An accepted provider request is NOT proof of mailbox delivery.
   if(response?.status===201){
    const body=await response.json();
    if(typeof body?.messageId==='string'&&body.messageId.length>0&&body.messageId.length<=512)return {status:'accepted'};
   }
   return {status:'unconfirmed'};
  }catch{return {status:'unconfirmed'};}
 };
}
