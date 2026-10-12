// Whitelisted inference adapters: do not accept client-provided provider endpoint/model.
export type CreativeMode='image'|'text_video'|'image_video'|'motion'|'edit_video';
export type CreativeAspect='9:16'|'16:9'|'1:1';
export const creativeModes:Record<CreativeMode,{label:string;model:string;kind:'image'|'video';image:boolean;video:boolean;hint:string}>={
 image:{label:'AI 图片生成',model:'fal-ai/flux-2',kind:'image',image:false,video:false,hint:'一句话生成高质量图片、封面、人物写真'},
 text_video:{label:'文字生成视频',model:'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',kind:'video',image:false,video:false,hint:'一句话生成有镜头语言的短视频'},
 image_video:{label:'图片生成视频',model:'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',kind:'video',image:true,video:false,hint:'上传图片，描述动作和镜头，生成短视频'},
 motion:{label:'参考视频动作复刻',model:'fal-ai/kling-video/v2.6/standard/motion-control',kind:'video',image:true,video:true,hint:'上传人物图片与动作参考视频，迁移动作'},
 edit_video:{label:'AI 视频剪辑与重塑',model:'fal-ai/wan/v2.7/edit-video',kind:'video',image:false,video:true,hint:'上传原视频，用文字指导 AI 修改画面与风格'}
};
export const creativeStyles={
 cinematic:'Cinematic professional grade, believable physical motion, natural skin texture, controlled camera movement, coherent lighting, consistent faces and limbs, precise scene continuity.',
 portrait:'Photorealistic editorial photography, true-to-life skin, premium studio lighting, refined composition, natural colors.',
 anime:'High-end animated feature film aesthetic, expressive composition, carefully detailed backgrounds, consistent characters.',
 product:'Luxury commercial photography, clean reflections, premium art direction, striking studio composition.'
} as const;
export type CreativeStyle=keyof typeof creativeStyles;
export const creativeModeKeys=Object.keys(creativeModes) as CreativeMode[];
export function isCreativeMode(v:unknown):v is CreativeMode{
 return typeof v==='string'&&Object.prototype.hasOwnProperty.call(creativeModes,v);
}
export function isCreativeStyle(v:unknown):v is CreativeStyle{
 return typeof v==='string'&&Object.prototype.hasOwnProperty.call(creativeStyles,v);
}
export function creativeInput(mode:CreativeMode,prompt:string,style:CreativeStyle,aspect:CreativeAspect,
 duration:5|10,imageUrl?:string,videoUrl?:string):Record<string,unknown>{
 const instruction=prompt.trim()+'. '+creativeStyles[style];
 switch(mode){
  case 'image':return {prompt:instruction,image_size:aspect==='9:16'?'portrait_16_9':aspect==='16:9'?'landscape_16_9':'square_hd'};
  case 'text_video':return {prompt:instruction,aspect_ratio:aspect,duration:String(duration)};
  case 'image_video':return {prompt:instruction,image_url:imageUrl,duration:String(duration)};
  case 'motion':return {prompt:instruction,image_url:imageUrl,video_url:videoUrl,
    character_orientation:'video',keep_original_sound:true};
  case 'edit_video':return {prompt:instruction,video_url:videoUrl,
    ...(imageUrl?{reference_image_url:imageUrl}:{}),resolution:'720p',aspect_ratio:aspect};
 }
}
export function isAllowedFalResult(url:unknown):url is string{
 if(typeof url!=='string'||url.length>2048)return false;
 try{const u=new URL(url);return u.protocol==='https:'&&(
  u.hostname==='fal.media'||u.hostname.endsWith('.fal.media')||
  u.hostname==='fal.ai'||u.hostname.endsWith('.fal.ai')||
  u.hostname==='storage.googleapis.com'
 );}catch{return false}
}
export function extractCreativeOutput(result:unknown,kind:'image'|'video'):string|null{
 if(!result||typeof result!=='object')return null;
 const r=result as {images?:Array<{url?:unknown}>;image?:{url?:unknown};video?:{url?:unknown}};
 const url=kind==='image'?(r.images?.[0]?.url??r.image?.url):r.video?.url;
 return isAllowedFalResult(url)?url:null;
}
