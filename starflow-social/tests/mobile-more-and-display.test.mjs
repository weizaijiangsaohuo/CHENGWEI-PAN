import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const menu=file('components/StarflowHomeMenu.tsx');
const root=file('app/layout.tsx');
const prefs=file('components/StarflowDisplayPreferences.tsx');
const social=file('components/SocialApp.tsx');
test('all signed-in screens expose more menu without fake routes',()=>{
 assert.match(social,/<StarflowHomeMenu isAdmin=\{isAdmin\}\/>/);
 assert.doesNotMatch(social,/view==='home'&&<StarflowHomeMenu/);
 for(const route of ['/creator','/bookmarks','/verification','/messages','/settings/security','/support','/guidelines','/privacy','/terms'])assert.ok(menu.includes(route));
});
test('real display controls preserve state on the same device only',()=>{
 assert.match(root,/<StarflowExperienceBootstrap\/>/);
 assert.match(prefs,/localStorage\.setItem/);
 assert.match(prefs,/role="switch"/);
 assert.match(prefs,/sf-user-motion-off/);
 assert.match(prefs,/sf-user-compact/);
});
