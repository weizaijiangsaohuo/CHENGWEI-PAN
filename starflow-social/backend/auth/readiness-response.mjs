// Make the existing public HTTP status visible to mobile shortcuts on this exact staging URL.
// Never expose configuration, exception text, secrets, or additional authorization information.
const stages=new Set(['signing_config','auth_missing','business_missing','auth_config','business_config','credential_separation','auth_connection','business_connection','auth_credentials','business_credentials','auth_role','business_role','auth_permissions','business_permissions','auth_query','business_query','runtime']);
const target='https://feature-neon-backend-foundation-20261120-weizai.weizai.workers.dev/api/v2/readiness';
export function readinessResponse(request,response){
 if(request.method!=='GET'||request.url!==target||![400,403,404,503].includes(response.status))return response;
 const status=response.status;
 const stage=response.headers.get('X-Starflow-Readiness-Stage');
 const detail=status===503&&stages.has(stage)?{stage}:{};
 return Response.json({error:status===503?'unavailable':'not_permitted',status,...detail},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
