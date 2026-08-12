from django.test import TestCase

from apps.accounts.models import User
from apps.wallet.models import LedgerEntry, WalletTransaction
from apps.wallet.services import SIMULATION_STARTING_BONUS, credit_simulation_bonus


class SimulationWalletTests(TestCase):
    def test_welcome_bonus_is_idempotent_and_balanced(self):
        user = User.objects.create_user(
            email="034000000@mdg.local", phone="+261340000000", display_name="Miora"
        )
        account, first, created = credit_simulation_bonus(user)
        same_account, same_transaction, created_again = credit_simulation_bonus(user)
        self.assertTrue(created)
        self.assertFalse(created_again)
        self.assertEqual(account.balance, SIMULATION_STARTING_BONUS)
        self.assertEqual(same_account.balance, SIMULATION_STARTING_BONUS)
        self.assertEqual(first.pk, same_transaction.pk)
        self.assertEqual(WalletTransaction.objects.count(), 1)
        self.assertEqual(LedgerEntry.objects.filter(transaction=first).count(), 2)
