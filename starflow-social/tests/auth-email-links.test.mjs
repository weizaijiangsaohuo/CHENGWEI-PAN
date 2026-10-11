import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const callback = readFileSync(new URL('../app/auth/callback/page.tsx', import.meta.url), 'utf8');
const reset = readFileSync(new URL('../app/auth/reset/page.tsx', import.meta.url), 'utf8');

test('signup confirmation accepts the token hash independently of PKCE storage', () => {
  assert.match(callback, /params\.get\('token_hash'\)/);
  assert.match(callback, /params\.get\('type'\) !== 'email'/);
  assert.match(callback, /auth\.verifyOtp\(\{[\s\S]*?token_hash: tokenHash,[\s\S]*?type: 'email'/);
});

test('signup confirmation preserves the legacy PKCE/OAuth code path', () => {
  assert.match(callback, /else if \(code\)/);
  assert.match(callback, /auth\.exchangeCodeForSession\(code\)/);
  assert.match(callback, /detail\.includes\('PKCE code verifier'\)/);
});

test('password recovery accepts token hash with recovery-only type', () => {
  assert.match(reset, /params\.get\('token_hash'\)/);
  assert.match(reset, /params\.get\('type'\)!=='recovery'/);
  assert.match(reset, /auth\.verifyOtp\(\{token_hash:tokenHash,type:'recovery'\}\)/);
});

test('password recovery preserves old PKCE email compatibility', () => {
  assert.match(reset, /else if\(code\)/);
  assert.match(reset, /auth\.exchangeCodeForSession\(code\)/);
  assert.match(reset, /detail\.includes\('PKCE code verifier'\)/);
});
