"""Real-money mode cannot be enabled by user input or a direct service call."""

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.payments.models import PaymentIntent
from apps.payments.services import initiate_payment_intent
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
