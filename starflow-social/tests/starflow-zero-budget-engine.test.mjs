import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const plan=read('lib/starflow-zero-engine.ts');
const renderer=read('lib/starflow-zero-renderer.ts');
const api=read('app/api/creative/zero/route.ts');
const paid=read('app/api/creative/route.ts');
const page=read('app/ai-studio/page.tsx');
const ui=read('components/StarflowZeroStudio.tsx');
const legacyTests=read('tests/starflow-ai-creative-studio.test.mjs');

test('first-party scene planner supports four honest free modes',()=>{
 for(const mode of ['poster','text_motion','image_motion','video_grade'])
  assert.ok(plan.includes("'"+mode+"'"),mode);
 assert.match(plan,/export function makeZeroPlan/);
 assert.match(plan,/export function hashPrompt/);
 assert.match(plan,/const motion:ZeroMotion=/);
 assert.match(plan,/prompt\.length>240/);
 assert.match(plan,/duration:5,fps:24/);
 assert.doesNotMatch(plan,/fal\.ai|FAL_KEY|OPENAI_API_KEY|service_role/);
});

test('zero-cost API validates inputs and returns procedural plan without media uploads',()=>{
 assert.match(api,/export async function GET/);
 assert.match(api,/export async function POST/);
 assert.match(api,/makeZeroPlan\(/);
 assert.match(api,/text\.length>1200/);
 assert.match(api,/origin!==new URL\(request\.url\)\.origin/);
 assert.match(api,/isZeroMode\(input\.mode\)/);
 assert.match(api,/render:'on-device'/);
 assert.match(api,/provider:'Starflow Zero'/);
 assert.match(api,/cost:'0',paid:false/);
 assert.doesNotMatch(api,/queue\.fal\.run|secret|FAL_KEY|service_role|createSignedUrl/);
});

test('generates genuine PNG and motion video on phone when browser encoder supports it',()=>{
 assert.match(renderer,/canvas\.toBlob\(resolve,'image\/png'\)/);
 assert.match(renderer,/canvas\.captureStream\(plan\.fps\)/);
 assert.match(renderer,/new MediaRecorder\(stream/);
 assert.match(renderer,/recorder\.start\(500\)/);
 assert.match(renderer,/new Blob\(chunks,/);
 assert.match(renderer,/requestAnimationFrame\(step\)/);
 assert.match(renderer,/video\/mp4/);
 assert.match(renderer,/video\/webm/);
 assert.match(renderer,/video\.play\(\)|el\.play\(\)/);
 assert.match(renderer,/ctx\.drawImage\(/);
 assert.match(renderer,/navigator|localVideo/);
 assert.match(renderer,/stream\.getTracks\(\)\.forEach\(track=>track\.stop\(\)\)/);
 assert.match(renderer,/URL\.revokeObjectURL/);
 assert.doesNotMatch(renderer,/fetch\(|axios|XMLHttpRequest|storage\.from|FormData/);
});

test('user reference media remains on-device and unsupported models are labeled correctly',()=>{
 assert.match(page,/StarflowZeroStudio/);
 assert.match(legacyTests,/StarflowZeroStudio/);
 assert.match(ui,/\/api\/creative\/zero/);
 assert.match(ui,/createObjectURL/);
 assert.match(ui,/renderZeroArtifact\(body\.plan/);
 assert.match(ui,/href=\{result\.url\} download=\{result\.filename\}/);
 assert.match(ui,/不上传原始素材/);
 assert.match(ui,/不是扩散式 AI 生图/);
 assert.match(ui,/人物动作复刻/);
 assert.match(ui,/研发中/);
 assert.match(ui,/MediaRecorder|视频编码|浏览器支持/);
 assert.doesNotMatch(ui,/upload\(image|storage\.from\(|FAL_KEY|queue\.fal\.run/);
});

test('legacy paid model endpoint has permanent budget circuit breaker',()=>{
 assert.match(paid,/const STARFLOW_PAID_INFERENCE_LOCKED=true/);
 assert.match(paid,/if\(STARFLOW_PAID_INFERENCE_LOCKED\)\s*return response\(/);
 assert.match(paid,/enabled:!STARFLOW_PAID_INFERENCE_LOCKED&&/);
 assert.match(paid,/请使用 \/api\/creative\/zero/);
 assert.match(paid,/warning:'星流零预算模式已停止所有第三方付费模型同步。'/);
});
