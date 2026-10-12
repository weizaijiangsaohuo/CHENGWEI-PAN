/** Rendered only while Next.js is loading a route; not a fake data preview. */
export default function Loading(){
 return <main className="sf2-route-loading" aria-label="正在载入星流页面" aria-busy="true">
  <div className="sf2-route-loading-header"><span/><span/><span/></div>
  <div className="sf2-route-loading-content">
   {Array.from({length:4},(_,index)=><div className="sf2-route-loading-post" key={index}>
    <i/><div><b/><span/><span/><small/></div>
   </div>)}
  </div>
 </main>;
}
