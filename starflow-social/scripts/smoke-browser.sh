#!/usr/bin/env bash
set -euo pipefail

# A successful Next.js build is not evidence the homepage can hydrate.
# Check the rendered DOM in a real headless Chromium session on CI.
CHROME="$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || true)"
if [[ -z "$CHROME" ]]; then
  echo "::error::Chrome/Chromium unavailable; browser smoke test cannot run."
  exit 1
fi
PORT=31871
npm run start -- --hostname 127.0.0.1 --port "$PORT" >/tmp/starflow-smoke-server.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

READY=0
for i in {1..40}; do
  if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/"; then READY=1; break; fi
  sleep 1
done
if [[ "$READY" != "1" ]]; then
  cat /tmp/starflow-smoke-server.log
  echo "::error::Starflow test server did not become ready."
  exit 1
fi

timeout 55 "$CHROME" --headless=new --no-sandbox --disable-gpu \
  --disable-dev-shm-usage --disable-background-networking \
  --virtual-time-budget=10000 --window-size=390,844 \
  --dump-dom "http://127.0.0.1:${PORT}/" \
  >/tmp/starflow-smoke-dom.html 2>/tmp/starflow-smoke-chrome.log || {
  tail -30 /tmp/starflow-smoke-chrome.log
  echo "::error::Chrome failed to render Starflow."
  exit 1
}
if grep -Eqi 'Application error: a client-side exception|页面暂时无法显示|加载遇到问题' /tmp/starflow-smoke-dom.html; then
  echo "::error::A client-side exception/recovery fallback rendered instead of homepage."
  exit 1
fi
if ! grep -q '你关心的世界' /tmp/starflow-smoke-dom.html; then
  echo "::error::Expected unauthenticated Starflow homepage did not hydrate."
  head -c 350 /tmp/starflow-smoke-dom.html
  exit 1
fi
echo "Starflow public homepage hydrated without a visible client-side exception."
