import hashlib
import hmac
import json

from django.conf import settings
from django.test import TestCase
from rest_framework.test import APIClient

from apps.payments.models import WebhookInboxEvent


class PaymentWebhookTests(TestCase):
    def test_webhook_is_authenticated_and_idempotent(self):
        client = APIClient(); payload = {"event_id": "evt-001", "event_type": "payment.succeeded", "amount": 100}; body = json.dumps(payload, separators=(",", ":")).encode(); signature = hmac.new(settings.PAYMENT_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
        first = client.post("/api/v1/payments/webhooks/mvola/", payload, format="json", HTTP_X_WEBHOOK_SIGNATURE=signature)
        second = client.post("/api/v1/payments/webhooks/mvola/", payload, format="json", HTTP_X_WEBHOOK_SIGNATURE=signature)
        self.assertEqual(first.status_code, 201); self.assertEqual(second.status_code, 200); self.assertTrue(second.data["duplicate"]); self.assertEqual(WebhookInboxEvent.objects.count(), 1)

    def test_invalid_signature_is_rejected(self):
        response = APIClient().post("/api/v1/payments/webhooks/orange/", {"event_id": "evt-002", "event_type": "payment.failed"}, format="json", HTTP_X_WEBHOOK_SIGNATURE="bad")
        self.assertEqual(response.status_code, 401)
