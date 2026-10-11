import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page=read('app/page.tsx');
const art=read('components/StarflowAssemblyHero.tsx');
const css=read('components/StarflowAssemblyHero.css');
test('reference mockup is replaced in exactly the public homepage hero',()=>{
 assert.match(page,/<StarflowAssemblyHero english=\{en\}\/>/);
 assert.doesNotMatch(page,/className=\{styles\.mockup\}/);
 assert.match(art,/让想法相遇。/);
 assert.match(art,/每个人都有自己的故事/);
});
test('actual official symbol splits into four quarters and assembles at the UI brand',()=>{
 assert.match(art,/starflow-official-mark\.webp/);
 assert.match(art,/fragmentNames=\['northwest','northeast','southwest','southeast'\]/);
 assert.match(css,/clip-path:inset\(0 50% 50% 0\)/);
 assert.match(css,/@keyframes sf-assembly-separate/);
 assert.match(css,/@keyframes sf-assembly-panel/);
 assert.match(css,/@keyframes sf-assembly-particle/);
});
test('replay is interactive while reduced motion displays a complete readable card',()=>{
 assert.match(art,/useState\(0\)/);
 assert.match(art,/key=\{replay\}/);
 assert.match(art,/onClick=\{\(\)=>setReplay\(n=>n\+1\)\}/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/sf-user-motion-off/);
 assert.match(css,/animation:none!important;opacity:1!important/);
});
test('motion does not hijack scrolling or introduce heavy realtime rendering',()=>{
 assert.doesNotMatch(art,/requestAnimationFrame|touchmove|scrollTo|canvas|WebGL|setInterval/);
 assert.doesNotMatch(css,/scroll-snap-type/);
});
