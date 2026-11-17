"""Single source of truth for player sign-in channels and provider readiness."""

import os

from django.conf import settings

from .models import AuthChannelPolicy


def channel_mode():
    return (
        AuthChannelPolicy.objects.filter(pk=1)
        .values_list("mode", flat=True)
        .first()
        or "both"
    )


def channel_allowed(channel):
    mode = channel_mode()
    return mode == "both" or mode == channel


def smtp_configured():
    return bool(
        getattr(settings, "EMAIL_OTP_ENABLED", False)
        and settings.EMAIL_BACKEND == "django.core.mail.backends.smtp.EmailBackend"
        and settings.EMAIL_HOST
        and settings.DEFAULT_FROM_EMAIL
        and (settings.EMAIL_USE_SSL or settings.EMAIL_USE_TLS)
        and (not settings.EMAIL_HOST_USER or settings.EMAIL_HOST_PASSWORD)
    )


def sms_configured():
    url = os.getenv("SMS_GATEWAY_URL", "").strip()
    gateway = url.startswith("https://")
    sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    twilio = bool(
        sid
        and sid.startswith("AC")
        and not sid.startswith("AC_xxx")
        and os.getenv("TWILIO_AUTH_TOKEN", "").strip()
        and os.getenv("TWILIO_PHONE_NUMBER", "").strip()
    )
    return gateway or twilio


def channel_capabilities():
    mode = channel_mode()
    email_enabled = mode in ("email", "both")
    sms_enabled = mode in ("sms", "both")
    email_ready = smtp_configured()
    sms_ready = sms_configured() or settings.DEBUG
    return {
        "email": {"allowed": email_enabled, "available": email_enabled and email_ready},
        "sms": {"allowed": sms_enabled, "available": sms_enabled and sms_ready},
        "default_channel": (
            "email"
            if email_enabled and email_ready
            else "sms"
            if sms_enabled and sms_ready
            else None
        ),
    }
