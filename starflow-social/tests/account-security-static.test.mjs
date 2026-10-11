import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../components/StarflowSecurityCenter.tsx',import.meta.url),'utf8');
const provider=readFileSync(new URL('../lib/account-providers.ts',import.meta.url),'utf8');
test('account info reads verified user and linked identities from Supabase',()=>{
 assert.match(ui,/auth\.getUserIdentities\(\)/);assert.match(ui,/auth\.getUser\(\)/);
 assert.match(ui,/email_confirmed_at/);
});
test('password modification verifies current password on server',()=>{
 assert.match(ui,/auth\.updateUser\(attrs\)/);assert.match(ui,/current_password:oldPwd/);
 assert.match(ui,/newPwd\.length<8/);assert.doesNotMatch(ui,/localStorage\.setItem/);
});
test('bind does not accidentally sign into a different account',()=>{
 assert.match(ui,/auth\.linkIdentity\(\{/);assert.doesNotMatch(ui,/auth\.signInWithOAuth\(/);
 for(const term of ["provider:'google'","provider:'apple'","provider:'facebook'","provider:'twitter'","NEXT_PUBLIC_WECHAT_ENABLED","NEXT_PUBLIC_QQ_ENABLED"])assert.ok(provider.includes(term),term);
 assert.match(ui,/!item\?\.enabled/);
});
test('email recovery does not assume delivery',()=>{
 assert.match(ui,/auth\.resetPasswordForEmail\(/);
 assert.match(ui,/实际送达仍取决于邮件服务配置/);
});
