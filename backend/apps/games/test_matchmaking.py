from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import GameTable, MatchmakingTicket, PlayerPresence, TableSeat


class MatchmakingApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.first = User.objects.create_user(
            email="match-first@mdg.local", phone="+261340001001", display_name="First"
        )
        self.second = User.objects.create_user(
            email="match-second@mdg.local", phone="+261340001002", display_name="Second"
        )

    def test_heartbeat_and_status_count_only_fresh_humans(self):
        self.client.force_authenticate(self.first)
        heartbeat = self.client.post(
            "/api/v1/games/matchmaking/heartbeat/",
            {"game_type": "poker"},
            format="json",
        )
        self.assertEqual(heartbeat.status_code, 200)
        status = self.client.get("/api/v1/games/matchmaking/status/?game_type=poker")
        self.assertEqual(status.data["human_online"], 1)
        self.assertEqual(status.data["estimated_wait_seconds"], 20)
        self.assertEqual(PlayerPresence.objects.count(), 1)

    def test_queue_is_idempotent_and_second_human_gets_a_table(self):
        self.client.force_authenticate(self.first)
        first = self.client.post(
            "/api/v1/games/matchmaking/queue/", {"game_type": "poker"}, format="json"
        )
        retry = self.client.post(
            "/api/v1/games/matchmaking/queue/", {"game_type": "poker"}, format="json"
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(
            first.data["ticket"]["ticket_id"], retry.data["ticket"]["ticket_id"]
        )

        self.client.force_authenticate(self.second)
        matched = self.client.post(
            "/api/v1/games/matchmaking/queue/", {"game_type": "poker"}, format="json"
        )
        self.assertEqual(matched.status_code, 201)
        self.assertEqual(matched.data["ticket"]["status"], "matched")
        table = GameTable.objects.get(pk=matched.data["ticket"]["table_id"])
        self.assertEqual(TableSeat.objects.filter(table=table).count(), 2)
        self.assertEqual(MatchmakingTicket.objects.filter(status="matched").count(), 2)

    def test_status_exposes_waiting_time_and_immediate_estimate_with_another_player(
        self,
    ):
        self.client.force_authenticate(self.first)
        queued = self.client.post(
            "/api/v1/games/matchmaking/queue/", {"game_type": "rami"}, format="json"
        )
        self.assertEqual(queued.data["ticket"]["waiting_seconds"], 0)
        self.client.force_authenticate(self.second)
        self.client.post(
            "/api/v1/games/matchmaking/heartbeat/",
            {"game_type": "rami"},
            format="json",
        )
        status = self.client.get("/api/v1/games/matchmaking/status/?game_type=rami")
        self.assertEqual(status.data["estimated_wait_seconds"], 0)

    def test_cancel_removes_ticket_from_queue(self):
        self.client.force_authenticate(self.first)
        queued = self.client.post(
            "/api/v1/games/matchmaking/queue/", {"game_type": "belote"}, format="json"
        )
        ticket_id = queued.data["ticket"]["ticket_id"]
        cancelled = self.client.delete(f"/api/v1/games/matchmaking/queue/{ticket_id}/")
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.data["ticket"]["status"], "cancelled")
