/** Starflow Zero v0.1: a deterministic, self-owned storyboard/scene engine.
 * No inference, training, paid API, image or prompt is sent to an external provider.
 * This produces procedural compositions and motion plans, NOT diffusion output.
 */
export const ZERO_ENGINE_VERSION='starflow-zero-0.1';
export const zeroModes=['poster','text_motion','image_motion','video_grade'] as const;
export type ZeroMode=typeof zeroModes[number];
export type ZeroAspect='9:16'|'16:9'|'1:1';
export type ZeroStyle='cinematic'|'neon'|'warm'|'mono';
export type ZeroMotion='zoom_in'|'zoom_out'|'pan_left'|'pan_right'|'float';
export type ZeroPlan={
 version:string;mode:ZeroMode;style:ZeroStyle;aspect:ZeroAspect;
 prompt:string;seed:number;width:number;height:number;
 duration:5;fps:24;motion:ZeroMotion;
 palette:[string,string,string,string];title:string;subtitle:string;
};
const palettes:Record<ZeroStyle,[string,string,string,string]>={
 cinematic:['#0c1026','#293765','#8166a7','#f6bb9b'],
 neon:['#080e27','#27214a','#ef58c8','#6ae2ff'],
 warm:['#27203d','#854964','#ffba79','#ffe9c2'],
 mono:['#131621','#303642','#929eac','#f4f5f7']
};
export function isZeroMode(x:unknown):x is ZeroMode{
 return typeof x==='string'&&zeroModes.includes(x as ZeroMode);
}
export function hashPrompt(text:string):number{
 let h=2166136261;
 for(let i=0;i<text.length;i++){h=Math.imul(h^text.charCodeAt(i),16777619);}
 return h>>>0;
}
export function makeZeroPlan(input:{
 mode:ZeroMode;prompt:string;style?:ZeroStyle;aspect?:ZeroAspect;
}):ZeroPlan{
 if(!isZeroMode(input.mode))throw Error('不支持的零预算创作模式');
 const prompt=input.prompt.trim().replace(/\s+/g,' ');
 if(!prompt||prompt.length>240||/[\u0000-\u001f]/.test(prompt))
  throw Error('请输入 1 至 240 字的创作描述');
 const style:ZeroStyle=['cinematic','neon','warm','mono'].includes(input.style||'')?
  input.style!:'cinematic';
 const aspect:ZeroAspect=['9:16','16:9','1:1'].includes(input.aspect||'')?
  input.aspect!:'9:16';
 const [width,height]:[number,number]=aspect==='16:9'?[960,540]:
  aspect==='1:1'?[720,720]:[540,960];
 const motion:ZeroMotion=/拉远|缩小|后退|zoom out/i.test(prompt)?'zoom_out':
  /左移|向左|left/i.test(prompt)?'pan_left':
  /右移|向右|right/i.test(prompt)?'pan_right':
  /缓慢|漂浮|呼吸|轻轻|float/i.test(prompt)?'float':'zoom_in';
 const title=prompt.length>24?prompt.slice(0,24)+'…':prompt;
 return {version:ZERO_ENGINE_VERSION,mode:input.mode,style,aspect,prompt,
  seed:hashPrompt(prompt+'|'+style+'|'+aspect),width,height,duration:5,fps:24,
  motion,palette:[...palettes[style]],title,
  subtitle:input.mode==='poster'?'STARFLOW / CONCEPT POSTER':
   input.mode==='video_grade'?'STARFLOW / LOCAL VIDEO COLOR':
   input.mode==='image_motion'?'STARFLOW / PHOTO MOTION':'STARFLOW / MOTION GRAPHICS'};
}
