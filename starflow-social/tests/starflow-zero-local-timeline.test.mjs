import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('lib/starflow-zero-timeline.ts');
const renderer=read('lib/starflow-zero-renderer.ts');
const ui=read('components/StarflowZeroStudio.tsx');
const css=read('components/StarflowCreativeStudio.css');
const api=read('app/api/creative/zero/route.ts');
// Execute the real TypeScript helper with the same transpiler as Next, instead of
// merely asserting textual patterns. No browser or paid service needed.
const compiled=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const moduleStub={exports:{}};
vm.runInNewContext(compiled,{module:moduleStub,exports:moduleStub.exports,
 require:createRequire(import.meta.url)},{filename:'starflow-zero-timeline.ts'});
const timeline=moduleStub.exports;

test('timeline safely clamps image count, subtitles and invalid trim parameters',()=>{
 const config=timeline.normalizeZeroTimeline({
  imageCount:999,transition:'unknown',trimStart:-10,subtitle:'A'.repeat(100),
  subtitleFrom:-7,subtitleTo:93,showTitle:false
 });
 assert.equal(config.imageCount,3);
 assert.equal(config.transition,'crossfade');
 assert.equal(config.trimStart,0);
 assert.equal(config.subtitle.length,80);
 assert.equal(config.subtitleFrom,0);
 assert.equal(config.subtitleTo,5);
 assert.equal(config.showTitle,false);
 const normal=timeline.normalizeZeroTimeline({
  imageCount:2,transition:'cut',trimStart:12.5,subtitle:'hello',subtitleFrom:3,subtitleTo:2
 });
 assert.equal(normal.imageCount,2);
 assert.equal(normal.transition,'cut');
 assert.equal(normal.trimStart,12.5);
 assert.equal(normal.subtitleTo,3);
 assert.equal(timeline.normalizeZeroTimeline({trimStart:Infinity}).trimStart,0);
});

test('three-shot order and crossfades are mathematically deterministic',()=>{
 const a=timeline.zeroShotAt(.15,3,'crossfade');
 assert.equal(a.from,0);assert.equal(a.to,0);assert.equal(a.mix,0);
 const fade=timeline.zeroShotAt(.3,3,'crossfade');
 assert.equal(fade.from,0);assert.equal(fade.to,1);
 assert.ok(fade.mix>0&&fade.mix<1);
 const second=timeline.zeroShotAt(.4,3,'crossfade');
 assert.equal(second.from,1);assert.equal(second.to,1);
 const third=timeline.zeroShotAt(.8,3,'crossfade');
 assert.equal(third.from,2);assert.equal(third.to,2);
 const last=timeline.zeroShotAt(1,3,'crossfade');
 assert.equal(last.from,2);assert.equal(last.to,2);
 const cut=timeline.zeroShotAt(.3,3,'cut');
 assert.equal(cut.from,0);assert.equal(cut.to,0);assert.equal(cut.mix,0);
 assert.equal(timeline.zeroShotAt(-10,2,'crossfade').from,0);
 assert.equal(timeline.zeroShotAt(20,2,'crossfade').from,1);
});

test('timecoded subtitles appear only within selected 5-second region',()=>{
 const conf=timeline.normalizeZeroTimeline({
  subtitle:'本机字幕',subtitleFrom:1,subtitleTo:3
 });
 assert.equal(timeline.zeroSubtitleVisible(conf,0),false);
 assert.equal(timeline.zeroSubtitleVisible(conf,.2),true);
 assert.equal(timeline.zeroSubtitleVisible(conf,.5),true);
 assert.equal(timeline.zeroSubtitleVisible(conf,.8),false);
 assert.equal(timeline.zeroSubtitleVisible({...conf,subtitle:''},.4),false);
});

test('renderer uses real frame sources, trim seek and non-destructive crossfades',()=>{
 assert.match(renderer,/assets\.images\?\.length/);
 assert.match(renderer,/for\(const file of source\)slides\.push\(await loadImage\(file,assets\.signal\)\)/);
 assert.match(renderer,/zeroShotAt\(t,slides\.length,timeline\?\.transition/);
 assert.match(renderer,/ctx\.globalAlpha=shot\.mix/);
 assert.match(renderer,/zeroSubtitleVisible\(timeline,t\)/);
 assert.match(renderer,/ctx\.strokeText\(captionLines\[i\]/);
 assert.match(renderer,/await localVideo\(assets\.video,assets\.signal,timeline\.trimStart\)/);
 assert.match(renderer,/el\.currentTime=bounded/);
 assert.match(renderer,/el\.addEventListener\('seeked'/);
 assert.match(renderer,/el\.loop=el\.duration<5/);
 assert.match(renderer,/recorder\.start\(500\)/);
 assert.doesNotMatch(renderer,/fetch\(|FormData|navigator\.sendBeacon|storage\.from\(/);
});

test('UI exposes editable per-source timeline without cloud media upload',()=>{
 assert.match(ui,/multiple=\{mode==='image_motion'\}/);
 assert.match(ui,/Array\.from\(files\|\|\[\]\)\.slice\(0,3\)/);
 assert.match(ui,/镜头顺序/);
 assert.match(ui,/setVideoDuration/);
 assert.match(ui,/id="sf-zero-trim"/);
 assert.match(ui,/字幕开始/);
 assert.match(ui,/字幕结束/);
 assert.match(ui,/柔和交叉淡化/);
 assert.match(ui,/直接切换镜头/);
 assert.match(ui,/timeline:\{imageCount:photoFiles\.length\|\|1,transition,trimStart/);
 assert.match(ui,/裁剪、转场和字幕仅作用于导出版本/);
 assert.match(css,/\.sf-zero-timeline/);
 assert.match(api,/render:'on-device'/);
 assert.doesNotMatch(ui,/storage\.from\(|FAL_KEY|queue\.fal\.run/);
});
