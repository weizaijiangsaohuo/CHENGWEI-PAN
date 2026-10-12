import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('lib/starflow-zero-gif.ts');
const renderer=read('lib/starflow-zero-renderer.ts');
const ui=read('components/StarflowZeroStudio.tsx');
const css=read('components/StarflowCreativeStudio.css');
const paid=read('app/api/creative/route.ts');
const js=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020
}}).outputText;
const m={exports:{}};
vm.runInNewContext(js,{module:m,exports:m.exports,Blob,Uint8Array,Uint8ClampedArray,
 Math,Number,Error,Array,Object,String},{filename:'starflow-zero-gif.ts'});
const {ZeroGifWriter,literalGifLzw,zeroGifDimensions,ZERO_GIF_MAX_PIXELS}=m.exports;
const ascii=(b,start,count)=>String.fromCharCode(...b.subarray(start,start+count));
const short=(b,pos)=>b[pos]|(b[pos+1]<<8);
function decodeLiteralLzw(bytes){
 const codes=[];let bit=0;
 while(bit+9<=bytes.length*8){
  const pos=bit>>3;
  const word=(bytes[pos]||0)|((bytes[pos+1]||0)<<8)|((bytes[pos+2]||0)<<16);
  codes.push((word>>>(bit&7))&511);bit+=9;
  if(codes.at(-1)===257)break;
 }
 // Independently decode the table the same way as a standards-compliant
 // GIF decoder. The encoder resets well below the 10-bit threshold.
 let next=258,previous=null,output=[],clearCount=0,ended=false;
 const dictionary=()=>Array.from({length:258},(_,i)=>i<256?[i]:null);
 let dict=dictionary();
 for(const c of codes){
  if(c===256){clearCount++;dict=dictionary();next=258;previous=null;continue;}
  if(c===257){ended=true;break;}
  let value=dict[c];
  if(!value&&c===next&&previous)value=[...previous,previous[0]];
  assert.ok(value,'illegal GIF LZW code '+c);
  output.push(...value);
  if(previous){
   dict[next++]=[...previous,value[0]];
   assert.ok(next<512,'encoder failed to reset 9-bit dictionary');
  }
  previous=value;
 }
 assert.ok(ended,'GIF image must finish with END code');
 assert.ok(clearCount>=1);
 return output;
}
function parseGif(blobBytes){
 assert.equal(ascii(blobBytes,0,6),'GIF89a');
 const width=short(blobBytes,6),height=short(blobBytes,8);
 assert.equal(blobBytes[10],0xf7);
 const frames=[];
 let at=13+768;
 assert.equal(blobBytes[at],0x21);assert.equal(blobBytes[at+1],0xff);
 assert.equal(ascii(blobBytes,at+3,11),'NETSCAPE2.0');
 at+=19;
 while(blobBytes[at]!==0x3b){
  assert.equal(blobBytes[at++],0x21);
  assert.equal(blobBytes[at++],0xf9);
  assert.equal(blobBytes[at++],4);
  assert.equal(blobBytes[at++],8);
  assert.equal(short(blobBytes,at),10);at+=2; // 100ms/frame
  at+=2; // transparent index and terminator
  assert.equal(blobBytes[at++],0x2c);
  assert.equal(short(blobBytes,at),0);at+=2;
  assert.equal(short(blobBytes,at),0);at+=2;
  assert.equal(short(blobBytes,at),width);at+=2;
  assert.equal(short(blobBytes,at),height);at+=2;
  assert.equal(blobBytes[at++],0); // global color table
  assert.equal(blobBytes[at++],8); // 8-bit GIF LZW
  const packed=[];
  while(true){
   const n=blobBytes[at++];if(!n)break;
   packed.push(...blobBytes.subarray(at,at+n));at+=n;
  }
  frames.push(decodeLiteralLzw(Uint8Array.from(packed)));
  assert.equal(frames.at(-1).length,width*height);
 }
 assert.equal(at,blobBytes.length-1);
 return {width,height,frames};
}
test('GIF89a writer emits genuinely decodable two-frame animation',async()=>{
 const writer=new ZeroGifWriter(2,2);
 const a=new Uint8ClampedArray([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]);
 const b=new Uint8ClampedArray([0,0,0,255,255,255,255,255,255,0,0,255,0,0,255,255]);
 writer.addFrame({data:a,width:2,height:2});
 writer.addFrame({data:b,width:2,height:2});
 const blob=writer.toBlob();
 assert.equal(blob.type,'image/gif');
 const gif=parseGif(new Uint8Array(await blob.arrayBuffer()));
 assert.equal(gif.width,2);assert.equal(gif.height,2);
 assert.equal(gif.frames.length,2);
 assert.deepEqual(gif.frames[0],[224,28,3,255]);
 assert.deepEqual(gif.frames[1],[0,255,224,3]);
});
test('literal LZW stays inside GIF 9-bit dictionary for 192-symbol resets',()=>{
 const indices=Uint8Array.from({length:1025},(_,i)=>i%256);
 const packed=literalGifLzw(indices);
 assert.deepEqual(decodeLiteralLzw(packed),Array.from(indices));
 assert.throws(()=>literalGifLzw(new Uint8Array()),/动画帧没有像素/);
});
test('encoder refuses oversized and malformed frames, supports mobile dimensions',()=>{
 for(const [w,h] of [[540,960],[960,540],[720,720]]){
  const dim=zeroGifDimensions(w,h);
  assert.ok(dim.width*dim.height<=ZERO_GIF_MAX_PIXELS);
  assert.ok(dim.width<=w&&dim.height<=h);
 }
 assert.throws(()=>new ZeroGifWriter(9000,9000),/范围/);
 const writer=new ZeroGifWriter(2,2);
 assert.throws(()=>writer.toBlob(),/尚无/);
 assert.throws(()=>writer.addFrame({data:new Uint8ClampedArray(5),width:2,height:2}),/不匹配/);
});
test('Safari unsupported MediaRecorder and codecs fall back to local GIF',()=>{
 assert.match(renderer,/import \{ZeroGifWriter,ZERO_GIF_FPS,zeroGifDimensions\}/);
 assert.match(renderer,/if\(assets\.format==='gif'\)return exportGif\(\)/);
 assert.match(renderer,/if\(typeof canvas\.captureStream!=='function'\|\|typeof MediaRecorder==='undefined'\)\s*return exportGif\(\)/);
 assert.match(renderer,/if\(!mime\)return exportGif\(\)/);
 assert.match(renderer,/catch\{stream\.getTracks\(\)\.forEach\(track=>track\.stop\(\)\);return exportGif\(\)/);
 assert.match(renderer,/writer\.addFrame\(pixels\)/);
 assert.match(renderer,/assertNotAborted\(assets\.signal\)/);
 assert.match(renderer,/signal\?:AbortSignal/);
 assert.doesNotMatch(renderer,/fetch\(|axios|storage\.from\(|FAL_KEY/);
});
test('user can select GIF, native iPhone share files, and leave paid API disabled',()=>{
 assert.match(ui,/id="sf-zero-export-format"/);
 assert.match(ui,/setExportFormat/);
 assert.match(ui,/navigator\.canShare/);
 assert.match(ui,/navigator\.share\(\{title:'Starflow Zero 本地创作',files:\[file\]\}\)/);
 assert.match(ui,/href=\{result\.url\} download=\{result\.filename\}/);
 assert.match(ui,/result\.mime\.startsWith\('image\/'\)/);
 assert.match(ui,/iPhone|文件 App/);
 assert.match(css,/\.sf-zero-result-actions/);
 assert.match(paid,/STARFLOW_PAID_INFERENCE_LOCKED=true/);
});
