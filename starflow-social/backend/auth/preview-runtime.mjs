// Preview-only composition for the existing Next.js Worker routes.
// Access verification must be supplied by a trusted server integration, never by a client flag.
import pg from 'pg';
import {createStarflowAuthLab} from './auth.mjs';
import {createBusinessHandler} from './business-api.mjs';

const authPaths=new Set([
 'POST /api/identity/auth/sign-in/email',
 'POST /api/identity/auth/sign-in/username',
 'GET /api/identity/auth/get-session',
 'POST /api/identity/auth/sign-out',
 'POST /api/identity/auth/two-factor/verify-totp'
]);
const readinessRoute='GET /api/v2/readiness';
const businessPaths=new Set([
 'GET /api/v2/me','GET /api/v2/messages','GET /api/v2/notifications',
 'POST /api/v2/messages','POST /api/v2/notifications/read'
]);
const deny=(status=404)=>Response.json({error:status===503?'unavailable':'not_permitted'},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});

export function restrictedPoolConfig(value,expectedRole,expectedHost){
 if(!/^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)+\.neon\.tech$/.test(expectedHost??'')||
 expectedHost.includes('-pooler')||typeof value!=='string')throw Error('invalid database target');
 const u=new URL(value);
 if(u.protocol!=='postgresql:'||u.hostname!==expectedHost||u.port&&u.port!=='5432'||u.pathname!=='/neondb'||u.hash||
 decodeURIComponent(u.username)!==expectedRole||!u.password||u.searchParams.getAll('sslmode').length!==1||
 u.searchParams.get('sslmode')!=='require'||[...u.searchParams.keys()].some(k=>!['sslmode','channel_binding'].includes(k))||
 u.searchParams.getAll('channel_binding').length>1||
 (u.searchParams.has('channel_binding')&&u.searchParams.get('channel_binding')!=='require'))throw Error('invalid database credentials');
 return {host:expectedHost,port:5432,database:'neondb',user:expectedRole,password:decodeURIComponent(u.password),
  ssl:{rejectUnauthorized:true},enableChannelBinding:true,max:1,connectionTimeoutMillis:5000,
  statement_timeout:8000,query_timeout:10000,idleTimeoutMillis:5000,allowExitOnIdle:true};
}
export function createPreviewHandler({env,authorizePreview,Pool=pg.Pool,authFactory=createStarflowAuthLab}){
 return async request=>{
  // No production access, no fall-through to legacy auth, no DB connection on disabled paths.
  if(env?.STARFLOW_V2_ENABLED!=='true'||env.STARFLOW_V2_PREVIEW_ONLY!=='true'||
    typeof authorizePreview!=='function')return deny();
  let url;try{url=new URL(request.url);}catch{return deny();}
  const origin=env.STARFLOW_AUTH_ORIGIN;
  let target;try{target=new URL(origin);}catch{return deny();}
  if(target.origin!==origin||target.protocol!=='https:'||!/^[-a-z0-9]+-weizai\.[a-z0-9-]+\.workers\.dev$/.test(target.hostname)||url.origin!==origin||url.username||url.password)return deny();
  const route=request.method+' '+url.pathname;
  if(route!==readinessRoute&&!authPaths.has(route)&&!businessPaths.has(route))return deny();
  if(request.headers.has('origin')&&request.headers.get('origin')!==origin)return deny(403);
  if(request.method==='POST'&&request.headers.get('origin')!==origin)return deny(403);
  if(authPaths.has(route)&&url.search)return deny(403);
  try{if(await authorizePreview(request)!==true)return deny(403);}catch{return deny(403);}
  // No trusted-device bypass in this preview. Reject malformed/oversized request bodies.
  if(route==='POST /api/identity/auth/two-factor/verify-totp'||
    route==='POST /api/identity/auth/sign-in/email'||route==='POST /api/identity/auth/sign-in/username'){
   try{
    if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||!request.body)return deny(400);
    const reader=request.clone().body.getReader();const chunks=[];let n=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>4096){void reader.cancel();return deny(400);}chunks.push(value);}}finally{reader.releaseLock();}
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!data||Array.isArray(data)||typeof data!=='object'||data.trustDevice===true||data.rememberMe===true)return deny(400);
   }catch{return deny(400);}
  }
  let authPool,businessPool;
  try{
   if(typeof env.BETTER_AUTH_SECRET!=='string'||env.BETTER_AUTH_SECRET.length<32)return deny(503);
   const a=restrictedPoolConfig(env.STARFLOW_AUTH_DB_URL,'sf_auth_runtime',env.STARFLOW_PREVIEW_DB_HOST);
   const b=restrictedPoolConfig(env.STARFLOW_BUSINESS_DB_URL,'sf_business_connect',env.STARFLOW_PREVIEW_DB_HOST);
   if(a.password===b.password)return deny(503);
   authPool=new Pool(a);
   if(route===readinessRoute){
    businessPool=new Pool(b);
    const sql="SELECT current_user::text AS role, session_user::text AS login, current_database() AS db";
    const results=await Promise.allSettled([authPool.query(sql),businessPool.query(sql)]);
    const expected=[a.user,b.user];
    if(!results.every((result,i)=>result.status==='fulfilled'&&result.value.rows.length===1&&
      result.value.rows[0].role===expected[i]&&result.value.rows[0].login===expected[i]&&result.value.rows[0].db==='neondb'))return deny(503);
    return Response.json({ready:true},{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   const auth=authFactory({database:authPool,origin,secret:env.BETTER_AUTH_SECRET});
   let response;
   if(authPaths.has(route))response=await auth.handler(request);
   else{
    businessPool=new Pool(b);
    response=await createBusinessHandler({auth,pool:businessPool,origin})(request);
   }
   const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');
   return new Response(response.body,{status:response.status,headers});
  }catch{return deny(503);}
  finally{
   // Worker I/O resources are request scoped; never reuse pg sockets across requests.
   await Promise.allSettled([authPool,businessPool].filter(Boolean).map(p=>p.end()));
  }
 };
}
