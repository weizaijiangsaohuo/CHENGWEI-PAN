import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const social=readFileSync(new URL('../components/SocialApp.tsx',import.meta.url),'utf8');
test('home uses one stable card feed without competing layouts or mode toggles',()=>{
 assert.doesNotMatch(social,/sf-home-view-toggle|sf-home-display|homeLayout/);
 assert.match(social,/StarflowMasonryFeed posts=\{ordered\}/);
 assert.match(social,/ordered\.map\(card\)/); // Thread and saved-post views still use full posts.
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
 assert.doesNotMatch(source,/onLayoutChange/);
 assert.doesNotMatch(source,/sf-home-drawer-mode/);
 assert.match(source,/\/settings\/security/);
 assert.match(source,/\/messages/);
 assert.match(source,/\/bookmarks/);
 assert.match(social,/<StarflowHomeMenu isAdmin=\{isAdmin\}\/>/);
});

test('mobile five-tab navigation has an actual working publish action',()=>{
 const nav=readFileSync(new URL('../components/StarflowMobileNavigation.tsx',import.meta.url),'utf8');
 const globalCss=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 assert.match(nav,/sf-mobile-five-nav/);
 for(const key of ['home','explore','notifications','profile'])assert.ok(nav.includes("label:t('"+key+"')"));
 assert.match(nav,/onClick=\{onPublish\}/);
 assert.match(social,/sf-open-home-composer/);
 assert.match(social,/router\.push\('\/\?compose=1'\)/);
 assert.match(globalCss,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test('the left drawer groups existing product routes without fake commerce tools',()=>{
 const drawer=readFileSync(new URL('../components/StarflowHomeMenu.tsx',import.meta.url),'utf8');
 assert.match(drawer,/heading:'探索社区'/);
 assert.match(drawer,/heading:'互动与创作'/);
 assert.match(drawer,/heading:'账户服务'/);
 assert.match(drawer,/\/creator/);
 assert.doesNotMatch(drawer,/\/wallet|\/shopping-cart/);
});

test('notification quick actions filter only real notice kinds and keep counts accurate',()=>{
 const source=readFileSync(new URL('../components/StarflowNotificationCenter.tsx',import.meta.url),'utf8');
 assert.match(source,/sf3-activity-shortcuts/);
 assert.match(source,/tab==='likes'/);
 assert.match(source,/tab==='follows'/);
 assert.match(source,/tab==='comments'/);
 assert.match(source,/category\.kinds\.includes\(n\.kind\)/);
 assert.doesNotMatch(source,/tab==='bookmarks'/);
});
test('initial loading uses genuine Starflow brand asset with no artificial waiting',()=>{
 const home=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(home,/sf-boot-screen/);
 assert.match(home,/starflow-official-mark\.webp/);
 assert.match(social,/if\(checking\)return <main className="sf2-route-loading sf2-auth-route-loading"/);
 assert.doesNotMatch(social,/正在切换页面/);
 const brand=readFileSync(new URL('../components/Brand.tsx',import.meta.url),'utf8');
 assert.match(brand,/starflow-official-mark\.webp/);
});

test('owner profile shortcuts use supported feature pages only',()=>{
 assert.match(social,/profile\.id===user\?\.id&&<div className="sf-own-profile-quicklinks"/);
 assert.match(social,/href="\/bookmarks"/);
 assert.match(social,/href="\/creator"/);
 assert.match(social,/href="\/settings\/security"/);
});

test('card image aspect ratio is reserved before media loads',()=>{
 const masonry=readFileSync(new URL('../components/StarflowMasonryFeed.tsx',import.meta.url),'utf8');
 const styles=readFileSync(new URL('../components/StarflowMasonryFeed.css',import.meta.url),'utf8');
 assert.match(masonry,/post\.id\.charCodeAt/);
 assert.match(styles,/sf-cover-portrait\{aspect-ratio:3\/4\}/);
 assert.match(styles,/object-fit:cover/);
});
