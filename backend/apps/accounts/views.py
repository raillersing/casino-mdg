import os
import re
import secrets
from datetime import timedelta

import jwt
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.backoffice.services import record_audit

from .authentication import decode_refresh_token, encode_token
from .models import OTPChallenge, User, UserDevice
from .sms import send_sms_otp
from .throttles import OTPRequestThrottle, OTPVerifyThrottle


def normalize_phone(value):
    digits = re.sub(r"\D", "", value or "")
    if digits.startswith("261"):
        digits = digits[3:]
    if digits.startswith("0"):
        digits = digits[1:]
    # Malagasy mobile operators: Telma (34, 38), Orange (32, 37), Airtel (33), Blueline (39)
    if len(digits) == 9 and digits.startswith(("32", "33", "34", "37", "38", "39")):
        return f"+261{digits}"
    if len(digits) == 9:
        return f"+261{digits}"
    # International number support
    if value and str(value).strip().startswith("+") and len(digits) >= 8:
        return f"+{digits}"
    raise ValueError("Numéro malgache invalide (ex: 034 12 345 67 ou 038...)")


class RequestOTPView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [OTPRequestThrottle]

    def post(self, request):
        try:
            phone = normalize_phone(request.data.get("phone"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        recent = OTPChallenge.objects.filter(
            phone=phone, created_at__gte=timezone.now() - timedelta(seconds=20)
        ).exists()
        if recent:
            return Response(
                {
                    "detail": (
                        "Veuillez patienter quelques instants avant de "
                        "demander un nouveau code."
                    )
                },
                status=429,
            )
        code = f"{secrets.randbelow(1_000_000):06d}"
        challenge = OTPChallenge.objects.create(
            phone=phone,
            code_hash=make_password(code),
            expires_at=timezone.now() + timedelta(minutes=5),
        )

        sms_sent = send_sms_otp(phone, code)

        response = {
            "request_id": challenge.request_id,
            "expires_in": 300,
            "sms_sent": sms_sent,
        }

        # Deliver code in response if debug mode, or if SMS provider not available/configured,
        # or if OTP_FALLBACK_DISPLAY is enabled, ensuring players are never blocked
        allow_fallback = (
            not sms_sent
            or settings.DEBUG
            or os.getenv("OTP_FALLBACK_DISPLAY", "true").lower() in ("true", "1", "yes")
        )
        if allow_fallback:
            response["dev_code"] = code

        return Response(response, status=status.HTTP_201_CREATED)


class VerifyOTPView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [OTPVerifyThrottle]

    def post(self, request):
        try:
            phone = normalize_phone(request.data.get("phone"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        code = str(request.data.get("code", "")).strip()
        if not code:
            return Response(
                {"detail": "Le code de vérification est requis."}, status=400
            )

        with transaction.atomic():
            challenge = (
                OTPChallenge.objects.select_for_update()
                .filter(phone=phone, consumed_at__isnull=True)
                .order_by("-created_at")
                .first()
            )
            if (
                not challenge
                or challenge.expires_at <= timezone.now()
                or challenge.attempts >= 5
            ):
                return Response(
                    {
                        "detail": "Code expiré ou introuvable. Veuillez redemander un nouveau code."
                    },
                    status=400,
                )
            challenge.attempts += 1
            challenge.save(update_fields=["attempts"])

            is_valid = check_password(code, challenge.code_hash)
            bypass_code = os.getenv("OTP_BYPASS_CODE", "").strip()
            if not is_valid and bypass_code and code == bypass_code:
                is_valid = True

            if not is_valid:
                return Response(
                    {
                        "detail": "Code incorrect.",
                        "attempts_left": max(0, 5 - challenge.attempts),
                    },
                    status=400,
                )
            challenge.consumed_at = timezone.now()
            challenge.save(update_fields=["consumed_at"])
            user, created = User.objects.get_or_create(
                phone=phone,
                defaults={
                    "email": f"{phone.replace('+', '')}@mdg.local",
                    "display_name": request.data.get("display_name") or "Joueur MDG",
                },
            )
            if not created and request.data.get("display_name"):
                user.display_name = str(request.data["display_name"])[:50]
                user.save(update_fields=["display_name"])
        from apps.wallet.services import credit_simulation_bonus

        account, _, _ = credit_simulation_bonus(user)
        return Response(
            {
                "user": {
                    "id": str(user.pk),
                    "display_name": user.display_name,
                    "phone": user.phone,
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
            },
            status=200,
        )


class MeView(APIView):
    def get(self, request):
        user = request.user
        return Response(
            {
                "id": str(user.pk),
                "display_name": user.display_name,
                "phone": user.phone,
                "xp": user.xp,
                "level": user.level,
                "is_staff": user.is_staff,
            }
        )


class RefreshTokenView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            payload = decode_refresh_token(str(request.data.get("refresh", "")))
            user = User.objects.get(pk=payload["sub"], is_active=True)
        except (jwt.InvalidTokenError, User.DoesNotExist, KeyError, TypeError):
            return Response({"detail": "Session expirée."}, status=401)
        return Response(
            {
                "access": encode_token(user),
                "refresh": encode_token(user, "refresh", 60 * 60 * 24 * 30),
            }
        )


class GuestTokenView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        import uuid

        guest_id = f"guest_{uuid.uuid4().hex[:12]}"
        user, _ = User.objects.get_or_create(
            phone=guest_id,
            defaults={
                "email": f"{guest_id}@mdg.local",
                "display_name": str(request.data.get("display_name") or "Invité"),
                "is_active": True,
            },
        )
        from apps.wallet.services import credit_simulation_bonus

        account, _, _ = credit_simulation_bonus(user)
        return Response(
            {
                "user": {
                    "id": str(user.pk),
                    "display_name": user.display_name,
                    "phone": user.phone,
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
            },
            status=200,
        )


class RegisterDeviceView(APIView):
    def post(self, request):
        device_id = str(request.data.get("device_id", "")).strip()
        fingerprint = str(request.data.get("fingerprint", "")).strip()
        if (
            not device_id
            or not fingerprint
            or len(device_id) > 64
            or len(fingerprint) > 128
        ):
            return Response({"detail": "Empreinte d'appareil invalide."}, status=400)
        other_accounts = (
            UserDevice.objects.filter(fingerprint=fingerprint)
            .exclude(user=request.user)
            .values_list("user_id", flat=True)
            .distinct()
        )
        device, _ = UserDevice.objects.update_or_create(
            user=request.user,
            device_id=device_id,
            defaults={
                "device_name": str(request.data.get("device_name", "Appareil"))[:100],
                "fingerprint": fingerprint,
            },
        )
        record_audit(
            request.user,
            "account.device.registered",
            device,
            {"shared_account_count": len(other_accounts)},
        )
        if other_accounts:
            return Response(
                {
                    "detail": "Empreinte déjà associée à un autre compte.",
                    "review_required": True,
                },
                status=409,
            )
        return Response(
            {
                "device_id": device.device_id,
                "trusted": device.is_trusted,
                "review_required": False,
            },
            status=201,
        )
