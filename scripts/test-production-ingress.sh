#!/usr/bin/env bash
# Disposable CI-only containers, not a deployment or staging environment.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUFFIX="$$-${RANDOM}"
NET="kajitik-ingress-test-$SUFFIX"
BACK="kajitik-backend-test-$SUFFIX"
FRONT="kajitik-frontend-test-$SUFFIX"
TMP="$(mktemp -d)"
cleanup() {
  docker rm -f "$FRONT" "$BACK" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT
cat > "$TMP/upstream.conf" <<'NGINX'
server {
    listen 8000;
    listen 8080;
    location / {
        return 200 "$http_x_forwarded_proto|$http_x_forwarded_for";
    }
}
NGINX
docker network create "$NET" >/dev/null
docker run -d --name "$BACK" --network "$NET" --network-alias backend --network-alias game-engine \
  -v "$TMP/upstream.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine >/dev/null
docker run -d --name "$FRONT" --network "$NET" -p 127.0.0.1::80 \
  -v "$ROOT/frontend/nginx.production.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine >/dev/null
docker exec "$FRONT" nginx -t
BASE="http://$(docker port "$FRONT" 80/tcp)"
for _ in $(seq 1 20); do
  if curl -fsS --max-time 2 "$BASE/_nginx_health" >/dev/null; then break; fi
  sleep 1
done
test "$(curl -fsS --max-time 5 "$BASE/_nginx_health")" = ok
status() { curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$@"; }
test "$(status "$BASE/api/v1/auth/methods/")" = 400
test "$(status -H 'X-Forwarded-Proto: http' "$BASE/api/v1/auth/methods/")" = 400
test "$(status -H 'X-Forwarded-Proto: https,http' "$BASE/api/v1/auth/methods/")" = 400
for path in /api/v1/games/internal /api/v1/games/internal/sessions/1/ /api/v1/games/internal/settle-round/ /api/v1/games/internal/x.js /metrics; do
  test "$(status -H 'X-Forwarded-Proto: https' "$BASE$path")" = 404
done
for path in /api/v1/auth/methods/ /ws; do
  result="$(curl -fsS --max-time 5 -H 'X-Forwarded-Proto: https' -H 'CF-Connecting-IP: 192.0.2.10' -H 'X-Forwarded-For: 203.0.113.20' "$BASE$path")"
  test "$result" = 'https|192.0.2.10'
done
echo 'PASS: tunnel-only HTTPS ingress, private routes, and forwarded IP sanitation'
