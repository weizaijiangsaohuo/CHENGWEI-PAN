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
// Read-only runtime attestation. No customer rows or credentials are returned.
const roleIdentitySql = `
 SELECT current_user::text AS role, session_user::text AS login, current_database() AS db,
 NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit)
 AND rolcanlogin AND NOT has_schema_privilege(current_user,'public','CREATE') AS restricted
 FROM pg_roles WHERE rolname=current_user`;
const authPrivilegeSql = `
 SELECT
 count(*)=7 AND bool_and(
 has_table_privilege(current_user,c.oid,'SELECT')
 AND has_table_privilege(current_user,c.oid,'INSERT')
 AND has_table_privilege(current_user,c.oid,'UPDATE')
 AND has_table_privilege(current_user,c.oid,'DELETE')
 AND NOT has_table_privilege(current_user,c.oid,'TRUNCATE,REFERENCES,TRIGGER')
 ) AND NOT has_schema_privilege(current_user,'sf_core','USAGE')
 AND NOT pg_has_role(current_user,'sf_session_gateway','MEMBER')
 AND NOT pg_has_role(current_user,'sf_review_gateway','MEMBER') AS safe
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
 AND c.relname IN ('user','session','account','verification','twoFactor','passkey','rateLimit')`;
const businessPrivilegeSql = `
 SELECT count(*)=7 AND bool_and(
 NOT has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 AND NOT has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
 ) AND pg_has_role(current_user,'sf_session_gateway','SET')
 AND pg_has_role(current_user,'sf_profile_runtime','SET')
 AND NOT pg_has_role(current_user,'sf_profile_runtime','USAGE')
 AND NOT pg_has_role(current_user,'sf_review_gateway','MEMBER')
 AND NOT pg_has_role(current_user,'sf_auth_runtime','MEMBER')
 AND EXISTS (
 SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='sf_core' AND p.proname='open_review_queue'
 AND pg_catalog.oidvectortypes(p.proargtypes)='uuid, uuid, uuid, integer'
 AND NOT has_function_privilege(current_user,p.oid,'EXECUTE')
 ) AS safe
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
 AND c.relname IN ('user','session','account','verification','twoFactor','passkey','rateLimit')`;
export async function verifyPreviewDatabaseRoles(authPool,businessPool,database='neondb'){
 const probes=[[authPool,'sf_auth_runtime',authPrivilegeSql],[businessPool,'sf_business_connect',businessPrivilegeSql]];
 const results=await Promise.allSettled(probes.map(async([pool,role,sql])=>{
  const {rows}=await pool.query(roleIdentitySql);
  if(rows.length!==1||rows[0].role!==role||rows[0].login!==role||rows[0].db!==database||rows[0].restricted!==true)return false;
  const grants=await pool.query(sql);
  return grants.rows.length===1&&grants.rows[0].safe===true;
 }));
 return results.every(result=>result.status==='fulfilled'&&result.value===true);
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
  // The preview-specific credential must never reach authentication or business handlers.
  if(request.headers.has('x-starflow-preview-key')){
   const headers=new Headers(request.headers);headers.delete('x-starflow-preview-key');
   request=new Request(request,{headers});
  }
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
    if(!await verifyPreviewDatabaseRoles(authPool,businessPool))return deny(503);
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
