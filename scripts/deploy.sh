#!/usr/bin/env bash
# Deploy with wrangler.local.jsonc and tag the deployed commit with the Cloudflare version id
# (deploy-<first 8 chars>, annotated with the full id, URL and time), then push the tag.
# Refuses to run with uncommitted changes, so the tag always matches what was deployed.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "uncommitted changes - commit first so the deploy tag matches the deployed code" >&2
  git status --short >&2
  exit 1
fi

if [ ! -f src/data/officialWorkouts.generated.ts ]; then
  echo "src/data/officialWorkouts.generated.ts is missing - run npm run library first" >&2
  exit 1
fi

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT
npx wrangler deploy -c wrangler.local.jsonc 2>&1 | tee "$OUT"

VERSION_ID="$(sed -n 's/.*Current Version ID: \([0-9a-f-]*\).*/\1/p' "$OUT" | head -1)"
URL="$(grep -o 'https://[^ ]*workers\.dev' "$OUT" | head -1 || true)"
if [ -z "$VERSION_ID" ]; then
  echo "no 'Current Version ID' in wrangler output - deploy not tagged" >&2
  exit 1
fi

TAG="deploy-${VERSION_ID:0:8}"
git tag -a "$TAG" -m "Deployed to Cloudflare $(date -u +%Y-%m-%dT%H:%M:%SZ)
Version ID: $VERSION_ID
URL: ${URL:-unknown}"
git push origin "$TAG"
echo "tagged $(git rev-parse --short HEAD) as $TAG"
