// Verify the signed Cloudflare Access application token, not client identity headers.
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {timingSafeEqual} from 'node:crypto';
export function createPreviewAccessVerifier(env,{keyset}={}){
 const issuer=env?.STARFLOW_ACCESS_ISSUER,audience=env?.STARFLOW_ACCESS_AUD,owner=env?.STARFLOW_ACCESS_OWNER_EMAIL;
 if(typeof issuer!=='string'||!/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(issuer)||
 typeof audience!=='string'||!/^[a-f0-9]{64}$/.test(audience)||
 typeof owner!=='string'||owner.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner))return async()=>false;
 // Request-scoped keys avoid sharing Worker I/O across invocations. Issuer is trusted configuration.
 return async request=>{
  const token=request.headers.get('cf-access-jwt-assertion');
  if(!token||token.length>16384||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/.test(token))return false;
  try{
   const keys=keyset??createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'),{timeoutDuration:4000});
   const {payload}=await jwtVerify(token,keys,{issuer,audience,algorithms:['RS256'],requiredClaims:['iss','aud','sub','iat','exp'],clockTolerance:5,maxTokenAge:'24h'});
   return payload.type==='app'&&typeof payload.sub==='string'&&payload.sub.length>0&&
    typeof payload.email==='string'&&payload.email.toLowerCase()===owner.toLowerCase();
  }catch{return false;}
 };
}

// Optional owner-controlled alternative; no Zero Trust service required.
// Only an independently generated 256-bit runtime secret can enable this mode.
// No query parameter, cookie, browser identity flag or fallback on bad credentials.
export function createConfiguredPreviewVerifier(env,options={}){
 const key=env?.STARFLOW_PREVIEW_OWNER_KEY;
 if(key===undefined)return createPreviewAccessVerifier(env,options);
 const signingSecret=env?.BETTER_AUTH_SECRET;
 const valid=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 if(!valid(key)||typeof signingSecret!=='string'||signingSecret.length<32||key===signingSecret.toLowerCase())return async()=>false;
 const encoder=new TextEncoder();
 const expected=encoder.encode(key);
 return async request=>{
  const supplied=request.headers.get('x-starflow-preview-key');
  return valid(supplied)&&timingSafeEqual(expected,encoder.encode(supplied));
 };
}
