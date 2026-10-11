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

test('cinematic hero has real brand visuals, layers and working scroll navigation',()=>{
 assert.match(home,/heroBackdrop/);
 assert.match(home,/portalStage/);
 assert.match(home,/portalGlyph/);
 assert.match(home,/starflow-official-mark\.webp/);
 assert.match(home,/href="#discover"/);
 assert.match(home,/showcaseBridge/);
 assert.match(home,/motionTicker/);
 assert.match(style,/sf-cinematic-aurora/);
 assert.match(style,/sf-orbit-sweep/);
 assert.match(style,/sf-ticker/);
 assert.match(style,/prefers-reduced-motion:reduce/);
});
test('hero pointer effects are passive and respect reduced motion',()=>{
 assert.match(home,/window\.addEventListener\('pointermove',move,\{passive:true\}\)/);
 assert.match(home,/cancelAnimationFrame/);
 assert.match(home,/prefers-reduced-motion: reduce/);
 assert.doesNotMatch(home,/addEventListener\('touchmove'/);
});
