import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('public/starflow-video-editor.html');
const studio=read('components/StarflowCreativeStudio.tsx');
const nav=read('components/StarflowHomeMenu.tsx');
const script=html.match(/<script>([\s\S]+?)<\/script>/)?.[1];
assert.ok(script,'expected inline local editor script');

test('zero-budget local editor is reachable from Starflow navigation and AI Studio',()=>{
 assert.match(studio,/href="\/starflow-video-editor\.html"/);
 assert.match(nav,/to:'\/starflow-video-editor\.html'/);
 assert.match(html,/STARFLOW · LOCAL VIDEO/);
 assert.match(html,/@media\(max-width:800px\)/);
});

test('local editor JavaScript parses and does not silently call remote APIs',()=>{
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|FAL_KEY|service_role/);
 assert.match(script,/URL\.createObjectURL/);
 assert.match(script,/URL\.revokeObjectURL/);
 assert.match(html,/不会通过本工具上传到服务器/);
});

test('editing and download controls are real browser operations, not demo placeholders',()=>{
 for(const id of ['source','preview','sourceVideo','aspect','filter','motion','speed','caption',
 'trimStart','trimEnd','resolution','fps','snapshot','export','cancel','downloadLink']){
  assert.match(html,new RegExp('id="'+id+'"'),'missing control '+id);
 }
 assert.match(script,/captureStream\(Number\(fps\.value\)\)/);
 assert.match(script,/new MediaRecorder\(stream/);
 assert.match(script,/MediaRecorder\.isTypeSupported/);
 assert.match(script,/drawImage\(media/);
 assert.match(script,/video\.playbackRate/);
 assert.match(script,/preview\.toDataURL\('image\/png'\)/);
 assert.match(script,/link\.download='starflow-local-'/);
 assert.match(html,/不包含原视频声音/);
 assert.match(html,/不代表 AI 原生生成或实际编码帧率保证/);
});

test('resolution controls correctly calculate portrait, landscape and 4K targets',()=>{
 const sizes=script.match(/function getBounds\(\)\{[\s\S]*?\}\nfunction previewSize/);
 assert.ok(sizes);
 const out=script.match(/function outputSize\(\)\{[\s\S]*?\}\nfunction filterValue/);
 assert.ok(out);
 const a=sizes[0].replace(/\nfunction previewSize[\s\S]*/,'');
 const b=out[0].replace(/\nfunction filterValue[\s\S]*/,'');
 for(const [aspectValue,resolutionValue,expected] of [
  ['16:9','2160',[3840,2160]],['9:16','2160',[2160,3840]],
  ['1:1','1080',[1080,1080]],['9:16','720',[720,1280]]
 ]){
  const ctx={aspect:{value:aspectValue},resolution:{value:resolutionValue}};
  vm.runInNewContext(a+';'+b+';globalThis.output=outputSize()',ctx);
  assert.deepEqual(Array.from(ctx.output),expected);
 }
});

test('record cancellation never publishes a partially recorded file',()=>{
 assert.match(script,/let chunks=\[\],finished=false,wasCancelled=false;/);
 assert.match(script,/wasCancelled=cancelled/);
 assert.match(script,/if\(!wasCancelled&&e\.data&&e\.data\.size\)/);
 assert.match(script,/if\(wasCancelled\)\{message\('导出已取消/);
 assert.match(script,/if\(finished\)return;\s*recording\.start\(250\)/);
 assert.match(script,/await seekVideo\(start\)/);
});
