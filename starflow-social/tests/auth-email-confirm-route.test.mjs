import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercises the actual POST handler with mocked Supabase and response cookies.
// GET is a Next.js page instead of a consuming API request.
const source = readFileSync(new URL('../app/api/auth/confirm/route.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/auth/confirm/page.tsx', import.meta.url), 'utf8');

function handlerWithMock(verification) {
  const calls = [];
  const actualCookies = [];
  const NextResponse = {
    json(body, init) {
      const headers = {};
      return {
        body,
        status: init?.status ?? 200,
        headers: { values: init?.headers ?? headers, set(name, value) { headers[name] = value; } },
        cookies: { set(name, value, options) { actualCookies.push({ name, value, options }); } },
      };
    }
  };
  const exported = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(code, {
    exports: exported,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://staging.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key' } },
    require(id) {
      if (id === 'next/server') return { NextResponse };
      if (id === '@supabase/ssr') return {
        createServerClient(_url, _key, config) {
          return { auth: { async verifyOtp(args) {
            calls.push(args);
            const result = await verification(args);
            if (result.data?.session) config.cookies.setAll([
              { name: 'sb-session', value: 'test-cookie', options: { path: '/', sameSite: 'lax' } }
            ]);
            return result;
          } } };
        }
      };
      throw new Error('Unexpected module: ' + id);
    },
  });
  const request = ({ token_hash, type, validJSON = true, contentType = 'application/json' }) => ({
    headers: { get(name) { return name === 'content-type' ? contentType : null; } },
    async json() { if (!validJSON) throw new Error('Invalid JSON'); return { token_hash, type }; },
    cookies: { getAll() { return []; }, set() {} },
  });
  return { POST: exported.POST, calls, actualCookies, request };
}

const success = async () => ({ data: { session: { access_token: 'test' } }, error: null });
const validHash = '12345678901234567890';

test('GET on email landing page does not exchange or consume OTP', () => {
  assert.match(page, /fetch\('\/api\/auth\/confirm'/);
  assert.match(page, /method: 'POST'/);
  assert.match(page, /history\.replaceState\(/);
  assert.doesNotMatch(page, /auth\.verifyOtp\(/);
  assert.doesNotMatch(source, /export async function GET\(/);
});

test('email confirmation POST sets a session cookie and correct destination', async () => {
  const app = handlerWithMock(success);
  const response = await app.POST(app.request({ token_hash: validHash, type: 'email' }));
  assert.equal(response.status, 200);
  assert.equal(response.body.next, '/auth/verified');
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].token_hash, validHash);
  assert.equal(app.calls[0].type, 'email');
  assert.equal(app.actualCookies[0].name, 'sb-session');
  assert.equal(response.headers.values['Cache-Control'], 'no-store');
});

test('password recovery POST creates cookie and directs to reset', async () => {
  const app = handlerWithMock(success);
  const response = await app.POST(app.request({ token_hash: validHash, type: 'recovery' }));
  assert.equal(response.status, 200);
  assert.equal(response.body.next, '/auth/reset');
  assert.equal(app.actualCookies.length, 1);
});

test('invalid type, missing token, invalid content-type and invalid JSON reject before verification', async () => {
  const app = handlerWithMock(success);
  for (const input of [
    { type: 'email' }, { token_hash: 'short', type: 'email' },
    { token_hash: validHash, type: 'invite' },
    { token_hash: validHash, type: 'email', validJSON: false },
    { token_hash: validHash, type: 'email', contentType: 'text/plain' },
  ]) {
    const response = await app.POST(app.request(input));
    assert.equal(response.status, 400);
    assert.equal(response.body.next, undefined);
  }
  assert.equal(app.calls.length, 0);
});

test('used or expired email token does not persist session', async () => {
  const app = handlerWithMock(async () => ({ data: { session: null }, error: new Error('expired') }));
  const response = await app.POST(app.request({ token_hash: validHash, type: 'email' }));
  assert.equal(response.status, 400);
  assert.equal(app.actualCookies.length, 0);
});
