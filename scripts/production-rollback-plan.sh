#!/usr/bin/env bash
# Non-destructive validation/report only; never restore data or start old code.
set -euo pipefail
[[ "$#" == 1 ]] || { echo "Usage: bash scripts/production-rollback-plan.sh /root/backups/casino-mdg/BACKUP"; exit 1; }
backup="$(realpath "$1")"
[[ "$backup" == /root/backups/casino-mdg/* && -f "$backup/COMPLETE" ]]
(cd "$backup" && sha256sum -c SHA256SUMS)
while IFS=$'\t' read -r service image tag; do
  [[ "$(docker --context default image inspect --format '{{.Id}}' "$tag")" == "$image" ]] ||
    { echo "Missing or mismatched image: $service" >&2; exit 1; }
  printf '%s: %s\n' "$service" "$tag"
done < "$backup/images.tsv"
echo "Artifacts present. No containers or database changed."
echo "Before rollback, verify schema compatibility and the previous Compose/nginx configuration."
echo "A database restore loses writes after the backup and requires explicit operator approval."
