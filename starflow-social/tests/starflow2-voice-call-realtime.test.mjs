import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const call=read('components/StarflowVoiceCall.tsx');
const sql=read('supabase/migrations/20261012_dm_voice_calls_location.sql');

test('caller and callee Realtime events are filtered and protected by RLS',()=>{
 assert.match(call,/table:'sf_dm_calls',[\s\S]*?filter:'callee_id=eq\.'\+userId/);
 assert.match(call,/table:'sf_dm_calls',[\s\S]*?filter:'id=eq\.'\+callId/);
 assert.match(call,/table:'sf_dm_call_signals',[\s\S]*?filter:'call_id=eq\.'\+callId/);
 assert.match(call,/client\.removeChannel\(incoming\)/);
 assert.match(call,/client\.removeChannel\(active\)/);
 assert.match(sql,/ALTER TABLE public\.sf_dm_calls ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/ALTER TABLE public\.sf_dm_call_signals ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/CREATE POLICY sf_dm_calls_participant_read/);
 assert.match(sql,/CREATE POLICY sf_dm_call_signals_participant_read/);
});

test('connection polls are single-flight and rate-reduced; transient errors do not hang up',()=>{
 assert.match(call,/if\(!valid\|\|polling\|\|document\.visibilityState==='hidden'\)return/);
 assert.match(call,/polling=true/);
 assert.match(call,/finally\{polling=false;\}/);
 assert.match(call,/window\.setInterval\(\(\)=>\{void poll\(\)\},6000\)/);
 assert.match(call,/if\(result\.error\)\{\s*setStatus\('通话状态暂时无法更新/);
 assert.match(call,/if\(!result\.data\|\|\['ended','declined'\]\.includes\(result\.data\.status\)/);
 assert.match(call,/document\.addEventListener\('visibilitychange',resume\)/);
 assert.match(call,/window\.addEventListener\('online',resume\)/);
});

test('SDP synchronization is guarded against overlapping runs and retries failed messages',()=>{
 assert.match(call,/if\(!current\|\|!setupRef\.current\|\|startedRef\.current\)return/);
 assert.match(call,/startedRef\.current=true/);
 assert.match(call,/await consume\(current\.id\)/);
 assert.match(call,/finally\{startedRef\.current=false;\}/);
 assert.match(call,/signalSeen\.current\.delete\(s\.id\)/);
 assert.match(call,/pc\.setRemoteDescription\(description\)/);
 assert.match(call,/pc\.addIceCandidate\(candidate\)/);
});

test('TURN request has timeout and cleanup does not leak microphone after closing a route',()=>{
 assert.match(call,/window\.setTimeout\(\(\)=>controller\.abort\(\),8000\)/);
 assert.match(call,/signal:controller\.signal/);
 assert.match(call,/window\.clearTimeout\(timeout\)/);
 assert.match(call,/pcRef\.current\?\.close\(\)/);
 assert.match(call,/streamRef\.current\?\.getTracks\(\)\.forEach\(t=>t\.stop\(\)\)/);
 assert.match(call,/if\(activeCall\)void Promise\.resolve\(db\(\)\.rpc\('sf_dm_call_action'/);
 assert.match(call,/p_call:item\.id,p_action:'end'/);
 assert.match(call,/aria-label="手动同步通话状态"/);
 assert.doesNotMatch(call,/service_role|NEXT_PUBLIC_STARFLOW_TURN_SHARED_SECRET/);
});
