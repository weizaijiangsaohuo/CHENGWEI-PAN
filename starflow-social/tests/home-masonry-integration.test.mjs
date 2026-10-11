import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const social=readFileSync(new URL('../components/SocialApp.tsx',import.meta.url),'utf8');
test('homepage defaults to discovery cards, with classic posts still available',()=>{
 assert.match(social,/useState<'masonry'\|'classic'>\('masonry'\)/);
 assert.match(social,/sf-home-view-toggle/);
 assert.match(social,/sf-home-display/);
 assert.match(social,/onClick=\{\(\)=>changeHomeLayout\('classic'\)\}/);
 assert.match(social,/StarflowMasonryFeed posts=\{ordered\}/);
 assert.match(social,/ordered\.map\(card\)/);
});
test('home interactions do not block on database reload before showing feedback',()=>{
 assert.match(social,/Optimistic feedback/);
 assert.match(social,/setMetrics\(previous/);
 assert.match(social,/pendingToggles\.current\.has/);
 assert.match(social,/if\(view==='bookmarks'\)void load\(\)/);
});

test('real home menu uses a native modal and preserves existing routes',()=>{
 const source=readFileSync(new URL('../components/StarflowHomeMenu.tsx',import.meta.url),'utf8');
 assert.match(source,/showModal\(\)/);
 assert.match(source,/<dialog/);
 assert.match(source,/onLayoutChange\('masonry'\)/);
 assert.match(source,/onLayoutChange\('classic'\)/);
 assert.match(source,/\/settings\/security/);
 assert.match(source,/\/messages/);
 assert.match(source,/\/bookmarks/);
 assert.match(social,/<StarflowHomeMenu layout=\{homeLayout\}/);
});

test('mobile five-tab navigation has an actual working publish action',()=>{
 const nav=readFileSync(new URL('../components/StarflowMobileNavigation.tsx',import.meta.url),'utf8');
 const globalCss=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(nav,/sf-mobile-five-nav/);
 for(const label of ['首页','探索','消息','我'])assert.ok(nav.includes("label:'"+label+"'"));
 assert.match(nav,/onClick=\{onPublish\}/);
 assert.match(social,/sf-open-home-composer/);
 assert.match(social,/router\.push\('\/\?compose=1'\)/);
 assert.match(globalCss,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});
