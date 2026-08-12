import hashlib
import hmac
import json

from django.conf import settings
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.payments.models import PaymentIntent, WebhookInboxEvent


class PaymentWebhookTests(TestCase):
    def test_webhook_is_authenticated_and_idempotent(self):
        client = APIClient()
        payload = {
            "event_id": "evt-001",
            "event_type": "payment.succeeded",
            "amount": 100,
        }
        body = json.dumps(payload, separators=(",", ":")).encode()
        signature = hmac.new(
            settings.PAYMENT_WEBHOOK_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()
        first = client.post(
            "/api/v1/payments/webhooks/mvola/",
            payload,
            format="json",
            HTTP_X_WEBHOOK_SIGNATURE=signature,
        )
        second = client.post(
            "/api/v1/payments/webhooks/mvola/",
            payload,
            format="json",
            HTTP_X_WEBHOOK_SIGNATURE=signature,
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.data["duplicate"])
        self.assertEqual(WebhookInboxEvent.objects.count(), 1)

    def test_invalid_signature_is_rejected(self):
        response = APIClient().post(
            "/api/v1/payments/webhooks/orange/",
            {"event_id": "evt-002", "event_type": "payment.failed"},
            format="json",
            HTTP_X_WEBHOOK_SIGNATURE="bad",
        )
        self.assertEqual(response.status_code, 401)

    def test_reused_event_id_with_different_payload_is_rejected(self):
        client = APIClient()
        first_payload = {
            "event_id": "evt-conflict",
            "event_type": "payment.succeeded",
            "amount": 100,
        }
        first_body = json.dumps(first_payload, separators=(",", ":")).encode()
        first_signature = hmac.new(
            settings.PAYMENT_WEBHOOK_SECRET.encode(), first_body, hashlib.sha256
        ).hexdigest()
        self.assertEqual(
            client.post(
                "/api/v1/payments/webhooks/mvola/",
                first_payload,
                format="json",
                HTTP_X_WEBHOOK_SIGNATURE=first_signature,
            ).status_code,
            201,
        )
        second_payload = {**first_payload, "amount": 999}
        second_body = json.dumps(second_payload, separators=(",", ":")).encode()
        second_signature = hmac.new(
            settings.PAYMENT_WEBHOOK_SECRET.encode(), second_body, hashlib.sha256
        ).hexdigest()

        response = client.post(
            "/api/v1/payments/webhooks/mvola/",
            second_payload,
            format="json",
            HTTP_X_WEBHOOK_SIGNATURE=second_signature,
        )

        self.assertEqual(response.status_code, 409)

    def test_payment_intent_is_idempotent_and_sandbox_only(self):
        user = User.objects.create_user(
            email="payment@mdg.local", phone="+261340000022", display_name="Payment"
        )
        client = APIClient()
        client.force_authenticate(user)
        payload = {
            "provider": "mvola",
            "direction": "deposit",
            "amount": 5000,
            "idempotency_key": "deposit-001",
        }
        first = client.post("/api/v1/payments/intents/", payload, format="json")
        second = client.post("/api/v1/payments/intents/", payload, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.data["duplicate"])
        self.assertTrue(first.data["sandbox"])
        self.assertEqual(PaymentIntent.objects.count(), 1)

    def test_signed_callback_updates_intent_without_touching_wallet(self):
        from apps.accounts.models import User

        user = User.objects.create_user(
            email="callback@mdg.local", phone="+261340000023", display_name="Callback"
        )
        client = APIClient()
        client.force_authenticate(user)
        intent = client.post(
            "/api/v1/payments/intents/",
            {
                "provider": "orange",
                "direction": "deposit",
                "amount": 7500,
                "idempotency_key": "deposit-callback",
            },
            format="json",
        ).data
        client.force_authenticate(None)
        payload = {
            "event_id": "evt-callback",
            "event_type": "payment.succeeded",
            "intent_id": intent["id"],
        }
        body = json.dumps(payload, separators=(",", ":")).encode()
        signature = hmac.new(
            settings.PAYMENT_WEBHOOK_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()
        response = client.post(
            "/api/v1/payments/webhooks/orange/",
            payload,
            format="json",
            HTTP_X_WEBHOOK_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(PaymentIntent.objects.get(pk=intent["id"]).status, "completed")
