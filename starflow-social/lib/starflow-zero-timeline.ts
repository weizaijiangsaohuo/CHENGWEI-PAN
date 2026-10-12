/**
 * Starflow Zero local editing model. Pure functions, no external models,
 * uploads, dependencies, billing, GPU or network requests.
 */
export type ZeroTransition='crossfade'|'cut';
export type ZeroTimelineOptions={
 imageCount:number;
 transition:ZeroTransition;
 trimStart:number;
 subtitle:string;
 subtitleFrom:number;
 subtitleTo:number;
 showTitle:boolean;
};
export type ZeroShot={from:number;to:number;mix:number};
export const ZERO_OUTPUT_SECONDS=5;
export function normalizeZeroTimeline(input:Partial<ZeroTimelineOptions>):ZeroTimelineOptions{
 const count=Number.isFinite(input.imageCount)?Math.floor(Number(input.imageCount)):1;
 const imageCount=Math.max(1,Math.min(3,count));
 const transition:ZeroTransition=input.transition==='cut'?'cut':'crossfade';
 const trimStart=Number.isFinite(input.trimStart)?Math.max(0,Math.min(55,Number(input.trimStart))):0;
 const subtitle=typeof input.subtitle==='string'?
  input.subtitle.trim().replace(/[\u0000-\u001f]/g,'').slice(0,80):'';
 const from=Number.isFinite(input.subtitleFrom)?Number(input.subtitleFrom):0;
 const subtitleFrom=Math.max(0,Math.min(ZERO_OUTPUT_SECONDS,from));
 const to=Number.isFinite(input.subtitleTo)?Number(input.subtitleTo):ZERO_OUTPUT_SECONDS;
 const subtitleTo=Math.max(subtitleFrom,Math.min(ZERO_OUTPUT_SECONDS,to));
 return {imageCount,transition,trimStart,subtitle,subtitleFrom,subtitleTo,
  showTitle:input.showTitle!==false};
}
/** Which two stills to draw for a normalized output frame in [0,1]? */
export function zeroShotAt(progress:number,count:number,transition:ZeroTransition):ZeroShot{
 const n=Math.max(1,Math.min(3,Math.floor(count)||1));
 const p=Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):0;
 const position=p*n;
 const from=Math.min(n-1,Math.floor(position));
 const fraction=Math.max(0,Math.min(1,position-from));
 if(from===n-1||transition==='cut'||fraction<.76)
  return {from,to:from,mix:0};
 return {from,to:Math.min(n-1,from+1),mix:(fraction-.76)/.24};
}
export function zeroSubtitleVisible(options:ZeroTimelineOptions,progress:number){
 const current=Math.max(0,Math.min(1,progress))*ZERO_OUTPUT_SECONDS;
 return Boolean(options.subtitle)&&current>=options.subtitleFrom&&current<=options.subtitleTo;
}
