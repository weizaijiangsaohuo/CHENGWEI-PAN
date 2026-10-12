import Link from 'next/link';
import {Building2} from 'lucide-react';

/** Route-segment loading preserves page identity while Next streams account data. */
export default function Loading(){
 return <main className="sf-aff-page"><div className="sf-aff-wrap">
  <Link className="sf-aff-back" href="/settings">← 返回设置</Link>
  <div className="sf-aff-page-head"><div className="sf-aff-icon"><Building2 size={25}/></div>
   <h1>官方附属账号</h1>
   <p>把官方组织与旗下品牌、成员或团队账号关联起来。</p>
  </div>
  <div className="sf-aff-loading" role="status" aria-live="polite" aria-label="正在加载官方附属账号">
   <p>正在打开官方附属账号…</p>
   <div className="sf-aff-card sf-aff-skeleton-card" aria-hidden="true"><span/><i/><i/></div>
   <div className="sf-aff-card sf-aff-skeleton-card" aria-hidden="true"><span/><i/></div>
   <div className="sf-aff-card sf-aff-skeleton-card" aria-hidden="true"><span/><i/></div>
  </div>
 </div></main>;
}
