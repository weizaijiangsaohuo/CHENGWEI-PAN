import Link from 'next/link';
export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="brand" aria-label="星流主页">
    <img width="44" height="44" src="/starflow-official-mark.webp" alt="星流正式 Logo"
      style={{flexShrink:0,borderRadius:13,objectFit:'cover'}} />
    {!compact && <span>星流 <small>STARFLOW</small></span>}
  </Link>;
}
export function Avatar({ name = '星', size = 44, image }: { name?: string; size?: number; image?: string | null }) {
  const color = ['#156d74', '#b66a6e', '#6858a9', '#7f8d40', '#aa7748'][Array.from(name).reduce((a,c) => a + c.charCodeAt(0),0) % 5];
  return <div className="avatar" style={{ width: size, height: size, minWidth: size, background: color, fontSize: size * .38 }} aria-label={name}>
    {image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : name.slice(0,1).toUpperCase()}
  </div>;
}
