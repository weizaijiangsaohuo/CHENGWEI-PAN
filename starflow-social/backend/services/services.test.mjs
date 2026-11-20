import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {buildSecurityEmail,prepareBrevoRequest} from './brevo.mjs';
import {inspectImage,prepareAuthenticatedImage} from './cloudinary.mjs';
const id='11111111-1111-4111-8111-111111111111';
const mail={origin:'https://example.invalid',sender:'security@example.invalid',recipient:'user@example.invalid',purpose:'verify',link:'https://example.invalid/api/identity/auth/verify-email?token=synthetic',eventId:id};
test('mail is a single recipient, fixed API, no user HTML or redirect',()=>{
 const result=prepareBrevoRequest(mail,'fake-key');
 assert.equal(result.url,'https://api.brevo.com/v3/smtp/email');
 const body=JSON.parse(result.options.body);assert.equal(body.to.length,1);assert.equal(body.headers.IdempotencyKey,id);assert.equal(body.htmlContent,undefined);assert.equal(result.options.redirect,'error');
 for(const patch of [{link:'https://attacker.invalid/api/identity/auth/verify-email?token=x'},{link:mail.link+'&callbackURL=https://attacker.invalid'},{recipient:'a@example.invalid,b@example.invalid'},{purpose:'marketing'},{link:mail.link+'&token=second'}])assert.throws(()=>buildSecurityEmail({...mail,...patch}));
});
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0]);
const media={cloud:'test-cloud',apiKey:'12345678',apiSecret:'synthetic-key',assetId:id,bytes:png,now:1795170000};
test('only authenticated image forms, fixed host, SHA256, overwrite false',()=>{
 const r=prepareAuthenticatedImage(media),f=r.options.body;
 assert.equal(r.url,'https://api.cloudinary.com/v1_1/test-cloud/image/upload');
 assert.equal(f.get('type'),'authenticated');assert.equal(f.get('overwrite'),'false');assert.equal(f.get('public_id'),'starflow-v2/'+id);
 assert.equal(f.get('signature'),createHash('sha256').update('overwrite=false&public_id=starflow-v2/'+id+'&timestamp=1795170000&type=authenticatedsynthetic-key').digest('hex'));assert.equal(f.has('api_secret'),false);
 for(const patch of [{cloud:'evil.com/a'},{assetId:'../other'},{bytes:new Uint8Array(2*1024*1024+1)},{bytes:new TextEncoder().encode('<svg>malicious payload</svg>')}])assert.throws(()=>prepareAuthenticatedImage({...media,...patch}));
 assert.equal(inspectImage(png),'png');
});
