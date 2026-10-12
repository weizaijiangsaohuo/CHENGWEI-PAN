'use client';
import type {ButtonHTMLAttributes,HTMLAttributes,ReactNode} from 'react';

type Level='navigation'|'panel'|'overlay';
const names:Record<Level,string>={
 navigation:'sf2-glass-nav',panel:'sf2-glass-panel',overlay:'sf2-glass'
};
/** A semantic surface, not an overlay over scrolling content or private messages. */
export function GlassSurface({level='panel',className='',children,...props}:
 HTMLAttributes<HTMLDivElement>&{level?:Level;children:ReactNode}){
 return <div {...props} className={[names[level],className].filter(Boolean).join(' ')}>{children}</div>;
}
/** Real button contract: callers provide onClick or type=submit; never decorative navigation. */
export function GlassAction({variant='neutral',className='',children,type='button',...props}:
 ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'neutral'|'primary'|'danger'}){
 return <button {...props} type={type} className={['sf2-glass-button',variant==='neutral'?'':'sf2-glass-'+variant,className].filter(Boolean).join(' ')}>
  {children}
 </button>;
}
