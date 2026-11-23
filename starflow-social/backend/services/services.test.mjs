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

test('private media dispatcher requires authorization, sanitized dimensions, free plan and committed quota',async()=>{
 const calls=[];
 const {createPrivateImageDispatcher}=await import('./cloudinary.mjs');
 const cfg={enabled:true,cloud:media.cloud,apiKey:media.apiKey,apiSecret:media.apiSecret,
  authorize:async subject=>{calls.push('authorize');assert.deepEqual(subject,{assetId:id});return true},
  confirmFreePlan:async()=>{calls.push('free');return true},
  sanitize:async(bytes,limits)=>{calls.push('sanitize');assert.equal(limits.maxPixels,12000000);assert.deepEqual(bytes,png);return {bytes:png,width:4,height:4}},
  reserve:async args=>{calls.push('reserve');assert.deepEqual(args,{assetId:id,bytes:png.length});return true},
  transport:async(url,opts)=>{calls.push('send');assert.equal(url,'https://api.cloudinary.com/v1_1/test-cloud/image/upload');assert.equal(opts.body.get('type'),'authenticated');assert.equal(opts.redirect,'error');return Response.json({public_id:'starflow-v2/'+id,resource_type:'image',type:'authenticated',width:4,height:4,bytes:png.length,format:'png',secure_url:'https://example.invalid/private'})}
 };
 const input={assetId:id,bytes:png};
 assert.deepEqual(await createPrivateImageDispatcher(cfg)(input),{status:'accepted',assetId:id});
 assert.deepEqual(calls,['authorize','free','sanitize','reserve','authorize','send']);
 calls.length=0;
 assert.deepEqual(await createPrivateImageDispatcher({...cfg,sanitize:undefined})(input),{status:'disabled'});assert.deepEqual(calls,[]);
 assert.deepEqual(await createPrivateImageDispatcher({...cfg,confirmFreePlan:async()=>false})(input),{status:'rejected'});assert.deepEqual(calls,['authorize']);
 calls.length=0;
 assert.deepEqual(await createPrivateImageDispatcher({...cfg,sanitize:async()=>({bytes:png,width:4097,height:4})})(input),{status:'rejected'});assert.deepEqual(calls,['authorize','free']);
 calls.length=0;
 assert.deepEqual(await createPrivateImageDispatcher({...cfg,reserve:async()=>false})(input),{status:'quota_denied'});assert.deepEqual(calls,['authorize','free','sanitize']);
 calls.length=0;let checks=0;
 assert.deepEqual(await createPrivateImageDispatcher({...cfg,authorize:async()=>++checks===1})(input),{status:'rejected'});assert.equal(checks,2);assert.deepEqual(calls,['free','sanitize','reserve']);
 calls.length=0;
 assert.deepEqual(await createPrivateImageDispatcher({...cfg,transport:async()=>Response.json({public_id:'other',type:'upload'})})(input),{status:'unconfirmed'});
 assert.deepEqual(calls,['authorize','free','sanitize','reserve','authorize']);
});
