'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

// The existing affiliate component uses a legacy seal outline. Keep its verified
// organization/affiliate symbol identical to the already-issued Starflow seal.
// This does not alter who is verified, the colour, or the square organization link.
const STANDARD_SEAL = Array.from({length:160},(_,i)=>{
  const t=-Math.PI/2+2*Math.PI*i/160;
  const r=13.48+1.12*Math.cos(8*t);
  return `${i===0?'M':'L'}${(16+Math.cos(t)*r).toFixed(3)} ${(16+Math.sin(t)*r).toFixed(3)}`;
}).join(' ')+' Z';

/** Adds the account-details entry to the existing profile. The verified seal is unchanged.
 * An affiliation's square logo remains a link to the parent organization. */
export function StarflowAccountAboutEntry() {
  const pathname = usePathname() || '';
  const router = useRouter();
  const match = /^\/profile\/([^/]+)\/?$/.exec(pathname);
  const handle = match ? decodeURIComponent(match[1]) : '';
  const href = handle ? `/profile/${encodeURIComponent(handle)}/about` : '';
  const [portal, setPortal] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const normalize=()=>{
      document.querySelectorAll<SVGPathElement>('.sf-aff-derived-check path:first-child').forEach(p=>{
        if(p.getAttribute('d')!==STANDARD_SEAL)p.setAttribute('d',STANDARD_SEAL);
      });
    };
    normalize();
    const observer=new MutationObserver(normalize);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);

  useEffect(() => {
    if (!href) { setPortal(null); return; }
    let currentName: HTMLElement | null = null;
    let currentVerifiedButton: HTMLButtonElement | null = null;
    const go = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();
      router.push(href);
    };
    const onNameKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') go(event);
    };
    const observe = () => {
      const info = document.querySelector<HTMLElement>('.app-frame .profile-info');
      const joined = info?.querySelector<HTMLElement>('p.muted.small');
      const name = info?.querySelector<HTMLElement>('h2');
      const badge = info?.querySelector<HTMLButtonElement>('.sf-verified button');
      if (name !== currentName) {
        currentName?.removeEventListener('click', go, true);
        currentName?.removeEventListener('keydown', onNameKey);
        if (currentName) { currentName.removeAttribute('tabindex'); currentName.removeAttribute('role'); currentName.classList.remove('sf-about-name-link'); }
        currentName = name || null;
        if (currentName) {
          currentName.addEventListener('click', go, true);
          currentName.addEventListener('keydown', onNameKey);
          currentName.setAttribute('tabindex', '0');
          currentName.setAttribute('role', 'link');
          currentName.classList.add('sf-about-name-link');
          currentName.setAttribute('title', '关于此账号');
        }
      }
      if (badge !== currentVerifiedButton) {
        currentVerifiedButton?.removeEventListener('click', go, true);
        currentVerifiedButton = badge || null;
        currentVerifiedButton?.addEventListener('click', go, true);
      }
      if (joined) {
        let slot = info?.querySelector<HTMLElement>('.sf-about-entry-slot');
        if (!slot) {
          slot = document.createElement('div');
          slot.className = 'sf-about-entry-slot';
          joined.insertAdjacentElement('afterend', slot);
        }
        setPortal(prev => prev === slot ? prev : slot || null);
      } else setPortal(null);
    };
    observe();
    const observer = new MutationObserver(observe);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      currentName?.removeEventListener('click', go, true);
      currentName?.removeEventListener('keydown', onNameKey);
      if (currentName) { currentName.removeAttribute('tabindex'); currentName.removeAttribute('role'); currentName.classList.remove('sf-about-name-link'); }
      currentVerifiedButton?.removeEventListener('click', go, true);
      setPortal(null);
    };
  }, [href, router]);
  return handle && portal ? createPortal(
    <Link href={href} className="sf-about-entry">关于此账号 <span aria-hidden="true">›</span></Link>, portal
  ) : null;
}
