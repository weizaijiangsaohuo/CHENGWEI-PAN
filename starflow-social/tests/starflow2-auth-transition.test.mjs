import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('components/SocialApp.tsx');
const css=read('app/starflow-2.css');

test('returning between logged-in routes does not show purple switching-page splash',()=>{
 assert.doesNotMatch(app,/正在切换页面/);
 assert.doesNotMatch(app,/className="sf-section-loading"/);
 assert.match(app,/const VERIFIED_ROUTE_USER_TTL = 90_000/);
 assert.match(app,/useLayoutEffect\(\(\)=>\{\s*const cached=readVerifiedRouteUser\(\)/);
 assert.match(app,/if\(cached\)\{setUser\(cached\);setChecking\(false\)\}/);
 assert.match(app,/if\(checking\)return <main className="sf2-route-loading sf2-auth-route-loading"/);
 assert.match(app,/aria-label="正在验证登录状态"/);
 assert.match(css,/\.sf2-route-loading\{/);
});

test('verified user cache stays in memory, short-lived, revalidated, and cleared on sign out',()=>{
 assert.match(app,/let verifiedRouteUser: \{user: User; checkedAt: number\}\|null = null/);
 assert.match(app,/Date\.now\(\)-entry\.checkedAt < VERIFIED_ROUTE_USER_TTL/);
 assert.match(app,/client\.auth\.getUser\(\)\.then/);
 assert.match(app,/rememberVerifiedRouteUser\(next\)/);
 assert.match(app,/if\(event==='SIGNED_OUT'\)\{/);
 assert.match(app,/signedOut=true;rememberVerifiedRouteUser\(null\)/);
 assert.match(app,/if\(verifiedRouteUser\?\.user\.id!==session\.user\.id\)rememberVerifiedRouteUser\(null\)/);
 assert.doesNotMatch(app,/localStorage\.setItem\(['"]sf-[^'"]*user-cache/);
});
