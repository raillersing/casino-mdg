import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import GameResult
from apps.wallet.models import WalletTransaction


class DailyMissionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="mission@mdg.local", phone="+261340000031", display_name="Mission")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_missions_are_derived_from_today_results_and_claimed_once(self):
        GameResult.objects.create(game_id=uuid.uuid4(), user=self.user, game_type="poker", outcome="win", amount=100)

        missions = self.client.get("/api/v1/games/missions/")

        self.assertEqual(missions.status_code, 200)
        self.assertTrue(missions.data["missions"][0]["claimable"])
        self.assertTrue(missions.data["missions"][1]["claimable"])

        first = self.client.post("/api/v1/games/missions/", {"key": "win_daily"}, format="json")
        second = self.client.post("/api/v1/games/missions/", {"key": "win_daily"}, format="json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.data["duplicate"])
        self.assertEqual(WalletTransaction.objects.filter(user=self.user, type="bonus").count(), 1)

    def test_unfinished_mission_cannot_be_claimed(self):
        response = self.client.post("/api/v1/games/missions/", {"key": "play_daily"}, format="json")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(WalletTransaction.objects.filter(user=self.user).count(), 0)
