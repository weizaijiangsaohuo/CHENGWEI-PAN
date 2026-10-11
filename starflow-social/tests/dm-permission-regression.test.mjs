import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../components/StarflowMessages.tsx',import.meta.url),'utf8');

test('Only an explicit database denial blocks message composition',()=>{
  assert.match(source,/sendPermission !== 'denied'/);
  assert.match(source,/data === false \? 'denied' : data === true \? 'allowed' : 'retry'/);
  assert.match(source,/permissionError \? 'retry'/);
  assert.match(source,/catch \{\s*if \(live\) setSendPermission\('retry'\)/);
  assert.doesNotMatch(source,/setCanSend\(false\)/);
});

test('Inbox refresh with the same block set must not reset permission check',()=>{
  assert.match(source,/previous\.length === next\.length && previous\.every/);
  assert.match(source,/const blocksKey = blockedPeerIds\.join\(','\)/);
  assert.match(source,/\[activeId, user\?\.id, blocksKey\]/);
});

test('Temporary authorization problems remain retryable without bypassing server-side RLS',()=>{
  assert.match(source,/window\.addEventListener\('online', resume\)/);
  assert.match(source,/document\.addEventListener\('visibilitychange', resume\)/);
  assert.match(source,/setInterval\(\(\) => \{ if \(document\.visibilityState === 'visible'\) void verify\(\); \}, 15000\)/);
  assert.match(source,/\.from\('dm_messages'\)\.insert/);
  assert.match(source,/if \(!user \|\| !activeId \|\| !canSend \|\| sendingRef\.current\) return/);
  assert.match(source,/!canSend && !loadingThread && <p className="sf-dm-send-restricted"/);
});
