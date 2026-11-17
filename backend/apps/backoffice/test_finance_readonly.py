"""MGA dashboard remains read-only and distinguishes sandbox from unclassified data."""

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.payments.models import PaymentIntent, WebhookInboxEvent
from apps.wallet.models import LedgerAccount, LedgerEntry, WalletTransaction


class MGAReadOnlyTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="mga-player@mdg.local",
            phone="+261340000451",
            display_name="Joueur",
        )
        self.staff = User.objects.create_user(
            email="mga-staff@mdg.local",
            phone="+261340000452",
            display_name="Staff",
            is_staff=True,
        )
        self.admin = User.objects.create_superuser(
            email="mga-admin@mdg.local",
            phone="+261340000453",
            password="test-strong-password-not-prod",
            display_name="Responsable",
        )
        self.client = APIClient()

    def populate(self):
        PaymentIntent.objects.create(
            user=self.user,
            provider="mvola",
            direction="deposit",
            currency="MGA",
            amount=5000,
            status="completed",
            metadata={"sandbox": True},
            idempotency_key="mga-sandbox-1",
        )
        PaymentIntent.objects.create(
            user=self.user,
            provider="orange",
            direction="withdrawal",
            currency="MGA",
            amount=2000,
            status="processing",
            metadata={},
            idempotency_key="mga-unclassified-2",
        )
        PaymentIntent.objects.create(
            user=self.user,
            provider="airtel",
            direction="deposit",
            currency="SIM",
            amount=900000,
            status="completed",
            metadata={"sandbox": True},
            idempotency_key="excluded-non-mga",
        )
        mga = LedgerAccount.objects.create(
            user=self.user,
            account_type="player",
            currency_code="MGA",
            balance=5000,
            held_balance=400,
        )
        sim = LedgerAccount.objects.create(
            user=self.user,
            account_type="player",
            currency_code="SIM",
            balance=900000,
            held_balance=8000,
        )
        for code, currency, kind, direction, amount, account in (
            ("mga-dep", "MGA", "deposit", "credit", 5000, mga),
            ("mga-wd", "MGA", "withdrawal", "debit", 1000, mga),
            ("sim-dep", "SIM", "deposit", "credit", 900000, sim),
        ):
            tx = WalletTransaction.objects.create(
                transaction_code=code,
                user=self.user,
                type=kind,
                direction=direction,
                currency_code=currency,
                amount=amount,
                status="completed",
            )
            LedgerEntry.objects.create(
                transaction=tx,
                account=account,
                entry_type="credit",
                amount=amount,
                balance_after=amount,
            )
            LedgerEntry.objects.create(
                transaction=tx,
                account=account,
                entry_type="debit",
                amount=amount,
                balance_after=0,
            )
        WebhookInboxEvent.objects.create(
            provider="mvola",
            event_id="mga-inbox-1",
            event_type="payment.succeeded",
            status="processed",
        )
        WebhookInboxEvent.objects.create(
            provider="orange",
            event_id="mga-inbox-2",
            event_type="payment.failed",
            status="received",
        )

    def test_restricts_finance_endpoints_to_superuser(self):
        for path in (
            "/api/v1/backoffice/finance/overview/",
            "/api/v1/backoffice/finance/intents/",
        ):
            self.assertEqual(self.client.get(path).status_code, 401)
            self.client.force_authenticate(self.user)
            self.assertEqual(self.client.get(path).status_code, 403)
            self.client.force_authenticate(self.staff)
            self.assertEqual(self.client.get(path).status_code, 403)
            self.client.force_authenticate(self.admin)
            self.assertEqual(self.client.get(path).status_code, 200)
            self.assertEqual(self.client.post(path, {}, format="json").status_code, 405)

    def test_mga_overview_excludes_sim_and_discloses_no_settlement_claim(self):
        self.populate()
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/backoffice/finance/overview/?days=7")
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data
        self.assertEqual(data["currency"], "MGA")
        self.assertEqual(data["mode"], "read_only_internal_ledger")
        self.assertFalse(data["external_psp_reconciliation_verified"])
        self.assertFalse(data["real_money_activation_authorized"])
        self.assertEqual(data["intents"]["count"], 2)
        self.assertEqual(data["intents"]["sandbox_count"], 1)
        self.assertEqual(data["intents"]["unclassified_count"], 1)
        self.assertEqual(data["intents"]["pending_withdrawals"], 1)
        self.assertEqual(data["wallet"]["completed_deposit_total_mga"], 5000)
        self.assertEqual(data["wallet"]["completed_withdrawal_total_mga"], 1000)
        self.assertEqual(data["wallet"]["player_held_mga"], 400)
        self.assertEqual(data["wallet"]["ledger_entries_credit_mga"], 6000)
        self.assertEqual(data["wallet"]["ledger_entries_debit_mga"], 6000)
        self.assertTrue(data["wallet"]["aggregate_entries_balanced"])
        self.assertTrue(data["wallet"]["aggregate_check_only"])
        self.assertEqual(data["webhooks"]["received"], 2)
        self.assertEqual(data["webhooks"]["processed"], 1)
        self.assertEqual(data["webhooks"]["unprocessed"], 1)
        self.assertNotIn(self.user.phone, str(data))
        for invalid in ("0", "7days", "-1", "365"):
            self.assertEqual(
                self.client.get(
                    f"/api/v1/backoffice/finance/overview/?days={invalid}"
                ).status_code,
                400,
            )

    def test_intents_paginate_without_exposing_payment_phone_or_secrets(self):
        self.populate()
        self.client.force_authenticate(self.admin)
        url = "/api/v1/backoffice/finance/intents/?status=processing&limit=1"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertTrue(response.data["read_only"])
        item = response.data["results"][0]
        self.assertEqual(item["amount_mga"], 2000)
        self.assertFalse(item["sandbox"])
        self.assertEqual(item["provider"], "orange")
        self.assertNotIn("phone_number", item)
        self.assertNotIn("metadata", item)
        self.assertNotIn("checkout_url", item)
        self.assertNotIn(self.user.phone, str(response.data))
        for invalid in (
            "?status=unknown",
            "?offset=-1",
            "?limit=0",
            "?limit=1000",
            "?limit=bad",
        ):
            self.assertEqual(
                self.client.get(
                    "/api/v1/backoffice/finance/intents/" + invalid
                ).status_code,
                400,
            )
