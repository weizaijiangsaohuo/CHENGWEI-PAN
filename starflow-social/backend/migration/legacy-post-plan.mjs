// Offline legacy post conversion; never connects to a database or writes an export into Git.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const id=v=>typeof v==='string'&&uuid.test(v);
const length=v=>typeof v==='string'?[...v].length:Infinity;
const time=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
const url=v=>{try{const u=new URL(v);return typeof v==='string'&&v.length<=2048&&u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const ensure=(ok,code)=>{if(!ok)throw new Error(code);};
function index(rows,keys,label){
 ensure(Array.isArray(rows),label+'_missing');
 const m=new Map();
 for(const r of rows){
  ensure(r&&typeof r==='object'&&!Array.isArray(r)&&id(r.id),label+'_invalid_id');
  ensure(!m.has(r.id),label+'_duplicate_id');
  ensure(Object.keys(r).every(k=>keys.includes(k)),label+'_unmapped_column');
  m.set(r.id,r);
 }
 return m;
}
// Return a typed transfer bundle only after validating ALL rows. No partial output on error.
// Caller must keep source backup immutable; this is NOT approval for runtime access or cutover.
export function planLegacyPosts(source){
 const profiles=index(source?.profiles,['id'],'profile');
 const posts=index(source?.posts,['id','author_id','content','image_url','video_url','parent_id','created_at','has_poll','has_gallery'],'post');
 const media=index(source?.post_media,['id','post_id','media_url','position','created_at'],'media');
 const polls=index(source?.post_polls,['id','post_id','question','expires_at','created_at'],'poll');
 const options=index(source?.poll_options,['id','poll_id','label','position'],'option');
 ensure(Array.isArray(source?.poll_votes),'votes_missing');
 const mediaPositions=new Set(),pollPosts=new Set(),optionPositions=new Set(),votes=new Set(),mediaPosts=new Set();
 for(const m of media.values()){
  ensure(posts.has(m.post_id)&&url(m.media_url)&&Number.isInteger(m.position)&&m.position>=0&&m.position<=3&&time(m.created_at),'media_invalid');
  const key=m.post_id+':'+m.position;
  ensure(!mediaPositions.has(key),'media_duplicate_position');mediaPositions.add(key);mediaPosts.add(m.post_id);
 }
 for(const p of polls.values()){
  ensure(posts.has(p.post_id)&&length(p.question)<=160&&p.question.trim().length>0&&time(p.expires_at)&&time(p.created_at),'poll_invalid');
  ensure(!pollPosts.has(p.post_id),'poll_duplicate_post');pollPosts.add(p.post_id);
 }
 const optionCounts=new Map();
 for(const o of options.values()){
  ensure(polls.has(o.poll_id)&&length(o.label)<=100&&o.label.trim().length>0&&Number.isInteger(o.position)&&o.position>=0&&o.position<=3,'option_invalid');
  const key=o.poll_id+':'+o.position;
  ensure(!optionPositions.has(key),'option_duplicate_position');optionPositions.add(key);
  optionCounts.set(o.poll_id,(optionCounts.get(o.poll_id)??0)+1);
 }
 for(const p of polls.values())ensure((optionCounts.get(p.id)??0)>=2,'poll_insufficient_options');
 for(const v of source.poll_votes){
  ensure(v&&Object.keys(v).every(k=>['poll_id','option_id','user_id','created_at'].includes(k))&&profiles.has(v.user_id)&&polls.has(v.poll_id)&&options.get(v.option_id)?.poll_id===v.poll_id&&time(v.created_at),'vote_invalid');
  const key=v.poll_id+':'+v.user_id;
  ensure(!votes.has(key),'vote_duplicate');votes.add(key);
 }
 const mapped=[];
 for(const p of posts.values()){
  ensure(profiles.has(p.author_id)&&length(p.content)<=280&&time(p.created_at),'post_invalid');
  ensure((p.image_url==null||url(p.image_url))&&(p.video_url==null||url(p.video_url)),'post_media_invalid');
  ensure(typeof p.has_poll==='boolean'&&typeof p.has_gallery==='boolean','post_flags_missing');
  ensure(p.has_poll===pollPosts.has(p.id)&&p.has_gallery===mediaPosts.has(p.id),'post_flags_inconsistent');
  ensure(p.content.trim().length||p.image_url||p.video_url||mediaPosts.has(p.id),'post_empty');
  ensure(p.parent_id==null||posts.has(p.parent_id),'post_parent_missing');
  mapped.push({id:p.id,author_id:p.author_id,content:p.content,created_at:p.created_at,visibility:'private',
   legacy:{parent_id:p.parent_id??null,image_url:p.image_url??null,video_url:p.video_url??null,has_poll:p.has_poll,has_gallery:p.has_gallery}});
 }
 // Linear traversal also catches self replies and multi-post cycles without recursion.
 const finished=new Set();
 for(const p of posts.values()){
  let current=p.id;const chain=new Set();
  while(current!=null&&!finished.has(current)){
   ensure(!chain.has(current),'post_reply_cycle');chain.add(current);
   current=posts.get(current).parent_id;
  }
  for(const item of chain)finished.add(item);
 }
 return {version:1,posts:mapped,post_media:structuredClone([...media.values()]),post_polls:structuredClone([...polls.values()]),
  poll_options:structuredClone([...options.values()]),poll_votes:structuredClone(source.poll_votes),
  importReady:false,blockers:['target media/reply/poll storage and verified access policy pending','authorized source and media backup reconciliation pending']};
}
