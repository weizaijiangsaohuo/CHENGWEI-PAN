import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const layout=read('app/layout.tsx');
const mobile=read('components/StarflowMobileNavigation.tsx');
const css=read('app/starflow-2.css');
const spec=read('design/STARFLOW_2_PRODUCT_SPEC.md');
const designLab=read('components/StarflowDesignLab.tsx');

function renderBootstrap(preference,systemDark=false){
 const match=layout.match(/const bootstrapAppearance = \x60([\s\S]*?)\x60;/);
 assert.ok(match,'pre-hydration appearance bootstrap present');
 let result;
 const document={documentElement:{
  classList:{toggle:(name,value)=>{assert.equal(name,'sf-user-lite-glass');assert.equal(value,false);}},
  setAttribute:(name,value)=>{
   assert.equal(name,'data-sf2-theme');result=value;
  }
 }};
 const localStorage={getItem:key=>key==='sf2-theme'?preference:null};
 const window={matchMedia:()=>({matches:systemDark})};
 runInNewContext(match[1],{document,localStorage,window});
 return result;
}

test('dark mode is restored before React paints, not only in useEffect',()=>{
 assert.match(layout,/suppressHydrationWarning/);
 assert.match(layout,/<head><script dangerouslySetInnerHTML/);
 assert.equal(renderBootstrap('dark',false),'dark');
 assert.equal(renderBootstrap('light',true),'light');
 assert.equal(renderBootstrap('system',true),'dark');
 assert.equal(renderBootstrap(null,false),'light');
});

test('selected liquid pill can travel between Next route remounts',()=>{
 assert.match(mobile,/useLayoutEffect/);
 assert.match(mobile,/sessionStorage\.getItem\('sf2-last-nav-slot'\)/);
 assert.match(mobile,/setIndicatorSlot\(from\.slot\)/);
 assert.match(mobile,/requestAnimationFrame/);
 assert.match(mobile,/cancelAnimationFrame/);
 assert.match(mobile,/--sf2-active-slot/);
 assert.match(mobile,/onClick=\{markNavigation\}/);
 assert.match(mobile,/aria-current=\{item\.active\?'page'/);
 assert.match(css,/transition:transform var\(--sf2-nav\)/);
});

test('dark mode never forces legacy white surfaces in critical utility pages',()=>{
 for(const selector of ['.sf-home-drawer-group','.sf-display-options','.sf-dm-compose','.sac-card']){
  assert.ok(css.includes('html[data-sf2-theme="dark"] '+selector),selector);
 }
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(prefers-reduced-transparency:reduce\)/);
});

test('all handoff links are real and route skeleton is truthful',()=>{
 assert.match(spec,/figma\.com\/design\/I4LzIPERJmtZtQMORfietK/);
 assert.match(designLab,/figma\.com\/design\/I4LzIPERJmtZtQMORfietK/);
 assert.match(designLab,/url:'\/profile\/wei'/);
 assert.match(read('app/loading.tsx'),/aria-busy="true"/);
 assert.match(css,/\.sf2-route-loading-post/);
 assert.doesNotMatch(read('app/loading.tsx'),/likes|followers|users|fake/);
});
