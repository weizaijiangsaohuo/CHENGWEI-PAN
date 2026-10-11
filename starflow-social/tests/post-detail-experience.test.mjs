import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const page=read('../app/post/[id]/page.tsx');
const detail=read('../components/StarflowPostDetail.tsx');
const css=read('../components/StarflowPostDetail.css');
const feed=read('../components/StarflowMasonryFeed.tsx');

test('Post routes render dedicated immersive reader, not the general-purpose feed',()=>{
 assert.match(page,/import \{StarflowPostDetail\} from '@\/components\/StarflowPostDetail'/);
 assert.match(page,/<StarflowPostDetail postId=\{id\}\/>/);
 assert.doesNotMatch(page,/<SocialApp view="post"/);
 assert.match(feed,/href=\{'\/post\/'.encodeURIComponent\(post\.id\)\}/);
});

test('Post detail renders photos, video, readable text, image pager, and comments',()=>{
 assert.match(detail,/\.from\('posts'\)\.select\(fields\)\.eq\('id',postId\)/);
 assert.match(detail,/<video src=\{post\.video_url\} controls playsInline/);
 assert.match(detail,/sf-detail-images/);
 assert.match(detail,/onTouchStart=\{onTouchStart\}/);
 assert.match(detail,/sf-detail-content/);
 assert.match(detail,/sf-detail-comments/);
 assert.match(detail,/\.eq\('parent_id',id\)\.order\('created_at'/);
 assert.match(detail,/setComments\(rows\)/);
});

test('Comments and reactions are real writes, not locally invented numbers',()=>{
 assert.match(detail,/from\('posts'\)\.insert\(\{/);
 assert.match(detail,/author_id:user\.id, parent_id:post\.id/);
 assert.match(detail,/loadComments\(post\.id,user\.id\),loadStats\(post\.id,user\.id\)/);
 assert.match(detail,/from\('likes'\)/);
 assert.match(detail,/\.from\(kind\)\.insert\(\{post_id:post\.id,user_id:user\.id\}\)/);
 assert.match(detail,/rpc\('sf_record_post_view'/);
 assert.match(detail,/rpc\('sf_post_view_counts'/);
 assert.match(detail,/onClick=\{openComments\}/);
 assert.match(detail,/aria-label="发表动态评论"/);
});

test('Mobile persistent comment bar and native media controls are available',()=>{
 assert.match(css,/\.sf-detail-dock\{position:fixed/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(detail,/aria-label="发送评论"/);
 assert.match(detail,/aria-label="点赞"/);
 assert.match(detail,/aria-label="收藏"/);
 assert.match(detail,/aria-label="分享动态"/);
});
