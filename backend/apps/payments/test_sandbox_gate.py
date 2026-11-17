"""Real-money mode cannot be enabled by user input or a direct service call."""

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.payments.models import PaymentIntent
from apps.payments.services import initiate_payment_intent, settle_payment_intent
from apps.wallet.models import LedgerAccount


class PaymentSandboxGateTests(TestCase):
    def setUp(self):
        self.player = User.objects.create_user(
            email="sandbox-gate@mdg.local",
            phone="+261340000351",
            display_name="Player",
            kyc_level="verified",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.player)

    def test_api_rejects_explicit_live_mode_even_if_provider_configured(self):
        body = {
            "provider": "mvola",
            "direction": "deposit",
            "amount": 1000,
            "idempotency_key": "payment-live-attempt-001",
            "sandbox": False,
        }
        response = self.client.post(
            "/api/v1/payments/intents/", body, format="json"
        )
        self.assertEqual(response.status_code, 503)
        self.assertIn("désactivés", response.data["detail"])
        self.assertEqual(PaymentIntent.objects.count(), 0)
        self.assertEqual(LedgerAccount.objects.count(), 0)

        body["sandbox"] = "false"
        body["idempotency_key"] = "payment-live-attempt-002"
        bad_string = self.client.post(
            "/api/v1/payments/intents/", body, format="json"
        )
        self.assertEqual(bad_string.status_code, 503)
        self.assertFalse(PaymentIntent.objects.exists())

    def test_direct_service_rejects_live_mode_before_any_mutations(self):
        with self.assertRaises(ValidationError):
            initiate_payment_intent(
                self.player,
                provider="mvola",
                direction="deposit",
                amount=1000,
                phone_number=self.player.phone,
                idempotency_key="payment-direct-live-blocked",
                sandbox=False,
            )
        self.assertFalse(PaymentIntent.objects.exists())
        self.assertFalse(LedgerAccount.objects.exists())

    def test_sandbox_intents_are_explicitly_marked_as_simulated(self):
        response = self.client.post(
            "/api/v1/payments/intents/",
            {
                "provider": "mvola",
                "direction": "deposit",
                "amount": 1000,
                "idempotency_key": "payment-sandbox-accepted",
                "sandbox": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["sandbox"])
        intent = PaymentIntent.objects.get(pk=response.data["id"])
        self.assertIs(intent.metadata["sandbox"], True)
        self.assertTrue(intent.metadata["adapter_response"]["simulation"])

    @override_settings(
        DEBUG=False,
        PAYMENT_SANDBOX_WEBHOOKS_ENABLED=False,
        PAYMENT_WEBHOOK_SECRET="test-secret-with-appropriate-length-123456",
    )
    def test_production_webhook_is_disabled_without_explicit_sandbox_opt_in(self):
        import hashlib
        import hmac
        import json

        payload = {"event_id": "sandbox-disabled", "event_type": "payment.succeeded"}
        body = json.dumps(payload).encode()
        secret = "test-secret-with-appropriate-length-123456"
        signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        response = APIClient().post(
            "/api/v1/payments/webhooks/mvola/",
            data=body,
            content_type="application/json",
            HTTP_X_WEBHOOK_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, 503)

    @override_settings(DEBUG=False)
    def test_unclassified_old_intent_cannot_settle_on_deployed_server(self):
        intent = PaymentIntent.objects.create(
            user=self.player,
            direction="deposit",
            provider="mvola",
            amount=12000,
            idempotency_key="legacy-unclassified-intent",
            status="processing",
        )
        with self.assertRaises(ValidationError):
            settle_payment_intent(intent, success=True)
        self.assertFalse(LedgerAccount.objects.exists())
        intent.refresh_from_db()
        self.assertEqual(intent.status, "processing")
