from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.wallet.models import LedgerEntry, WalletTransaction
from apps.wallet.services import SIMULATION_STARTING_BONUS, credit_simulation_bonus


class SimulationWalletTests(TestCase):
    def test_welcome_bonus_is_idempotent_and_balanced(self):
        user = User.objects.create_user(email="034000000@mdg.local", phone="+261340000000", display_name="Miora")
        account, first, created = credit_simulation_bonus(user)
        same_account, same_transaction, created_again = credit_simulation_bonus(user)
        self.assertTrue(created)
        self.assertFalse(created_again)
        self.assertEqual(account.balance, SIMULATION_STARTING_BONUS)
        self.assertEqual(same_account.balance, SIMULATION_STARTING_BONUS)
        self.assertEqual(first.pk, same_transaction.pk)
        self.assertEqual(WalletTransaction.objects.count(), 1)
        self.assertEqual(LedgerEntry.objects.filter(transaction=first).count(), 2)

    def test_transaction_detail_is_private_and_exposes_balanced_entries(self):
        user = User.objects.create_user(email="detail@mdg.local", phone="+261340000099", display_name="Detail")
        _, transaction, _ = credit_simulation_bonus(user)
        client = APIClient()
        client.force_authenticate(user)

        response = client.get(f"/api/v1/wallet/transactions/{transaction.pk}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["entries"]), 2)
        self.assertEqual({entry["entry_type"] for entry in response.data["entries"]}, {"debit", "credit"})

        other = User.objects.create_user(email="private@mdg.local", phone="+261340000098", display_name="Private")
        client.force_authenticate(other)
        self.assertEqual(client.get(f"/api/v1/wallet/transactions/{transaction.pk}/").status_code, 404)

    def test_transaction_list_supports_bounded_pagination(self):
        user = User.objects.create_user(email="page@mdg.local", phone="+261340000097", display_name="Page")
        credit_simulation_bonus(user)
        client = APIClient()
        client.force_authenticate(user)

        response = client.get("/api/v1/wallet/transactions/?limit=1&offset=0")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertIsNone(response.data["next_offset"])
        self.assertEqual(len(response.data["results"]), 1)

    def test_transaction_list_rejects_invalid_pagination(self):
        user = User.objects.create_user(email="invalid-page@mdg.local", phone="+261340000096", display_name="Invalid")
        client = APIClient()
        client.force_authenticate(user)

        response = client.get("/api/v1/wallet/transactions/?limit=bad")

        self.assertEqual(response.status_code, 400)
