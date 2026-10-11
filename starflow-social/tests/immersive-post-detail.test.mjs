import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const page=read('../app/post/[id]/page.tsx');
const detail=read('../components/StarflowPostDetail.tsx');
const css=read('../components/StarflowPostDetail.css');
const feed=read('../components/StarflowMasonryFeed.tsx');

test('Tapping a feed post opens a dedicated immersive details page',()=>{
 assert.match(page,/StarflowPostDetail postId=\{id\}/);
 assert.doesNotMatch(page,/SocialApp view="post"/);
 assert.match(feed,/href=\{'\/post\/'\+encodeURIComponent\(post\.id\)\}/);
 assert.match(css,/\.sf-detail-nav\{.*position:sticky/);
 assert.match(css,/\.sf-detail-dock\{position:fixed/);
});

test('Details include complete media, photos, comments and a reply composer',()=>{
 assert.match(detail,/post\.video_url&&<div className="sf-detail-media sf-detail-video"/);
 assert.match(detail,/controls playsInline preload="metadata"/);
 assert.match(detail,/result\.has_gallery\?client\.from\('post_media'\)/);
 assert.match(detail,/onTouchStart=\{onTouchStart\} onTouchEnd=\{onTouchEnd\}/);
 assert.match(detail,/post\.content\|\|'分享了一段精彩瞬间'/);
 assert.match(detail,/\.eq\('parent_id',id\)\.order\('created_at'/);
 assert.match(detail,/from\('posts'\)\.insert\(\{/);
 assert.match(detail,/parent_id:post\.id/);
 assert.match(detail,/replyTo\?'@'\+replyTo\.handle/);
 assert.match(detail,/form className="sf-detail-dock"/);
 assert.match(detail,/onSubmit=\{event=>void sendComment\(event\)\}/);
 assert.match(detail,/sendComment/);
 assert.match(detail,/deleteComment/);
});

test('Engagement buttons call production Supabase tables and users can follow',()=>{
 for(const name of ['likes','reposts','bookmarks'])assert.ok(detail.includes("toggleAction('"+name+"')"),name);
 assert.match(detail,/client\.from\(kind\)\.insert\(\{post_id:post\.id,user_id:user\.id\}\)/);
 assert.match(detail,/client\.from\(kind\)\.delete\(\)\.eq\('post_id',post\.id\)/);
 assert.match(detail,/client\.from\('follows'\)\.insert\(/);
 assert.match(detail,/\.rpc\('sf_record_post_view'/);
 assert.match(detail,/\.rpc\('sf_post_view_counts'/);
 assert.match(detail,/\.rpc\('sf_post_view_counts',\{p_post_ids:\[currentId\]\}\)/);
 assert.match(detail,/navigator\.share/);
 assert.match(detail,/navigator\.clipboard\.writeText/);
});

test('Mobile input uses safe-area inset and does not expose data to nonmembers',()=>{
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(detail,/client\.auth\.getUser\(\)/);
 assert.match(detail,/if\(!user\)return <main/);
 assert.match(detail,/parent_id',id/);
 assert.doesNotMatch(detail,/fakeCount|mockComments|Math\.random\(/);
});
