#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/production-common.sh"
public_edge_checks
for domain in kajitik.com www.kajitik.com; do
  curl -fsS --max-time 15 "https://$domain/api/v1/auth/methods/" |
    python3 -c 'import json,sys; d=json.load(sys.stdin); assert "email" in d and "sms" in d'
  for path in /api/v1/games/internal/sessions/1/ /metrics; do
    code="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "https://$domain$path")"
    [[ "$code" == 404 ]] || die "Private route exposed: $domain$path ($code)"
  done
done
binding="$("${DOCKER[@]}" port casino-mdg-frontend-prod 80/tcp)"
[[ "$binding" == "127.0.0.1:$PORT" ]] || die "Frontend is not loopback-only"
[[ "$(curl -fsS --max-time 5 "http://127.0.0.1:$PORT/_nginx_health")" == ok ]]
[[ "$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/v1/auth/methods/")" == 400 ]]
"${DOCKER[@]}" exec -i casino-mdg-backend-prod python - <<'PY'
import os
import urllib.request
import urllib.error
url = "http://backend:8000/api/v1/games/internal/sessions/0/"
def status(headers):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=5) as response:
            return response.status
    except urllib.error.HTTPError as exc:
        return exc.code
assert status({}) == 403, "unauthenticated RPC must be forbidden"
assert status({"X-Game-Engine-Secret": os.environ["GAME_ENGINE_RESULT_SECRET"]}) in (200, 404), "authenticated private RPC must not redirect"
PY
"${DOCKER[@]}" exec casino-mdg-game-engine-prod wget --spider --quiet http://localhost:8080/health
echo "PASS: production HTTPS, public/private boundaries, engine health."
echo "Manual acceptance remains required: guest session, WebSockets and all five games."
