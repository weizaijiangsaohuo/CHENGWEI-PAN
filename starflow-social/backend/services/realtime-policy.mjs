// Transport-independent handshake policy; no WebSocket server or production route.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function authorizeUpgrade({request,origin,auth,resolvePrincipal,now=Date.now()}){
 try{
  const base=new URL(origin),url=new URL(request.url);
  if(base.protocol!=='https:'||base.origin!==origin||url.origin!==origin||url.pathname!=='/api/realtime'||url.search||url.hash||
   request.method!=='GET'||request.headers.get('origin')!==origin||request.headers.get('upgrade')?.toLowerCase()!=='websocket')return null;
  const session=await auth.api.getSession({headers:request.headers});
  const subject=session?.user?.id, sid=session?.session?.id, expiry=Date.parse(session?.session?.expiresAt);
  if(session?.user?.emailVerified!==true||!uuid.test(subject??'')||!uuid.test(sid??'')||
   session.session.userId!==subject||!Number.isFinite(expiry)||expiry<=now)return null;
  const principal=await resolvePrincipal(subject);
  if(!uuid.test(principal??''))return null;
  return {principal,subject,sessionId:sid,expiresAt:Math.min(expiry,now+60000)};
 }catch{return null;}
}
// Only a generic hint; never put message content, user IDs, tokens or counts on a socket.
// Call only after independently revalidating the session, binding and per-user recipient routing.
export function syncHint(connection,revalidated,now=Date.now()){
 if(!connection||!revalidated||connection.expiresAt<=now||
 connection.principal!==revalidated.principal||connection.subject!==revalidated.subject||
 connection.sessionId!==revalidated.sessionId||revalidated.expiresAt<=now)return null;
 return JSON.stringify({type:'sync_available'});
}
