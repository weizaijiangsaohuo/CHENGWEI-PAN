'use client';

export default function GlobalError({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
 return <html lang="zh-CN"><body style={{margin:0,minHeight:'100dvh',display:'grid',placeItems:'center',padding:20,background:'#faf6ff',color:'#34264e',fontFamily:"-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif"}}>
  <main style={{textAlign:'center',maxWidth:440}}>
   <img src="/starflow-official-mark.webp" alt="星流" width="70" height="70" style={{borderRadius:20}}/>
   <h1 style={{fontSize:24}}>页面暂时无法显示</h1>
   <p style={{fontSize:14,color:'#84748e',lineHeight:1.8}}>连接出现异常，请重新加载；如果仍有问题，可以稍后重试。</p>
   <button type="button" onClick={()=>{reset();window.location.reload()}} style={{minHeight:46,border:0,borderRadius:12,background:'#865ac7',color:'#fff',padding:'12px 28px',fontSize:15,fontWeight:750}}>重新加载</button>
   <p><a href="/" style={{color:'#7964b8',fontSize:14}}>返回 Starflow 首页</a></p>
  </main>
 </body></html>;
}
