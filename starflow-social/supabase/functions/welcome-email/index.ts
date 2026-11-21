// Retired optional welcome-mail transport. No provider request or database mutation.
// Existing deployed Edge Functions are NOT changed by committing this file.
Deno.serve((request) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return Response.json({error:'method_not_allowed'}, {status:405,headers});
  return Response.json({error:'welcome_email_retired'}, {status:410,headers});
});
