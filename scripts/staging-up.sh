#!/usr/bin/env bash
# Safe, explicit start of an isolated staging project (never the production stack).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env.staging}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.staging.example and replace all placeholders." >&2
  exit 2
fi
if grep -Eq '^[[:space:]]*STAGING_[A-Z0-9_]+=[[:space:]]*(CHANGE_ME|change-me)' "$ENV_FILE"; then
  echo "Refusing staging startup: example credentials are still present." >&2
  exit 2
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required for staging preflight." >&2
  exit 2
fi
python3 "$ROOT/scripts/staging_environment.py" check --env-file "$ENV_FILE"
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI is required to launch staging." >&2
  exit 2
fi

ARGS=(--project-name casino-mdg-staging --env-file "$ENV_FILE" -f "$ROOT/docker-compose.staging.yml")
docker compose "${ARGS[@]}" config --quiet
docker compose "${ARGS[@]}" up -d --build --wait --wait-timeout 300
echo "Staging is bound on 127.0.0.1; run scripts/staging-smoke.sh for health checks."
