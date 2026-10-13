import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sw=read('public/sw.js');
const offline=read('app/offline/page.tsx');
const app=read('components/StarflowOfflineBootstrap.tsx');
const mfa=read('components/StarflowMFASettings.tsx');
const prompt=read('components/StarflowMFASessionPrompt.tsx');
const security=read('components/StarflowSecurityCenter.tsx');
const layout=read('app/layout.tsx');
test('Offline caching strictly excludes private authenticated content',()=>{
 for(const marker of ['request.method !== \'GET\'','url.origin !== self.location.origin','request.mode === \'navigate\'','fetch(request).catch','OFFLINE_PATH','/_next/static/','PUBLIC_FILES','credentials:\'omit\'']){
  assert.ok(sw.includes(marker),marker);
 }
 assert.ok(sw.includes('if (!isPublicStatic(url)) return;'));
 assert.ok(!sw.includes("caches.open('starflow-private"));
 assert.ok(!sw.includes("cache.put(request, response)") || sw.includes('if (!isPublicStatic(url)) return;'));
 assert.ok(!sw.includes("'/api/") && !sw.includes('supabase.co') && !sw.includes("'/messages"));
 assert.ok(offline.includes("dynamic = 'force-static'"));
 assert.ok(offline.includes('你的账号、私信、草稿和帖子没有被保存在离线缓存中'));
 assert.ok(app.includes("serviceWorker.register('/sw.js',{scope:'/'})"));
 assert.ok(layout.includes('<StarflowOfflineBootstrap/>'));
});
test('2FA uses native Auth enrollment and OTP challenge verification, not local secret persistence',()=>{
 for(const marker of ['auth.mfa.enroll({factorType:\'totp\'','auth.mfa.challengeAndVerify({factorId:setup.id,code})','auth.mfa.unenroll({factorId})','auth.mfa.listFactors()','auth.mfa.getAuthenticatorAssuranceLevel()','setSetup(null)']){
  assert.ok(mfa.includes(marker),marker);
 }
 assert.ok(mfa.includes('setup.secret'),'manual TOTP setup on one iPhone');
 assert.ok(!mfa.includes('localStorage')&&!mfa.includes('sessionStorage'));
 assert.ok(!mfa.includes('fetch(\'https://'),'TOTP is not sent to a remote third-party site');
 assert.ok(security.includes('href="/settings/security/2fa"'));
});
test('Enrolled accounts get login second-factor prompts using aal1->aal2, without false claims of server enforcement',()=>{
 for(const marker of ["currentLevel==='aal2'","nextLevel!=='aal2'","auth.mfa.listFactors()","auth.mfa.challengeAndVerify({factorId:factor.id,code})","'SIGNED_IN'","'SIGNED_OUT'","setDismissed(true)"]){
  assert.ok(prompt.includes(marker),marker);
 }
 assert.ok(layout.includes('<StarflowMFASessionPrompt/>'));
 assert.ok(mfa.includes('还取决于对应服务器权限策略'));
});
