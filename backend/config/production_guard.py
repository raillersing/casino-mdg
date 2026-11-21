"""Runtime invariants for deployments explicitly marked ENV=production."""

from urllib.parse import urlparse

from django.core.exceptions import ImproperlyConfigured


def enforce_production_settings(env):
    """Refuse insecure production settings before Django serves a request."""
    if env.get("ENV", "").strip().lower() != "production":
        return

    def enabled(key):
        return str(env.get(key, "")).strip().lower() == "true"

    errors = []
    if enabled("DEBUG"):
        errors.append("DEBUG")
    if not enabled("SECURE_SSL_REDIRECT"):
        errors.append("SECURE_SSL_REDIRECT")

    for key in (
        "DJANGO_SECRET_KEY",
        "JWT_SECRET",
        "GAME_ENGINE_BOT_SECRET",
        "GAME_ENGINE_RESULT_SECRET",
        "PAYMENT_WEBHOOK_SECRET",
        "DB_PASSWORD",
    ):
        value = str(env.get(key, ""))
        if len(value) < 32 or any(
            marker in value.lower()
            for marker in (
                "change-me",
                "change_me",
                "generate-strong",
                "placeholder",
                "dev-key",
                ".invalid",
            )
        ):
            errors.append(key)

    hosts = [
        host.strip()
        for host in str(env.get("ALLOWED_HOSTS", "")).split(",")
        if host.strip()
    ]
    if not hosts or any(
        host == "*" or host.endswith(".invalid") or "." not in host for host in hosts
    ):
        errors.append("ALLOWED_HOSTS")

    origins = [
        origin.strip()
        for origin in str(env.get("CORS_ALLOWED_ORIGINS", "")).split(",")
        if origin.strip()
    ]
    if not origins or any(
        urlparse(origin).scheme != "https"
        or not urlparse(origin).hostname
        or urlparse(origin).hostname.endswith(".invalid")
        or "*" in origin
        for origin in origins
    ):
        errors.append("CORS_ALLOWED_ORIGINS")

    if enabled("PAYMENT_SANDBOX_WEBHOOKS_ENABLED"):
        errors.append("PAYMENT_SANDBOX_WEBHOOKS_ENABLED")
    if enabled("REAL_MONEY_ENABLED") or enabled("PAYMENTS_REAL_MONEY_ALLOWED"):
        errors.append("REAL_MONEY_ENABLED")
    if enabled("EMAIL_OTP_ENABLED") and not all(
        env.get(key)
        for key in ("EMAIL_HOST", "EMAIL_HOST_PASSWORD", "DEFAULT_FROM_EMAIL")
    ):
        errors.append("EMAIL_OTP_ENABLED")

    if errors:
        raise ImproperlyConfigured(
            "Refusing insecure production configuration: " + ", ".join(errors)
        )
