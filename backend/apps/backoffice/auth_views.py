"""Staff control plane for player login channels (TOTP step-up required)."""

from django.db import transaction
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_policy import channel_capabilities, channel_mode, sms_configured, smtp_configured
from .models import AuthChannelPolicy
from .services import record_audit


class BackofficeAuthChannelsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        record = AuthChannelPolicy.objects.filter(pk=1).first()
        return Response(
            {
                "mode": record.mode if record else channel_mode(),
                "revision": record.revision if record else 0,
                "reason": record.reason if record else "",
                "updated_at": record.updated_at.isoformat() if record else None,
                "providers": {
                    "email": {"configured": smtp_configured()},
                    "sms": {"configured": sms_configured()},
                },
                "capabilities": channel_capabilities(),
                "can_update": bool(
                    request.user.is_superuser
                    and TOTPDevice.objects.filter(
                        user=request.user, confirmed=True
                    ).exists()
                ),
            }
        )

    @transaction.atomic
    def patch(self, request):
        if not request.user.is_superuser or not request.user.is_active:
            return Response({"detail": "Droit super-administrateur requis."}, status=403)
        mode = request.data.get("mode")
        reason = request.data.get("reason")
        revision = request.data.get("revision")
        code = request.data.get("mfa_code")
        if mode not in dict(AuthChannelPolicy.MODES):
            return Response({"detail": "Politique de connexion invalide."}, status=400)
        if not isinstance(reason, str) or not (10 <= len(reason.strip()) <= 255):
            return Response({"detail": "Justification requise (10 à 255 caractères)."}, status=400)
        if type(revision) is not int or revision < 0:
            return Response({"detail": "Révision invalide."}, status=400)
        if not TOTPDevice.objects.filter(
            user=request.user, confirmed=True
        ).exists():
            return Response({"detail": "Appareil MFA requis."}, status=403)

        record, _ = AuthChannelPolicy.objects.select_for_update().get_or_create(
            pk=1,
            defaults={"mode": "both", "revision": 0},
        )
        if record.revision != revision:
            return Response(
                {"detail": "Politique modifiée entre-temps.", "revision": record.revision},
                status=409,
            )
        token = str(code or "").strip()
        if len(token) != 6 or not token.isdigit():
            return Response({"detail": "Code MFA TOTP à six chiffres requis."}, status=403)
        devices = (
            TOTPDevice.objects.select_for_update()
            .filter(user=request.user, confirmed=True)
            .order_by("pk")
        )
        if not any(device.verify_token(token) for device in devices):
            return Response({"detail": "Vérification MFA refusée."}, status=403)

        old_mode = record.mode
        record.mode = mode
        record.reason = reason.strip()
        record.revision += 1
        record.updated_by = request.user
        record.save(update_fields=["mode", "reason", "revision", "updated_by", "updated_at"])
        record_audit(
            request.user,
            "auth.channels.updated",
            record,
            {
                "before": old_mode,
                "after": mode,
                "revision": record.revision,
                "reason": record.reason,
            },
        )
        return Response(
            {
                "mode": record.mode,
                "revision": record.revision,
                "reason": record.reason,
                "capabilities": channel_capabilities(),
            }
        )
