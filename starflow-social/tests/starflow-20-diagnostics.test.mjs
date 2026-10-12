import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('app/diagnostics/page.tsx');
const css=read('app/diagnostics/diagnostics.module.css');
const health=read('app/api/health/route.ts');
const social=read('components/SocialApp.tsx');
const menu=read('components/StarflowHomeMenu.tsx');
const baseStyles=read('app/starflow-clean-nav.css');

test('self-test is reachable in settings without bringing back retired workspaces',()=>{
 assert.match(social,/href="\/diagnostics"/);
 assert.match(social,/设备与服务自检/);
 assert.match(baseStyles,/sf-diagnostics-entry/);
 assert.doesNotMatch(menu,/to:'\/ai-studio'|to:'\/starflow-video-editor\.html'/);
 assert.doesNotMatch(menu,/to:'\/diagnostics'/); // preserve clean primary menu
});

test('on-device diagnostic examines communications, notifications, recording and storage without requesting permissions',()=>{
 for(const symbol of ['RTCPeerConnection','mediaDevices?.getUserMedia',
   'WebSocket','MediaRecorder','HTMLCanvasElement.prototype.captureStream',
   'Notification.permission','PushManager','navigator.share','indexedDB',
   'sessionStorage.setItem','sessionStorage.removeItem']){
  assert.ok(ui.includes(symbol),'missing capability '+symbol);
 }
 assert.doesNotMatch(ui,/getUserMedia\s*\(|requestPermission\s*\(|getCurrentPosition\s*\(|getDisplayMedia\s*\(/);
 assert.doesNotMatch(ui,/navigator\.geolocation|fetch\('https?:\/\/|new WebSocket\(/);
 assert.match(ui,/不主动上传设备报告/);
 assert.match(ui,/接口可用不代表相关业务功能已经完成实际验收/);
});

test('health probe uses existing same-origin no-cache endpoint and handles timeouts',()=>{
 assert.match(health,/export async function GET/);
 assert.match(health,/name: 'Starflow'/);
 assert.match(health,/status: configured \? 'configured' : 'setup_required'/);
 assert.match(ui,/fetch\('\/api\/health'/);
 assert.match(ui,/credentials:'same-origin'/);
 assert.match(ui,/cache:'no-store'/);
 assert.match(ui,/new AbortController\(\)/);
 assert.match(ui,/setTimeout\(\(\)=>c\.abort\(\),8000\)/);
 assert.match(ui,/服务器已响应/);
 assert.doesNotMatch(ui,/FAL_KEY|service_role|SUPABASE_ANON_KEY/);
});

test('reports are locally inspectable and copyable with graceful clipboard fallback',()=>{
 assert.match(ui,/navigator\.clipboard\.writeText\(report\)/);
 assert.match(ui,/完整检测报告/);
 assert.match(ui,/长按下方报告文本复制/);
 assert.match(ui,/role="status"/);
 assert.match(ui,/aria-label="自检结果"/);
});

test('mobile and dark-mode layout supports reduced motion and keyboard focus',()=>{
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css, /:global\(html\[data-sf2-theme="dark"\]\)/);
 assert.match(css, /:focus-visible/);
 assert.match(ui, /disabled=\{checking\}/);
});
