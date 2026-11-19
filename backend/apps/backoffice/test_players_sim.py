"""Player registry and SIM-only cashier safeguards."""

from unittest.mock import patch

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.backoffice.models import AuditEvent, BalanceAdjustmentRequest
from apps.wallet.models import LedgerAccount, LedgerEntry, WalletTransaction
from apps.wallet.services import credit_simulation_bonus


class BackofficePlayersAndSimTests(TestCase):
    def setUp(self):
        self.player = User.objects.create_user(
            email="pilot@casino.example",
            phone="+261340000251",
            display_name="Pilot Miora",
            email_verified_at=timezone.now(),
        )
        self.staff = User.objects.create_user(
            email="cashier@mdg.local",
            phone="+261340000252",
            display_name="Cashier",
            is_staff=True,
        )
        self.admin = User.objects.create_superuser(
            email="approver@mdg.local",
            password="strong-test-admin-password",
            phone="+261340000253",
            display_name="Approver",
        )
        self.staff.groups.add(
            Group.objects.get_or_create(name="casino:player_support")[0]
        )
        self.staff.groups.add(Group.objects.get_or_create(name="casino:sim_cashier")[0])
        self.client = APIClient()
        self.request_key = "cashier-sim-safe-key-0001"

    def login(self, user):
        self.client.force_authenticate(user)

    def test_player_directory_masks_contact_and_detail_requires_superuser(self):
        self.login(self.staff)
        listing = self.client.get("/api/v1/backoffice/players/?q=Miora")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.data["count"], 1)
        row = listing.data["results"][0]
        self.assertEqual(row["id"], self.player.pk)
        self.assertNotEqual(row["email"], self.player.email)
        self.assertNotEqual(row["phone"], self.player.phone)
        self.assertTrue(row["email_verified"])
        self.assertFalse(row["phone_verified"])
        self.assertEqual(
            self.client.get(
                f"/api/v1/backoffice/players/{self.player.pk}/"
            ).status_code,
            403,
        )
        self.login(self.admin)
        detail = self.client.get(f"/api/v1/backoffice/players/{self.player.pk}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["player"]["email"], self.player.email)
        self.assertEqual(detail.data["wallets"], [])
        # The directory excludes staff accounts, even for a superuser.
        staff_search = self.client.get("/api/v1/backoffice/players/?q=Cashier")
        self.assertEqual(staff_search.data["count"], 0)

    def test_sim_summary_and_ledger_never_include_mga(self):
        credit_simulation_bonus(self.player)
        LedgerAccount.objects.create(
            user=self.player,
            account_type="player",
            currency_code="MGA",
            balance=999999,
        )
        self.login(self.staff)
        summary = self.client.get("/api/v1/backoffice/sim/summary/")
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.data["currency"], "SIM")
        self.assertEqual(summary.data["entries_debit_sim"], 10000)
        self.assertEqual(summary.data["entries_credit_sim"], 10000)
        self.assertTrue(summary.data["ledger_entries_balanced"])
        self.assertEqual(summary.data["total_balances_sim"], 0)
        self.assertEqual(
            self.client.get("/api/v1/backoffice/sim/ledger/").status_code,
            403,
        )
        self.login(self.admin)
        journal = self.client.get("/api/v1/backoffice/sim/ledger/")
        self.assertEqual(journal.status_code, 200)
        self.assertEqual(journal.data["count"], 1)
        self.assertEqual(journal.data["results"][0]["currency"], "SIM")
        self.assertEqual(len(journal.data["results"][0]["entries"]), 2)

    def request_grant(self, amount=2500, key=None, target=None, reason=None):
        return self.client.post(
            "/api/v1/backoffice/sim/adjustments/",
            {
                "player_id": target or self.player.pk,
                "amount": amount,
                "reason": reason or "Attribution de jetons pour test pilote tracé",
            },
            HTTP_IDEMPOTENCY_KEY=key or self.request_key,
            format="json",
        )

    def test_sim_request_is_idempotent_and_requires_another_approver(self):
        self.login(self.staff)
        first = self.request_grant()
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data["status"], "pending")
        repeat = self.request_grant()
        self.assertEqual(repeat.status_code, 200)
        self.assertEqual(first.data["id"], repeat.data["id"])
        conflicting = self.request_grant(amount=3000)
        self.assertEqual(conflicting.status_code, 409)
        self.assertEqual(BalanceAdjustmentRequest.objects.count(), 1)
        self.assertEqual(WalletTransaction.objects.count(), 0)
        self.assertEqual(
            self.client.post(
                f"/api/v1/backoffice/sim/adjustments/{first.data['id']}/decision/",
                {
                    "action": "approve",
                    "reason": "Revue et accord de dotation",
                    "mfa_code": "123456",
                },
                format="json",
            ).status_code,
            403,
        )
        self.login(self.admin)
        device = TOTPDevice.objects.create(
            user=self.admin, name="Supervisor", confirmed=True
        )
        with patch.object(TOTPDevice, "verify_token", return_value=True) as verify:
            approved = self.client.post(
                f"/api/v1/backoffice/sim/adjustments/{first.data['id']}/decision/",
                {
                    "action": "approve",
                    "reason": "Double contrôle de la dotation SIM",
                    "mfa_code": "123456",
                },
                format="json",
            )
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertEqual(approved.data["status"], "approved")
        self.assertIsNotNone(approved.data["transaction_id"])
        verify.assert_called_once_with("123456")
        self.assertEqual(TOTPDevice.objects.filter(pk=device.pk).count(), 1)
        player_account = LedgerAccount.objects.get(
            user=self.player, account_type="player", currency_code="SIM"
        )
        self.assertEqual(player_account.balance, 2500)
        self.assertFalse(LedgerAccount.objects.filter(currency_code="MGA").exists())
        entries = LedgerEntry.objects.filter(
            transaction_id=approved.data["transaction_id"]
        )
        self.assertEqual(entries.count(), 2)
        self.assertEqual(
            entries.filter(entry_type="debit").first().amount,
            entries.filter(entry_type="credit").first().amount,
        )
        self.assertTrue(AuditEvent.objects.filter(action="sim.grant.approved").exists())
        replay = self.client.post(
            f"/api/v1/backoffice/sim/adjustments/{first.data['id']}/decision/",
            {
                "action": "approve",
                "reason": "Réessai après approbation",
                "mfa_code": "123456",
            },
            format="json",
        )
        self.assertEqual(replay.status_code, 409)
        self.assertEqual(WalletTransaction.objects.count(), 1)

    def test_self_approval_is_forbidden_even_for_superuser(self):
        self.login(self.admin)
        first = self.request_grant(key="cashier-admin-self-request-0001")
        self.assertEqual(first.status_code, 201)
        TOTPDevice.objects.create(user=self.admin, name="Self", confirmed=True)
        with patch.object(TOTPDevice, "verify_token", return_value=True) as verify:
            response = self.client.post(
                f"/api/v1/backoffice/sim/adjustments/{first.data['id']}/decision/",
                {
                    "action": "approve",
                    "reason": "Ma propre approbation",
                    "mfa_code": "123456",
                },
                format="json",
            )
        self.assertEqual(response.status_code, 403)
        verify.assert_not_called()
        self.assertEqual(WalletTransaction.objects.count(), 0)

    def test_request_validation_and_rejection_never_touch_wallet(self):
        self.login(self.staff)
        self.assertEqual(self.request_grant(amount=1000001).status_code, 400)
        self.assertEqual(
            self.request_grant(
                key="staff-not-player-target-0001",
                target=self.admin.pk,
            ).status_code,
            404,
        )
        self.assertEqual(
            self.request_grant(reason="short").status_code,
            400,
        )
        first = self.request_grant()
        self.assertEqual(first.status_code, 201)
        self.login(self.admin)
        TOTPDevice.objects.create(user=self.admin, name="Approve", confirmed=True)
        with patch.object(TOTPDevice, "verify_token", return_value=True):
            response = self.client.post(
                f"/api/v1/backoffice/sim/adjustments/{first.data['id']}/decision/",
                {
                    "action": "reject",
                    "reason": "Demande sans justificatif suffisant",
                    "mfa_code": "123456",
                },
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "rejected")
        self.assertEqual(WalletTransaction.objects.count(), 0)
