// Isolated metadata-only workbench. Host must provide a real fresh-MFA proof issuer.
// No auto-fetch, proof input field, persistent storage, raw photo access, or fake records.
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const states={reserved:'已预约',pending:'核验中',review:'待复核',declined:'未通过',cancelled:'已取消',checks_passed:'核验检查通过'};
const kinds={face_photo:'人脸照片',document_front:'证件正面',document_back:'证件反面',identity_fields:'身份字段'};
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function validateIdentityPage(value,subject){
 if(!value||!Array.isArray(value.cases)||value.cases.length>50||!(value.next===null||uuid(value.next)))throw Error('invalid response');
 const seen=new Set();
 const cases=value.cases.map(r=>{
  if(!r||!uuid(r.attemptId)||!uuid(r.principalId)||(subject!==null&&r.principalId!==subject)||seen.has(r.attemptId)||
   !Object.hasOwn(states,r.state)||!date(r.submittedAt)||!Array.isArray(r.evidenceKinds)||r.evidenceKinds.length>4||
   !r.evidenceKinds.every(k=>Object.hasOwn(kinds,k))||new Set(r.evidenceKinds).size!==r.evidenceKinds.length||
   !(r.retainedUntil===null||date(r.retainedUntil))||(r.evidenceKinds.length>0&&r.retainedUntil===null))throw Error('invalid response');
  seen.add(r.attemptId);
  const active=r.retainedUntil!==null&&Date.parse(r.retainedUntil)>Date.now();
  return {attemptId:r.attemptId,principalId:r.principalId,state:r.state,submittedAt:r.submittedAt,evidenceKinds:active?[...r.evidenceKinds]:[],retainedUntil:active?r.retainedUntil:null};
 });
 if(value.next!==null&&(cases.length!==50||value.next!==cases[49].attemptId))throw Error('invalid cursor');
 return {cases,next:value.next};
}
export function createCasePageLoader({requestProof,request=fetch,onChange}){
 let generation=0,abort=null;
 function clear(reason='idle'){generation++;abort?.abort();abort=null;onChange({status:reason,cases:[],next:null});}
 async function load(subject=null,before=null){
  clear('loading');const current=generation;
  if(typeof requestProof!=='function'||!(subject===null||uuid(subject))||!(before===null||uuid(before))){clear('unavailable');return;}
  const controller=new AbortController();abort=controller;
  try{
   const proof=await requestProof({subject,before,signal:controller.signal});
   if(current!==generation)return;
   if(!uuid(proof))throw Error('proof');
   const response=await request('/api/v2/admin/identity/cases',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
    headers:{'content-type':'application/json'},body:JSON.stringify({proof,subject,before}),signal:controller.signal});
   if(!response.ok)throw Error('denied');
   const result=validateIdentityPage(await response.json(),subject);
   if(current!==generation)return;
   abort=null;onChange({status:'ready',...result});
  }catch{if(current===generation)clear('unavailable');}
 }
 return {load,clear};
}
export function mountIdentityWorkbench(root,{requestProof,request=fetch}={}){
 const form=root.querySelector('form'),filter=root.querySelector('[name=subject]'),body=root.querySelector('tbody');
 const status=root.querySelector('[role=status]'),next=root.querySelector('[data-next]'),search=root.querySelector('[data-search]');
 const messages={idle:'请完成管理员二次验证后查询。',loading:'正在验证权限并查询…',ready:'查询完成。',unavailable:'未获授权或服务暂不可用，请重新验证。'};
 let cursor=null,subject=null,timer=null;
 const cell=(row,value)=>{const td=document.createElement('td');td.textContent=value;row.append(td);};
 const loader=createCasePageLoader({requestProof,request,onChange(value){
  clearTimeout(timer);timer=null;body.replaceChildren();cursor=value.next;next.disabled=!cursor;status.textContent=messages[value.status];
  let expiry=Infinity;
  for(const item of value.cases){
   const row=document.createElement('tr');cell(row,item.principalId);cell(row,item.attemptId);cell(row,states[item.state]);
   cell(row,new Date(item.submittedAt).toLocaleString());cell(row,item.evidenceKinds.map(k=>kinds[k]).join('、')||'无可查看材料');
   cell(row,item.retainedUntil?new Date(item.retainedUntil).toLocaleString():'—');body.append(row);
   if(item.retainedUntil)expiry=Math.min(expiry,Date.parse(item.retainedUntil));
  }
  if(value.status==='ready'&&!value.cases.length)status.textContent='没有符合条件的认证档案。';
  if(Number.isFinite(expiry))timer=setTimeout(()=>loader.clear(),Math.max(0,Math.min(2147483647,expiry-Date.now())));
 }});
 search.disabled=typeof requestProof!=='function';
 if(search.disabled)status.textContent='身份档案接口尚未启用，等待安全接入。';
 const submit=e=>{e.preventDefault();subject=filter.value.trim().toLowerCase()||null;void loader.load(subject,null);};
 const advance=()=>{if(cursor)void loader.load(subject,cursor);};
 const reset=()=>{loader.clear();subject=null;};
 const hidden=()=>{if(document.visibilityState!=='visible')reset();};
 form.addEventListener('submit',submit);next.addEventListener('click',advance);filter.addEventListener('input',reset);
 document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',reset);
 return {clear:reset,destroy(){reset();form.removeEventListener('submit',submit);next.removeEventListener('click',advance);filter.removeEventListener('input',reset);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',reset);}};
}
