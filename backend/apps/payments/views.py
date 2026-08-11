import hashlib
import hmac

from django.conf import settings
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PaymentIntent, WebhookInboxEvent


class PaymentWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, provider):
        if provider not in dict(WebhookInboxEvent.PROVIDERS): return Response({"detail": "Opérateur inconnu."}, status=404)
        signature = request.headers.get("X-Webhook-Signature", "")
        expected = hmac.new(settings.PAYMENT_WEBHOOK_SECRET.encode(), request.body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected): return Response({"detail": "Signature invalide."}, status=401)
        event_id = str(request.data.get("event_id", "")).strip(); event_type = str(request.data.get("event_type", "")).strip()
        if not event_id or not event_type: return Response({"detail": "Événement webhook invalide."}, status=400)
        event, created = WebhookInboxEvent.objects.get_or_create(provider=provider, event_id=event_id, defaults={"event_type": event_type, "payload": request.data, "status": "received"})
        return Response({"event_id": event.event_id, "status": event.status, "duplicate": not created}, status=201 if created else 200)


class PaymentIntentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        intents = PaymentIntent.objects.filter(user=request.user)[:50]
        return Response({"results": [{"id": str(item.id), "provider": item.provider, "direction": item.direction, "amount": item.amount, "currency": item.currency, "status": item.status, "idempotency_key": item.idempotency_key} for item in intents]})

    def post(self, request):
        provider = str(request.data.get("provider", "")); direction = str(request.data.get("direction", "")); key = str(request.data.get("idempotency_key", "")).strip()
        try: amount = int(request.data.get("amount", 0))
        except (TypeError, ValueError): amount = 0
        if provider not in dict(WebhookInboxEvent.PROVIDERS) or direction not in dict(PaymentIntent.DIRECTIONS) or amount <= 0 or not key or len(key) > 160:
            return Response({"detail": "Intent de paiement invalide."}, status=400)
        intent, created = PaymentIntent.objects.get_or_create(idempotency_key=key, defaults={"user": request.user, "provider": provider, "direction": direction, "amount": amount})
        if not created and intent.user_id != request.user.pk: return Response({"detail": "Clé d'idempotence déjà utilisée."}, status=409)
        return Response({"id": str(intent.id), "status": intent.status, "duplicate": not created, "sandbox": True}, status=201 if created else 200)
