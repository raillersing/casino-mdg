#!/usr/bin/env bash
# Read-only smoke checks of the staging reverse proxy and Django backend.
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:18081}"
BASE_URL="${BASE_URL%/}"
if ! [[ "$BASE_URL" =~ ^https?:// ]]; then
  echo "Supply a full http(s) URL." >&2
  exit 2
fi

# Refuse accidental smoke tests against a non-staging frontend.
echo "Verifying CasinoMDG staging identity at $BASE_URL/__staging__/identity"
curl --fail --silent --show-error --max-time 15 "$BASE_URL/__staging__/identity" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d == {"environment":"staging","application":"casino-mdg"}, d'
echo "Checking frontend at $BASE_URL/"
curl --fail --silent --show-error --max-time 15 --output /dev/null "$BASE_URL/"
echo "Checking Django through Nginx at $BASE_URL/api/v1/ping/"
curl --fail --silent --show-error --max-time 15 "$BASE_URL/api/v1/ping/" \
  | python3 -c 'import json,sys; data=json.load(sys.stdin); assert data.get("status") == "ok", data'
echo "Verifying engine-only player session endpoint refuses unauthenticated callers"
http_status="$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' \
  "$BASE_URL/api/v1/games/internal/sessions/1/")"
if [[ "$http_status" != "403" ]]; then
  echo "FAIL: internal engine endpoint must return HTTP 403, got $http_status" >&2
  exit 1
fi

echo "PASS: frontend, API and internal endpoint guards; multiplayer still requires real-account staging acceptance."
