import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

// Configurable TURN REST credentials (coturn use-auth-secret).
// Never expose STARFLOW_TURN_SHARED_SECRET or Supabase service_role to clients.
export async function GET(request:Request){
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return NextResponse.json({error:'Authentication required'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!anon)return NextResponse.json({error:'Not configured'},{status:503});
 try{
  const client=createClient(url,anon,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data,error}=await client.auth.getUser(token);
  if(error||!data.user)return NextResponse.json({error:'Invalid session'},{status:401});
  const urls=(process.env.STARFLOW_TURN_URLS||'').split(',').map(s=>s.trim())
   .filter(s=>/^(turns?):[^/\s]+/i.test(s)).slice(0,4);
  const secret=process.env.STARFLOW_TURN_SHARED_SECRET;
  if(!urls.length||!secret)return NextResponse.json({iceServers:[],turnConfigured:false},{
   headers:{'Cache-Control':'private, no-store'}
  });
  const expires=Math.floor(Date.now()/1000)+3600;
  const username=expires+':'+data.user.id;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
   {name:'HMAC',hash:'SHA-1'},false,['sign']);
  const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(username));
  const credential=btoa(String.fromCharCode(...new Uint8Array(signed)));
  return NextResponse.json({iceServers:[{urls,username,credential}],turnConfigured:true},{
   headers:{'Cache-Control':'private, no-store'}
  });
 }catch{
  return NextResponse.json({error:'TURN unavailable'},{status:503});
 }
}
