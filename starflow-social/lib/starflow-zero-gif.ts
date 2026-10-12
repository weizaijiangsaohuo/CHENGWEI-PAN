/** Starflow Zero fallback GIF89a writer.
 * Local-only, no dependency, no WebGPU, no paid API.
 * Uses RGB332 global palette and a conservatively reset 9-bit GIF LZW stream.
 * Size/quality are deliberately capped for mobile memory and CPU safety.
 */
export const ZERO_GIF_FPS=10;
export const ZERO_GIF_MAX_PIXELS=220000;
export type GifFrame={data:Uint8ClampedArray;width:number;height:number};
const MAX_FRAME_COUNT=50;
function byteArray(...bytes:number[]):Uint8Array{return Uint8Array.from(bytes)}
function word(value:number):number[]{return [value&255,(value>>>8)&255]}
function palette332():Uint8Array{
 const palette=new Uint8Array(256*3);
 for(let index=0;index<256;index++){
  palette[index*3]=Math.round(((index>>>5)&7)*255/7);
  palette[index*3+1]=Math.round(((index>>>2)&7)*255/7);
  palette[index*3+2]=Math.round((index&3)*255/3);
 }
 return palette;
}
function color332(r:number,g:number,b:number):number{
 return (r&0xe0)|((g&0xe0)>>>3)|(b>>>6);
}
/** Encode pixel indices without relying on native GIF support.
 * Reset after 192 literal symbols so the GIF dictionary never needs 10 bits.
 * This trades compression for deterministic cross-browser decoding.
 */
export function literalGifLzw(indices:Uint8Array):Uint8Array{
 if(!indices.length)throw Error('动画帧没有像素');
 const extra=Math.ceil(indices.length/192)+2;
 const bytes=new Uint8Array(Math.ceil((indices.length+extra)*9/8)+4);
 let cursor=0,bits=0,acc=0,count=0;
 const write=(code:number)=>{
  acc|=(code&511)<<bits;bits+=9;
  while(bits>=8){bytes[cursor++]=acc&255;acc>>>=8;bits-=8;}
 };
 for(const value of indices){
  if(count===0){write(256);} // CLEAR, reset the GIF code table.
  write(value);count=(count+1)%192;
 }
 write(257); // END.
 if(bits>0)bytes[cursor++]=acc&255;
 return bytes.subarray(0,cursor);
}
export class ZeroGifWriter{
 private readonly pieces:Uint8Array[]=[];
 private readonly width:number;
 private readonly height:number;
 private frames=0;
 constructor(width:number,height:number){
  if(!Number.isInteger(width)||!Number.isInteger(height)||
     width<1||height<1||width*height>ZERO_GIF_MAX_PIXELS)
   throw Error('GIF 分辨率超出本地设备处理范围');
  this.width=width;this.height=height;
  const text=(v:string)=>[...v].map(c=>c.charCodeAt(0));
  this.pieces.push(byteArray(
   ...text('GIF89a'),...word(width),...word(height),0xf7,0,0));
  this.pieces.push(palette332());
  // Netscape loop extension: repeat indefinitely.
  this.pieces.push(byteArray(0x21,0xff,11,...text('NETSCAPE2.0'),3,1,0,0,0));
 }
 addFrame(frame:GifFrame){
  if(this.frames>=MAX_FRAME_COUNT)throw Error('GIF 最多支持50帧');
  if(frame.width!==this.width||frame.height!==this.height||
     frame.data.length!==this.width*this.height*4)
   throw Error('GIF 画面尺寸不匹配');
  const rgba=frame.data,colors=new Uint8Array(this.width*this.height);
  for(let i=0,p=0;i<colors.length;i++,p+=4){
   const alpha=rgba[p+3]/255;
   const r=Math.round(rgba[p]*alpha+255*(1-alpha));
   const g=Math.round(rgba[p+1]*alpha+255*(1-alpha));
   const b=Math.round(rgba[p+2]*alpha+255*(1-alpha));
   colors[i]=color332(r,g,b);
  }
  const compressed=literalGifLzw(colors);
  // Graphic Control: disposal=2 (restore background), 100ms per frame.
  this.pieces.push(byteArray(0x21,0xf9,4,0x08,10,0,0,0));
  // Full-screen image descriptor, no local color table; LZW min size 8.
  this.pieces.push(byteArray(0x2c,0,0,0,0,
   ...word(this.width),...word(this.height),0,8));
  for(let offset=0;offset<compressed.length;offset+=255){
   const data=compressed.subarray(offset,offset+255);
   const part=new Uint8Array(data.length+1);
   part[0]=data.length;part.set(data,1);
   this.pieces.push(part);
  }
  this.pieces.push(byteArray(0)); // image data terminator
  this.frames++;
 }
 toBlob():Blob{
  if(!this.frames)throw Error('尚无任何动画帧');
  return new Blob([...this.pieces,byteArray(0x3b)],{type:'image/gif'});
 }
 get frameCount(){return this.frames;}
}
/** Reduced dimensions keep 50 RGBA frames viable on memory-constrained iPhones. */
export function zeroGifDimensions(width:number,height:number):{width:number;height:number}{
 const scale=Math.min(1,Math.sqrt(ZERO_GIF_MAX_PIXELS/(width*height)));
 // Even dimensions are friendlier to decoder and thumbnail pipelines.
 return {width:Math.max(2,Math.floor(width*scale/2)*2),
  height:Math.max(2,Math.floor(height*scale/2)*2)};
}
