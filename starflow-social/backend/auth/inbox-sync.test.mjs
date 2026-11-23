import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInboxSync,createPreviewInboxController} from './inbox-sync.mjs';
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const msg=i=>({id:id(i),sync_seq:String(i),sender_id:a,recipient_id:b,body:'fixture'});
const notice=i=>({id:id(i+1000),message_id:id(i)});
const json=body=>Response.json(body);
test('bounded pages preserve order and do not skip records',async()=>{
 const paths=[];
 const sync=createInboxSync({request:async path=>{
  paths.push(path);
  if(path==='/api/v2/me')return json({profile:{id:a}});
  if(path.endsWith('after=0'))return json({principal:a,messages:Array.from({length:50},(_,i)=>msg(i+1)),next:'50',hasMore:true});
  if(path.endsWith('after=50'))return json({principal:a,messages:[msg(51)],next:'51',hasMore:false});
  if(path==='/api/v2/notifications')return json({principal:a,notifications:[notice(1)],next:null,hasMore:false});
  throw Error('unexpected');
 }});
 const r=await sync.refresh(a);
 assert.equal(r.messages.length,51);assert.equal(r.notifications.length,1);
 assert.equal(r.hasMoreMessages,false);assert.equal(r.hasMoreNotifications,false);
 assert.equal(paths.filter(p=>p==='/api/v2/me').length,3);
});
test('malformed page, repeated sequence, and foreign message fail closed',async()=>{
 for(const batch of [
  {principal:a,messages:[msg(1),msg(1)],next:'1',hasMore:false},
  {principal:a,messages:[msg(1)],next:'2',hasMore:false},
  {principal:a,messages:[{...msg(1),sender_id:b,recipient_id:id(500)}],next:'1',hasMore:false},
  {principal:a,messages:[msg(1)],next:'1',hasMore:true}
 ]){
  const sync=createInboxSync({request:async p=>json(p==='/api/v2/me'?{profile:{id:a}}:batch)});
  await assert.rejects(sync.refresh(a),/refresh required/);
 }
});
test('account change, expired session and reset discard in-flight data',async()=>{
 let checks=0;
 const sync=createInboxSync({request:async p=>{
  if(p==='/api/v2/me')return json({profile:{id:++checks===1?a:b}});
  return json(p.includes('messages')?{principal:a,messages:[msg(1)],next:'1',hasMore:false}:{principal:a,notifications:[],next:null,hasMore:false});
 }});
 await assert.rejects(sync.refresh(a),/refresh required/);
 const expired=createInboxSync({request:async()=>new Response(null,{status:401})});
 await assert.rejects(expired.refresh(a),/refresh required/);
 let release;
 const delayed=createInboxSync({request:()=>new Promise(r=>{release=r;})});
 const pending=delayed.refresh(a);delayed.reset();
 release(json({profile:{id:a}}));
 await assert.rejects(pending,/refresh required/);
});
test('page budget is enforced, refresh replaces old visibility instead of retaining a cache',async()=>{
 let visible=true;
 const sync=createInboxSync({pageBudget:1,request:async p=>{
  if(p==='/api/v2/me')return json({profile:{id:a}});
  if(p.includes('messages'))return json(visible?{principal:a,messages:Array.from({length:50},(_,i)=>msg(i+1)),next:'50',hasMore:true}:{principal:a,messages:[],next:'0',hasMore:false});
  return json({principal:a,notifications:[],next:null,hasMore:false});
 }});
 const first=await sync.refresh(a);assert.equal(first.hasMoreMessages,true);
 visible=false;
 const second=await sync.refresh(a);assert.deepEqual(second.messages,[]);
});

test('account switches away and back between identity checks cannot mix another inbox page',async()=>{
 for(const foreignPath of ['messages','notifications']){
  let checks=0;
  const sync=createInboxSync({request:async p=>{
   if(p==='/api/v2/me'){checks++;return json({profile:{id:a}});}
   if(p.includes('messages'))return json({principal:foreignPath==='messages'?b:a,messages:[msg(1)],next:'1',hasMore:false});
   return json({principal:foreignPath==='notifications'?b:a,notifications:[notice(1)],next:null,hasMore:false});
  }});
  await assert.rejects(sync.refresh(a),/refresh required/);
  assert.equal(checks,1);
 }
});
test('legacy pages without server-confirmed identity are rejected',async()=>{
 const sync=createInboxSync({request:async p=>json(p==='/api/v2/me'?{profile:{id:a}}:{messages:[],next:'0',hasMore:false})});
 await assert.rejects(sync.refresh(a),/refresh required/);
});

test('preview inbox uses explicit same-origin cookie transport and clears data before refresh or logout',async()=>{
 const origin='https://fixture-weizai.example.workers.dev',states=[],requests=[];
 const fetcher=async(url,opts)=>{
  requests.push({url,opts});const p=new URL(url);
  assert.equal(p.origin,origin);assert.equal(opts.credentials,'same-origin');assert.equal(opts.redirect,'error');assert.equal(opts.cache,'no-store');assert.deepEqual(opts.headers,{accept:'application/json'});
  return json(p.pathname.endsWith('/me')?{profile:{id:a}}:p.pathname.endsWith('/messages')?{principal:a,messages:[msg(1)],next:'1',hasMore:false}:{principal:a,notifications:[],next:null,hasMore:false});
 };
 const c=createPreviewInboxController({origin,fetcher,onState:s=>states.push(s)});
 assert.throws(()=>createPreviewInboxController({origin:'https://weizai.example.workers.dev',fetcher,onState:()=>{}}));
 assert.equal(await c.refresh(a),true);assert.equal(states.at(-1).snapshot.messages.length,1);
 const second=c.refresh(a);assert.deepEqual(states.at(-1),{status:'loading',snapshot:null});
 c.reset();assert.deepEqual(states.at(-1),{status:'idle',snapshot:null});
 assert.equal(await second,false);assert.equal(states.at(-1).status,'idle');
 c.close();assert.equal(states.at(-1).status,'closed');assert.equal(await c.refresh(a),false);
 assert.ok(requests.length>0);
});
test('preview inbox does not publish delayed account data or keep expired session records',async()=>{
 const origin='https://fixture-weizai.example.workers.dev',states=[];
 let resolve,first=true;
 const c=createPreviewInboxController({origin,onState:s=>states.push(s),fetcher:async()=>{
  if(first){first=false;return new Promise(r=>{resolve=r;});}
  return new Response(null,{status:401});
 }});
 const old=c.refresh(a);const latest=c.refresh(b);
 assert.equal(await latest,false);
 assert.deepEqual(states.at(-1),{status:'error',snapshot:null});
 resolve(json({profile:{id:a}}));assert.equal(await old,false);
 assert.deepEqual(states.at(-1),{status:'error',snapshot:null});
 assert.ok(states.every(s=>s.snapshot===null));
});
