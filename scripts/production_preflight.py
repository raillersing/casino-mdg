#!/usr/bin/env python3
"""Fail-closed deployment checklist; reads only an explicit .env file.

The script never connects to a live service or mutates configuration.
It reports variable *names* and remediation requirements, never secret values.
"""
import argparse
import os
import sys
from pathlib import Path
from urllib.parse import urlparse


def parse_env(path):
    """Strictly parse simple dotenv KEY=VALUE lines (no interpolation/commands)."""
    values = {}
    for number, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:]
        if "=" not in line:
            raise ValueError(f"Invalid env-file assignment at line {number}")
        name, value = line.split("=", 1)
        name = name.strip()
        if not name.replace("_", "").isalnum():
            raise ValueError(f"Invalid environment variable at line {number}")
        values[name] = value.strip().strip("'").strip('"')
    return values


def check_configuration(env):
    errors = []

    def bad(key, reason):
        errors.append(f"{key}: {reason}")

    def true(key):
        return env.get(key, "").strip().lower() == "true"

    if env.get("ENV", "").lower() != "production":
        bad("ENV", "must equal production")
    if env.get("DEBUG", "").strip().lower() != "false":
        bad("DEBUG", "must equal False")

    secrets = ("DJANGO_SECRET_KEY", "JWT_SECRET", "DB_PASSWORD", "GAME_ENGINE_BOT_SECRET",
               "GAME_ENGINE_RESULT_SECRET", "PAYMENT_WEBHOOK_SECRET")
    for key in secrets:
        value = env.get(key, "")
        if len(value) < 32 or any(marker in value.lower() for marker in
            ("change-me", "change_me", "example", "dev-key", "placeholder", "generate-strong")):
            bad(key, "must be an operator-managed strong unique secret")

    hosts = [h.strip() for h in env.get("ALLOWED_HOSTS", "").split(",") if h.strip()]
    internal_hosts = {"backend", "localhost", "127.0.0.1", "[::1]"}
    public_hosts = [host for host in hosts if host not in internal_hosts]
    if not public_hosts or any(
        "*" in host or host.startswith(".") or host.endswith(".invalid") or host == "votre-domaine.com"
        or "." not in host or "/" in host or ":" in host
        for host in public_hosts
    ):
        bad("ALLOWED_HOSTS", "must list explicit public hostnames; wildcard not allowed")

    origins = [o.strip() for o in env.get("CORS_ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if not origins or any(
        (urlparse(o).scheme != "https" or not urlparse(o).hostname or
         urlparse(o).hostname in ("localhost", "127.0.0.1") or
         urlparse(o).hostname.endswith(".invalid") or "*" in o)
        for o in origins
    ):
        bad("CORS_ALLOWED_ORIGINS", "must contain explicit HTTPS origins")

    if not true("SECURE_SSL_REDIRECT"):
        bad("SECURE_SSL_REDIRECT", "must be True (including trusted TLS proxy configuration)")
    if true("EMAIL_OTP_ENABLED") and (
        not env.get("EMAIL_HOST") or not env.get("DEFAULT_FROM_EMAIL") or
        not env.get("EMAIL_HOST_PASSWORD")
    ):
        bad("EMAIL_OTP_ENABLED", "SMTP transport credentials must be configured")
    if true("PAYMENT_SANDBOX_WEBHOOKS_ENABLED"):
        bad("PAYMENT_SANDBOX_WEBHOOKS_ENABLED", "disable public sandbox callbacks in production")
    for key in ("REAL_MONEY_ENABLED", "PAYMENTS_REAL_MONEY_ALLOWED"):
        if true(key):
            bad(key, "real-money activation is blocked until independent external approval")
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        if not args.env_file.is_file():
            raise ValueError("Environment file does not exist")
        env = parse_env(args.env_file)
        problems = check_configuration(env)
    except (ValueError, OSError) as exc:
        print(f"FAIL: cannot parse configuration: {exc}", file=sys.stderr)
        return 2
    if problems:
        print("FAIL: deployment preflight rejected:")
        for problem in problems:
            print(f" - {problem}")
        return 1
    print("PASS: static configuration guardrails. Runtime, PSP, legal and security audit NOT verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
