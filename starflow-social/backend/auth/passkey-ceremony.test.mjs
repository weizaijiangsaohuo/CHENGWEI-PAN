import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import pg from 'pg';
import {betterAuth} from 'better-auth';
import {authOptions} from './auth.mjs';
// Software authenticator fixture only. Private key never persisted or used with real accounts.
const hash=b=>createHash('sha256').update(b).digest(),b64=b=>Buffer.from(b).toString('base64url');
const head=(major,n)=>n<24?Buffer.from([(major<<5)|n]):n<256?Buffer.from([(major<<5)|24,n]):Buffer.from([(major<<5)|25,n>>8,n&255]);
function cbor(v){
 if(typeof v==='number')return v>=0?head(0,v):head(1,-1-v);
 if(typeof v==='string'){const b=Buffer.from(v);return Buffer.concat([head(3,b.length),b]);}
 if(Buffer.isBuffer(v))return Buffer.concat([head(2,v.length),v]);
 if(v instanceof Map)return Buffer.concat([head(5,v.size),...[...v].flatMap(([k,v])=>[cbor(k),cbor(v)])]);
 throw Error('unsupported fixture CBOR');
}
test('software WebAuthn registration and signed assertion, origin and UV checks, challenge replay',async()=>{
 const db=new pg.Pool({host:'127.0.0.1',port:5432,database:'starflow_auth_test',user:'postgres',password:'ephemeral-ci-only'});
 const origin='https://passkey-fixture.example.invalid',rp=new URL(origin).hostname,secret='synthetic-passkey-lab-only-not-a-real-secret';
 const email='passkey-fixture@example.invalid',password='synthetic-passkey-password-2026';
 let verify;
 const o=authOptions({database:db,origin,secret});
 const auth=betterAuth({...o,emailAndPassword:{...o.emailAndPassword,disableSignUp:false},emailVerification:{...o.emailVerification,sendOnSignUp:true,sendVerificationEmail:async({url})=>{verify=url;}}});
 const jar=new Map();
 const headers=()=>({origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.71',cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')});
 const call=async(path,body)=>{const r=await auth.handler(new Request(origin+'/api/identity/auth/'+path,{method:body===undefined?'GET':'POST',headers:headers(),...(body===undefined?{}:{body:JSON.stringify(body)})}));for(const line of r.headers.getSetCookie()){const p=line.split(';')[0],i=p.indexOf('=');if(i<1)continue;const k=p.slice(0,i),v=p.slice(i+1);if(!v||/Max-Age=0(?:;|$)/i.test(line))jar.delete(k);else jar.set(k,v);}return r;};
 const session=()=>auth.api.getSession({headers:new Headers(headers())});
 const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=key.publicKey.export({format:'jwk'}),id=randomBytes(32);
 const cose=cbor(new Map([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x,'base64url')],[-3,Buffer.from(jwk.y,'base64url')]]));
 const client=(type,challenge,from=origin)=>Buffer.from(JSON.stringify({type,challenge,origin:from,crossOrigin:false}));
 const base=(flags,count)=>{const n=Buffer.alloc(4);n.writeUInt32BE(count);return Buffer.concat([hash(rp),Buffer.from([flags]),n]);};
 const reg=(options,flags=0x45)=>{
  const length=Buffer.alloc(2);length.writeUInt16BE(id.length);
  const authData=Buffer.concat([base(flags,0),Buffer.alloc(16),length,id,cose]);
  const attestation=cbor(new Map([['fmt','none'],['attStmt',new Map()],['authData',authData]]));
  return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(client('webauthn.create',options.challenge)),attestationObject:b64(attestation),transports:['internal']}};
 };
 const assertion=(options,flags=5,from=origin,count=1)=>{
  const data=client('webauthn.get',options.challenge,from),ad=base(flags,count);
  const signature=sign('sha256',Buffer.concat([ad,hash(data)]),key.privateKey);
  return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(data),authenticatorData:b64(ad),signature:b64(signature)}};
 };
 const opts=async path=>{const r=await call(path);assert.ok(r.ok,'options '+r.status);return r.json();};
 try{
  assert.ok((await call('sign-up/email',{name:'Passkey fixture',username:'passkey_fixture',email,password})).ok);
  assert.ok(verify);const confirmed=await auth.handler(new Request(verify,{headers:headers()}));assert.ok(confirmed.ok||confirmed.status===302);
  assert.ok((await call('sign-in/email',{email,password})).ok);
  const subject=(await session()).user.id;
  const create=await opts('passkey/generate-register-options');
  assert.equal(create.rp.id,rp);
  const registered=await call('passkey/verify-registration',{response:reg(create),name:'Synthetic authenticator'});
  assert.ok(registered.ok,'registration '+registered.status);
  assert.equal(Number((await db.query('SELECT count(*) AS n FROM passkey WHERE "userId"=$1',[subject])).rows[0].n),1);
  assert.ok((await call('sign-out',{})).ok);jar.clear();
  const wrong=await opts('passkey/generate-authenticate-options');
  const rejected=await call('passkey/verify-authentication',{response:assertion(wrong,1)});
  assert.ok(!rejected.ok&&rejected.status!==429,'UV absent must be rejected');
  assert.equal(await session(),null);
  const options=await opts('passkey/generate-authenticate-options');
  const response=assertion(options);
  const authenticated=await call('passkey/verify-authentication',{response});
  assert.ok(authenticated.ok,'assertion '+authenticated.status);
  assert.equal((await session()).user.id,subject);
  const replay=await call('passkey/verify-authentication',{response});
  assert.ok(!replay.ok&&replay.status!==429,'replay must be rejected');
  assert.ok((await call('sign-out',{})).ok);jar.clear();
 }finally{await db.end();}
});
