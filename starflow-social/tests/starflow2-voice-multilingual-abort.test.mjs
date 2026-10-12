import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('components/StarflowDmVoiceFeatures.tsx');
const api=read('app/api/voice/transcribe/route.ts');
const styles=read('app/messages/messages.css');

test('Cloudflare Whisper accepts auto-detection instead of forcing all speech to Chinese',()=>{
 assert.match(api,/language\?:string/);
 assert.match(api,/requestedLanguage=\(request\.headers\.get\('x-sf-speech-language'\)\|\|'auto'\)/);
 assert.match(api,/requestedLanguage==='auto'\?undefined:requestedLanguage/);
 assert.match(api,/\.\.\.\(language\?\{language\}:\{\}\)/);
 for(const language of ["'auto'","'zh'","'en'","'ja'","'ko'","'fr'","'de'"])
  assert.ok(api.includes(language),'missing language '+language);
 assert.doesNotMatch(api,/===.en.\?.en.:.zh./);
});

test('dictation is never sent automatically and selected locale is passed to the server',()=>{
 assert.match(ui,/const \[speechLanguage,setSpeechLanguage\]=useState\('auto'\)/);
 assert.match(ui,/value=\{speechLanguage\} onChange=\{event=>setSpeechLanguage\(event\.target\.value\)\}/);
 assert.match(ui,/value="auto">自动识别（推荐）/);
 assert.match(ui,/'x-sf-speech-language':speechLanguage/);
 assert.match(ui,/setDraft\(prev=>/);
 assert.match(ui,/payload=await portableWav\(blob\)/);
 assert.match(ui,/signal:controller\.signal/);
 assert.match(ui,/没有|超时/);
 assert.doesNotMatch(ui,/setDraft\([^)]*\).*sendVoice/);
 assert.match(styles,/\.sf-dm-speech-language/);
});

test('switching conversations aborts outstanding speech and never pastes it into a different DM',()=>{
 assert.match(ui,/currentConversation=useRef\(conversationId\)/);
 assert.match(ui,/transcriptionController\.current\?\.abort\(\)/);
 assert.match(ui,/currentConversation\.current!==requestedConversation/);
 assert.match(ui,/if\(controller\.signal\.aborted\|\|currentConversation\.current!==requestedConversation\)return/);
 assert.match(ui,/window\.clearTimeout\(timeout\)/);
 assert.match(ui,/transcriptionController\.current===controller/);
 assert.match(ui,/取消|cancelRecorder/);
});

test('received audio belongs to current path and can be transcribed without a forced language',()=>{
 assert.match(ui,/currentPath=useRef\(path\)/);
 assert.match(ui,/receivedController\.current\?\.abort\(\)/);
 assert.match(ui,/playbackRequest\.current!==requestId/);
 assert.match(ui,/currentPath\.current!==requestedPath/);
 assert.match(ui,/'x-sf-speech-language':'auto'/);
 assert.match(ui,/if\(!controller\.signal\.aborted&&currentPath\.current===requestedPath\)setTranscript/);
 assert.match(ui,/let payload=blob/);
 assert.match(ui,/payload=await portableWav\(blob\)/);
 assert.doesNotMatch(ui,/getPublicUrl\(/);
});

test('existing consent, authentication, RLS and one-time location rules preserved',()=>{
 assert.match(ui,/window\.confirm\('是否录音并将本次语音发送至星流的 Cloudflare AI/);
 assert.match(ui,/window\.confirm\('是否使用 Cloudflare AI 将此条私人语音识别成文字/);
 assert.match(ui,/window\.confirm\('是否仅向当前聊天对象发送一次你的精确位置/);
 assert.match(ui,/navigator\.geolocation\.getCurrentPosition/);
 assert.match(ui,/storage\.from\(BUCKET\)\.download\(requestedPath\)/);
 assert.match(api,/client\.auth\.getUser/);
 assert.match(api,/SUPPORT_PER_IP/);
 assert.match(api,/SUPPORT_GLOBAL/);
 assert.doesNotMatch(api,/service_role|\\.upsert\\(/);
});
