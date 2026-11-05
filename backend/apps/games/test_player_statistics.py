from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User

from .models import GameTable, HumanGameActivity, TableSeat


@override_settings(
    GAME_ENGINE_RESULT_SECRET="statistics-test-secret-with-32-characters"
)
class PlayerStatisticsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="stats@mdg.local", phone="+261340009991", display_name="Stats"
        )

    def test_distinct_windows_and_missing_history(self):
        url = "/api/v1/games/player-statistics/"
        self.assertIsNone(self.client.get(url).data["coverage_started_at"])
        now = timezone.now()
        for days in (0, 2, 10, 100):
            at = now - timedelta(days=days)
            HumanGameActivity.objects.create(
                user=self.user,
                game_type="belote",
                day=at.date(),
                first_seen_at=at,
                last_seen_at=at,
            )
        data = self.client.get(url).data
        for days in (1, 7, 30, 365):
            self.assertEqual(data["games"]["belote"][f"unique_players_{days}d"], 1)
            self.assertEqual(data["games"]["ludo"][f"unique_players_{days}d"], 0)
        HumanGameActivity.objects.filter(
            last_seen_at__gte=now - timedelta(days=1)
        ).delete()
        data = self.client.get(url).data["games"]["belote"]
        self.assertEqual(data["unique_players_1d"], 0)
        self.assertEqual(data["unique_players_7d"], 1)

    def test_signed_activity_idempotent_and_excludes_simulation(self):
        table = GameTable.objects.create(
            name="Stats", game_type="ludo", table_code="stats-live"
        )
        TableSeat.objects.create(user=self.user, table=table, seat_index=0)
        url = "/api/v1/games/internal/human-activity/"
        payload = {"table_id": str(table.pk), "user_id": str(self.user.pk)}
        self.assertEqual(self.client.post(url, payload).status_code, 403)
        for _ in range(2):
            response = self.client.post(
                url,
                payload,
                HTTP_X_GAME_ENGINE_SECRET="statistics-test-secret-with-32-characters",
            )
            self.assertEqual(response.status_code, 200)
        self.assertEqual(HumanGameActivity.objects.count(), 1)
        table.mode = "DEMO_AI"
        table.save()
        HumanGameActivity.objects.all().delete()
        self.client.post(
            url,
            payload,
            HTTP_X_GAME_ENGINE_SECRET="statistics-test-secret-with-32-characters",
        )
        self.assertEqual(HumanGameActivity.objects.count(), 0)

    def test_delayed_activity_uses_original_date(self):
        table = GameTable.objects.create(
            name="Delayed", game_type="belote", table_code="delayed-stats"
        )
        TableSeat.objects.create(user=self.user, table=table, seat_index=0)
        at = timezone.now() - timedelta(days=8)
        response = self.client.post(
            "/api/v1/games/internal/human-activity/",
            {
                "table_id": str(table.pk),
                "user_id": str(self.user.pk),
                "occurred_at": at.isoformat(),
            },
            HTTP_X_GAME_ENGINE_SECRET="statistics-test-secret-with-32-characters",
        )
        self.assertEqual(response.status_code, 200)
        stats = self.client.get("/api/v1/games/player-statistics/").data["games"][
            "belote"
        ]
        self.assertEqual(stats["unique_players_7d"], 0)
        self.assertEqual(stats["unique_players_30d"], 1)
