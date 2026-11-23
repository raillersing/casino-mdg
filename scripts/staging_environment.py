#!/usr/bin/env python3
"""Generate isolated staging secrets and reject unsafe staging configuration.

Never prints passwords, writes production files, or starts services.
"""
import argparse
import os
import re
import secrets
import stat
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
SECRET_KEYS = (
    "STAGING_DB_PASSWORD",
    "STAGING_RABBITMQ_PASSWORD",
    "STAGING_DJANGO_SECRET_KEY",
    "STAGING_JWT_SECRET",
    "STAGING_ENGINE_BOT_SECRET",
    "STAGING_ENGINE_RESULT_SECRET",
    "STAGING_PAYMENT_WEBHOOK_SECRET",
)
PLACEHOLDERS = ("change_me", "change-me", "placeholder", "generate-strong", "dev-key")
SIMPLE_NAME = re.compile(r"^[a-z][a-z0-9_]*$")
HEX_OR_PLAIN = re.compile(r"^[A-Za-z0-9_\-]+$")


def parse_text(content):
    values = {}
    for index, raw in enumerate(content.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"line {index}: invalid assignment")
        key, value = line.split("=", 1)
        key = key.strip()
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            raise ValueError(f"line {index}: invalid variable name")
        if key in values:
            raise ValueError(f"line {index}: duplicate variable {key}")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values[key] = value
    return values


def configuration_errors(env):
    errors = []

    def bad(key, reason):
        errors.append(f"{key}: {reason}")

    def enabled(key):
        return env.get(key, "").lower().strip() == "true"

    secrets_seen = set()
    for key in SECRET_KEYS:
        value = env.get(key, "")
        if (len(value) < 32 or not HEX_OR_PLAIN.fullmatch(value)
                or any(marker in value.lower() for marker in PLACEHOLDERS)):
            bad(key, "must be a distinct generated secret of at least 32 safe characters")
        elif value in secrets_seen:
            bad(key, "must be different from all other secrets")
        secrets_seen.add(value)

    try:
        port = int(env.get("STAGING_PORT", ""))
        if not 1024 <= port <= 65535 or port in (3000, 3005, 8000, 8080):
            raise ValueError()
    except ValueError:
        port = None
        bad("STAGING_PORT", "must be an unprivileged staging-only port (e.g. 18081)")

    origin_value = env.get("STAGING_ORIGIN", "")
    try:
        origin = urlsplit(origin_value)
        host = origin.hostname
        origin_port = origin.port
    except ValueError:
        origin = urlsplit("")
        host = None
        origin_port = None
    if (not host or origin.username or origin.password or origin.path not in ("", "/")
            or origin.query or origin.fragment or origin.scheme not in ("http", "https")):
        bad("STAGING_ORIGIN", "must be an explicit loopback URL or HTTPS staging origin")
    else:
        local = host in ("localhost", "127.0.0.1", "::1")
        if local:
            if origin.scheme != "http" or origin_port != port:
                bad("STAGING_ORIGIN", "loopback origin must use http and STAGING_PORT")
        elif origin.scheme != "https" or "staging" not in host.lower():
            bad("STAGING_ORIGIN", "public origin must be HTTPS and explicitly named staging")

    hosts = [h.strip() for h in env.get("STAGING_ALLOWED_HOSTS", "").split(",") if h.strip()]
    if (not hosts or "*" in hosts or "backend" not in hosts
            or (host and host not in hosts and host != "::1")
            or any(any(symbol in item for symbol in ("*", "/", "://", ":"))
                   for item in hosts)):
        bad("STAGING_ALLOWED_HOSTS", "explicit staging hosts and internal backend required")

    for key in ("STAGING_DB_NAME", "STAGING_DB_USER", "STAGING_RABBITMQ_USER"):
        value = env.get(key, "")
        if not SIMPLE_NAME.fullmatch(value) or "staging" not in value:
            bad(key, "must use an isolated alphanumeric name containing staging")

    for key in ("REAL_MONEY_ENABLED", "PAYMENTS_REAL_MONEY_ALLOWED",
                "STAGING_REAL_MONEY_ENABLED", "STAGING_PAYMENTS_REAL_MONEY_ALLOWED",
                "STAGING_PAYMENT_SANDBOX_WEBHOOKS_ENABLED"):
        if enabled(key):
            bad(key, "must remain disabled during initial isolated staging")

    if enabled("STAGING_EMAIL_OTP_ENABLED"):
        for key in ("STAGING_EMAIL_HOST", "STAGING_EMAIL_HOST_PASSWORD",
                    "STAGING_DEFAULT_FROM_EMAIL"):
            if not env.get(key):
                bad(key, "required when staging email OTP is enabled")
        if enabled("STAGING_EMAIL_USE_TLS") == enabled("STAGING_EMAIL_USE_SSL"):
            bad("STAGING_EMAIL_USE_TLS", "configure exactly one of TLS or SSL")

    return errors


def read_env(path):
    if path.name != ".env.staging" or path.is_symlink() or not path.is_file():
        raise ValueError("Only an existing, regular .env.staging file is accepted")
    if os.name == "posix" and stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise ValueError(".env.staging must not be readable by group or others (chmod 600)")
    return parse_text(path.read_text(encoding="utf-8"))


def create_env(root=ROOT):
    root = Path(root).resolve()
    if "staging" not in root.name.lower():
        raise ValueError("Refusing to initialize outside a dedicated *staging* checkout")
    if not (root / ".git").exists() or not (root / "docker-compose.staging.yml").is_file():
        raise ValueError("A dedicated Git checkout with staging Compose is required")
    if (root / ".env.production").exists() or (root / "docker-compose.prod.yml").is_symlink():
        raise ValueError("Production environment or suspicious Compose link found")
    template = (root / ".env.staging.example").read_text(encoding="utf-8")
    for key in SECRET_KEYS:
        token = re.compile(rf"(?m)^({re.escape(key)}=)CHANGE_ME[^\r\n]*$")
        if len(token.findall(template)) != 1:
            raise ValueError(f"Example file missing exactly one placeholder for {key}")
        template = token.sub(lambda match: match.group(1) + secrets.token_hex(32), template)
    template = template.replace(
        "STAGING_ORIGIN=http://localhost:18081",
        "STAGING_ORIGIN=http://127.0.0.1:18081",
    )
    problems = configuration_errors(parse_text(template))
    if problems:
        raise ValueError("Generated staging config rejected: " + "; ".join(problems))
    destination = root / ".env.staging"
    fd = os.open(str(destination), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        stream.write(template)
    return destination


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init", help="create isolated .env.staging; never overwrite existing file")
    check = sub.add_parser("check", help="validate .env.staging without logging secrets")
    check.add_argument("--env-file", type=Path, default=ROOT / ".env.staging")
    args = parser.parse_args(argv)
    try:
        if args.command == "init":
            dest = create_env()
            print(f"PASS: generated dedicated secrets in {dest}; no services were started")
            return 0
        problems = configuration_errors(read_env(args.env_file))
    except (ValueError, OSError) as exc:
        print(f"FAIL: staging configuration: {exc}", file=sys.stderr)
        return 2
    if problems:
        for item in problems:
            print(f"FAIL: {item}", file=sys.stderr)
        return 1
    print("PASS: isolated staging config preflight (not a remote deployment or game test)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
