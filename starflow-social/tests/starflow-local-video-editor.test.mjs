import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/starflow-video-editor.html',import.meta.url),'utf8');
const studio=readFileSync(new URL('../components/StarflowCreativeStudio.tsx',import.meta.url),'utf8');

test('free editor is discoverable inside Starflow AI studio',()=>{
 assert.match(studio,/href="\/starflow-video-editor\.html"/);
 assert.match(html,/STARFLOW · LOCAL VIDEO/);
});

test('local processing and export are actually wired, no paid provider calls',()=>{
 for(const required of [
  'type="file"','id="sourceVideo"','id="caption"','id="filter"',
  'id="trimStart"','id="trimEnd"','id="resolution"','id="fps"',
  'id="play"','id="export"','id="snapshot"','id="cancel"',
  'URL.createObjectURL','URL.revokeObjectURL','drawImage',
  'preview.captureStream','new MediaRecorder','ondataavailable',
  'files','captureStream'
 ]) assert.ok(html.includes(required),required);
 assert.doesNotMatch(html,/FAL_KEY|queue\.fal\.run|https:\/\/api\.|fetch\(/);
});

test('no inflated 4K/120fps and image-to-video claims',()=>{
 assert.match(html,/不是文生视频大模型/);
 assert.match(html,/4K.*实验性/);
 assert.match(html,/120 FPS.*实验性/);
 assert.match(html,/实际编码帧率保证/);
 assert.match(html,/导出不包含原视频声音/);
});

test('basic video safety guardrails exist',()=>{
 assert.match(html,/file\.size>150\*1024\*1024/);
 assert.match(html,/end-start>60/);
 assert.match(html,/if\(!mime\)/);
 assert.match(html,/finished=true/);
 assert.match(html,/video\.pause\(\)/);
 assert.match(html,/pagehide/);
});
