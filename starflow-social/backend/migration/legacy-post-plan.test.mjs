import {test} from 'node:test';import assert from 'node:assert/strict';import {planLegacyPosts} from './legacy-post-plan.mjs';
const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),at='2026-10-10T00:00:00.123456Z';
const source=()=>({profiles:[{id:id(1)}],posts:[{id:id(2),author_id:id(1),content:'',image_url:'https://example.invalid/image',video_url:null,parent_id:null,created_at:at,has_poll:true,has_gallery:true},{id:id(3),author_id:id(1),content:'reply',image_url:null,video_url:null,parent_id:id(2),created_at:at,has_poll:false,has_gallery:false}],post_media:[{id:id(4),post_id:id(2),media_url:'https://example.invalid/gallery',position:0,created_at:at}],post_polls:[{id:id(5),post_id:id(2),question:'fixture?',expires_at:at,created_at:at}],poll_options:[{id:id(6),poll_id:id(5),label:'A',position:0},{id:id(7),poll_id:id(5),label:'B',position:1}],poll_votes:[{poll_id:id(5),option_id:id(6),user_id:id(1),created_at:at}]});
test('preserves stable IDs, ordering metadata, timestamps and media-only posts without exposing private content',()=>{
 const s=source(),before=structuredClone(s),r=planLegacyPosts(s);
 assert.equal(r.importReady,false);assert.equal(r.posts[0].content,'');assert.equal(r.posts[0].id,id(2));assert.equal(r.posts[1].legacy.parent_id,id(2));
 assert.equal(r.posts[0].created_at,at);assert.ok(r.posts.every(p=>p.visibility==='private'));
 for(const k of ['post_media','post_polls','poll_options','poll_votes'])assert.deepEqual(r[k],s[k]);
 assert.deepEqual(s,before);
});
test('unknown columns, missing records, unsafe URLs, reply cycles and duplicate votes fail closed',()=>{
 for(const [edit,error] of [
  [s=>s.posts[0].unknown='fixture','post_unmapped_column'],
  [s=>s.posts[0].author_id=id(9),'post_invalid'],
  [s=>s.posts[0].image_url='http://example.invalid','post_media_invalid'],
  [s=>s.posts[0].parent_id=id(3),'post_reply_cycle'],
  [s=>s.posts[1].parent_id=id(9),'post_parent_missing'],
  [s=>s.post_media.push({...s.post_media[0],id:id(8)}),'media_duplicate_position'],
  [s=>s.poll_votes.push({...s.poll_votes[0]}),'vote_duplicate'],
  [s=>s.poll_votes[0].option_id=id(9),'vote_invalid'],
  [s=>s.posts[0].has_gallery=false,'post_flags_inconsistent'],
  [s=>delete s.post_media,'media_missing']
 ]){
  const s=source();edit(s);assert.throws(()=>planLegacyPosts(s),new RegExp(error));
 }
});
