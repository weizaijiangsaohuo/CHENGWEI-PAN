import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const social=read('components/SocialApp.tsx');
const home=read('app/page.tsx');
const landing=read('components/StarflowLandingExperience.tsx');
const style=read('components/StarflowLandingExperience.css');

test('signed-in route navigation never remounts the full-screen logo',()=>{
 assert.match(social,/if\(checking\)return <main className="sf-section-loading"/);
 assert.doesNotMatch(social,/sf-boot-screen/);
 assert.match(home,/StarflowLandingExperience onJoin=/);
 assert.doesNotMatch(home,/sf-boot-screen/);
});
test('one-time public brand intro uses a browser session guard and can be skipped',()=>{
 assert.match(landing,/sessionStorage.getItem\('sf-landing-intro-shown'\)/);
 assert.match(landing,/sessionStorage.setItem\('sf-landing-intro-shown','1'\)/);
 assert.match(landing,/onClick=\{\(\)=>\{setIntro\(false\);setIntroComplete\(true\)\}\}/);
 assert.match(landing,/prefers-reduced-motion: reduce/);
});
test('guest landing has nonblocking scroll animation and reduced-motion support',()=>{
 assert.match(landing,/IntersectionObserver/);
 assert.match(style,/sf-cinema-reveal/);
 assert.match(style,/prefers-reduced-motion:reduce/);
 assert.match(landing,/starflow-official-mark.webp/);
 assert.match(style,/sf-cinema-orbit/);
 assert.doesNotMatch(style,/scroll-snap-type/);
});
test('homepage navigation does not reload the whole app when logo is tapped',()=>{
 assert.match(landing,/className="sf-cinema-brand"/);
 assert.match(landing,/href="\/"/);
 assert.doesNotMatch(landing,/window.location.reload/);
});
test('AI help and legal resources are reachable from the landing and member chat stays separate',()=>{
 const hero=landing.slice(landing.indexOf('<section className="sf-cinema-hero"'),landing.indexOf('<section id="sf-cinema-experience"'));
 assert.doesNotMatch(hero,/href="\/support"/);
 for(const url of ['/support','/terms','/privacy','/guidelines'])assert.ok(landing.includes('href="'+url+'"'));
 assert.match(home,/screen==='member'&&<StarflowAiWidget/);
});
test('feature tabs and mobile resources have functional interaction and links',()=>{
 assert.match(landing,/role="tablist"/);
 assert.match(landing,/setActive\(index\)/);
 assert.match(landing,/role="tabpanel"/);
 assert.match(style,/sf-cinema-resource-grid/);
 assert.match(style,/@media\(max-width:700px\)/);
});
test('new romantic visitor landing has scrolling chapter anchors, not technical launch copy',()=>{
 assert.doesNotMatch(landing,/网页端现已开放 · 中文 \/ English · 独立社交平台/);
 for(const anchor of ['sf-cinema-experience','sf-cinema-world','sf-cinema-resources']){
   assert.ok(landing.includes('id="'+anchor+'"'));
 }
 assert.match(landing,/className="sf-cinema-scroll"/);
});
test('approved official Starflow logo and soft pink-purple cosmic palette are retained',()=>{
 assert.match(landing,/starflow-official-mark.webp/);
 assert.match(style,/sf-cinema-universe/);
 assert.match(style,/#e[a-fA-F0-9]{5}|#f[a-fA-F0-9]{5}/);
 assert.match(style,/prefers-reduced-motion:reduce/);
});
