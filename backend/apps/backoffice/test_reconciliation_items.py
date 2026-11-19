"""Per-intent reconciliation must not claim PSP settlement."""

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.payments.models import PaymentIntent, WebhookInboxEvent
from apps.wallet.models import LedgerAccount, LedgerEntry, WalletTransaction


class TransactionReconciliationTests(TestCase):
    def setUp(self):
        self.player = User.objects.create_user(
            email="recon-player@mdg.test",
            phone="+261340000801",
            display_name="Reconciliation player",
        )
        self.staff = User.objects.create_user(
            email="recon-staff@mdg.test",
            phone="+261340000802",
            display_name="Reconciliation reader",
            is_staff=True,
        )
        self.admin = User.objects.create_superuser(
            email="recon-admin@mdg.test",
            phone="+261340000803",
            display_name="Reconciliation admin",
            password="test-only-strong-password",
        )
        self.url = "/api/v1/backoffice/finance/reconciliation/items/"
        self.client = APIClient()

    def make_intent(self, status="completed", ref="sim-123"):
        return PaymentIntent.objects.create(
            user=self.player,
            provider="mvola",
            direction="deposit",
            amount=12500,
            currency="MGA",
            status=status,
            provider_reference=ref,
            metadata={"sandbox": True},
            idempotency_key=f"recon-{status}-{ref}",
        )

    def test_requires_superuser_and_does_not_allow_writes(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.client.force_authenticate(self.player)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 405)

    def test_completed_intent_without_internal_postings_needs_review(self):
        intent = self.make_intent()
        self.client.force_authenticate(self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        item = response.data["results"][0]
        self.assertEqual(item["intent_id"], str(intent.pk))
        self.assertIn("missing_wallet_transaction", item["issue_codes"])
        self.assertIn("missing_processed_webhook", item["issue_codes"])
        self.assertEqual(item["internal_status"], "needs_review")
        self.assertFalse(item["external_psp_settlement_verified"])
        self.assertFalse(response.data["real_money_activation_authorized"])

    def test_balanced_internal_postings_never_claim_external_settlement(self):
        intent = self.make_intent()
        txn = WalletTransaction.objects.create(
            transaction_code="MGA-DEP-RECON",
            user=self.player,
            type="deposit",
            direction="credit",
            amount=12500,
            currency_code="MGA",
            status="completed",
            metadata={"payment_intent_id": str(intent.pk), "sandbox": True},
        )
        account = LedgerAccount.objects.create(
            user=self.player, account_type="player", currency_code="MGA"
        )
        platform = LedgerAccount.objects.create(
            user=None, account_type="platform", currency_code="MGA"
        )
        LedgerEntry.objects.create(
            transaction=txn,
            account=platform,
            entry_type="debit",
            amount=12500,
            balance_after=0,
        )
        LedgerEntry.objects.create(
            transaction=txn,
            account=account,
            entry_type="credit",
            amount=12500,
            balance_after=12500,
        )
        WebhookInboxEvent.objects.create(
            provider="mvola",
            event_id="recon-event-001",
            event_type="payment.completed",
            status="processed",
            payload={"intent_id": str(intent.pk)},
        )
        self.client.force_authenticate(self.admin)
        data = self.client.get(self.url).data
        item = data["results"][0]
        self.assertEqual(item["issue_codes"], [])
        self.assertEqual(item["internal_status"], "internally_consistent")
        self.assertFalse(item["external_psp_settlement_verified"])

    def test_invalid_filters_rejected(self):
        self.client.force_authenticate(self.admin)
        for query in ("?days=365", "?provider=unknown", "?limit=1000", "?offset=-1"):
            self.assertEqual(self.client.get(self.url + query).status_code, 400)
