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
    const id = window.setTimeout(() => {
      const box = document.querySelector<HTMLTextAreaElement>('.app-frame .composer textarea');
      box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      box?.focus();
    }, 160);
    return () => window.clearTimeout(id);
  }, [pathname]);
  const compose = () => {
    if (pathname === '/') {
      const box = document.querySelector<HTMLTextAreaElement>('.app-frame .composer textarea');
      box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      box?.focus();
    } else {
      pending.current = true;
      router.push('/');
    }
  };
  return <button type="button" onClick={compose} aria-label="写一条新动态" title="发布动态" className="sf-mobile-compose-fab">
    <PenLine size={21}/>
  </button>;
}
