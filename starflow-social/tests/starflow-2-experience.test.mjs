import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const layout=read('app/layout.tsx');
const css=read('app/starflow-2.css');
const social=read('components/SocialApp.tsx');
const mobile=read('components/StarflowMobileNavigation.tsx');
const prefs=read('components/StarflowDisplayPreferences.tsx');
const glass=read('components/StarflowGlass.tsx');
const lab=read('components/StarflowDesignLab.tsx');
const tokens=JSON.parse(read('design/starflow-2.tokens.json'));

test('final Nebula Glass stylesheet overrides legacy sheets, with no private data logic',()=>{
 assert.match(layout,/import '\.\/starflow-2\.css'/);
 assert.ok(layout.lastIndexOf("starflow-2.css")>layout.lastIndexOf("starflow-mentions.css"));
 assert.match(css,/--sf2-glass:/);
 assert.match(css,/--sf2-brand:/);
 assert.match(css,/--sf2-active-slot/);
 assert.match(css,/content-visibility:auto/);
 assert.match(css,/backdrop-filter:none!important/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/prefers-reduced-transparency:reduce/);
 assert.match(css,/prefers-contrast:more/);
});
test('recommendation and actual following timelines are functionally separate',()=>{
 assert.match(social,/aria-pressed=\{tab==='all'&&feedSort==='recommended'\}/);
 assert.match(social,/aria-pressed=\{tab==='all'&&feedSort==='latest'\}/);
 assert.match(social,/aria-pressed=\{tab==='following'\}/);
 assert.match(social,/tab==='all'\?/);
 assert.match(social,/className="posts-list sf2-following-list"/);
 assert.match(social,/ordered\.map\(card\)/);
 assert.match(social,/following\.includes\(p\.author_id\)/);
 assert.match(social,/sf2-feed-skeleton/);
});
test('native mobile navigation uses same real route handlers with a glass moving puck',()=>{
 assert.match(mobile,/--sf2-active-slot/);
 assert.match(mobile,/profileUrl/);
 assert.match(mobile,/onClick=\{onPublish\}/);
 assert.match(css,/translate3d\(calc\(var\(--sf2-active-slot,0\)\*100%\)/);
});
test('persistent light/dark/system theme and reusable accessible primitives',()=>{
 assert.equal(tokens.color.brand.primary.$value,'#7549BD');
 assert.ok(tokens.spacing['16'].$value==='16px');
 assert.match(prefs,/sf2-theme/);
 assert.match(prefs,/GlassSegmentedControl<Appearance>/);
 assert.match(prefs,/prefers-color-scheme: dark/);
 assert.match(prefs,/setAttribute\('data-sf2-theme'/);
 assert.match(glass,/role="group" aria-label=\{label\}/);
 assert.match(glass,/aria-pressed=\{value===option.value\}/);
 assert.match(lab,/onClick=\{\(\)=>setSample/);
 assert.match(lab,/href=\{item.url\}/);
 assert.match(lab,/localStorage\.setItem\('sf2-theme'/);
});
