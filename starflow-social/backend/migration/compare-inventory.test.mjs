import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareInventory} from './compare-inventory.mjs';
const row=(schema_name,table_name,row_count='0',columns=['id'])=>({schema_name,table_name,row_count,columns});
const base=()=>[row('auth','users','2'),row('public','profiles','2'),row('public','posts','1',['id','image_url','parent_id']),row('public','follows'),row('public','likes'),row('public','bookmarks'),row('storage','objects'),row('storage','buckets')];
test('complete inventory still blocks production cutover and detects known schema differences',()=>{
 const r=compareInventory({version:1,tables:base()});
 assert.equal(r.inventoryComplete,true);assert.equal(r.readyForCutover,false);
 assert.deepEqual(r.tables.find(t=>t.table==='public.posts').knownDifferences,['image_url','parent_id']);
});
test('nonempty unmapped tables cannot silently lose legacy features',()=>{
 const r=compareInventory({version:1,tables:[...base(),row('public','poll_votes','9007199254740993'),row('public','post_media','3'),row('public','reposts','0')]});
 assert.deepEqual(r.unsupportedNonempty,['public.poll_votes','public.post_media']);
 assert.equal(r.tables.find(t=>t.table==='public.poll_votes').count,'9007199254740993');
});
test('missing tables, malformed counts, and duplicate rows fail closed',()=>{
 assert.equal(compareInventory({version:1,tables:[]}).inventoryComplete,false);
 for(const tables of [[...base(),base()[0]],[row('public','posts','-1')],[row('public','posts','1',['id','id'])],[row('public','posts','9223372036854775808')],[row('public','posts',3)]]){
  assert.throws(()=>compareInventory({version:1,tables}));
 }
});
