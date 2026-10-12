import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const manager=read('components/StarflowAffiliationManager.tsx');
const route=read('app/organization/affiliates/loading.tsx');
const css=read('app/starflow-affiliations.css');

test('affiliates load in-place with stable account page chrome, no blank full-screen navigation splash',()=>{
 assert.match(route,/sf-aff-page/);
 assert.match(route,/官方附属账号/);
 assert.match(route,/sf-aff-skeleton-card/);
 assert.match(route,/aria-live="polite"/);
 assert.match(manager,/sf-aff-skeleton-card/);
 assert.match(manager,/正在读取账户关系/);
 assert.doesNotMatch(route,/正在切换页面/);
});

test('after successful actions, data refresh does not replace all cards with a loader',()=>{
 assert.match(manager,/const \[refreshing,setRefreshing\]=useState\(false\)/);
 assert.match(manager,/if\(silent\)setRefreshing\(true\)/);
 assert.match(manager,/else setLoading\(true\)/);
 assert.match(manager,/await load\(true\)/);
 assert.match(manager,/setHint\('邀请已发送/);
 assert.match(manager,/正在更新账户关系，当前内容可继续浏览/);
 assert.match(manager,/onClick=\{\(\)=>void load\(true\)\}/);
});

test('skeleton degrades safely in dark mode and with reduced motion',()=>{
 assert.match(css,/\.sf-aff-loading>p/);
 assert.match(css,/\.sf-aff-skeleton-card/);
 assert.match(css,/@media\(prefers-reduced-motion:no-preference\)/);
 assert.match(css,/html\[data-sf2-theme="dark"\] \.sf-aff-invite/);
 assert.match(css,/\.sf-aff-page\{background:var\(--sf2-canvas/);
});
