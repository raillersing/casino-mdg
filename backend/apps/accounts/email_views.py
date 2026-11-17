"""Email login and authenticated email binding; SMS auth remains unchanged."""

import secrets
import uuid
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.backoffice.auth_policy import channel_allowed
from apps.wallet.services import credit_simulation_bonus

from .authentication import encode_token
from .email_otp import send_email_otp
from .models import EmailOTPChallenge, User
from .throttles import OTPRequestThrottle, OTPVerifyThrottle
from .views import normalize_phone


def clean_email(value):
    if not isinstance(value, str):
        raise ValueError("Adresse email invalide.")
    email = value.strip().lower()
    try:
        validate_email(email)
    except ValidationError:
        raise ValueError("Adresse email invalide.")
    if email.endswith(".local") or len(email) > 254:
        raise ValueError("Une véritable adresse email est requise.")
    return email


def send_challenge(*, email, phone="", user=None, purpose):
    now = timezone.now()
    if EmailOTPChallenge.objects.filter(
        email__iexact=email,
        created_at__gte=now - timedelta(seconds=30),
    ).exists():
        return Response(
            {"detail": "Veuillez patienter avant de redemander un code."}, status=429
        )
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = EmailOTPChallenge.objects.create(
        email=email,
        phone=phone,
        user=user,
        purpose=purpose,
        code_hash=make_password(code),
        expires_at=now + timedelta(minutes=5),
    )
    if not send_email_otp(email, code):
        challenge.delete()
        return Response(
            {"detail": "Service email indisponible. Réessayez plus tard."}, status=503
        )
    EmailOTPChallenge.objects.filter(
        email__iexact=email,
        purpose=purpose,
        consumed_at__isnull=True,
    ).exclude(pk=challenge.pk).update(consumed_at=timezone.now())
    return Response(
        {
            "request_id": str(challenge.request_id),
            "expires_in": 300,
            "email_sent": True,
        },
        status=201,
    )


def consume_challenge(request, purpose):
    request_id = request.data.get("request_id")
    code = str(request.data.get("code", "")).strip()
    if not request_id or not (len(code) == 6 and code.isdigit()):
        return None
    try:
        request_id = uuid.UUID(str(request_id))
    except (TypeError, ValueError, AttributeError):
        return None
    challenge = (
        EmailOTPChallenge.objects.select_for_update()
        .filter(request_id=request_id, purpose=purpose, consumed_at__isnull=True)
        .first()
    )
    if (
        not challenge
        or challenge.expires_at <= timezone.now()
        or challenge.attempts >= 5
    ):
        return None
    challenge.attempts += 1
    challenge.save(update_fields=["attempts"])
    if not check_password(code, challenge.code_hash):
        return None
    return challenge


class RequestEmailOTPView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [OTPRequestThrottle]

    def post(self, request):
        if not channel_allowed("email"):
            return Response({"detail": "Connexion email désactivée."}, status=503)
        try:
            email = clean_email(request.data.get("email"))
            phone = normalize_phone(request.data.get("phone"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)

        # An arbitrary email must never claim an existing telephone account.
        by_phone = User.objects.filter(phone=phone).first()
        by_email = User.objects.filter(email__iexact=email).first()
        if (by_phone and by_phone.email.lower() != email) or (
            by_email and by_email.phone != phone
        ):
            return Response(
                {"detail": "Ces coordonnées ne peuvent pas être utilisées ensemble."},
                status=409,
            )
        if by_phone and not by_phone.is_active:
            return Response({"detail": "Connexion indisponible."}, status=403)
        return send_challenge(email=email, phone=phone, purpose="login")


class VerifyEmailOTPView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [OTPVerifyThrottle]

    @transaction.atomic
    def post(self, request):
        if not channel_allowed("email"):
            return Response({"detail": "Connexion email désactivée."}, status=503)
        challenge = consume_challenge(request, "login")
        if not challenge:
            return Response(
                {"detail": "Code invalide, expiré ou déjà utilisé."}, status=400
            )

        # Never permit a mail address to take over a phone already in the DB.
        user = User.objects.select_for_update().filter(phone=challenge.phone).first()
        linked = (
            User.objects.select_for_update()
            .filter(email__iexact=challenge.email)
            .first()
        )
        if (
            (user and user.email.lower() != challenge.email)
            or (linked and linked.phone != challenge.phone)
            or (user and not user.is_active)
        ):
            return Response(
                {"detail": "Association des coordonnées impossible."}, status=409
            )

        if user is None:
            try:
                # Nested atomic savepoint avoids poisoning the transaction on a race.
                with transaction.atomic():
                    user = User.objects.create_user(
                        email=challenge.email,
                        phone=challenge.phone,
                        display_name=str(
                            request.data.get("display_name") or "Joueur MDG"
                        )[:50],
                    )
            except IntegrityError:
                return Response({"detail": "Compte indisponible."}, status=409)
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at"])
        challenge.consumed_at = timezone.now()
        challenge.save(update_fields=["consumed_at"])
        account, _, _ = credit_simulation_bonus(user)
        return Response(
            {
                "user": {
                    "id": str(user.pk),
                    "display_name": user.display_name,
                    "phone": user.phone,
                    "email": user.email,
                    "email_verified": True,
                    "xp": user.xp,
                    "level": user.level,
                    "is_staff": user.is_staff,
                },
                "wallet": {
                    "balance": account.balance,
                    "currency": account.currency_code,
                },
                "access": encode_token(user),
                "refresh": encode_token(user, "refresh", 60 * 60 * 24 * 30),
            }
        )


class RequestEmailBindingView(APIView):
    """Existing phone/guest accounts can verify an address from an auth session."""

    throttle_classes = [OTPRequestThrottle]

    def post(self, request):
        if not channel_allowed("email"):
            return Response({"detail": "Service email désactivé."}, status=503)
        user = request.user
        if user.email_verified_at is not None:
            return Response(
                {"detail": "Changement d'email vérifié réservé au support sécurisé."},
                status=403,
            )
        try:
            email = clean_email(request.data.get("email"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
            return Response({"detail": "Adresse non disponible."}, status=409)
        return send_challenge(email=email, user=user, purpose="bind")


class VerifyEmailBindingView(APIView):
    throttle_classes = [OTPVerifyThrottle]

    @transaction.atomic
    def post(self, request):
        if not channel_allowed("email"):
            return Response({"detail": "Service email désactivé."}, status=503)
        challenge = consume_challenge(request, "bind")
        if not challenge or challenge.user_id != request.user.pk:
            return Response(
                {"detail": "Code invalide, expiré ou déjà utilisé."}, status=400
            )
        user = User.objects.select_for_update().get(pk=request.user.pk)
        if user.email_verified_at is not None:
            return Response({"detail": "Adresse déjà vérifiée."}, status=409)
        if (
            User.objects.filter(email__iexact=challenge.email)
            .exclude(pk=user.pk)
            .exists()
        ):
            return Response({"detail": "Adresse non disponible."}, status=409)
        user.email = challenge.email
        user.email_verified_at = timezone.now()
        try:
            with transaction.atomic():
                user.save(update_fields=["email", "email_verified_at"])
        except IntegrityError:
            return Response({"detail": "Adresse non disponible."}, status=409)
        challenge.consumed_at = timezone.now()
        challenge.save(update_fields=["consumed_at"])
        return Response({"email": user.email, "email_verified": True})
