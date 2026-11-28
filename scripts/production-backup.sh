#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/production-common.sh"
[[ "${1:-}" == "--quiesced" && "$#" == 1 ]] ||
  die "Stop application writers after draining games; then pass --quiesced"
for service in frontend game-engine celery-worker celery-beat backend; do
  name="casino-mdg-$service-prod"
  [[ "$("${DOCKER[@]}" inspect --format '{{.State.Running}}' "$name")" == false ]] ||
    die "$name must be stopped for this backup"
done
parent="/root/backups/casino-mdg"
mkdir -p "$parent"
chmod 700 "$parent"
stamp="$(date -u +%Y%m%d-%H%M%S)-$$"
backup="$parent/$stamp"
mkdir -m 700 "$backup"
# The repo head may be newer than the deployed containers.
git rev-parse HEAD > "$backup/source-head.txt"
install -m 600 "$ENV_FILE" "$backup/.env.production"
install -m 600 docker-compose.prod.yml "$backup/docker-compose.prod.yml"
"${DOCKER[@]}" cp casino-mdg-frontend-prod:/etc/nginx/conf.d/default.conf "$backup/live-nginx.conf"
for service in frontend game-engine celery-worker celery-beat backend; do
  image="$("${DOCKER[@]}" inspect --format '{{.Image}}' "casino-mdg-$service-prod")"
  tag="casino-mdg-rollback/$service:$stamp"
  "${DOCKER[@]}" tag "$image" "$tag"
  printf '%s\t%s\t%s\n' "$service" "$image" "$tag" >> "$backup/images.tsv"
done
"${DOCKER[@]}" exec casino-mdg-postgres-prod sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup/database.dump"
test -s "$backup/database.dump"
"${DOCKER[@]}" exec -i casino-mdg-postgres-prod pg_restore --list < "$backup/database.dump" > "$backup/database-contents.txt"
mkdir "$backup/media" "$backup/engine-activity"
"${DOCKER[@]}" cp casino-mdg-backend-prod:/app/media/. "$backup/media/"
"${DOCKER[@]}" cp casino-mdg-game-engine-prod:/var/lib/casino-activity/. "$backup/engine-activity/"
(
  cd "$backup"
  sha256sum database.dump images.tsv live-nginx.conf > SHA256SUMS
)
touch "$backup/COMPLETE"
echo "Backup: $backup"
echo "Database archive list checked; no restore rehearsal performed."
echo "Redis/RabbitMQ state is not independently backed up: preserve all volumes."
