import hashlib
import hmac

from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import WebhookInboxEvent


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
