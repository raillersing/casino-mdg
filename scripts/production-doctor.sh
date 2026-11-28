#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/production-common.sh"
python3 scripts/production_preflight.py --env-file "$ENV_FILE"
"${DC[@]}" config --quiet
systemctl is-active --quiet cloudflared || die "cloudflared is not active"
version="$("${DOCKER[@]}" version --format '{{.Server.Version}}')"
major="${version%%.*}"
[[ "$major" =~ ^[0-9]+$ ]] && (( major >= 28 )) ||
  die "Docker Engine 28+ required for this loopback-only deployment policy"
public_edge_checks
echo "PASS: static configuration, local Docker, tunnel service and public HTTPS"
echo "DNS tunnel routing must still be confirmed in Cloudflare by the operator."
