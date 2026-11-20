#!/usr/bin/env bash
set -euo pipefail

# Test actual client hydration, not just prerendered HTML or virtual-time dump-dom.
CHROME="$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || true)"
if [[ -z "$CHROME" ]]; then
  echo "::error::Chrome/Chromium unavailable; browser smoke test cannot run."
  exit 1
fi
PORT=31871
WORK="$(mktemp -d)"
SERVER_PID=""
CHROME_PID=""
cleanup() {
  local test_status="$1"
  trap - EXIT
  if [[ -n "$CHROME_PID" ]]; then kill "$CHROME_PID" 2>/dev/null || true; wait "$CHROME_PID" 2>/dev/null || true; fi
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi
  # Chromium subprocesses may finish writing the profile after the parent exits.
  # Retry cleanup, but never replace the actual browser test's exit status.
  local attempt
  for attempt in 1 2 3 4 5; do
    if rm -rf -- "$WORK" 2>/dev/null; then exit "$test_status"; fi
    sleep 1
  done
  echo "::warning::Temporary browser profile cleanup incomplete; disposable runner will remove it."
  exit "$test_status"
}
trap 'cleanup "$?"' EXIT
node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$PORT" >"$WORK/server.log" 2>&1 &
SERVER_PID=$!

READY=0
for i in {1..40}; do
  if curl --noproxy '*' -fsS --max-time 3 -o /dev/null "http://127.0.0.1:${PORT}/"; then READY=1; break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 1
done
if [[ "$READY" != "1" ]]; then
  tail -50 "$WORK/server.log"
  echo "::error::Starflow test server did not become ready."
  exit 1
fi

# Fresh, disposable profile; DevTools binds only to loopback and an ephemeral port.
env -u DBUS_SESSION_BUS_ADDRESS "$CHROME" --headless=new --no-sandbox --disable-gpu \
  --disable-dev-shm-usage --disable-background-networking --no-first-run \
  --no-default-browser-check --no-proxy-server --lang=zh-CN --window-size=390,844 \
  --user-data-dir="$WORK/profile" --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=0 about:blank >"$WORK/chrome.log" 2>&1 &
CHROME_PID=$!

# Node 22 supplies fetch/WebSocket; no additional browser package or paid service.
if ! timeout --kill-after=5s 100s node --input-type=module - "$WORK/profile" "$PORT" "$CHROME_PID" <<'JS'
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const [profile, port, pid] = process.argv.slice(2);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let target;
for (let i = 0; i < 40; i++) {
  try { process.kill(Number(pid), 0); } catch { throw Error('Chrome exited before the DevTools session became available'); }
  try {
    const [debugPort] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n');
    assert.match(debugPort, /^\d+$/);
    const response = await fetch('http://127.0.0.1:' + debugPort + '/json/list', {signal: AbortSignal.timeout(1500)});
    if (response.ok) target = (await response.json()).find(x => x.type === 'page' && x.webSocketDebuggerUrl);
    if (target) break;
  } catch {}
  await sleep(500);
}
assert.ok(target, 'Chrome DevTools did not become available');
const endpoint = new URL(target.webSocketDebuggerUrl);
assert.equal(endpoint.protocol, 'ws:');
assert.equal(endpoint.hostname, '127.0.0.1');
const socket = new WebSocket(endpoint);
const pending = new Map();
const exceptions = [];
let id = 0;
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const callback = pending.get(message.id);
    if (callback) { pending.delete(message.id); clearTimeout(callback.timer); message.error ? callback.reject(Error(message.error.message)) : callback.resolve(message.result); }
  } else if (message.method === 'Runtime.exceptionThrown') {
    const detail = message.params.exceptionDetails;
    exceptions.push(String(detail.exception?.description ?? detail.text).slice(0, 1500));
  }
});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('DevTools connection timed out')), 5000);
    socket.addEventListener('open', () => {clearTimeout(timer);resolve();}, {once:true});
    socket.addEventListener('error', () => {clearTimeout(timer);reject(Error('DevTools connection failed'));}, {once:true});
  });
  function call(method, params = {}) {
    return new Promise((resolve,reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => {pending.delete(requestId);reject(Error(method+' timed out'));}, 5000);
      pending.set(requestId, {resolve,reject,timer});
      socket.send(JSON.stringify({id:requestId,method,params}));
    });
  }
  await call('Runtime.enable');
  await call('Page.enable');
  const navigation = await call('Page.navigate', {url:'http://127.0.0.1:'+port+'/'});
  assert.ok(!navigation.errorText, navigation.errorText);
  const evaluate = async () => {
    const result = await call('Runtime.evaluate', {expression:`(() => {
      const text=document.body?.innerText || '';
      const landing=document.querySelector('.sf-public-landing');
      const h=landing?.querySelector('h1');
      return {url:location.href,text:text.slice(0,500),heading:h?.innerText || '',
        landing:!!(landing && h && h.getBoundingClientRect().width > 0 && h.getBoundingClientRect().height > 0),
        fallback:/Application error: a client-side exception|页面暂时无法显示|加载遇到问题/i.test(text)};
    })()`,returnByValue:true});
    if (result.exceptionDetails) throw Error('DOM evaluation failed');
    return result.result.value;
  };
  let snapshot;
  const deadline = Date.now()+40000;
  while (Date.now()<deadline) {
    if (exceptions.length) throw Error('Uncaught browser exception: '+exceptions[0]);
    try { snapshot = await evaluate(); } catch (error) {
      if (!/context|navigation/i.test(error.message)) throw error;
      await sleep(500); continue;
    }
    if (snapshot.fallback) throw Error('Client recovery fallback rendered: '+snapshot.text);
    if (snapshot.url==='http://127.0.0.1:'+port+'/' && snapshot.landing && /你关心的世界|Your world,/i.test(snapshot.heading)) break;
    await sleep(500);
  }
  assert.ok(snapshot?.landing && /你关心的世界|Your world,/i.test(snapshot.heading), 'Expected hydrated homepage: '+JSON.stringify(snapshot));
  // Keep observing after the first paint so deferred client exceptions still fail CI.
  await sleep(1500);
  snapshot = await evaluate();
  assert.ok(snapshot.landing && /你关心的世界|Your world,/i.test(snapshot.heading) && !snapshot.fallback, 'Homepage became unavailable after hydration: '+JSON.stringify(snapshot));
  assert.equal(exceptions.length,0,exceptions.join('\n'));
  console.log('PASS: real Chrome rendered and hydrated Starflow public homepage without client exceptions.');
} finally {
  for (const callback of pending.values()) clearTimeout(callback.timer);
  socket.close();
}
JS
then
  echo "::error::Starflow browser smoke test failed; see DevTools, Chrome and server diagnostics."
  tail -50 "$WORK/chrome.log"
  tail -50 "$WORK/server.log"
  exit 1
fi
