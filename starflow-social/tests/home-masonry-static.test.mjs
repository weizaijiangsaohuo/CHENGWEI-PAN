import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../components/StarflowMasonryFeed.tsx',import.meta.url),'utf8');
const styles=readFileSync(new URL('../components/StarflowMasonryFeed.css',import.meta.url),'utf8');
test('discovery cards contain actual posts and preserved actions',()=>{
 assert.match(source,/posts\.filter/);
 assert.match(source,/\/post\/\x27\+encodeURIComponent\(post\.id\)/);
 assert.match(source,/onLike\(post\)/);
 assert.match(source,/onBookmark\(post\)/);
 assert.match(source,/onOpenPost\(post\)/);
 assert.match(source,/VerificationBadge/);
});
test('content cards are responsive, native-scrolling and reduced-motion friendly',()=>{
 assert.match(styles,/columns:2/);
 assert.match(styles,/columns:3/);
 assert.match(styles,/break-inside:avoid/);
 assert.match(styles,/scrollbar-width:none/);
 assert.match(styles,/-webkit-overflow-scrolling:touch/);
 assert.match(styles,/prefers-reduced-motion:reduce/);
});
test('feed reveals bounded records instead of rendering all 80 at once',()=>{
 assert.match(source,/visibleCount/);
 assert.match(source,/IntersectionObserver/);
 assert.match(source,/filtered\.slice\(0,visibleCount\)/);
 assert.match(source,/loading=\{index<4\?'eager':'lazy'\}/);
});
test('categories filter real user posts rather than invented trend counts',()=>{
 assert.match(source,/matcher\.test\(post\.content\)/);
 assert.match(source,/post\.video_url/);
 assert.match(source,/post\.image_url/);
 assert.doesNotMatch(source,/mockPosts|sampleImages|fakeCount/);
});
