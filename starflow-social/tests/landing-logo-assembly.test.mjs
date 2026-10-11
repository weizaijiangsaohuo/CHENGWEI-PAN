import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page=read('app/page.tsx');
const art=read('components/StarflowAssemblyHero.tsx');
const css=read('components/StarflowAssemblyHero.css');
const approved=read('components/StarflowLandingExperience.tsx');

test('latest approved visitor hero preserves official brand and space art without obsolete white mockup',()=>{
 assert.match(page,/StarflowLandingExperience onJoin=/);
 assert.doesNotMatch(page,/className=\{styles\.mockup\}/);
 assert.match(approved,/sf-cinema-universe/);
 assert.match(approved,/starflow-official-mark\.webp/);
 assert.match(art,/sf-constellation-scene/);
});
test('real mark quadrants converge into one brand mark',()=>{
 assert.match(art,/starflow-official-mark\.webp/);
 assert.match(art,/shards=\['northwest','northeast','southwest','southeast'\]/);
 assert.match(css,/clip-path:inset\(0 50% 50% 0\)/);
 assert.match(css,/@keyframes sf-cosmos-assemble/);
 assert.match(css,/@keyframes sf-cosmos-full-mark/);
 assert.match(css,/@keyframes sf-cosmos-star-gather/);
});
test('replay works while accessibility disables all entrance movement',()=>{
 assert.match(art,/key=\{replay\}/);
 assert.match(art,/onClick=\{\(\)=>setReplay\(value=>value\+1\)\}/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/sf-user-motion-off/);
 assert.match(css,/sf-cosmos-replay\{display:none!important\}/);
});
test('no client-side scroll listeners or 3D engine in the hero',()=>{
 assert.doesNotMatch(art, /\b(requestAnimationFrame|addEventListener|scrollTo|setInterval)\s*\(/);
 assert.doesNotMatch(art, /<canvas\b|new WebGLRenderingContext/);
 assert.doesNotMatch(css,/scroll-snap-type/);
});
