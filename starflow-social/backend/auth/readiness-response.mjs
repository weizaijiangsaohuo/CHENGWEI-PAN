// Make the existing public HTTP status visible to mobile shortcuts on this exact staging URL.
// Never expose configuration, exception text, secrets, or additional authorization information.
const target='https://feature-neon-backend-foundation-20261120-weizai.weizai.workers.dev/api/v2/readiness';
export function readinessResponse(request,response){
 if(request.method!=='GET'||request.url!==target||![400,403,404,503].includes(response.status))return response;
 const status=response.status;
 return Response.json({error:status===503?'unavailable':'not_permitted',status},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
