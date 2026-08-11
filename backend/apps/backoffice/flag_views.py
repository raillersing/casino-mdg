import uuid

from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FeatureFlag
from apps.social.models import ChatMessage
from apps.payments.models import PaymentIntent, WebhookInboxEvent
from .services import record_audit


class FeatureFlagView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response({"results": [{"key": item.key, "enabled": item.enabled, "reason": item.reason, "updated_at": item.updated_at.isoformat()} for item in FeatureFlag.objects.all()]})

    def post(self, request):
        key = str(request.data.get("key", "")).strip()
        if not key or len(key) > 80: return Response({"detail": "Clé de feature flag invalide."}, status=400)
        flag, _ = FeatureFlag.objects.update_or_create(key=key, defaults={"enabled": bool(request.data.get("enabled", True)), "reason": str(request.data.get("reason", ""))[:255], "updated_by": request.user})
        return Response({"key": flag.key, "enabled": flag.enabled, "reason": flag.reason}, status=200)


class ChatModerationView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        messages = ChatMessage.objects.filter(is_hidden=False).select_related("author", "table")[:100]
        return Response({"results": [{"id": item.pk, "table_id": str(item.table_id), "author": item.author.display_name, "body": item.body, "created_at": item.created_at.isoformat()} for item in messages]})

    def post(self, request):
        try: message = ChatMessage.objects.get(pk=request.data["message_id"])
        except (KeyError, ChatMessage.DoesNotExist, TypeError, ValueError): return Response({"detail": "Message introuvable."}, status=404)
        message.is_hidden = True; message.save(update_fields=["is_hidden"])
        record_audit(request.user, "chat.message.hidden", message, {"reason": str(request.data.get("reason", "staff moderation"))[:255]})
        return Response({"id": message.pk, "hidden": True})


class PaymentReconciliationView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        events = WebhookInboxEvent.objects.all()
        unmatched = []
        for event in events:
            intent_id = event.payload.get("intent_id") if isinstance(event.payload, dict) else None
            if intent_id:
                try: valid_intent_id = uuid.UUID(str(intent_id))
                except (TypeError, ValueError): valid_intent_id = None
                if not valid_intent_id or not PaymentIntent.objects.filter(pk=valid_intent_id, provider=event.provider).exists(): unmatched.append(str(event.id))
        return Response({"sandbox": True, "intents_pending": PaymentIntent.objects.filter(status__in=["pending", "processing"]).count(), "intents_completed": PaymentIntent.objects.filter(status="completed").count(), "webhooks_received": events.count(), "webhooks_processed": events.filter(status="processed").count(), "unmatched_webhooks": unmatched})
