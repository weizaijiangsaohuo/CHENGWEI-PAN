// Offline inventory gate; no connection, data import, or credentials.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const mandatory=['auth.users','public.profiles','public.posts','public.follows','public.likes','public.bookmarks','storage.objects','storage.buckets'];
// This allowlist means "known mapping needs implementation", NOT "safe to copy".
const planned=new Set(['auth.users','public.profiles','public.posts','public.follows','public.likes','public.bookmarks','public.dm_conversations','public.dm_messages','public.dm_read_state','public.blocks','public.notifications','public.communities','public.community_members','public.community_posts','storage.objects','storage.buckets']);
const differences={
 'public.posts':['image_url','parent_id','has_poll','has_gallery'],
 'public.follows':['following_id'],
 'public.dm_messages':['conversation_id'],
 'public.community_members':['user_id'],
 'public.community_posts':['post_id'],
 'public.communities':['description','rules']
};
const identifier=s=>typeof s==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(s);
export function compareInventory(value){
 if(value?.version!==1||!Array.isArray(value.tables)||value.tables.length>10000)throw Error('Invalid inventory');
 const seen=new Set(),tables=[];
 for(const row of value.tables){
  if(!identifier(row?.schema_name)||!identifier(row.table_name)||!Array.isArray(row.columns)||!row.columns.length||
    !row.columns.every(identifier)||new Set(row.columns).size!==row.columns.length||
    typeof row.row_count!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(row.row_count)||BigInt(row.row_count)>9223372036854775807n)throw Error('Invalid inventory row');
  const key=row.schema_name+'.'+row.table_name;
  if(seen.has(key))throw Error('Duplicate inventory table');
  seen.add(key);
  tables.push({table:key,count:row.row_count,mapping:planned.has(key)?'unverified':'unsupported',knownDifferences:(differences[key]??[]).filter(c=>row.columns.includes(c))});
 }
 const missing=mandatory.filter(k=>!seen.has(k));
 const unsupported=tables.filter(t=>t.mapping==='unsupported'&&t.count!=='0').map(t=>t.table);
 // Inventory alone cannot verify completeness, actual target contents, identity recovery or rollback.
 return {inventoryComplete:missing.length===0,missing,unsupportedNonempty:unsupported,tables,readyForCutover:false,
  blockers:['source backup completeness not independently verified','row-level mapping and target reconciliation pending','identity recovery, media transfer and rollback not verified']};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 try{
  if(process.argv.length!==3)throw Error('usage: node compare-inventory.mjs inventory.json');
  const raw=await readFile(process.argv[2]);
  if(raw.length>8*1024*1024)throw Error('inventory too large');
  const report=compareInventory(JSON.parse(raw.toString('utf8')));
  console.log(JSON.stringify(report,null,2));
  // Always block cutover until independent migration acceptance exists.
  process.exitCode=2;
 }catch{console.error('Inventory invalid or unavailable; cutover blocked.');process.exitCode=1;}
}
