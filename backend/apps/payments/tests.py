import hashlib
import hmac
import json

from django.conf import settings
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.payments.models import PaymentIntent, WebhookInboxEvent
from apps.wallet.models import LedgerAccount, WalletTransaction


class PaymentWebhookTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="payment@mdg.local",
            phone="+261340000022",
            display_name="Joueur MGA",
            kyc_level="verified",
        )
        self.client = APIClient()

    def test_webhook_is_authenticated_and_idempotent(self):
        payload = {
            "event_id": "evt-001",
            "event_type": "payment.succeeded",
            "amount": 10000,
        }
        body = json.dumps(payload, separators=(",", ":")).encode()
        signature = hmac.new(
            settings.PAYMENT_WEBHOOK_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()
        first = self.client.post(
            "/api/v1/payments/webhooks/mvola/",
            data=body,
            content_type="application/json",
            HTTP_X_WEBHOOK_SIGNATURE=signature,
        )
        second = self.client.post(
            "/api/v1/payments/webhooks/mvola/",
            data=body,
            content_type="application/json",
            HTTP_X_WEBHOOK_SIGNATURE=signature,
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.data["duplicate"])
        self.assertEqual(WebhookInboxEvent.objects.count(), 1)

    def test_invalid_signature_is_rejected(self):
        response = self.client.post(
            "/api/v1/payments/webhooks/orange/",
            {"event_id": "evt-002", "event_type": "payment.failed"},
            format="json",
            HTTP_X_WEBHOOK_SIGNATURE="bad-signature",
        )
        self.assertEqual(response.status_code, 401)

    def test_reused_event_id_with_different_payload_is_rejected(self):
        first_payload = {
            "event_id": "evt-conflict",
            "event_type": "payment.succeeded",
            "amount": 10000,
        }
        first_body = json.dumps(first_payload, separators=(",", ":")).encode()
        first_signature = hmac.new(
            settings.PAYMENT_WEBHOOK_SECRET.encode(), first_body, hashlib.sha256
        ).hexdigest()
        self.assertEqual(
            self.client.post(
                "/api/v1/payments/webhooks/mvola/",
                data=first_body,
                content_type="application/json",
                HTTP_X_WEBHOOK_SIGNATURE=first_signature,
            ).status_code,
            201,
        )
        second_payload = {**first_payload, "amount": 99999}
        second_body = json.dumps(second_payload, separators=(",", ":")).encode()
        second_signature = hmac.new(
            settings.PAYMENT_WEBHOOK_SECRET.encode(), second_body, hashlib.sha256
        ).hexdigest()

        response = self.client.post(
            "/api/v1/payments/webhooks/mvola/",
            data=second_body,
            content_type="application/json",
            HTTP_X_WEBHOOK_SIGNATURE=second_signature,
        )
        self.assertEqual(response.status_code, 409)

    def test_deposit_lifecycle_and_ledger_settlement(self):
        self.client.force_authenticate(self.user)
        # 1. Initié le dépôt
        init_res = self.client.post(
            "/api/v1/payments/intents/",
            {
                "provider": "mvola",
                "direction": "deposit",
                "amount": 25000,
                "phone_number": "0340000022",
                "idempotency_key": "dep-lifecycle-001",
            },
            format="json",
        )
        self.assertEqual(init_res.status_code, 201)
        intent_id = init_res.data["id"]

        # 2. Webhook de confirmation opérateur
        self.client.force_authenticate(None)
        payload = {
            "event_id": "evt-dep-success-01",
            "event_type": "payment.succeeded",
            "intent_id": intent_id,
        }
        body = json.dumps(payload, separators=(",", ":")).encode()
        signature = hmac.new(
            settings.PAYMENT_WEBHOOK_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()

        wh_res = self.client.post(
            "/api/v1/payments/webhooks/mvola/",
            data=body,
            content_type="application/json",
            HTTP_X_WEBHOOK_SIGNATURE=signature,
        )
        self.assertEqual(wh_res.status_code, 201)

        # 3. Vérifier le solde MGA du joueur et la transaction
        player_mga = LedgerAccount.objects.get(user=self.user, currency_code="MGA")
        self.assertEqual(player_mga.balance, 25000)

        intent = PaymentIntent.objects.get(id=intent_id)
        self.assertEqual(intent.status, "completed")
        self.assertEqual(WalletTransaction.objects.filter(currency_code="MGA", type="deposit").count(), 1)

    def test_withdrawal_lifecycle_with_held_balance_and_refund(self):
        # Créditer initialement le solde MGA
        player_mga, _ = LedgerAccount.objects.get_or_create(
            user=self.user, account_type="player", currency_code="MGA", defaults={"balance": 50000}
        )
        player_mga.balance = 50000
        player_mga.save()

        self.client.force_authenticate(self.user)
        # 1. Demande de retrait
        init_res = self.client.post(
            "/api/v1/payments/intents/",
            {
                "provider": "orange",
                "direction": "withdrawal",
                "amount": 20000,
                "phone_number": "0320000022",
                "idempotency_key": "wdl-lifecycle-001",
            },
            format="json",
        )
        self.assertEqual(init_res.status_code, 201)
        intent_id = init_res.data["id"]

        player_mga.refresh_from_db()
        self.assertEqual(player_mga.balance, 30000)
        self.assertEqual(player_mga.held_balance, 20000)

        # 2. Webhook d'échec du transfert opérateur
        self.client.force_authenticate(None)
        payload = {
            "event_id": "evt-wdl-fail-01",
            "event_type": "payment.failed",
            "intent_id": intent_id,
            "reason": "Numero Orange Money non trouve",
        }
        body = json.dumps(payload, separators=(",", ":")).encode()
        signature = hmac.new(
            settings.PAYMENT_WEBHOOK_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()

        wh_res = self.client.post(
            "/api/v1/payments/webhooks/orange/",
            data=body,
            content_type="application/json",
            HTTP_X_WEBHOOK_SIGNATURE=signature,
        )
        self.assertEqual(wh_res.status_code, 201)

        # 3. Vérifier que les 20 000 Ar ont été restitués au joueur
        player_mga.refresh_from_db()
        self.assertEqual(player_mga.balance, 50000)
        self.assertEqual(player_mga.held_balance, 0)
        self.assertEqual(PaymentIntent.objects.get(id=intent_id).status, "failed")

    def test_kyc_limits_enforced_on_deposit(self):
        unverified_user = User.objects.create_user(
            email="unverified@mdg.local",
            phone="+261340000088",
            display_name="Invité",
            kyc_level="discovered",
        )
        self.client.force_authenticate(unverified_user)
        res = self.client.post(
            "/api/v1/payments/intents/",
            {
                "provider": "airtel",
                "direction": "deposit",
                "amount": 5000,
                "idempotency_key": "dep-unverified",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("plafond", res.data["detail"].lower())
