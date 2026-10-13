import Link from 'next/link';
export const dynamic = 'force-static';
export const metadata = {title:'暂时离线 · Starflow',robots:{index:false,follow:false}};
export default function OfflinePage(){
 return <main style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:24,background:'#f8f5ff',color:'#30264d',textAlign:'center'}}>
  <section style={{maxWidth:410}}>
   <div aria-hidden="true" style={{fontSize:60}}>✦</div>
   <h1 style={{fontSize:27}}>星流暂时离线</h1>
   <p style={{lineHeight:1.75,color:'#766a8b'}}>当前无法连接网络。你的账号、私信、草稿和帖子没有被保存在离线缓存中。重新联网即可继续使用。</p>
   <Link href="/" style={{display:'inline-block',borderRadius:12,background:'#7043b8',color:'white',textDecoration:'none',padding:'12px 20px'}}>重新连接 Starflow</Link>
  </section>
 </main>
}
