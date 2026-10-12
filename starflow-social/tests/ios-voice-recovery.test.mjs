import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const next=read('next.config.ts');
const ui=read('components/StarflowDmVoiceFeatures.tsx');
const api=read('app/api/voice/transcribe/route.ts');
test('same-origin microphone and location access is allowed',()=>{
 assert.match(next,/microphone=\(self\), geolocation=\(self\)/);
 assert.doesNotMatch(next,/microphone=\(\)|geolocation=\(\)/);
});
test('private audio downloads under participant RLS and gives playback errors',()=>{
 assert.match(ui,/storage\.from\(BUCKET\)\.download\(path\)/);
 assert.match(ui,/URL\.createObjectURL\(data\)/);
 assert.match(ui,/URL\.revokeObjectURL/);
 assert.match(ui,/onError=\{\(\)=>setError/);
 assert.match(ui,/sf-dm-save-voice/);
 assert.match(ui,/transcribeReceived/);
 assert.doesNotMatch(ui,/getPublicUrl\(/);
});
test('recorded private voices prefer portable PCM WAV',()=>{
 assert.match(ui,/new OfflineAudioContext/);
 assert.match(ui,/function fourcc/);
 assert.match(ui,/audio\/wav/);
 assert.match(ui,/payload=await portableWav\(clip\)/);
 assert.match(ui,/contentType:format\.type/);
});
test('speech to text uses explicit user consent and authenticated server-side Whisper',()=>{
 assert.match(ui,/window\.confirm\('是否录音并将本次语音发送至星流的 Cloudflare AI/);
 assert.match(ui,/startRecording\('dictation'\)/);
 assert.match(ui,/transcribeAudio\(blob\)/);
 assert.match(ui,/fetch\('\/api\/voice\/transcribe'/);
 assert.match(ui,/setDraft\(prev=>/);
 assert.match(api,/client\.auth\.getUser/);
 assert.match(api,/getCloudflareContext/);
 assert.match(api,/whisper-large-v3-turbo/);
 assert.match(api,/SUPPORT_PER_IP/);
 assert.match(api,/SUPPORT_GLOBAL/);
 assert.match(api,/request\.headers\.get\('origin'\)!==new URL\(request\.url\)\.origin/);
 assert.match(api,/MAX_BYTES=6\*1024\*1024/);
 assert.doesNotMatch(api,/service_role|\\.insert\(|\\.upsert\(/);
});
