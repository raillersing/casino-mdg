from datetime import timedelta
from unittest.mock import patch

import requests
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User

from .lifecycle import reconcile_tables
from .models import GameTable
from .services import join_table, leave_table


class TableLifecycleTests(TestCase):
    def setUp(self):
        self.users = [
            User.objects.create_user(
                email=f"lifecycle{i}@mdg.local", phone=f"life{i}", display_name=f"P{i}"
            )
            for i in range(4)
        ]
        self.client = APIClient()
        self.client.force_authenticate(self.users[0])

    def table(self, **kwargs):
        return GameTable.objects.create(
            table_code=f"lifecycle-{GameTable.objects.count()}",
            name="Test",
            created_by=self.users[0],
            game_type="ludo",
            **kwargs,
        )

    def test_free_seat_reused_without_duplicate_index(self):
        table = self.table(max_players=4)
        for user in self.users[:3]:
            join_table(table, user)
        leave_table(table, self.users[1])
        seat, _ = join_table(table, self.users[3])
        self.assertEqual(seat.seat_index, 1)
        self.assertEqual(
            set(table.seats.values_list("seat_index", flat=True)), {0, 1, 2}
        )

    def test_started_fixed_player_game_is_never_reopened(self):
        table = self.table(max_players=2)
        for user in self.users[:2]:
            join_table(table, user)
        self.assertEqual(leave_table(table, self.users[0]), (True, False))
        table.refresh_from_db()
        self.assertEqual(table.status, "running")
        with patch(
            "apps.games.services.engine_activity",
            return_value={str(table.pk): {"waiting": False}},
        ), self.assertRaises(ValueError):
            join_table(table, self.users[2])

    def test_creation_retry_returns_same_table_and_rejects_changed_payload(self):
        body = {"game_type": "ludo", "max_players": 2, "idempotency_key": "retry-one"}
        first = self.client.post("/api/v1/games/tables/", body, format="json")
        retry = self.client.post("/api/v1/games/tables/", body, format="json")
        self.assertEqual((first.status_code, retry.status_code), (201, 200))
        self.assertEqual(first.data["id"], retry.data["id"])
        self.assertEqual(GameTable.objects.count(), 1)
        body["max_players"] = 4
        self.assertEqual(
            self.client.post("/api/v1/games/tables/", body, format="json").status_code,
            409,
        )

    @patch("apps.games.views.join_table", side_effect=ValueError("seat failure"))
    def test_creation_and_first_seat_roll_back_together(self, join):
        with self.assertRaises(ValueError):
            self.client.post(
                "/api/v1/games/tables/", {"game_type": "ludo"}, format="json"
            )
        self.assertEqual(GameTable.objects.count(), 0)

    @patch("apps.games.lifecycle.engine_activity_snapshot")
    def test_expiry_preserves_active_rooms_and_fails_closed(self, engine):
        active = self.table()
        orphan = self.table(status="running")
        join_table(active, self.users[0])
        GameTable.objects.all().update(updated_at=timezone.now() - timedelta(hours=1))
        engine.side_effect = requests.ConnectionError("down")
        with self.assertRaises(requests.ConnectionError):
            reconcile_tables()
        self.assertFalse(GameTable.objects.filter(status="finished").exists())
        engine.side_effect = None
        engine.return_value = {"tables": {}, "uptime_seconds": 10}
        self.assertEqual(reconcile_tables()["closed"], 0)
        engine.return_value = {
            "tables": {str(active.pk): {"humans": []}},
            "uptime_seconds": 300,
        }
        self.assertEqual(reconcile_tables()["closed"], 1)
        active.refresh_from_db()
        orphan.refresh_from_db()
        self.assertEqual(active.status, "open")
        self.assertEqual(orphan.status, "finished")

    @override_settings(GAME_ENGINE_RESULT_SECRET="test-lifecycle-secret-with-32-bytes")
    def test_durable_engine_closure_is_authenticated_and_idempotent(self):
        table = self.table()
        body = {"table_id": str(table.pk), "kind": "table_closed"}
        endpoint = "/api/v1/games/internal/human-activity/"
        self.assertEqual(
            self.client.post(endpoint, body, format="json").status_code, 403
        )
        for _ in range(2):
            response = self.client.post(
                endpoint,
                body,
                format="json",
                HTTP_X_GAME_ENGINE_SECRET="test-lifecycle-secret-with-32-bytes",
            )
            self.assertEqual(response.status_code, 200)
        table.refresh_from_db()
        self.assertEqual(table.status, "finished")

    @patch("apps.games.services.engine_activity")
    def test_running_reservation_can_only_refill_if_engine_confirms_waiting(
        self, engine
    ):
        table = self.table(max_players=2)
        for user in self.users[:2]:
            join_table(table, user)
        leave_table(table, self.users[0])
        engine.return_value = {str(table.pk): {"waiting": True}}
        seat, created = join_table(table, self.users[2])
        self.assertTrue(created)
        self.assertEqual(seat.seat_index, 0)

    @patch("apps.games.lifecycle.engine_activity_snapshot")
    def test_admission_renews_the_expiry_lease(self, engine):
        table = self.table(status="running")
        from .models import TableSeat

        TableSeat.objects.create(table=table, user=self.users[0], seat_index=0)
        GameTable.objects.filter(pk=table.pk).update(
            updated_at=timezone.now() - timedelta(hours=1)
        )
        self.assertEqual(
            self.client.post(
                f"/api/v1/games/tables/{table.pk}/admission/", {}, format="json"
            ).status_code,
            200,
        )
        engine.return_value = {"tables": {}, "uptime_seconds": 300}
        self.assertEqual(reconcile_tables()["closed"], 0)

    @patch("apps.games.lifecycle.engine_activity_snapshot")
    def test_waiting_and_started_tables_have_different_expiry_budgets(self, engine):
        from .models import TableSeat

        waiting = self.table()
        running = self.table(status="running")
        for table in [waiting, running]:
            TableSeat.objects.create(table=table, user=self.users[0], seat_index=0)
        GameTable.objects.all().update(updated_at=timezone.now() - timedelta(minutes=5))
        engine.return_value = {"tables": {}, "uptime_seconds": 300}
        self.assertEqual(reconcile_tables()["closed"], 1)
        waiting.refresh_from_db()
        running.refresh_from_db()
        self.assertEqual(waiting.status, "open")
        self.assertEqual(running.status, "finished")

    @patch("apps.games.lifecycle.engine_activity_snapshot")
    def test_waiting_reservation_expiry_keeps_fresh_admissions_and_grace_seats(
        self, engine
    ):
        from .models import TableSeat

        table = self.table(status="running", max_players=4)
        for index, user in enumerate(self.users):
            TableSeat.objects.create(table=table, user=user, seat_index=index)
        old = timezone.now() - timedelta(minutes=10)
        table.seats.update(joined_at=old)
        table.seats.filter(user=self.users[2]).update(admitted_at=timezone.now())
        GameTable.objects.filter(pk=table.pk).update(updated_at=old)
        engine.return_value = {
            "uptime_seconds": 300,
            "tables": {
                str(table.pk): {
                    "waiting": True,
                    "reserved_humans": [str(self.users[0].pk), str(self.users[3].pk)],
                    "humans": [str(self.users[0].pk)],
                }
            },
        }
        result = reconcile_tables()
        self.assertEqual(result["released_seats"], 1)
        self.assertFalse(table.seats.filter(user=self.users[1]).exists())
        self.assertTrue(table.seats.filter(user=self.users[2]).exists())
        self.assertTrue(table.seats.filter(user=self.users[3]).exists())
        table.refresh_from_db()
        self.assertEqual(table.status, "open")

    @patch("apps.games.lifecycle.engine_activity_snapshot")
    def test_started_game_never_expires_individual_participants(self, engine):
        from .models import TableSeat

        table = self.table(status="running")
        TableSeat.objects.create(table=table, user=self.users[0], seat_index=0)
        table.seats.update(joined_at=timezone.now() - timedelta(hours=1))
        engine.return_value = {
            "uptime_seconds": 300,
            "tables": {
                str(table.pk): {
                    "waiting": False,
                    "started": True,
                    "reserved_humans": [],
                    "humans": [],
                }
            },
        }
        self.assertEqual(reconcile_tables()["released_seats"], 0)
        self.assertEqual(table.seats.count(), 1)
