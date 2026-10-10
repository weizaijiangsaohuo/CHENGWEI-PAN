'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

/** Starflow original scalloped verification seal, issued only from approved server records. */
export type VerificationKind = 'blue' | 'gold' | 'gray';

const DETAILS: Record<VerificationKind, { name: string; color: string; description: string }> = {
  blue: {
    name: '蓝色认证', color: '#2797E8',
    description: 'Starflow 蓝色认证账号。具体资格由 Starflow 平台规则决定；不等于身份证件核验。',
  },
  gold: {
    name: '金色认证', color: '#D4A832',
    description: 'Starflow 平台审核通过的官方品牌、企业或组织账号。该认证仅属于 Starflow 平台，不代表 X 或其他第三方认证。',
  },
  gray: {
    name: '灰色认证', color: '#8995A5',
    description: 'Starflow 平台审核通过的政府、公共机构或符合条件的多边组织账号。',
  },
};

// Continuous, symmetric, gently scalloped seal rather than a sharp polygon.
// Eight shallow lobes distinguish it from a generic solid circle.
const SEAL = (() => {
  const cx = 16, cy = 16;
  const n = 160;
  const points = Array.from({ length: n }, (_, index) => {
    const theta = -Math.PI / 2 + 2 * Math.PI * index / n;
    const radius = 13.48 + 1.12 * Math.cos(8 * theta);
    return [cx + Math.cos(theta) * radius, cy + Math.sin(theta) * radius];
  });
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(3)} ${y.toFixed(3)}`).join(' ') + ' Z';
})();

export function VerificationBadge({ kind, size = 20, interactive = true }: { kind: VerificationKind | null | undefined; size?: 16 | 20 | 24 | 32; interactive?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();
  const item = kind ? DETAILS[kind] : undefined;
  const label = useMemo(() => item ? `已获得 Starflow ${item.name}` : '', [item]);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  if (!item) return null;
  if (!interactive) return <svg role="img" aria-label={item.name} viewBox="0 0 32 32" width={size} height={size} xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0,verticalAlign:'middle'}}>
    <path d={SEAL} fill={item.color}/>
    <path d="M9.25 16.15 13.65 20.4 22.65 11.25" fill="none" stroke="#fff" strokeWidth="3.12" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
  return <span ref={root} className="sf-verified" style={{ display: 'inline-flex', position: 'relative', alignItems: 'center', flexShrink: 0, verticalAlign: 'middle' }}>
    <button type="button" title={label} aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(wasOpen => !wasOpen); }}
      style={{ width: size + 7, height: size + 7, display: 'inline-grid', placeItems: 'center', padding: 0, border: 0, background: 'transparent', cursor: 'pointer', borderRadius: '50%' }}>
      <svg role="img" aria-label={item.name} viewBox="0 0 32 32" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <path d={SEAL} fill={item.color}/>
        <path d="M9.25 16.15 13.65 20.4 22.65 11.25" fill="none" stroke="#fff" strokeWidth="3.12" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
    {open && <span id={id} role="dialog" aria-label={item.name} onClick={e => e.stopPropagation()}
      style={{ position: 'absolute', zIndex: 250, top: 'calc(100% + 7px)', left: 'min(0px, calc(100vw - 295px))', width: 264, maxWidth: 'min(82vw, 264px)', display: 'block', boxSizing: 'border-box', padding: 15, border: '1px solid #ebdfed', borderRadius: 16, background: '#fff', color: '#251e2c', boxShadow: '0 15px 35px #29182e28', fontSize: 13, lineHeight: 1.65, textAlign: 'left' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <strong>{item.name}</strong>
        <button type="button" aria-label="关闭认证详情" onClick={() => setOpen(false)} style={{ border: 0, background: 'transparent', color: '#504659', fontSize: 20, lineHeight: 1 }}>×</button>
      </span>
      <span style={{ display: 'block', marginTop: 7 }}>{item.description}</span>
    </span>}
  </span>;
}
