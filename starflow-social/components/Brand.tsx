import Link from 'next/link';
export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="brand" aria-label="星流主页">
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="15" fill="#171923" />
      <path d="M11 27.5C18 28 19 13 26 15.5C32 17.5 29 28 37 20" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <circle cx="35.8" cy="31.5" r="3.4" fill="#A5B2FF" />
    </svg>
    {!compact && <span>星流 <small>STARFLOW</small></span>}
  </Link>;
}
export function Avatar({ name = '星', size = 44, image }: { name?: string; size?: number; image?: string | null }) {
  const color = ['#156d74', '#b66a6e', '#6858a9', '#7f8d40', '#aa7748'][Array.from(name).reduce((a,c) => a + c.charCodeAt(0),0) % 5];
  return <div className="avatar" style={{ width: size, height: size, minWidth: size, background: color, fontSize: size * .38 }} aria-label={name}>
    {image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : name.slice(0,1).toUpperCase()}
  </div>;
}
