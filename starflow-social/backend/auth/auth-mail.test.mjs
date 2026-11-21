import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixedAuthMailLink,createAuthMailCallbacks} from './auth-mail.mjs';
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
