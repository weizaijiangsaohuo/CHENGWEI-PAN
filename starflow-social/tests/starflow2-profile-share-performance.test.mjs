import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const social=read('components/SocialApp.tsx');
const profile=read('components/StarflowProfileEnhancements.tsx');
const preferences=read('components/StarflowDisplayPreferences.tsx');
const css=read('app/starflow-2.css');
const layout=read('app/layout.tsx');

test('profile follow is immediate, single-flight, reversible, real server-backed',()=>{
 assert.match(social,/pendingFollows=useRef<Set<string>>/);
 assert.match(social,/pendingFollows\.current\.has\(id\)/);
 assert.match(social,/setFollowing\(current=>exists\?current\.filter/);
 assert.match(social,/\.from\('follows'\)\.delete\(\)/);
 assert.match(social,/\.from\('follows'\)\.insert/);
 assert.match(social,/setFollowing\(current=>exists\?\[\.\.\.new Set\(\[\.\.\.current,id\]\)\]/);
 assert.match(social,/aria-busy=\{followBusyTarget===profile\.id\}/);
 assert.match(social,/aria-pressed=\{following\.includes\(profile\.id\)\}/);
 assert.match(social,/disabled=\{followBusyTarget===profile\.id\}/);
});
test('real profile counts update after confirmed follow and privacy remains intact',()=>{
 assert.match(social,/new CustomEvent\('sf-profile-follow-changed',\{detail:\{profileId:id\}\}\)/);
 assert.match(profile,/window\.addEventListener\('sf-profile-follow-changed', onChange\)/);
 assert.match(profile,/detail\?\.profileId === profile\.id/);
 assert.match(profile,/setRefresh\(previous => previous \+ 1\)/);
 assert.match(profile,/rpc\('sf_profile_follow_counts'/);
 assert.match(profile,/viewerId !== profile\.id/);
});
test('global DOM observer is temporary and does not run on each post append forever',()=>{
 assert.match(profile,/new MutationObserver\(\(\) =>/);
 assert.match(profile,/window\.requestAnimationFrame/);
 assert.match(profile,/if \(next\.info && next\.tabs && next\.posts\) observer\.disconnect\(\)/);
 assert.match(profile,/window\.cancelAnimationFrame\(pendingFrame\)/);
});
test('timeline share uses real post URL and supports native share or clipboard fallback',()=>{
 assert.match(social,/async function sharePost\(post:Post\)/);
 assert.match(social,/new URL\('\/post\/'\+encodeURIComponent\(post\.id\),window\.location\.origin\)/);
 assert.match(social,/navigator\.share\(\{title:'星流 Starflow',url:address\}\)/);
 assert.match(social,/navigator\.clipboard\.writeText\(address\)/);
 assert.match(social,/onClick=\{\(\)=>void sharePost\(post\)\}/);
 assert.match(social,/aria-pressed=\{m\.liked\}/);
 assert.match(social,/aria-pressed=\{m\.reposted\}/);
 assert.match(social,/aria-pressed=\{m\.saved\}/);
});
test('low-GPU glass mode persists without expensive blur and respects existing accessibility',()=>{
 assert.match(preferences,/const LITE_GLASS_KEY='sf-user-lite-glass'/);
 assert.match(preferences,/localStorage\.getItem\(LITE_GLASS_KEY\)==='true'/);
 assert.match(preferences,/update\(LITE_GLASS_KEY,event\.target\.checked,setLiteGlass\)/);
 assert.match(layout,/classList\.toggle\('sf-user-lite-glass'/);
 assert.match(css,/html\.sf-user-lite-glass\s*\{/);
 assert.match(css,/-webkit-backdrop-filter:none!important;backdrop-filter:none!important/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/html\[data-sf2-theme="dark"\]/);
});
