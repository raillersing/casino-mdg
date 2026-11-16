"""Mail delivery for low-assurance email verification (never logs secrets)."""

import logging

from django.conf import settings
from django.core.mail import EmailMessage

logger = logging.getLogger(__name__)


def send_email_otp(address: str, code: str) -> bool:
    """Return True only if a configured SMTP backend accepts the message."""
    if not settings.EMAIL_OTP_ENABLED:
        return False
    if (
        settings.EMAIL_BACKEND != "django.core.mail.backends.smtp.EmailBackend"
        or not settings.EMAIL_HOST
        or not settings.DEFAULT_FROM_EMAIL
        or not (settings.EMAIL_USE_TLS or settings.EMAIL_USE_SSL)
        or (settings.EMAIL_HOST_USER and not settings.EMAIL_HOST_PASSWORD)
    ):
        logger.warning("Email OTP unavailable: SMTP configuration incomplete")
        return False
    try:
        accepted = EmailMessage(
            subject="Votre code de vérification — MDG Game Club",
            body=(
                f"Votre code de vérification est : {code}\n"
                "Il expire dans 5 minutes et ne peut être utilisé qu'une fois.\n"
                "Si vous n'avez pas demandé ce code, ignorez ce message."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[address],
        ).send(fail_silently=False)
        return accepted == 1
    except Exception as exc:
        logger.warning("Email OTP delivery failed (%s)", type(exc).__name__)
        return False
