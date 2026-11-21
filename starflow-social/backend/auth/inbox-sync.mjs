// Isolated integration library; no automatic polling, persistent storage, or production UI wiring.
// request(path, {signal}) must be a trusted same-origin transport. No preview owner secret in this module.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId=id=>typeof id==='string'&&uuid.test(id);
const validSeq=s=>typeof s==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(s)&&BigInt(s)<=9223372036854775807n;
const fail=()=>{throw new Error('Inbox unavailable; refresh required');};
export function createInboxSync({request,pageBudget=10}){
 if(typeof request!=='function'||!Number.isInteger(pageBudget)||pageBudget<1||pageBudget>20)throw Error('Invalid inbox configuration');
 let generation=0,active=null;
 const reset=()=>{generation++;active?.abort();active=null;};
 async function refresh(expectedPrincipal){
  reset();
  if(!validId(expectedPrincipal))return fail();
  const epoch=generation,controller=new AbortController();active=controller;
  const check=()=>{if(epoch!==generation||controller.signal.aborted)fail();};
  async function read(path){
   check();
   const res=await request(path,{signal:controller.signal});
   check();
   if(!res?.ok||res.redirected)fail();
   const body=await res.json();check();return body;
  }
  const checkPrincipal=async()=>{
   const info=await read('/api/v2/me');
   if(info?.profile?.id!==expectedPrincipal)fail();
  };
  try{
   await checkPrincipal();
   // Rebuild from server authorization, not a cache that may contain now-hidden records.
   const messages=[],notifications=[],messageIds=new Set(),noticeIds=new Set();
   let after='0',before=null,moreMessages=true,moreNotices=true;
   for(let page=0;page<pageBudget&&(moreMessages||moreNotices);page++){
    if(moreMessages){
     const batch=await read('/api/v2/messages?after='+after);
     if(batch?.principal!==expectedPrincipal||!Array.isArray(batch?.messages)||batch.messages.length>50||!validSeq(batch.next)||typeof batch.hasMore!=='boolean')fail();
     let last=after;
     for(const m of batch.messages){
      if(!validId(m?.id)||!validSeq(m.sync_seq)||BigInt(m.sync_seq)<=BigInt(last)||messageIds.has(m.id)||
       !validId(m.sender_id)||!validId(m.recipient_id)||(m.sender_id!==expectedPrincipal&&m.recipient_id!==expectedPrincipal)||typeof m.body!=='string')fail();
      last=m.sync_seq;messageIds.add(m.id);messages.push(m);
     }
     if(batch.next!==last||(batch.hasMore&&batch.messages.length!==50))fail();
     after=last;moreMessages=batch.hasMore;
    }
    if(moreNotices){
     const batch=await read('/api/v2/notifications'+(before?'?before='+before:''));
     if(batch?.principal!==expectedPrincipal||!Array.isArray(batch?.notifications)||batch.notifications.length>50||typeof batch.hasMore!=='boolean')fail();
     for(const n of batch.notifications){
      if(!validId(n?.id)||!validId(n.message_id)||noticeIds.has(n.id))fail();
      noticeIds.add(n.id);notifications.push(n);
     }
     if(batch.hasMore?batch.notifications.length!==50||!validId(batch.next)||batch.next!==batch.notifications.at(-1).id||batch.next===before:batch.next!==null)fail();
     before=batch.next;moreNotices=batch.hasMore;
    }
    // Account changes invalidate the complete in-flight snapshot, not merely the next page.
    await checkPrincipal();
   }
   check();
   return {principal:expectedPrincipal,messages,notifications,hasMoreMessages:moreMessages,hasMoreNotifications:moreNotices};
  }catch{fail();}
  finally{if(epoch===generation)active=null;}
 }
 return {refresh,reset};
}

// Browser-facing preview adapter: same-origin cookies (including the Access session),
// no owner key, no persistent cache, no background activity. Caller controls lifecycle.
export function createPreviewInboxController({origin,fetcher=globalThis.fetch,onState,pageBudget=10}){
 const target=new URL(origin);
 if(target.origin!==origin||target.protocol!=='https:'||
 !/^[-a-z0-9]+-weizai\.[a-z0-9-]+\.workers\.dev$/.test(target.hostname)||
 typeof fetcher!=='function'||typeof onState!=='function')throw Error('Invalid preview inbox configuration');
 const sync=createInboxSync({pageBudget,request:async(path,{signal})=>{
  const endpoint=new URL(path,target);
  if(endpoint.origin!==origin||!['/api/v2/me','/api/v2/messages','/api/v2/notifications'].includes(endpoint.pathname))fail();
  return fetcher(endpoint.href,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal,headers:{accept:'application/json'}});
 }});
 let epoch=0,closed=false;
 const clear=status=>onState({status,snapshot:null});
 const reset=()=>{epoch++;sync.reset();if(!closed)clear('idle');};
 const close=()=>{if(closed)return;closed=true;epoch++;sync.reset();clear('closed');};
 async function refresh(principal){
  if(closed)return false;
  const current=++epoch;
  // Synchronously discard previous rendered data before any asynchronous read.
  clear('loading');
  if(closed||current!==epoch)return false;
  try{
   const snapshot=await sync.refresh(principal);
   if(closed||current!==epoch)return false;
   onState({status:'ready',snapshot});
   return !closed&&current===epoch;
  }catch{
   if(!closed&&current===epoch)clear('error');
   return false;
  }
 }
 return {refresh,reset,close};
}
