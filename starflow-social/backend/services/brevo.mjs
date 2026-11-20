// Isolated service adapter. No live transport, environment lookup, or public handler.
const email=/^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function buildSecurityEmail({origin,sender,recipient,purpose,link,eventId}){
 if(!email.test(sender)||!email.test(recipient)||sender.length>254||recipient.length>254||!uuid.test(eventId))throw Error('Invalid mail envelope');
 const host=new URL(origin),url=new URL(link);
 if(host.protocol!=='https:'||host.origin!==origin||url.origin!==origin||url.username||url.password||url.hash)throw Error('Invalid auth origin');
 const path={verify:'/api/identity/auth/verify-email',reset:'/reset-password'};
 if(!Object.hasOwn(path,purpose)||url.pathname!==path[purpose])throw Error('Invalid auth action');
 // Do not allow open redirect parameters; the eventual Better Auth reset callback must match this route.
 for(const k of url.searchParams.keys())if(k!=='token')throw Error('Unexpected action parameter');
 if(url.searchParams.getAll('token').length!==1||!url.searchParams.get('token')||url.href.length>2048)throw Error('Invalid token');
 return {sender:{email:sender,name:'Starflow'},to:[{email:recipient}],subject:purpose==='verify'?'Starflow 邮箱验证':'Starflow 密码重置',
  textContent:'请使用此一次性链接完成账户操作（15分钟内有效）：\n'+url.href+'\n如非本人操作，请忽略。',headers:{IdempotencyKey:eventId}};
}
// Preparation only; no caller and no default fetch. Real dispatcher requires quota reservation,
// verified account plan, recipient provenance, anti-abuse, and a durable outbox.
export function prepareBrevoRequest(input,apiKey){
 if(typeof apiKey!=='string'||!apiKey||/[\r\n]/.test(apiKey))throw Error('Missing credential');
 return {url:'https://api.brevo.com/v3/smtp/email',options:{method:'POST',redirect:'error',cache:'no-store',headers:{'api-key':apiKey,'content-type':'application/json'},body:JSON.stringify(buildSecurityEmail(input))}};
}

// Offline template only. Sender and verified account limits must be configured before any dispatch.
export function prepareBrevoOtpRequest({sender,recipient,otp,eventId},apiKey){
 if(typeof sender!=='string'||typeof recipient!=='string'||!email.test(sender)||!email.test(recipient)||sender.length>254||recipient.length>254||typeof otp!=='string'||!/^\d{6}$/.test(otp)||typeof eventId!=='string'||!uuid.test(eventId)||typeof apiKey!=='string'||!apiKey||/[\r\n]/.test(apiKey))throw Error('Invalid OTP mail');
 return {url:'https://api.brevo.com/v3/smtp/email',options:{method:'POST',redirect:'error',cache:'no-store',headers:{'api-key':apiKey,'content-type':'application/json'},body:JSON.stringify({sender:{email:sender,name:'Starflow'},to:[{email:recipient}],subject:'Starflow 邮箱验证码',textContent:'你的星流验证码：'+otp+'。5分钟内有效，仅能使用一次。请勿向任何人透露验证码。',headers:{IdempotencyKey:eventId}})}};
}
