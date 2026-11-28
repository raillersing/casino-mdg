# CasinoMDG — Cloudflare Tunnel production (Contabo)

Production frontend is published only on host loopback, with dedicated
`frontend/nginx.production.conf`. Development and staging are unchanged.

## Prerequisites (before changing live containers)
- Confirm both public hostnames are published through the running Cloudflare
  Tunnel, service URL `http://127.0.0.1:80` (or the explicitly selected PORT).
  Confirm DNS records point at that tunnel, not the old origin IP.
- Enable Always Use HTTPS in the Kajitik zone. Check HTTP redirect to HTTPS for
  both domains, and test HTTPS for both and IROOA. Do not change IROOA's route.
- The origin trusts Cloudflare's overwritten X-Forwarded-Proto and
  CF-Connecting-IP **only because the origin listener is private**. Do not
  publish it on a public IP, add an untrusted container to its Docker network,
  or point an arbitrary public proxy at it.
- Check Docker Engine version and host networking; Docker documents a localhost
  publishing caveat for releases older than 28.0.0. Upgrade or enforce a
  suitable host firewall before relying on loopback isolation.
- Take a fresh database backup, preserve configuration and current image IDs,
  verify the dump can be listed and schedule a maintenance window for active
  games. Confirm recovery plan including migration compatibility; image-only
  rollback is not always safe.

## Production settings
Set SECURE_SSL_REDIRECT=True in the existing .env.production (never regenerate
all secrets or replace the file). Default HSTS is 300 seconds without
includeSubDomains; raise only after successful operational verification.
Run scripts/production_preflight.py --env-file .env.production. Do not print
the resolved Compose environment, which contains secrets.

## Acceptance after deployment
- Public HTTP redirects to HTTPS; both HTTPS hostnames return the correct
  frontend. GET /api/v1/auth/methods/ returns JSON 200 without redirects.
- GET /api/v1/games/internal/sessions/1/ returns 404 from the public proxy.
- Public /metrics returns 404. Backend metrics remain private.
- Direct loopback /_nginx_health returns 200; an HTTP API request without the
  trusted scheme header returns 400.
- Private Go-to-Django RPCs work on Docker HTTP with the appropriate shared
  secrets; missing secrets are forbidden. The engine refuses HTTP redirects.
- Verify WebSockets and representative game flows; verify IROOA unchanged.
- Confirm published port is loopback-only and test direct origin access from
  a separate network (do not disclose origin IP or secrets).
- Real-money activation remains blocked; no claims of production security
  certification are made by these smoke checks.

References:
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/
- https://developers.cloudflare.com/fundamentals/reference/http-headers/
- https://docs.docker.com/engine/network/port-publishing/
- https://docs.djangoproject.com/en/5.2/ref/settings/#secure-proxy-ssl-header
