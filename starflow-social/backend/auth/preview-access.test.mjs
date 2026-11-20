import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {createPreviewAccessVerifier} from './preview-access.mjs';
const issuer='https://starflow-fixture.cloudflareaccess.com',aud='a'.repeat(64),email='owner@example.invalid';
const env={STARFLOW_ACCESS_ISSUER:issuer,STARFLOW_ACCESS_AUD:aud,STARFLOW_ACCESS_OWNER_EMAIL:email};
test('signed application JWT required, exact issuer/audience, owner and validity',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256',{extractable:true});
 const jwk=await exportJWK(publicKey);jwk.kid='fixture';jwk.alg='RS256';
 const keyset=createLocalJWKSet({keys:[jwk]});
 const verify=createPreviewAccessVerifier(env,{keyset});
 const token=async(overrides={},key=privateKey)=>new SignJWT({iss:issuer,aud:[aud],sub:'synthetic-owner',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,type:'app',email,...overrides}).setProtectedHeader({alg:'RS256',kid:'fixture'}).sign(key);
 const req=t=>new Request('https://preview-weizai.example.workers.dev/api/v2/me',{headers:{'cf-access-authenticated-user-email':email,...(t?{'cf-access-jwt-assertion':t}:{})}});
 assert.equal(await verify(req(await token())),true);
 assert.equal(await verify(req()),false);
 assert.equal(await verify(req('forged')),false);
 for(const x of [{iss:'https://evil.cloudflareaccess.com'},{aud:['b'.repeat(64)]},{email:'other@example.invalid'},{type:'org'},{exp:1},{sub:''},{iat:1}]){
  assert.equal(await verify(req(await token(x))),false);
 }
 const other=await generateKeyPair('RS256');
 assert.equal(await verify(req(await token({},other.privateKey))),false);
 assert.equal(await createPreviewAccessVerifier({...env,STARFLOW_ACCESS_AUD:''},{keyset})(req(await token())),false);
});
