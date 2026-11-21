import {test} from 'node:test';import assert from 'node:assert/strict';import {planLegacyPosts,reconcileLegacyPostInventory} from './legacy-post-plan.mjs';
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

const inventory=s=>({version:1,tables:[
 {schema_name:'auth',table_name:'users',row_count:'1',columns:['id']},
 ...['follows','likes','bookmarks'].map(table_name=>({schema_name:'public',table_name,row_count:'0',columns:['id']})),
 ...['objects','buckets'].map(table_name=>({schema_name:'storage',table_name,row_count:'0',columns:['id']})),
 ...Object.keys(s).map(table_name=>({schema_name:'public',table_name,row_count:String(s[table_name].length),columns:['id']}))
]});
test('scoped inventory reconciliation reports counts only and cannot authorize import or cutover',()=>{
 const s=source(),i=inventory(s),before=structuredClone({s,i});
 const r=reconcileLegacyPostInventory(i,s);
 assert.equal(r.scopedCountsMatch,true);assert.equal(r.readyForImport,false);assert.equal(r.readyForCutover,false);
 assert.equal(r.counts.length,6);assert.deepEqual(r.counts.find(x=>x.table==='public.posts'),{table:'public.posts',count:'2'});
 assert.doesNotMatch(JSON.stringify(r),/example.invalid|reply|00000000/);
 assert.deepEqual({s,i},before);
});
test('reconciliation blocks partial exports, missing inventory, extra tables and invalid rows',()=>{
 const s=source(),i=inventory(s);
 assert.throws(()=>reconcileLegacyPostInventory(i,{...s,posts:s.posts.slice(0,1)}),/source_count_mismatch/);
 assert.throws(()=>reconcileLegacyPostInventory({...i,tables:i.tables.filter(x=>x.table_name!=='poll_votes')},s),/inventory_table_missing/);
 assert.throws(()=>reconcileLegacyPostInventory({...i,tables:i.tables.filter(x=>x.table_name!=='users')},s),/inventory_incomplete/);
 assert.throws(()=>reconcileLegacyPostInventory(i,{...s,accounts:[]}),/source_scope_invalid/);
 assert.throws(()=>reconcileLegacyPostInventory(i,{...s,posts:s.posts.map(p=>({...p,author_id:id(99)}))}),/post_invalid/);
});
