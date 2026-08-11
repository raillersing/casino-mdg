import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.wallet.models import LedgerEntry, WalletTransaction
from apps.wallet.services import credit_simulation_bonus


class GameResultTests(TestCase):
    def test_win_is_credited_once_when_result_is_retried(self):
        user = User.objects.create_user(email="winner@mdg.local", phone="+261340000009", display_name="Winner")
        credit_simulation_bonus(user)
        client = APIClient(); client.force_authenticate(user)
        payload = {"game_id": str(uuid.uuid4()), "game_type": "poker", "outcome": "win", "amount": 250}
        first = client.post("/api/v1/games/results/", payload, format="json")
        second = client.post("/api/v1/games/results/", payload, format="json")
        self.assertEqual(first.status_code, 201); self.assertEqual(second.status_code, 200)
        self.assertEqual(WalletTransaction.objects.filter(user=user, type="game").count(), 1)
        self.assertEqual(LedgerEntry.objects.filter(transaction__type="game").count(), 2)
