import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const page=src('app/page.tsx');
const approvedLanding=src('components/StarflowLandingExperience.tsx');
const comp=src('components/StarflowMotionShowcase.tsx');
const css=src('components/StarflowMotionShowcase.css');
test('approved interactive cinematic sections replace the legacy moving rail on the public homepage',()=>{
 assert.match(page,/StarflowLandingExperience onJoin=/);
 assert.match(approvedLanding,/sf-cinema-experience-grid/);
 assert.match(approvedLanding,/role="tablist"/);
 assert.match(approvedLanding,/sf-cinema-world-art/);
 assert.doesNotMatch(page,/StarflowMotionShowcase english=/);
});
test('smooth continuous carousel is entirely CSS and never intercepts touch or scroll',()=>{
 assert.match(css,/animation:sf-motion-slide 48s linear infinite/);
 assert.match(css,/translate3d\(-50%,0,0\)/);
 assert.match(css,/animation-play-state:paused/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/-webkit-overflow-scrolling:touch/);
 assert.doesNotMatch(comp,/useEffect|requestAnimationFrame|addEventListener/);
});
test('duplicate sliding rail stays out of keyboard and screen reader navigation',()=>{
 assert.match(comp,/aria-hidden="true" inert/);
 assert.match(comp,/tabIndex=\{duplicate\?-1:0\}/);
 assert.match(comp,/starflow-official-mark\.webp/);
});
