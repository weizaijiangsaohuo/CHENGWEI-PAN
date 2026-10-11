'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PenLine } from 'lucide-react';

/** Mobile-only route to the existing, tested SocialApp composer. */
export function StarflowMobileCompose() {
  const pathname = usePathname();
  const router = useRouter();
  const pending = useRef(false);
  useEffect(() => {
    if (pathname !== '/' || !pending.current) return;
    pending.current = false;
    const id=window.setTimeout(()=>window.dispatchEvent(new Event('sf-open-home-composer')),160);
    return () => window.clearTimeout(id);
  }, [pathname]);
  const compose=()=>{
    if(pathname==='/')window.dispatchEvent(new Event('sf-open-home-composer'));
    else{pending.current=true;router.push('/?compose=1');}
  };
  return <button type="button" onClick={compose} aria-label="写一条新动态" title="发布动态" className="sf-mobile-compose-fab">
    <PenLine size={21}/>
  </button>;
}
