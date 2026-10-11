import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const social=read('components/SocialApp.tsx');
const home=read('app/page.tsx');
const style=read('app/landing.module.css');
test('route navigation never remounts an entire splash logo',()=>{
 assert.match(social,/if\(checking\)return <main className="sf-section-loading"/);
 assert.doesNotMatch(social,/if\(checking\)return <main className="center-screen sf-boot-screen"/);
});
test('initial public home shows brand only once per browser tab',()=>{
 assert.match(home,/sessionStorage\.getItem\('sf-entry-logo-seen'\)/);
 assert.match(home,/sessionStorage\.setItem\('sf-entry-logo-seen','1'\)/);
 assert.match(home,/screen==='checking'&&!showInitialLogo/);
 assert.match(home,/sf-boot-screen/);
});
test('public-facing landing animates without blocking navigation, supports reduced motion',()=>{
 assert.match(home,/sf-public-landing/);
 assert.match(home,/IntersectionObserver/);
 assert.match(style,/sf-landing-card-in/);
 assert.match(style,/prefers-reduced-motion:reduce/);
 assert.match(home,/starflow-official-mark\.webp/);
 assert.doesNotMatch(style,/scroll-snap-type/);
});

test('logo tap genuinely refreshes the public homepage',()=>{
 assert.match(home,/aria-label=\{en\?'Refresh Starflow home':'刷新星流首页'\}/);
 assert.match(home,/event\.preventDefault\(\);window\.location\.reload\(\)/);
});
test('AI customer support is at the footer bottom and not repeated under hero title',()=>{
 const hero=home.slice(home.indexOf('<section className={styles.hero}>'),home.indexOf('<StarflowMotionShowcase'));
 assert.doesNotMatch(hero,/href="\/support"/);
 assert.match(home,/className=\{styles\.footerHelp\}/);
 assert.match(home,/href="\/support"/);
 assert.match(home,/screen==='member'&&<StarflowAiWidget/);
});
test('resource cards expose consistent compact content structure and all legal links',()=>{
 assert.match(home,/className=\{styles\.resourceContent\}/);
 assert.match(home,/className=\{styles\.resourceIndex\}/);
 for(const url of ['/terms','/privacy','/guidelines'])assert.ok(home.includes('href="'+url+'"'));
 assert.match(style,/resource\{display:grid/);
 assert.match(style,/featureIndex/);
});
