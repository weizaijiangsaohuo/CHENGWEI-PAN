import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const portal=readFileSync(new URL('../components/AuthPortal.tsx',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261012_signup_custom_handle.sql',import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/auth-identifier/index.ts',import.meta.url),'utf8');

test('signup stores a chosen unique username and retains a recovery email',()=>{
 assert.match(portal,/handle:handle\.trim\(\)\.toLowerCase\(\)/);
 assert.match(portal,/autoComplete="username"/);
 assert.match(portal,/mode==='signup'\?'email':'text'/);
 assert.match(portal,/emailRedirectTo:`\$\{location\.origin\}\/auth\/confirm`/);
 assert.match(migration,/INSERT INTO public\.profiles\(id, handle, display_name\)/);
 assert.match(migration,/chosen_handle !~ '\^\[a-z0-9_\]\{3,24\}\$'/);
});

test('email credentials go to Supabase Auth, username goes to private function',()=>{
 assert.match(portal,/if\(identity\.includes\('@'\) && !identity\.startsWith\('@'\)\)/);
 assert.match(portal,/supabase\.auth\.signInWithPassword\(/);
 assert.match(portal,/supabase\.functions\.invoke\('auth-identifier'/);
 assert.match(portal,/auth\.setSession\(\{access_token:data\.session\.access_token,refresh_token:data\.session\.refresh_token\}\)/);
});

test('password recovery requires a verified mailbox, not username-only reset',()=>{
 assert.match(edge,/auth\.auth\.resetPasswordForEmail\(candidate,/);
 assert.match(edge,/captchaToken: captcha/);
 assert.match(edge,/getUserById\(found\.data\.id\)/);
 assert.doesNotMatch(edge,/password.*updateUser/);
 assert.match(portal,/向注册时预留的邮箱发送密码重置链接/);
 assert.match(portal,/captchaToken:requestCaptchaToken/);
});

test('username resolution never exposes registered emails',()=>{
 assert.match(edge,/serviceRoleKey/);
 assert.match(edge,/getUserById\(/);
 assert.match(edge,/signInWithPassword\(/);
 assert.match(edge,/if \(result\.error \|\| !result\.data\.session\) return badLogin/);
 assert.match(edge,/missing-username@invalid\.example/);
 assert.match(edge,/if \(!allowedOrigins\.has\(origin\)\)/);
 assert.doesNotMatch(edge,/send\(\{[^}]*email\s*:/);
});
