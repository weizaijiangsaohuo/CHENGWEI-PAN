import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixedAuthMailLink,createAuthMailCallbacks,createFreshRegistrationMail} from './auth-mail.mjs';
const origin='https://fixture.invalid',token='Abc123_token';
const user={id:'11111111-1111-4111-8111-111111111111',email:'member@fixture.invalid',emailVerified:false,twoFactorEnabled:false};
const verify={user,token,url:origin+'/api/identity/auth/verify-email?token='+token+'&callbackURL='+encodeURIComponent('https://attacker.invalid')};
const reset={user:{...user,emailVerified:true},token,url:origin+'/api/identity/auth/reset-password/'+token+'?callbackURL='+encodeURIComponent('https://attacker.invalid')};
test('canonical auth links remove original redirect, reject inconsistent token and origin',()=>{
 assert.equal(fixedAuthMailLink({origin,purpose:'verify',...verify}),origin+'/api/identity/auth/verify-email?token='+token);
 assert.equal(fixedAuthMailLink({origin,purpose:'reset',...reset}),origin+'/reset-password?token='+token);
 for(const patch of [{url:'https://attacker.invalid/api/identity/auth/verify-email?token='+token},{url:verify.url+'&token=other'},{token:'other'},{url:verify.url+'&redirect=evil'},{token:'a/b'}])assert.throws(()=>fixedAuthMailLink({origin,purpose:'verify',...verify,...patch}));
 assert.throws(()=>fixedAuthMailLink({origin,purpose:'reset',...reset,token:'different'}));
});
test('callback uses trusted subject, fixed link and committed reservation only; denied recovery cannot send',async()=>{
 const calls=[];
 const pool={connect:async()=>({query:async(sql,args)=>{calls.push(sql.split(' ')[0]);if(sql.startsWith('SELECT')){assert.match(args[1],/^[a-f0-9]{64}$/);return {rows:[{allowed:true}]};}},release(){calls.push('release');}})};
 const cfg={pool,origin,apiKey:'fixture',sender:'security@fixture.invalid',recipientSecret:'independent-synthetic-recipient-key',confirmFreePlan:async()=>true,allowRecipient:async s=>{assert.equal(s.id,user.id);assert.equal(s.email,user.email);return true;},transport:async(url,opts)=>{calls.push('send');const msg=JSON.parse(opts.body);assert.equal(msg.to[0].email,user.email);assert.doesNotMatch(msg.textContent,/attacker/);return Response.json({messageId:'fixture'},{status:201});}};
 await createAuthMailCallbacks(cfg).sendVerificationEmail(verify);assert.deepEqual(calls,[]);
 const cb=createAuthMailCallbacks({...cfg,enabled:true});
 await cb.sendResetPassword({...reset,user:{...reset.user,twoFactorEnabled:true}});
 await cb.sendResetPassword({...reset,user:{...reset.user,emailVerified:false}});
 await createAuthMailCallbacks({...cfg,enabled:true,allowRecipient:async()=>false}).sendResetPassword(reset);assert.deepEqual(calls,[]);
 await cb.sendVerificationEmail({...verify,recipient:'attacker@fixture.invalid'});assert.deepEqual(calls,['BEGIN','SET','SELECT','COMMIT','release','send']);
});

test('fresh registration connects canonical Better Auth verification to free-plan check and committed budget; no reset callback',async()=>{
 const calls=[];
 const pool={connect:async()=>({query:async(sql,args)=>{calls.push(sql.split(' ')[0]);if(sql.startsWith('SELECT')){assert.match(args[1],/^[a-f0-9]{64}$/);return {rows:[{allowed:true}]};}},release(){calls.push('release');}})};
 const cfg={pool,origin,enabled:true,apiKey:'fixture-only',sender:'security@fixture.invalid',recipientSecret:'independent-synthetic-recipient-key',
  allowRecipient:async s=>{calls.push('admission');return s.id===user.id&&s.email===user.email&&s.purpose==='verify';},
  verifyBilling:async()=>{calls.push('billing');return true;},
  transport:async(url,opts)=>{
   assert.equal(opts.redirect,'error');
   if(opts.method==='GET'){
    calls.push('plan');assert.equal(url,'https://api.brevo.com/v3/account');
    return Response.json({enterprise:false,relay:{enabled:true},plan:[{type:'free',creditsType:'sendLimit',credits:200}]});
   }
   calls.push('send');assert.equal(url,'https://api.brevo.com/v3/smtp/email');
   const msg=JSON.parse(opts.body);assert.equal(msg.to[0].email,user.email);
   assert.doesNotMatch(msg.textContent,/attacker/);assert.match(msg.textContent,/verify-email\?token=/);
   return Response.json({messageId:'fixture'},{status:201});
  }};
 const mail=createFreshRegistrationMail(cfg);
 assert.deepEqual(Object.keys(mail),['sendVerificationEmail']);
 await mail.sendVerificationEmail(verify);
 assert.deepEqual(calls,['admission','billing','plan','BEGIN','SET','SELECT','COMMIT','release','admission','send']);
 calls.length=0;
 await mail.sendVerificationEmail({...verify,user:{...user,emailVerified:true}});
 assert.deepEqual(calls,[]);
 await createFreshRegistrationMail({...cfg,enabled:false}).sendVerificationEmail(verify);
 assert.deepEqual(calls,[]);
 await createFreshRegistrationMail({...cfg,allowRecipient:async()=>false}).sendVerificationEmail(verify);
 assert.deepEqual(calls,[]);
 await createFreshRegistrationMail({...cfg,verifyBilling:async()=>false,confirmFreePlan:async()=>true}).sendVerificationEmail(verify);
 assert.deepEqual(calls,['admission']);
});

test('fresh registration retry respects committed quota and rechecks current admission before any send',async()=>{
 let eligible=true,quota=true,failTransport=true,commits=0,attempts=0,checks=0;
 const ids=[],keys=[];
 const pool={connect:async()=>({query:async(sql,args)=>{
  if(sql.startsWith('SELECT')){ids.push(args[0]);keys.push(args[1]);return {rows:[{allowed:quota}]};}
  if(sql==='COMMIT')commits++;
 },release(){}})};
 const cfg={pool,origin,enabled:true,apiKey:'fixture-only',sender:'security@fixture.invalid',recipientSecret:'independent-synthetic-recipient-key',
  allowRecipient:async s=>{checks++;return eligible&&s.id===user.id&&s.email===user.email&&s.purpose==='verify';},
  verifyBilling:async()=>true,
  transport:async(url,opts)=>{
   if(opts.method==='GET')return Response.json({enterprise:false,relay:{enabled:true},plan:[{type:'free',creditsType:'sendLimit',credits:200}]});
   attempts++;if(failTransport)throw Error('synthetic timeout');
   return Response.json({messageId:'fixture'},{status:201});
  }};
 const mail=createFreshRegistrationMail(cfg);
 // No automatic retry or refund after uncertain provider delivery.
 assert.equal(await mail.sendVerificationEmail(verify),undefined);
 assert.equal(attempts,1);assert.equal(commits,1);
 quota=false;await mail.sendVerificationEmail(verify);
 assert.equal(attempts,1);assert.equal(commits,1);
 // A new trusted callback may retry only when the database budget allows it.
 quota=true;failTransport=false;await mail.sendVerificationEmail(verify);
 assert.equal(attempts,2);assert.equal(commits,2);
 assert.equal(new Set(ids).size,3);assert.equal(new Set(keys).size,1);
 // Simulate expiration between budget commit and transport.
 const expired=createFreshRegistrationMail({...cfg,allowRecipient:async()=>++checks%2===1});
 checks=0;await expired.sendVerificationEmail(verify);
 assert.equal(commits,3);assert.equal(attempts,2);
 eligible=false;await mail.sendVerificationEmail(verify);
 assert.equal(commits,3);assert.equal(attempts,2);
});
