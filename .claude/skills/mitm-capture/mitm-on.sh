#!/usr/bin/env bash
# Capture MyWhoosh app traffic: start mitmdump (MyWhoosh hosts only), trust its CA, route Wi-Fi through it.
# Undo with mitm-off.sh. Requests land in $MITM_OUT_DIR/capture.jsonl (default ~/.mitmproxy/captures),
# tokens and passwords masked.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
export MITM_OUT_DIR="${MITM_OUT_DIR:-$HOME/.mitmproxy/captures}"
mkdir -p "$MITM_OUT_DIR"
SERVICE="${MITM_SERVICE:-Wi-Fi}"
PORT="${MITM_PORT:-8080}"
CERT="$HOME/.mitmproxy/mitmproxy-ca-cert.pem"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "proxy already listening on $PORT, not starting another"
else
  # http2/header validation off: the app sends "Authorization: Bearer " (empty token) at startup,
  # which mitmproxy's HTTP/2 stack rejects, and the app then reports "Server is not accessible"
  mitmdump -q -p "$PORT" --allow-hosts '(^|\.)(mywhoosh|my-whoosh)\.com(:\d+)?$' \
    --set http2=false --set validate_inbound_headers=false \
    -s "$DIR/capture.py" >"$MITM_OUT_DIR/mitm.log" 2>&1 &
  echo $! >"$MITM_OUT_DIR/mitm.pid"
  sleep 2
  echo "mitmdump started (pid $(cat "$MITM_OUT_DIR/mitm.pid")), capture: $MITM_OUT_DIR/capture.jsonl"
fi

if [ ! -f "$CERT" ]; then
  echo "no CA at $CERT yet; run mitmdump once to create it" >&2
  exit 1
fi

echo "trusting mitmproxy CA (asks for your password)"
sudo security add-trusted-cert -d -p ssl -r trustRoot -k /Library/Keychains/System.keychain "$CERT"

networksetup -setwebproxy "$SERVICE" 127.0.0.1 "$PORT"
networksetup -setsecurewebproxy "$SERVICE" 127.0.0.1 "$PORT"
echo "$SERVICE now uses 127.0.0.1:$PORT. Restart MyWhoosh, then run mitm-off.sh when done."
