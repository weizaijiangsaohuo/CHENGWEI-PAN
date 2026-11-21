// Preview-only composition for the existing Next.js Worker routes.
// Access verification must be supplied by a trusted server integration, never by a client flag.
import pg from 'pg';
import {createStarflowAuthLab} from './auth.mjs';
import {isSocialRoute} from './social-api.mjs';
import {createBusinessHandler} from './business-api.mjs';

const authPaths=new Set([
 'POST /api/identity/auth/sign-in/email',
 'POST /api/identity/auth/sign-in/username',
 'GET /api/identity/auth/get-session',
 'POST /api/identity/auth/sign-out',
 'POST /api/identity/auth/two-factor/verify-totp'
]);
// The guarded API accepts only the fields needed for the supported ceremonies.
function validAuthInput(route,data){
 if(!data||Array.isArray(data)||typeof data!=='object')return false;
 if(route==='POST /api/identity/auth/two-factor/verify-totp'){
  return Object.keys(data).every(k=>['code','trustDevice'].includes(k))&&
   typeof data.code==='string'&&/^\d{6}$/.test(data.code)&&(!Object.hasOwn(data,'trustDevice')||data.trustDevice===false);
 }
 const field=route.endsWith('/email')?'email':'username';
 return Object.keys(data).every(k=>[field,'password','rememberMe'].includes(k))&&
  typeof data[field]==='string'&&data[field].length>0&&data[field].length<=(field==='email'?254:24)&&
  typeof data.password==='string'&&data.password.length>0&&data.password.length<=512&&
  (!Object.hasOwn(data,'rememberMe')||data.rememberMe===false);
}
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
const privilegedMembershipSql = `
 AND NOT EXISTS (
 SELECT 1 FROM pg_roles r
 WHERE r.rolname IN ('sf_review_gateway','sf_identity_queue_gateway','sf_identity_proof_issuer','sf_didit_reconcile_gateway','sf_mail_budget_gateway','sf_account_recovery_gateway','neon_superuser')
 AND pg_has_role(current_user,r.oid,'MEMBER')
 )`;
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
 AND NOT pg_has_role(current_user,'sf_review_gateway','MEMBER')
 ${privilegedMembershipSql} AS safe
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
 ${privilegedMembershipSql}
 AND EXISTS (
 SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='sf_core' AND p.proname='open_review_queue'
 AND pg_catalog.oidvectortypes(p.proargtypes)='uuid, uuid, uuid, integer'
 AND NOT has_function_privilege(current_user,p.oid,'EXECUTE')
 ) AS safe
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
 AND c.relname IN ('user','session','account','verification','twoFactor','passkey','rateLimit')`;
async function readinessFailures(authPool,businessPool,database='neondb'){
 const probes=[[authPool,'sf_auth_runtime',authPrivilegeSql,'auth'],[businessPool,'sf_business_connect',businessPrivilegeSql,'business']];
 return await Promise.all(probes.map(async([pool,role,sql,label])=>{
  let rows;
  try{({rows}=await pool.query(roleIdentitySql));}catch(e){return label+(e?.code==='28P01'||e?.code==='28000'?'_credentials':'_connection');}
  if(rows.length!==1||rows[0].role!==role||rows[0].login!==role||rows[0].db!==database||rows[0].restricted!==true)return label+'_role';
  try{const g=await pool.query(sql);return g.rows.length===1&&g.rows[0].safe===true?null:label+'_permissions';}
  catch{return label+'_query';}
 }));
}
export async function verifyPreviewDatabaseRoles(authPool,businessPool,database='neondb'){
 return (await readinessFailures(authPool,businessPool,database)).every(x=>x===null);
}

export function createPreviewHandler({env,authorizePreview,Pool=pg.Pool,authFactory=createStarflowAuthLab}){
 return async request=>{
  // No production access, no fall-through to legacy auth, no DB connection on disabled paths.
  if(env?.STARFLOW_V2_PREVIEW_ONLY!=='true'||
    typeof authorizePreview!=='function')return deny();
  let url;try{url=new URL(request.url);}catch{return deny();}
  const origin=env.STARFLOW_AUTH_ORIGIN;
  let target;try{target=new URL(origin);}catch{return deny();}
  if(target.origin!==origin||target.protocol!=='https:'||!/^[-a-z0-9]+-weizai\.[a-z0-9-]+\.workers\.dev$/.test(target.hostname)||url.origin!==origin||url.username||url.password)return deny();
  const route=request.method+' '+url.pathname;
  // Owner-only read-only connection probe may run with the explicit disabled flag.
  // No auth or business routes are reachable before the feature switch is enabled.
  if(env.STARFLOW_V2_ENABLED!=='true'&&!(env.STARFLOW_V2_ENABLED==='false'&&route===readinessRoute))return deny();
  if(route===readinessRoute&&url.search)return deny(400);
  if(route!==readinessRoute&&!authPaths.has(route)&&!businessPaths.has(route)&&!(isSocialRoute(route)&&env.STARFLOW_SOCIAL_PREVIEW_ENABLED==='true'))return deny();
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
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
    if(!validAuthInput(route,data))return deny(400);
   }catch{return deny(400);}
  }
  let authPool,businessPool;
  // Only reached after the existing owner authorization. Fixed labels, never exception text.
  const unavailable=stage=>route===readinessRoute?Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Starflow-Readiness-Stage':stage}}):deny(503);
  let stage='signing_config';
  try{
   if(typeof env.BETTER_AUTH_SECRET!=='string'||env.BETTER_AUTH_SECRET.length<32)return unavailable(stage);
   stage=env.STARFLOW_AUTH_DB_URL===undefined?'auth_missing':'auth_config';
   const a=restrictedPoolConfig(env.STARFLOW_AUTH_DB_URL,'sf_auth_runtime',env.STARFLOW_PREVIEW_DB_HOST);
   stage=env.STARFLOW_BUSINESS_DB_URL===undefined?'business_missing':'business_config';
   const b=restrictedPoolConfig(env.STARFLOW_BUSINESS_DB_URL,'sf_business_connect',env.STARFLOW_PREVIEW_DB_HOST);
   if(a.password===b.password)return unavailable('credential_separation');
   stage='auth_connection';
   authPool=new Pool(a);
   if(route===readinessRoute){
    stage='business_connection';
    businessPool=new Pool(b);
    stage='runtime';
    const failures=await readinessFailures(authPool,businessPool);
    const failed=failures.find(Boolean);
    if(failed)return unavailable(failed);
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
  }catch{return unavailable(stage);}
  finally{
   // Worker I/O resources are request scoped; never reuse pg sockets across requests.
   await Promise.allSettled([authPool,businessPool].filter(Boolean).map(p=>p.end()));
  }
 };
}
