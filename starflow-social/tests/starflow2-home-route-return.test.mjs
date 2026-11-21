import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const home=read('app/page.tsx'),social=read('components/SocialApp.tsx');

test('returning to home reuses an existing in-memory verified identity before the first paint',()=>{
 assert.match(social,/export function readVerifiedRouteUser\(\): User\|null/);
 assert.match(home,/import \{SocialApp,readVerifiedRouteUser\} from '@\/components\/SocialApp'/);
 assert.match(home,/useLayoutEffect\(\(\)=>\{\s*if\(readVerifiedRouteUser\(\)\)setScreen\('member'\)/);
 assert.doesNotMatch(home,/localStorage\.getItem\(['"]sf-user/);
});

test('home still revalidates authenticated state and preserves public unauthenticated landing',()=>{
 assert.match(home,/client\.auth\.getUser\(\)\.then/);
 assert.match(home,/setScreen\(current=>current==='auth'\?current:\(user\?'member':'landing'\)\)/);
 assert.match(home,/if\(!hasConfig\(\)\)\{setScreen\('landing'\);return;\}/);
 assert.match(home,/screen==='member'\|\|screen==='auth'\?<SocialApp view="home"\/>/);
 assert.match(social,/const VERIFIED_ROUTE_USER_TTL = 90_000/);
 assert.match(social,/if\(event==='SIGNED_OUT'\)/);
});


test('stale initial session lookups cannot replace newer authentication events',()=>{
 assert.match(home,/if\(active&&!sessionChanged\)setScreen/);
 assert.match(home,/if\(event==='SIGNED_IN'&&session\?\.user\)sessionChanged=true/);
 assert.match(home,/if\(event==='SIGNED_OUT'\)\{\s*sessionChanged=true/);
 assert.match(social,/if\(!active\|\|signedOut\|\|sessionChanged\)return;/);
 assert.match(social,/signedOut=false;sessionChanged=true/);
 assert.match(social,/signedOut=true;sessionChanged=true;rememberVerifiedRouteUser\(null\)/);
});
