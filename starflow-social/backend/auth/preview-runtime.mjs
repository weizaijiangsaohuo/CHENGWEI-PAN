// Preview-only composition for the existing Next.js Worker routes.
// Access verification must be supplied by a trusted server integration, never by a client flag.
import pg from 'pg';
import {createStarflowAuthLab} from './auth.mjs';
import {isSocialRoute} from './social-api.mjs';
import {createBusinessHandler} from './business-api.mjs';
import {createInboxSync} from './inbox-sync.mjs';
import {provisionFreshAccount} from './fresh-account.mjs';
import {createFreshSignupHandler} from './fresh-signup-handler.mjs';
import {createRegistrationAdmission} from './registration-admission.mjs';
import {createFreshRegistrationMail} from './auth-mail.mjs';
import {createBrevoFreePlanCheck} from '../services/brevo-free.mjs';
import {inspectProviderBindings} from '../services/provider-readiness.mjs';

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
const registrationReadinessRoute='GET /api/v2/registration-readiness';
const providerReadinessRoute='GET /api/v2/provider-readiness';
const freshRoute='POST /api/v2/account/initialize';
const registrationRoutes=new Set(['POST /api/identity/auth/sign-up/email','GET /api/identity/auth/verify-email']);
const inboxPreviewRoute='GET /api/v2/inbox-preview';
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
 WHERE r.rolname IN ('sf_review_gateway','sf_identity_queue_gateway','sf_identity_proof_issuer','sf_didit_reconcile_gateway','sf_mail_budget_gateway','sf_account_recovery_gateway','sf_fresh_account_gateway','sf_registration_issuer','neon_superuser')
 AND pg_has_role(current_user,r.oid,'MEMBER')
 )`;
// SECURITY DEFINER grants can bypass table ACLs. Require only the intended delegated routines.
const noDirectDefinerSql = `
 AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sf_core' AND p.prosecdef AND has_function_privilege(current_user,p.oid,'EXECUTE'))`;
const delegatedDefinerSql = `
 AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sf_core' AND p.prosecdef AND (
 (has_function_privilege('sf_profile_runtime',p.oid,'EXECUTE')
 AND NOT (p.proname='can_view_author' AND pg_catalog.oidvectortypes(p.proargtypes)='uuid'))
 OR (has_function_privilege('sf_session_gateway',p.oid,'EXECUTE')
 AND NOT (p.proname='resolve_auth_subject' AND pg_catalog.oidvectortypes(p.proargtypes)='uuid'))))
 AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sf_core' AND p.proname='can_view_author'
 AND pg_catalog.oidvectortypes(p.proargtypes)='uuid' AND p.prosecdef
 AND has_function_privilege('sf_profile_runtime',p.oid,'EXECUTE'))
 AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sf_core' AND p.proname='resolve_auth_subject'
 AND pg_catalog.oidvectortypes(p.proargtypes)='uuid' AND p.prosecdef
 AND has_function_privilege('sf_session_gateway',p.oid,'EXECUTE'))`;
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
 ${privilegedMembershipSql}
 ${noDirectDefinerSql} AS safe
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
 ${noDirectDefinerSql}
 ${delegatedDefinerSql} AND EXISTS (
 SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='sf_core' AND p.proname='open_review_queue'
 AND pg_catalog.oidvectortypes(p.proargtypes)='uuid, uuid, uuid, integer'
 AND NOT has_function_privilege(current_user,p.oid,'EXECUTE')
 ) AS safe
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
 AND c.relname IN ('user','session','account','verification','twoFactor','passkey','rateLimit')`;
// Separate NOINHERIT login may SET only the provisioning gateway; neither may
// directly read or write account/business tables or execute other definer functions.
const gatewayPrivilegeSql = (gateway,allowed,count) => `
 SELECT pg_has_role(current_user,'sf_fresh_account_gateway','SET')
 AND NOT pg_has_role(current_user,'sf_fresh_account_gateway','USAGE')
 AND NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname NOT IN (current_user,'sf_fresh_account_gateway')
 AND pg_has_role(current_user,r.oid,'MEMBER'))
 AND EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname='sf_fresh_account_gateway'
 AND NOT (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit))
 AND NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname<>'sf_fresh_account_gateway'
 AND pg_has_role('sf_fresh_account_gateway',r.oid,'MEMBER'))
 AND NOT has_schema_privilege('sf_fresh_account_gateway','sf_core','CREATE')
 AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','sf_core') AND c.relkind IN ('r','p','v','m','f') AND (
 has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
 OR has_table_privilege('sf_fresh_account_gateway',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_any_column_privilege('sf_fresh_account_gateway',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
 ${noDirectDefinerSql}
 AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sf_core' AND p.prosecdef AND has_function_privilege('sf_fresh_account_gateway',p.oid,'EXECUTE')
 AND NOT (${allowed}))
 AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='sf_core' AND p.prosecdef AND (${allowed})
 AND has_function_privilege('sf_fresh_account_gateway',p.oid,'EXECUTE'))=${count} AS safe`.replaceAll('sf_fresh_account_gateway',gateway);
// Only these fixed internal literals may compose the catalog query.
const freshPrivilegeSql=gatewayPrivilegeSql('sf_fresh_account_gateway',"p.proname='provision_fresh_account' AND pg_catalog.oidvectortypes(p.proargtypes)='uuid, uuid'",1);
const issuerPrivilegeSql=gatewayPrivilegeSql('sf_registration_issuer',"p.proname IN ('issue_registration_admission','registration_mail_allowed') AND pg_catalog.oidvectortypes(p.proargtypes)='uuid, text'",2);
const mailPrivilegeSql=gatewayPrivilegeSql('sf_mail_budget_gateway',"p.proname='reserve_recipient_mail' AND pg_catalog.oidvectortypes(p.proargtypes)='uuid, text, text'",1);
async function roleFailure(pool,role,sql,label,database){
 let rows;
 try{({rows}=await pool.query(roleIdentitySql));}catch(e){return label+(e?.code==='28P01'||e?.code==='28000'?'_credentials':'_connection');}
 if(!Array.isArray(rows)||rows.length!==1||rows[0].role!==role||rows[0].login!==role||rows[0].db!==database||rows[0].restricted!==true)return label+'_role';
 try{const g=await pool.query(sql);return g.rows.length===1&&g.rows[0].safe===true?null:label+'_permissions';}
 catch{return label+'_query';}
}
async function readinessFailures(authPool,businessPool,database='neondb'){
 return Promise.all([
  roleFailure(authPool,'sf_auth_runtime',authPrivilegeSql,'auth',database),
  roleFailure(businessPool,'sf_business_connect',businessPrivilegeSql,'business',database)
 ]);
}
export async function verifyPreviewDatabaseRoles(authPool,businessPool,database='neondb'){
 return (await readinessFailures(authPool,businessPool,database)).every(x=>x===null);
}

export function createPreviewHandler({env,authorizePreview,Pool=pg.Pool,authFactory=createStarflowAuthLab,attestationDatabase='neondb',registrationMail,providerTransport=fetch}){
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
  if(env.STARFLOW_V2_ENABLED!=='true'&&!(env.STARFLOW_V2_ENABLED==='false'&&[readinessRoute,registrationReadinessRoute,providerReadinessRoute].includes(route)))return deny();
  if((route===readinessRoute||route===registrationReadinessRoute||route===providerReadinessRoute||route===inboxPreviewRoute)&&url.search)return deny(400);
  // Browser-facing page is independently opt-in and cannot use owner-key mode.
  if(route===inboxPreviewRoute&&(env.STARFLOW_INBOX_PREVIEW_ENABLED!=='true'||env.STARFLOW_PREVIEW_OWNER_KEY!==undefined))return deny();
  const registration=registrationRoutes.has(route);
  // Email verification is browser navigation: an owner header cannot authorize its link.
  // Do not admit signup until the independent account initialization route is enabled.
  if(registration&&(env.STARFLOW_REGISTRATION_PREVIEW_ENABLED!=='true'||env.STARFLOW_FRESH_PREVIEW_ENABLED!=='true'||env.STARFLOW_PREVIEW_OWNER_KEY!==undefined))return deny();
  if(route===freshRoute&&(env.STARFLOW_FRESH_PREVIEW_ENABLED!=='true'))return deny();
  if(route===freshRoute&&(url.search||request.body!==null))return deny(400);
  if(route!==readinessRoute&&route!==registrationReadinessRoute&&route!==providerReadinessRoute&&route!==inboxPreviewRoute&&route!==freshRoute&&!registration&&!authPaths.has(route)&&!businessPaths.has(route)&&!(isSocialRoute(route)&&env.STARFLOW_SOCIAL_PREVIEW_ENABLED==='true'))return deny();
  if(request.headers.has('origin')&&request.headers.get('origin')!==origin)return deny(403);
  if(request.method==='POST'&&request.headers.get('origin')!==origin)return deny(403);
  if(authPaths.has(route)&&url.search)return deny(403);
  try{if(await authorizePreview(request)!==true)return deny(403);}catch{return deny(403);}
  // Owner-only, network read-only provider credential attestation; no database pool,
  // mail dispatch, media upload, customer data or signup switch required.
  if(route===providerReadinessRoute)return Response.json(await inspectProviderBindings(env,providerTransport),
   {headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  // Access credentials are only for this verified outer boundary, not downstream auth/business.
  // Registration independently sanitizes its own request.
  const accessHeaders=['x-starflow-preview-key','cf-access-jwt-assertion','cf-access-authenticated-user-email','cf-access-client-id','cf-access-client-secret'];
  if(!registration&&accessHeaders.some(name=>request.headers.has(name))){
   const headers=new Headers(request.headers);
   for(const name of accessHeaders)headers.delete(name);
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
  let authPool,businessPool,freshPool,issuerPool,mailPool;
  // Only reached after the existing owner authorization. Fixed labels, never exception text.
  const unavailable=stage=>route===registrationReadinessRoute?Response.json({databaseReady:false,stage},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}):route===readinessRoute?Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Starflow-Readiness-Stage':stage}}):deny(503);
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
   if(route===registrationReadinessRoute){
    // No auth ceremony, customer reads, provider request, or writes. This route
    // attests the five independent connections while all signup flags remain off.
    stage=env.STARFLOW_FRESH_DB_URL===undefined?'fresh_missing':'fresh_config';
    const f=restrictedPoolConfig(env.STARFLOW_FRESH_DB_URL,'sf_fresh_account_connect',env.STARFLOW_PREVIEW_DB_HOST);
    stage=env.STARFLOW_REGISTRATION_DB_URL===undefined?'issuer_missing':'issuer_config';
    const i=restrictedPoolConfig(env.STARFLOW_REGISTRATION_DB_URL,'sf_registration_connect',env.STARFLOW_PREVIEW_DB_HOST);
    stage=env.STARFLOW_MAIL_DB_URL===undefined?'mail_missing':'mail_config';
    const m=restrictedPoolConfig(env.STARFLOW_MAIL_DB_URL,'sf_mail_budget_connect',env.STARFLOW_PREVIEW_DB_HOST);
    if(new Set([a.password,b.password,f.password,i.password,m.password]).size!==5)return unavailable('credential_separation');
    stage='business_connection';businessPool=new Pool(b);
    stage='fresh_connection';freshPool=new Pool(f);
    stage='issuer_connection';issuerPool=new Pool(i);
    stage='mail_connection';mailPool=new Pool(m);
    stage='runtime';
    const failures=await Promise.all([
     roleFailure(authPool,'sf_auth_runtime',authPrivilegeSql,'auth',attestationDatabase),
     roleFailure(businessPool,'sf_business_connect',businessPrivilegeSql,'business',attestationDatabase),
     roleFailure(freshPool,'sf_fresh_account_connect',freshPrivilegeSql,'fresh',attestationDatabase),
     roleFailure(issuerPool,'sf_registration_connect',issuerPrivilegeSql,'issuer',attestationDatabase),
     roleFailure(mailPool,'sf_mail_budget_connect',mailPrivilegeSql,'mail',attestationDatabase)]);
    const failed=failures.find(Boolean);if(failed)return unavailable(failed);
    return Response.json({databaseReady:true,mailAdapterConfigured:typeof registrationMail?.verifyBilling==='function'&&typeof registrationMail?.transport==='function',
     liveMailVerified:false,registrationEnabled:env.STARFLOW_V2_ENABLED==='true'&&env.STARFLOW_REGISTRATION_PREVIEW_ENABLED==='true'&&env.STARFLOW_FRESH_PREVIEW_ENABLED==='true'&&env.STARFLOW_PREVIEW_OWNER_KEY===undefined,
     // A separate release fence: owner-key mode can mask a mistakenly enabled signup flag.
     safetyFlagsOff:env.STARFLOW_V2_ENABLED==='false'&&
       ['STARFLOW_FRESH_PREVIEW_ENABLED','STARFLOW_REGISTRATION_PREVIEW_ENABLED','STARFLOW_BREVO_SEND_ENABLED',
        'STARFLOW_CLOUDINARY_UPLOAD_ENABLED','STARFLOW_SOCIAL_PREVIEW_ENABLED','STARFLOW_INBOX_PREVIEW_ENABLED']
        .every(key=>env[key]!=='true')},
     {headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   if(route===readinessRoute){
    stage='business_connection';
    businessPool=new Pool(b);
    stage='runtime';
    const failures=await readinessFailures(authPool,businessPool,attestationDatabase);
    const failed=failures.find(Boolean);
    if(failed)return unavailable(failed);
    return Response.json({ready:true},{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   if(registration){
    // No default live transport or static assertion of free billing. Production
    // integration must inject an independently verified provider configuration.
    const isSignup=route==='POST /api/identity/auth/sign-up/email';
    if(isSignup&&(typeof registrationMail?.verifyBilling!=='function'||typeof registrationMail?.transport!=='function'||
     typeof registrationMail.apiKey!=='string'||!registrationMail.apiKey||
     typeof registrationMail.sender!=='string'||!registrationMail.sender||
     typeof registrationMail.recipientSecret!=='string'||registrationMail.recipientSecret.length<32||
     [env.BETTER_AUTH_SECRET,registrationMail.apiKey].includes(registrationMail.recipientSecret)||
     await registrationMail.verifyBilling()!==true))return deny(503);
    const f=restrictedPoolConfig(env.STARFLOW_FRESH_DB_URL,'sf_fresh_account_connect',env.STARFLOW_PREVIEW_DB_HOST);
    const i=restrictedPoolConfig(env.STARFLOW_REGISTRATION_DB_URL,'sf_registration_connect',env.STARFLOW_PREVIEW_DB_HOST);
    const m=restrictedPoolConfig(env.STARFLOW_MAIL_DB_URL,'sf_mail_budget_connect',env.STARFLOW_PREVIEW_DB_HOST);
    if(new Set([a.password,b.password,f.password,i.password,m.password]).size!==5)return deny(503);
    businessPool=new Pool(b);freshPool=new Pool(f);issuerPool=new Pool(i);mailPool=new Pool(m);
    const failures=await Promise.all([roleFailure(authPool,'sf_auth_runtime',authPrivilegeSql,'auth',attestationDatabase),
     roleFailure(businessPool,'sf_business_connect',businessPrivilegeSql,'business',attestationDatabase),
     roleFailure(freshPool,'sf_fresh_account_connect',freshPrivilegeSql,'fresh',attestationDatabase),
     roleFailure(issuerPool,'sf_registration_connect',issuerPrivilegeSql,'issuer',attestationDatabase),
     roleFailure(mailPool,'sf_mail_budget_connect',mailPrivilegeSql,'mail',attestationDatabase)]);
    if(failures.some(Boolean))return deny(503);
    // New signup must not write an auth account if the free mail plan is unavailable.
    // Verify existing email links without requiring another provider request.
    if(isSignup&&await createBrevoFreePlanCheck(registrationMail)()!==true)return deny(503);
    const admissions=createRegistrationAdmission(issuerPool);
    // A signed existing email link must not depend on the provider being available.
    // Verification cannot send an email, even if the downstream auth library tries.
    const mail=isSignup?createFreshRegistrationMail({...registrationMail,enabled:true,pool:mailPool,origin,allowRecipient:admissions.allowRecipient}):
     Object.freeze({sendVerificationEmail:async()=>{throw Error('mail disabled during verification');}});
    // Exactly this request was already authorized above; the signup handler
    // independently validates its route and removes Access/owner credentials.
    return await createFreshSignupHandler({enabled:true,database:authPool,origin,secret:env.BETTER_AUTH_SECRET,admissions,mail,authorizePreview:async candidate=>candidate===request})(request);
   }
   if(route===freshRoute){
    const failure=await roleFailure(authPool,'sf_auth_runtime',authPrivilegeSql,'auth',attestationDatabase);
    if(failure)return unavailable(failure);
    const f=restrictedPoolConfig(env.STARFLOW_FRESH_DB_URL,'sf_fresh_account_connect',env.STARFLOW_PREVIEW_DB_HOST);
    if([a.password,b.password].includes(f.password))return unavailable('credential_separation');
    freshPool=new Pool(f);
    if(await roleFailure(freshPool,'sf_fresh_account_connect',freshPrivilegeSql,'fresh',attestationDatabase))return deny(503);
    const auth=authFactory({database:authPool,origin,secret:env.BETTER_AUTH_SECRET});
    const result=await provisionFreshAccount({auth,pool:freshPool,headers:request.headers});
    return Response.json(result,{status:result.status==='created'?201:result.status==='unavailable'?503:403,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   }
   // Re-attest each request-scoped pool before exposing any enabled preview operation.
   // Auth-only requests do not open a business connection.
   if(authPaths.has(route)){
    const failure=await roleFailure(authPool,'sf_auth_runtime',authPrivilegeSql,'auth',attestationDatabase);
    if(failure)return unavailable(failure);
   }else{
    businessPool=new Pool(b);
    const failure=(await readinessFailures(authPool,businessPool,attestationDatabase)).find(Boolean);
    if(failure)return unavailable(failure);
   }
   const auth=authFactory({database:authPool,origin,secret:env.BETTER_AUTH_SECRET});
   const business=authPaths.has(route)?null:createBusinessHandler({auth,pool:businessPool,origin});
   let response;
   if(route===inboxPreviewRoute){
    // Isolated HTML diagnostic: no legacy layout, scripts, credentials or message content.
    const read=path=>business(new Request(new URL(path,origin),{headers:request.headers,signal:request.signal}));
    const me=await read('/api/v2/me');
    if(!me.ok)return me;
    const principal=(await me.json())?.profile?.id;
    const snapshot=await createInboxSync({request:read,pageBudget:1}).refresh(principal);
    const count=(n,more)=>String(n)+(more?'+':'');
    const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>星流 · 消息联调</title></head><body><main><h1>星流 · 消息联调</h1><p>仅限授权测试环境。当前账户可见的消息与通知（最多读取各 50 条）。</p><p>消息：'+count(snapshot.messages.length,snapshot.hasMoreMessages)+'</p><p>通知：'+count(snapshot.notifications.length,snapshot.hasMoreNotifications)+'</p><p><a href="/api/v2/inbox-preview">重新验证并刷新</a></p></main></body></html>';
    response=new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'}});
   }else response=authPaths.has(route)?await auth.handler(request):await business(request);
   const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');
   return new Response(response.body,{status:response.status,headers});
  }catch{return unavailable(stage);}
  finally{
   // Worker I/O resources are request scoped; never reuse pg sockets across requests.
   await Promise.allSettled([authPool,businessPool,freshPool,issuerPool,mailPool].filter(Boolean).map(p=>p.end()));
  }
 };
}
