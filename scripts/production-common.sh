#!/usr/bin/env bash
# Shared operator helpers for this exact Compose project; never source dotenv.
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ENV_FILE="$ROOT/.env.production"
[[ -f "$ENV_FILE" ]] || { echo "Missing .env.production" >&2; exit 1; }
# Discard ambient Compose interpolation and explicitly address the local daemon.
DOCKER=(env -i "PATH=$PATH" "HOME=$HOME" docker --context default)
DC=("${DOCKER[@]}" compose -p casino-mdg --env-file "$ENV_FILE" -f "$ROOT/docker-compose.prod.yml")
PORT="$(python3 - <<'PY'
import sys
sys.path.insert(0, "scripts")
from production_preflight import parse_env
port = int(parse_env(".env.production").get("PORT", "80"))
if not 1 <= port <= 65535:
    raise SystemExit("Invalid PORT")
print(port)
PY
)"
die() { echo "FAIL: $*" >&2; exit 1; }
public_edge_checks() {
  for domain in kajitik.com www.kajitik.com; do
    local result
    result="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code} %{redirect_url}' "http://$domain/")"
    [[ "$result" == "301 https://$domain/" || "$result" == "308 https://$domain/" ]] ||
      die "$domain does not redirect HTTP to its HTTPS root"
    curl -fsS --max-time 15 "https://$domain/api/v1/ping/" | python3 -c 'import json,sys; assert json.load(sys.stdin)["status"] == "ok"'
  done
}
