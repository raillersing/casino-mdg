import uuid

from django.db import transaction
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.payments.models import PaymentIntent, WebhookInboxEvent
from apps.social.models import ChatMessage

from .models import FeatureFlag
from .rbac import BackofficeCapabilityPermission
from .services import record_audit


class FeatureFlagView(APIView):
    permission_classes = [BackofficeCapabilityPermission]
    capability_by_method = {"GET": "flags.read", "POST": "flags.write"}

    def get(self, request):
        can_update = bool(
            request.user.is_active
            and request.user.is_superuser
            and TOTPDevice.objects.filter(user=request.user, confirmed=True).exists()
        )
        return Response(
            {
                "can_update": can_update,
                "results": [
                    {
                        "key": item.key,
                        "enabled": item.enabled,
                        "reason": item.reason,
                        "updated_at": item.updated_at.isoformat(),
                    }
                    for item in FeatureFlag.objects.all().order_by("key")
                ],
            }
        )

    @transaction.atomic
    def post(self, request):
        if not request.user.is_active or not request.user.is_superuser:
            return Response({"detail": "Super-administrateur requis."}, status=403)
        key = request.data.get("key")
        enabled = request.data.get("enabled")
        reason = request.data.get("reason")
        expected_timestamp = request.data.get("expected_updated_at")
        mfa_code = str(request.data.get("mfa_code") or "").strip()

        if not isinstance(key, str) or not key.strip() or len(key.strip()) > 80:
            return Response({"detail": "Clé du paramètre invalide."}, status=400)
        if type(enabled) is not bool:
            return Response({"detail": "État booléen requis."}, status=400)
        if not isinstance(reason, str) or not 10 <= len(reason.strip()) <= 255:
            return Response(
                {"detail": "Justification obligatoire (10 à 255 caractères)."},
                status=400,
            )
        if not isinstance(expected_timestamp, str) or not expected_timestamp:
            return Response({"detail": "Version du paramètre requise."}, status=400)
        if len(mfa_code) != 6 or not mfa_code.isdigit():
            return Response({"detail": "Code TOTP requis."}, status=403)

        flag = FeatureFlag.objects.select_for_update().filter(key=key.strip()).first()
        if flag is None:
            return Response(
                {"detail": "Paramètre inexistant. Création non autorisée."},
                status=404,
            )
        if flag.updated_at.isoformat() != expected_timestamp:
            return Response(
                {"detail": "Paramètre modifié depuis votre dernière consultation."},
                status=409,
            )
        if flag.enabled is enabled:
            return Response({"detail": "Aucun changement à appliquer."}, status=409)

        devices = (
            TOTPDevice.objects.select_for_update()
            .filter(user=request.user, confirmed=True)
            .order_by("pk")
        )
        if not any(device.verify_token(mfa_code) for device in devices):
            return Response(
                {"detail": "Seconde vérification TOTP refusée."},
                status=403,
            )

        previous = flag.enabled
        flag.enabled = enabled
        flag.reason = reason.strip()
        flag.updated_by = request.user
        flag.save(update_fields=["enabled", "reason", "updated_by", "updated_at"])
        record_audit(
            request.user,
            "feature_flag.updated",
            flag,
            {
                "before": previous,
                "after": flag.enabled,
                "reason": flag.reason,
            },
        )
        return Response(
            {
                "key": flag.key,
                "enabled": flag.enabled,
                "reason": flag.reason,
                "updated_at": flag.updated_at.isoformat(),
            }
        )


class ChatModerationView(APIView):
    permission_classes = [BackofficeCapabilityPermission]
    capability_by_method = {"GET": "chat.read", "POST": "chat.moderate"}

    def get(self, request):
        messages = ChatMessage.objects.select_related("author", "table")[:100]
        return Response(
            {
                "results": [
                    {
                        "id": item.pk,
                        "table_id": str(item.table_id),
                        "author": item.author.display_name,
                        "body": item.body,
                        "hidden": item.is_hidden,
                        "created_at": item.created_at.isoformat(),
                    }
                    for item in messages
                ]
            }
        )

    def post(self, request):
        try:
            message = ChatMessage.objects.get(pk=request.data["message_id"])
        except (KeyError, ChatMessage.DoesNotExist, TypeError, ValueError):
            return Response({"detail": "Message introuvable."}, status=404)
        hidden = request.data.get("hidden", True)
        if not isinstance(hidden, bool):
            return Response({"detail": "État de modération invalide."}, status=400)
        previous = message.is_hidden
        message.is_hidden = hidden
        message.save(update_fields=["is_hidden"])
        record_audit(
            request.user,
            "chat.message.hidden" if hidden else "chat.message.restored",
            message,
            {
                "from": previous,
                "to": hidden,
                "reason": str(request.data.get("reason", "staff moderation"))[:255],
            },
        )
        return Response({"id": message.pk, "hidden": hidden})


class PaymentReconciliationView(APIView):
    permission_classes = [BackofficeCapabilityPermission]
    capability_by_method = {"GET": "finance.reconcile"}

    def get(self, request):
        events = WebhookInboxEvent.objects.all()
        unmatched = []
        for event in events:
            intent_id = (
                event.payload.get("intent_id")
                if isinstance(event.payload, dict)
                else None
            )
            if intent_id:
                try:
                    valid_intent_id = uuid.UUID(str(intent_id))
                except (TypeError, ValueError):
                    valid_intent_id = None
                if (
                    not valid_intent_id
                    or not PaymentIntent.objects.filter(
                        pk=valid_intent_id, provider=event.provider
                    ).exists()
                ):
                    unmatched.append(str(event.id))
        return Response(
            {
                "sandbox": True,
                "intents_pending": PaymentIntent.objects.filter(
                    status__in=["pending", "processing"]
                ).count(),
                "intents_completed": PaymentIntent.objects.filter(
                    status="completed"
                ).count(),
                "webhooks_received": events.count(),
                "webhooks_processed": events.filter(status="processed").count(),
                "unmatched_webhooks": unmatched,
            }
        )
