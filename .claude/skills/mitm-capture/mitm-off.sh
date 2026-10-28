#!/usr/bin/env bash
# Undo mitm-on.sh: proxy off, mitmproxy CA removed from the System keychain, mitmdump stopped.
# Keeps going on errors so a half-applied setup still gets cleaned up.
set -uo pipefail

OUT_DIR="${MITM_OUT_DIR:-$HOME/.mitmproxy/captures}"
SERVICE="${MITM_SERVICE:-Wi-Fi}"

networksetup -setwebproxystate "$SERVICE" off
networksetup -setsecurewebproxystate "$SERVICE" off
echo "$SERVICE proxy off"

echo "removing mitmproxy CA (asks for your password)"
while sudo security find-certificate -c mitmproxy /Library/Keychains/System.keychain >/dev/null 2>&1; do
  sudo security delete-certificate -c mitmproxy /Library/Keychains/System.keychain || break
done
echo "mitmproxy CA removed"

if [ -f "$OUT_DIR/mitm.pid" ]; then
  kill "$(cat "$OUT_DIR/mitm.pid")" 2>/dev/null && echo "mitmdump stopped"
  rm -f "$OUT_DIR/mitm.pid"
else
  echo "no mitm.pid here; a mitmdump started elsewhere keeps running"
fi
