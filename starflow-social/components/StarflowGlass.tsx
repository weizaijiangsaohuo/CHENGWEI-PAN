'use client';
import type {ButtonHTMLAttributes,HTMLAttributes,ReactNode} from 'react';
import {useId} from 'react';

/** Shared Starflow 2 control primitives. For floating chrome, not long-reading content. */
export function GlassSurface({children,level='navigation',className='',...props}:HTMLAttributes<HTMLDivElement>&{
  children:ReactNode;level?:'navigation'|'overlay'|'panel';
}){
 return <div {...props} className={'sf2-glass sf2-glass-'+level+' '+className}>{children}</div>;
}
export function GlassButton({children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>){
 return <button {...props} className={'sf2-glass-button '+className}>{children}</button>;
}
export type SegmentOption<T extends string>={value:T;label:string;disabled?:boolean};
export function GlassSegmentedControl<T extends string>({label,value,options,onChange}:{
 label:string;value:T;options:readonly SegmentOption<T>[];onChange:(value:T)=>void;
}){
 const id=useId();
 return <div className="sf2-glass-segmented" role="group" aria-label={label}>
  {options.map(option=><button key={option.value} type="button"
   id={id+'-'+option.value}
   aria-pressed={value===option.value}
   className={value===option.value?'is-selected':''}
   disabled={option.disabled}
   onClick={()=>onChange(option.value)}>
   {option.label}
  </button>)}
 </div>;
}
