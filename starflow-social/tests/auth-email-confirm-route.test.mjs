import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual Next.js route with mock Supabase and response cookies.
// This tests control flow but cannot replace a real SMTP or browser end-to-end test.
const source = readFileSync(new URL('../app/auth/confirm/route.ts', import.meta.url), 'utf8');
function handlerWithMock(verification) {
  let calls = [];
  let receivedCookies = [];
  const actualCookies = [];
  const NextResponse = {
    redirect(url, init) {
      const headers = {};
      return {
        destination: String(url),
        status: init?.status || 307,
        headers: { set(name, value) { headers[name] = value; }, values: headers },
        cookies: {
          set(name, value, options) { actualCookies.push({ name, value, options }); }
        }
      };
    }
  };
  const exported = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(code, {
    exports: exported,
    URL,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://staging.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key' } },
    require(id) {
      if (id === 'next/server') return { NextResponse };
      if (id === '@supabase/ssr') {
        return {
          createServerClient(_url, _key, config) {
            return {
              auth: {
                async verifyOtp(args) {
                  calls.push(args);
                  const result = await verification(args);
                  if (result.data?.session) config.cookies.setAll([
                    { name: 'sb-session', value: 'test-cookie', options: { path: '/', sameSite: 'lax' } }
                  ]);
                  return result;
                }
              }
            };
          }
        };
      }
      throw new Error('Unexpected import: ' + id);
    }
  });
  const request = (address) => ({
    url: address,
    cookies: {
      getAll() { return []; },
      set(name, value) { receivedCookies.push({ name, value }); }
    }
  });
  return { GET: exported.GET, calls, actualCookies, receivedCookies, request };
}

const approved = async () => ({ data: { session: { access_token: 'test' } }, error: null });
test('verification succeeds across browser storage and sets a session cookie', async () => {
  const app = handlerWithMock(approved);
  const response = await app.GET(app.request('https://preview.example/auth/confirm?token_hash=ABC123&type=email'));
  assert.equal(new URL(response.destination).pathname, '/auth/verified');
  assert.equal(new URL(response.destination).search, '');
  assert.equal(response.status, 303);
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].token_hash, 'ABC123');
  assert.equal(app.calls[0].type, 'email');
  assert.equal(app.actualCookies.length, 1);
  assert.equal(app.actualCookies[0].name, 'sb-session');
  assert.equal(response.headers.values['Cache-Control'], 'no-store');
});

test('password recovery opens reset form and issues the session cookie', async () => {
  const app = handlerWithMock(approved);
  const response = await app.GET(app.request('https://preview.example/auth/confirm?token_hash=RECOVERY&type=recovery'));
  assert.equal(new URL(response.destination).pathname, '/auth/reset');
  assert.equal(app.calls[0].type, 'recovery');
  assert.equal(app.actualCookies.length, 1);
});

test('missing token and unknown types are rejected before using Supabase', async () => {
  const app = handlerWithMock(approved);
  for (const url of [
    'https://preview.example/auth/confirm?type=email',
    'https://preview.example/auth/confirm?token_hash=BAD&type=signup',
    'https://preview.example/auth/confirm?token_hash=BAD&type=invite'
  ]) {
    const response = await app.GET(app.request(url));
    assert.equal(new URL(response.destination).pathname, '/auth/email-error');
    assert.equal(new URL(response.destination).search, '');
  }
  assert.equal(app.calls.length, 0);
});

test('expired or already used confirmation cannot show a success page', async () => {
  const app = handlerWithMock(async () => ({ data: { session: null }, error: new Error('expired') }));
  const response = await app.GET(app.request('https://preview.example/auth/confirm?token_hash=EXPIRED&type=email'));
  assert.equal(new URL(response.destination).pathname, '/auth/email-error');
  assert.equal(app.actualCookies.length, 0);
});
