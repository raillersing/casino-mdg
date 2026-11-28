#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/production-common.sh"
# Explicit operator assertions; no staging or destructive volume operations.
[[ "$#" == 4 && "$1" == "--validated-commit" && "$3" == "--tunnel-confirmed" && "$4" == "--maintenance-confirmed" ]] ||
  die "Usage: bash scripts/production-deploy.sh --validated-commit FULL_SHA --tunnel-confirmed --maintenance-confirmed"
sha="$2"
[[ "$sha" =~ ^[a-f0-9]{40}$ ]] || die "Use the full CI-validated master commit SHA"
[[ "$(git branch --show-current)" == master ]] || die "Deploy only master"
[[ -z "$(git status --porcelain)" ]] || die "Git working tree is not clean"
git fetch origin master
[[ "$(git rev-parse HEAD)" == "$sha" && "$(git rev-parse origin/master)" == "$sha" ]] ||
  die "Local master, origin/master and validated SHA must match"
bash scripts/production-doctor.sh
# Build before any interruption; preserve current container image IDs later.
"${DC[@]}" build backend game-engine frontend celery-worker celery-beat
phase=before_migrations
on_failure() {
  local code=$?
  if (( code != 0 )); then
    if [[ "$phase" == stopping_or_backup ]]; then
      echo "Backup/stop failed before migration; attempting to restart old containers."
      "${DOCKER[@]}" start casino-mdg-backend-prod casino-mdg-celery-worker-prod \
        casino-mdg-celery-beat-prod casino-mdg-game-engine-prod casino-mdg-frontend-prod || true
    elif [[ "$phase" == migrations_started ]]; then
      echo "Deployment failed after migrations may have begun. Do not auto-rollback the DB."
      echo "Use the backup and review the database schema and container logs."
    fi
  fi
}
trap on_failure EXIT
phase=stopping_or_backup
"${DC[@]}" stop frontend game-engine celery-worker celery-beat backend
bash scripts/production-backup.sh --quiesced
phase=migrations_started
"${DC[@]}" up -d --no-build --no-deps --wait --wait-timeout 300 backend
"${DC[@]}" up -d --no-build --no-deps --wait --wait-timeout 300 game-engine celery-worker celery-beat
"${DC[@]}" up -d --no-build --no-deps --wait --wait-timeout 120 frontend
bash scripts/production-smoke.sh
echo "Deployment and basic smoke checks complete; manual game acceptance required."
