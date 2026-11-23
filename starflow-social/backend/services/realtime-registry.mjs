// In-process transport registry for isolated runtime integration. Not a Durable Object or a public route.
// Never broadcast identifiers or message contents. The trusted delivery caller selects one recipient.
import {syncHint,validRealtimeGrant} from './realtime-policy.mjs';
export function createRealtimeRegistry({maxTotal=32,maxPerPrincipal=2,clock=Date.now}={}){
 if(!Number.isSafeInteger(maxTotal)||maxTotal<1||maxTotal>128||!Number.isSafeInteger(maxPerPrincipal)||maxPerPrincipal<1||maxPerPrincipal>4)throw Error('invalid caps');
 const connections=new Set(),attached=new WeakSet();
 const close=(c)=>{if(!connections.delete(c))return;try{c.socket.close(1008,'reauthorize');}catch{}};
 const sweep=()=>{for(const c of connections)if(c.grant.expiresAt<=clock())close(c);};
 return {
  attach(socket,grant,revalidate){
   sweep();const now=clock();
   if(!socket||typeof socket.addEventListener!=='function'||typeof socket.send!=='function'||typeof socket.close!=='function'||attached.has(socket)||
    !validRealtimeGrant(grant,now)||typeof revalidate!=='function'||
    connections.size>=maxTotal||[...connections].filter(c=>c.grant.principal===grant.principal).length>=maxPerPrincipal)return false;
   const snapshot=Object.freeze({principal:grant.principal,subject:grant.subject,sessionId:grant.sessionId,expiresAt:grant.expiresAt});
   const c={socket,grant:snapshot,revalidate};connections.add(c);attached.add(socket);
   socket.addEventListener('close',()=>connections.delete(c),{once:true});
   socket.addEventListener('error',()=>close(c),{once:true});
   socket.addEventListener('message',()=>close(c)); // server-to-client hint channel only
   return true;
  },
  async notify(principal){
   sweep();for(const c of [...connections])if(c.grant.principal===principal){
    let current;try{current=await c.revalidate();}catch{close(c);continue;}
    if(!connections.has(c))continue;
    const hint=syncHint(c.grant,current,clock());if(!hint){close(c);continue;}
    try{c.socket.send(hint);}catch{close(c);}
   }
  },
  sweep,
  closeAll(){for(const c of [...connections])close(c);},
  get size(){return connections.size;}
 };
}
