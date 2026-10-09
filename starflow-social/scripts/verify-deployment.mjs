// 此脚本在网站上线后手动运行，检查真实域名是否提供可信 HTTPS 及健康接口。
// 用法：node scripts/verify-deployment.mjs https://your-worker.workers.dev
const base=process.argv[2];
if(!base){console.error('用法：node scripts/verify-deployment.mjs https://your-worker.workers.dev');process.exit(2)}
let address;
try{address=new URL(base);if(address.protocol!=='https:')throw new Error('必须使用 HTTPS');}
catch(e){console.error('地址无效：',e.message);process.exit(2)}
try {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  const response=await fetch(new URL('/api/health',address),{signal:controller.signal,redirect:'error'});
  clearTimeout(timer);
  const json=await response.json();
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  if(json.name!=='Starflow'||json.status!=='configured')throw new Error(`应用未完成后端配置：${JSON.stringify(json)}`);
  console.log('PASS HTTPS: 系统 TLS 校验已通过');
  console.log('PASS HTTP: /api/health 状态 200');
  console.log('PASS 应用: Starflow 已加载后端公开环境变量');
  console.log('注意：还需要亲自测试邮件、Google OAuth、RLS 与真实多用户流程；HTTPS 不等于企业认证。');
}catch(e){console.error('FAIL:',e.message);process.exitCode=1}
