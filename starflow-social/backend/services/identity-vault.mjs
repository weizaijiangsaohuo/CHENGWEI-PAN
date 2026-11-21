// Internal encryption primitive, NOT a storage endpoint or authorization decision.
// A dedicated random 32-byte key must be held outside the DB; no key is generated or persisted here.
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const kinds=new Set(['face_photo','document_front','document_back','identity_fields']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function context(key,{attemptId,kind,keyId}){
 if(!Buffer.isBuffer(key)||key.length!==32||typeof attemptId!=='string'||!uuid.test(attemptId)||!kinds.has(kind)||typeof keyId!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId))throw Error('Invalid vault configuration');
 return {aad:Buffer.from(JSON.stringify(['starflow-identity-v1',attemptId,kind,keyId])),max:kind==='identity_fields'?16384:2097152};
}
export function sealEvidence(key,binding,bytes){
 const {aad,max}=context(key,binding);
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>max)throw Error('Invalid evidence size');
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
 cipher.setAAD(aad);
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);
 return {nonce,ciphertext};
}
export function openEvidence(key,binding,{nonce,ciphertext}){
 const {aad,max}=context(key,binding);
 if(!Buffer.isBuffer(nonce)||nonce.length!==12||!Buffer.isBuffer(ciphertext)||ciphertext.length<=16||ciphertext.length>max+16)throw Error('Invalid sealed evidence');
 const cipher=createDecipheriv('aes-256-gcm',key,nonce);
 cipher.setAAD(aad);cipher.setAuthTag(ciphertext.subarray(-16));
 // Never return plaintext until authentication succeeds.
 const first=cipher.update(ciphertext.subarray(0,-16));
 try{return Buffer.concat([first,cipher.final()]);}finally{first.fill(0);}
}
