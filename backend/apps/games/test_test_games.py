from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import DrawDefinition, DrawResult, InstantPlay
from apps.wallet.models import WalletTransaction
from apps.wallet.services import credit_simulation_bonus


class TestGamesApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="test-games@mdg.local",
            phone="+261340000099",
            display_name="Test Games",
        )
        self.staff = User.objects.create_user(
            email="staff-games@mdg.local",
            phone="+261340000098",
            display_name="Staff Games",
            is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        credit_simulation_bonus(self.user)

    def test_catalog_requires_authentication_and_is_seeded(self):
        anonymous = APIClient().get("/api/v1/games/test-games/catalog/")
        self.assertEqual(anonymous.status_code, 401)

        response = self.client.get("/api/v1/games/test-games/catalog/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            {item["slug"] for item in response.data["results"]},
            {"coffre-mada", "roue-mdg"},
        )
        self.assertEqual(response.data["currency"], "SIM")

    def test_instant_play_is_idempotent_and_ledgered(self):
        first = self.client.post(
            "/api/v1/games/test-games/coffre-mada/plays/",
            {"idempotency_key": "play-test-001"},
            format="json",
        )
        second = self.client.post(
            "/api/v1/games/test-games/coffre-mada/plays/",
            {"idempotency_key": "play-test-001"},
            format="json",
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["play_id"], second.data["play_id"])
        self.assertEqual(InstantPlay.objects.filter(user=self.user).count(), 1)
        self.assertGreaterEqual(
            WalletTransaction.objects.filter(user=self.user, type="game").count(), 1
        )

    def test_wheel_is_limited_to_one_play_per_day(self):
        first = self.client.post(
            "/api/v1/games/test-games/roue-mdg/plays/",
            {"idempotency_key": "wheel-test-001"},
            format="json",
        )
        second = self.client.post(
            "/api/v1/games/test-games/roue-mdg/plays/",
            {"idempotency_key": "wheel-test-002"},
            format="json",
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 409)

    def test_draw_entry_validates_numbers_and_persists_after_retry(self):
        self.client.get("/api/v1/games/test-games/catalog/")
        first = self.client.post(
            "/api/v1/games/test-draws/tirage-3-chiffres/entries/",
            {"numbers": [1, 2, 3], "idempotency_key": "entry-test-001"},
            format="json",
        )
        second = self.client.post(
            "/api/v1/games/test-draws/tirage-3-chiffres/entries/",
            {"numbers": [9, 9, 9], "idempotency_key": "entry-test-001"},
            format="json",
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["entry_id"], second.data["entry_id"])

    def test_draw_result_is_staff_only_and_created_once(self):
        self.client.get("/api/v1/games/test-games/catalog/")
        forbidden = self.client.post(
            "/api/v1/games/test-draws/jackpot-mdg/result/", {}, format="json"
        )
        self.assertEqual(forbidden.status_code, 403)

        self.client.force_authenticate(self.staff)
        self.client.get("/api/v1/games/test-draws/")
        first = self.client.post(
            "/api/v1/games/test-draws/jackpot-mdg/result/", {}, format="json"
        )
        second = self.client.post(
            "/api/v1/games/test-draws/jackpot-mdg/result/", {}, format="json"
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(DrawResult.objects.filter(draw__slug="jackpot-mdg").count(), 1)
