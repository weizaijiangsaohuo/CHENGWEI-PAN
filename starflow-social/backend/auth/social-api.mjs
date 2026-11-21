// Internal route definitions shared by the business and guarded preview dispatchers.
// Every query runs inside the existing authenticated principal / RLS transaction.
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&[...v].length<=n&&!v.includes('\u0000');
const exact=(x,required,optional=[])=>required.every(k=>Object.hasOwn(x,k))&&Object.keys(x).every(k=>required.includes(k)||optional.includes(k));
const visibility=v=>['private','members'].includes(v);
const routes=new Set([
 'GET /api/v2/blocks','POST /api/v2/blocks','POST /api/v2/profile','GET /api/v2/posts','POST /api/v2/posts','POST /api/v2/posts/edit',
 'POST /api/v2/posts/like','POST /api/v2/posts/bookmark','POST /api/v2/follows/request',
 'POST /api/v2/follows/accept','POST /api/v2/follows/remove',
 'GET /api/v2/comments','POST /api/v2/comments','POST /api/v2/comments/edit','POST /api/v2/comments/withdraw'
]);
export const isSocialRoute=route=>routes.has(route);
export function validateSocialInput(route,input,url){
 if(route==='GET /api/v2/blocks'){
  const before=url.searchParams.get('before');
  return [...url.searchParams.keys()].every(k=>k==='before')&&url.searchParams.getAll('before').length<=1&&(before===null||uuid(before));
 }
 if(route==='GET /api/v2/posts'){
  const before=url.searchParams.get('before');
  return [...url.searchParams.keys()].every(k=>k==='before')&&url.searchParams.getAll('before').length<=1&&(before===null||uuid(before));
 }
 if(route==='GET /api/v2/comments'){
  const post=url.searchParams.get('post'),before=url.searchParams.get('before');
  return uuid(post)&&(before===null||uuid(before))&&url.searchParams.getAll('post').length===1&&url.searchParams.getAll('before').length<=1&&[...url.searchParams.keys()].every(k=>['post','before'].includes(k));
 }
 if(url.search||!input)return false;
 switch(route){
 case 'POST /api/v2/blocks':return exact(input,['id','enabled'])&&uuid(input.id)&&typeof input.enabled==='boolean';
 case 'POST /api/v2/profile':return exact(input,[],['displayName','bio'])&&Object.keys(input).length>0&&(!Object.hasOwn(input,'displayName')||text(input.displayName,60))&&(!Object.hasOwn(input,'bio')||typeof input.bio==='string'&&[...input.bio].length<=160&&!input.bio.includes('\u0000'));
 case 'POST /api/v2/posts':return exact(input,['content'],['visibility'])&&text(input.content,280)&&(!Object.hasOwn(input,'visibility')||visibility(input.visibility));
 case 'POST /api/v2/comments':return exact(input,['post','content'],['replyTo'])&&uuid(input.post)&&text(input.content,280)&&(!Object.hasOwn(input,'replyTo')||uuid(input.replyTo));
 case 'POST /api/v2/comments/withdraw':return exact(input,['id'])&&uuid(input.id);
 case 'POST /api/v2/comments/edit':return exact(input,['id','content'])&&uuid(input.id)&&text(input.content,280);
 case 'POST /api/v2/posts/edit':return exact(input,['id','content','visibility'])&&uuid(input.id)&&text(input.content,280)&&visibility(input.visibility);
 case 'POST /api/v2/posts/like':case 'POST /api/v2/posts/bookmark':return exact(input,['id','enabled'])&&uuid(input.id)&&typeof input.enabled==='boolean';
 case 'POST /api/v2/follows/request':case 'POST /api/v2/follows/accept':case 'POST /api/v2/follows/remove':return exact(input,['id'])&&uuid(input.id);
 default:return false;
 }
}
export async function runSocialRoute({route,input,url,client,id}){
 const q=(sql,args)=>client.query(sql,args);
 const missing={result:{error:'not_found'},status:404};
 switch(route){
 case 'GET /api/v2/blocks':{
  const r=await q('SELECT blocked_id,created_at FROM sf_core.blocks WHERE blocker_id=$1 AND ($2::uuid IS NULL OR (created_at,blocked_id)<(SELECT created_at,blocked_id FROM sf_core.blocks WHERE blocker_id=$1 AND blocked_id=$2)) ORDER BY created_at DESC,blocked_id DESC LIMIT 51',[id,url.searchParams.get('before')]);
  const blocks=r.rows.slice(0,50);return {result:{principal:id,blocks,next:r.rows.length>50?blocks.at(-1).blocked_id:null,hasMore:r.rows.length>50}};
 }
 case 'POST /api/v2/blocks':{
  if(input.id.toLowerCase()===id)return {result:{error:'invalid_target'},status:400};
  if(input.enabled)await q('INSERT INTO sf_core.blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,input.id]);
  else await q('DELETE FROM sf_core.blocks WHERE blocker_id=$1 AND blocked_id=$2',[id,input.id]);
  return {result:{id:input.id,enabled:input.enabled}};
 }
 case 'POST /api/v2/profile':{
  const r=await q('UPDATE sf_core.profiles SET display_name=COALESCE($2,display_name),bio=COALESCE($3,bio) WHERE id=$1 RETURNING id,handle,display_name,bio',[id,input.displayName??null,input.bio??null]);
  return r.rowCount?{result:{profile:r.rows[0]}}:missing;
 }
 case 'GET /api/v2/posts':{
  const r=await q('SELECT p.id,p.author_id,p.content,p.visibility,p.created_at,EXISTS(SELECT 1 FROM sf_core.likes l WHERE l.post_id=p.id AND l.user_id=$2) AS liked,EXISTS(SELECT 1 FROM sf_core.bookmarks b WHERE b.post_id=p.id AND b.user_id=$2) AS bookmarked FROM sf_core.posts p WHERE $1::uuid IS NULL OR (p.created_at,p.id)<(SELECT created_at,id FROM sf_core.posts WHERE id=$1) ORDER BY p.created_at DESC,p.id DESC LIMIT 51',[url.searchParams.get('before'),id]);
  const posts=r.rows.slice(0,50);return {result:{principal:id,posts,next:r.rows.length>50?posts.at(-1).id:null,hasMore:r.rows.length>50}};
 }
 case 'POST /api/v2/posts':{
  const r=await q('INSERT INTO sf_core.posts(author_id,content,visibility) VALUES($1,$2,$3) RETURNING id,author_id,content,visibility,created_at',[id,input.content,input.visibility??'private']);
  return {result:{post:r.rows[0]},status:201};
 }
 case 'GET /api/v2/comments':{
  const post=url.searchParams.get('post'),before=url.searchParams.get('before');
  if(!(await q('SELECT id FROM sf_core.posts WHERE id=$1',[post])).rowCount)return missing;
  const r=await q('SELECT c.id,c.post_id,c.author_id,c.content,c.created_at,c.withdrawn_at,CASE WHEN EXISTS(SELECT 1 FROM sf_core.post_comments r WHERE r.id=c.reply_to AND r.post_id=c.post_id) THEN c.reply_to ELSE NULL END AS reply_to FROM sf_core.post_comments c WHERE c.post_id=$1 AND ($2::uuid IS NULL OR (c.created_at,c.id)<(SELECT created_at,id FROM sf_core.post_comments WHERE id=$2 AND post_id=$1)) ORDER BY c.created_at DESC,c.id DESC LIMIT 51',[post,before]);
  const comments=r.rows.slice(0,50);
  return {result:{principal:id,post,comments,next:r.rows.length>50?comments.at(-1).id:null,hasMore:r.rows.length>50}};
 }
 case 'POST /api/v2/comments':{
  if(!(await q('SELECT id FROM sf_core.posts WHERE id=$1',[input.post])).rowCount)return missing;
  if(input.replyTo&&!(await q('SELECT id FROM sf_core.post_comments WHERE id=$1 AND post_id=$2 AND reply_to IS NULL AND withdrawn_at IS NULL',[input.replyTo,input.post])).rowCount)return missing;
  const r=await q('INSERT INTO sf_core.post_comments(post_id,author_id,content,reply_to) VALUES($1,$2,$3,$4) RETURNING id,post_id,author_id,content,created_at,reply_to,withdrawn_at',[input.post,id,input.content,input.replyTo??null]);
  return {result:{comment:r.rows[0]},status:201};
 }
 case 'POST /api/v2/comments/edit':{
  const r=await q('UPDATE sf_core.post_comments SET content=$2 WHERE id=$1 AND author_id=$3 AND withdrawn_at IS NULL RETURNING id,post_id,author_id,content,created_at,withdrawn_at',[input.id,input.content,id]);
  return r.rowCount?{result:{comment:r.rows[0]}}:missing;
 }
 case 'POST /api/v2/comments/withdraw':{
  const r=await q('UPDATE sf_core.post_comments SET withdrawn_at=clock_timestamp() WHERE id=$1 AND author_id=$2 AND withdrawn_at IS NULL RETURNING id,withdrawn_at',[input.id,id]);
  if(r.rowCount)return {result:{id:r.rows[0].id,withdrawn:true}};
  const old=await q('SELECT id FROM sf_core.post_comments WHERE id=$1 AND author_id=$2 AND withdrawn_at IS NOT NULL',[input.id,id]);
  return old.rowCount?{result:{id:old.rows[0].id,withdrawn:true}}:missing;
 }
 case 'POST /api/v2/posts/edit':{
  const r=await q('UPDATE sf_core.posts SET content=$2,visibility=$3 WHERE id=$1 AND author_id=$4 RETURNING id,author_id,content,visibility,created_at',[input.id,input.content,input.visibility,id]);
  return r.rowCount?{result:{post:r.rows[0]}}:missing;
 }
 case 'POST /api/v2/posts/like':case 'POST /api/v2/posts/bookmark':{
  // Table name is selected only from a fixed server route. Never interpolate request data.
  const table=route.endsWith('/like')?'sf_core.likes':'sf_core.bookmarks';
  if(input.enabled){
   const r=await q('SELECT id FROM sf_core.posts WHERE id=$1',[input.id]);if(!r.rowCount)return missing;
   await q('INSERT INTO '+table+'(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,input.id]);
  }else await q('DELETE FROM '+table+' WHERE user_id=$1 AND post_id=$2',[id,input.id]);
  return {result:{id:input.id,enabled:input.enabled}};
 }
 case 'POST /api/v2/follows/request':{
  if(input.id.toLowerCase()===id)return {result:{error:'invalid_target'},status:400};
  await q('INSERT INTO sf_core.follows(follower_id,target_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,input.id]);
  const r=await q('SELECT accepted FROM sf_core.follows WHERE follower_id=$1 AND target_id=$2',[id,input.id]);
  return r.rowCount?{result:{id:input.id,accepted:r.rows[0].accepted}}:missing;
 }
 case 'POST /api/v2/follows/accept':{
  const r=await q('UPDATE sf_core.follows SET accepted=true WHERE follower_id=$1 AND target_id=$2 RETURNING accepted',[input.id,id]);
  return r.rowCount?{result:{id:input.id,accepted:true}}:missing;
 }
 case 'POST /api/v2/follows/remove':{
  await q('DELETE FROM sf_core.follows WHERE (follower_id=$1 AND target_id=$2) OR (follower_id=$2 AND target_id=$1)',[id,input.id]);
  return {result:{id:input.id,removed:true}};
 }
 default:throw Error('unknown social route');
 }
}
