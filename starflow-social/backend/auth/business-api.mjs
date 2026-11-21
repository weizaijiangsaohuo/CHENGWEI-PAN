// Request/Response integration for isolated staging. Not imported by the production Next.js app.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid=v=>typeof v==='string'&&uuid.test(v);
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
const cursor=v=>typeof v==='string'&&/^\d{1,19}$/.test(v)&&BigInt(v)<=9223372036854775807n;
async function body(request){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')||!request.body)throw Error('invalid body');
 const reader=request.body.getReader();let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>20000){await reader.cancel();throw Error('too large');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.byteLength;}
 const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('invalid body');return parsed;
}
export function createBusinessHandler({auth,pool,origin}){
 if(new URL(origin).origin!==origin||!origin.startsWith('https://'))throw Error('exact HTTPS origin required');
 return async request=>{
  const url=new URL(request.url);
  if(url.origin!==origin||url.username||url.password)return response({error:'invalid_origin'},403);
  if(request.headers.has('origin')&&request.headers.get('origin')!==origin)return response({error:'invalid_origin'},403);
  if(request.method==='POST'&&request.headers.get('origin')!==origin)return response({error:'invalid_origin'},403);
  const route=request.method+' '+url.pathname;
  if(!['GET /api/v2/me','GET /api/v2/messages','GET /api/v2/notifications','POST /api/v2/messages','POST /api/v2/notifications/read'].includes(route))return response({error:'not_found'},404);
  let input,after='0',before=null;
  if(route==='GET /api/v2/messages'){
   after=url.searchParams.get('after')??'0';
   if(!cursor(after)||[...url.searchParams.keys()].some(k=>k!=='after')||url.searchParams.getAll('after').length>1)return response({error:'invalid_cursor'},400);
  }else if(route==='GET /api/v2/notifications'){
   before=url.searchParams.get('before');
   if((before!==null&&!isUuid(before))||[...url.searchParams.keys()].some(k=>k!=='before')||url.searchParams.getAll('before').length>1)return response({error:'invalid_cursor'},400);
  }else if(url.search)return response({error:'invalid_query'},400);
  if(request.method==='POST'){
   try{input=await body(request);}catch{return response({error:'invalid_body'},400);}
   if(route==='POST /api/v2/messages'&&(!isUuid(input.recipient)||typeof input.body!=='string'||!input.body.trim()||[...input.body].length>4000||(Object.hasOwn(input,'requestId')&&!isUuid(input.requestId))||Object.keys(input).some(k=>!['recipient','body','requestId'].includes(k))))return response({error:'invalid_message'},400);
   if(route==='POST /api/v2/notifications/read'&&(!isUuid(input.id)||Object.keys(input).length!==1))return response({error:'invalid_notice'},400);
  }
  let client,destroy=false;
  try{
   const session=await auth.api.getSession({headers:request.headers});
   const subject=session?.user?.id;
   if(session?.user?.emailVerified!==true||!uuid.test(subject??'')||session?.session?.userId!==subject||!(Date.parse(session?.session?.expiresAt)>Date.now()))return response({error:'unauthenticated'},401);
   client=await pool.connect();await client.query('BEGIN');
   await client.query('SET LOCAL ROLE sf_session_gateway');
   const id=(await client.query('SELECT sf_core.resolve_auth_subject($1::uuid) AS id',[subject])).rows[0]?.id;
   if(!uuid.test(id??'')){await client.query('ROLLBACK');return response({error:'unbound'},403);}
   await client.query('SET LOCAL ROLE sf_profile_runtime');await client.query("SELECT set_config('sf.principal_id',$1,true)",[id]);
   let result,status=200;
   if(route==='GET /api/v2/me')result={profile:(await client.query('SELECT id,handle,display_name,bio FROM sf_core.profiles WHERE id=$1',[id])).rows[0]??null};
   if(route==='GET /api/v2/messages'){
    const rows=(await client.query('SELECT * FROM sf_core.read_dm_delta($1::bigint,51)',[after])).rows;
    const messages=rows.slice(0,50);result={messages,next:messages.at(-1)?.sync_seq??after,hasMore:rows.length>50};
   }
   if(route==='GET /api/v2/notifications'){
    // A cursor is an RLS-visible notification ID, not an authorization credential.
    // Resolve its exact timestamp in PostgreSQL to preserve microsecond ordering.
    // Missing or hidden anchor yields an empty page; never fall back to unscoped results.
    const rows=(await client.query(
     'SELECT id,message_id,created_at,read_at FROM sf_core.dm_notifications WHERE $1::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM sf_core.dm_notifications WHERE id=$1::uuid) ORDER BY created_at DESC,id DESC LIMIT 51',
     [before])).rows;
    const notifications=rows.slice(0,50);
    result={notifications,next:rows.length>50?notifications.at(-1).id:null,hasMore:rows.length>50};
   }
   if(route==='POST /api/v2/messages'){
    if(!input.requestId){
     const q=await client.query('INSERT INTO sf_core.direct_messages(sender_id,recipient_id,body) VALUES($1,$2,$3) RETURNING id',[id,input.recipient,input.body]);result={id:q.rows[0].id};status=201;
    }else{
     const q=await client.query('INSERT INTO sf_core.direct_messages(sender_id,recipient_id,body,client_request_id) VALUES($1,$2,$3,$4) ON CONFLICT(sender_id,client_request_id) DO NOTHING RETURNING id',[id,input.recipient,input.body,input.requestId]);
     if(q.rowCount){result={id:q.rows[0].id};status=201;}
     else{
      // New statement at READ COMMITTED sees the committed winner. RLS still applies.
      const existing=(await client.query('SELECT id,recipient_id,body FROM sf_core.direct_messages WHERE sender_id=$1 AND client_request_id=$2',[id,input.requestId])).rows[0];
      if(!existing){await client.query('ROLLBACK');return response({error:'not_permitted'},403);}
      if(existing.recipient_id!==input.recipient.toLowerCase()||existing.body!==input.body){await client.query('ROLLBACK');return response({error:'request_conflict'},409);}
      result={id:existing.id};status=200;
     }
    }
   }
   if(route==='POST /api/v2/notifications/read'){const q=await client.query('UPDATE sf_core.dm_notifications SET read_at=clock_timestamp() WHERE id=$1 RETURNING id,read_at',[input.id]);result=q.rows[0]??{error:'not_found'};if(!q.rowCount)status=404;}
   await client.query('COMMIT');return response(result,status);
  }catch(e){
   if(client){try{await client.query('ROLLBACK');}catch{destroy=true;}}
   return e?.code==='42501'||e?.code==='23503'||e?.code==='23514'?response({error:'not_permitted'},403):response({error:'unavailable'},503);
  }finally{client?.release(destroy);}
 };
}
