from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import (
    BotSimulationSession,
    GameTable,
    MatchmakingTicket,
    PlayerPresence,
    TableSeat,
)


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

    @patch("apps.games.views.requests.post")
    def test_bot_simulation_session_is_idempotent_and_declares_bots(self, post):
        post.return_value.raise_for_status.return_value = None
        self.client.force_authenticate(self.first)
        headers = {"HTTP_IDEMPOTENCY_KEY": "bot-session-001"}
        first = self.client.post(
            "/api/v1/games/bot-simulations/",
            {"game_type": "belote", "profile": "balanced"},
            format="json",
            **headers,
        )
        retry = self.client.post(
            "/api/v1/games/bot-simulations/",
            {"game_type": "poker", "profile": "expert"},
            format="json",
            **headers,
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(first.data["session_id"], retry.data["session_id"])
        self.assertEqual(first.data["mode"], "DEMO_AI")
        self.assertEqual(len(first.data["bots"]), 3)
        self.assertTrue(all(bot["is_bot"] for bot in first.data["bots"]))
        self.assertEqual(BotSimulationSession.objects.count(), 1)

    def test_matchmaking_supports_three_player_ludo_format(self):
        third = User.objects.create_user(
            email="match-third@mdg.local", phone="+261340001003", display_name="Third"
        )
        tickets = []
        for user in (self.first, self.second, third):
            self.client.force_authenticate(user)
            response = self.client.post(
                "/api/v1/games/matchmaking/queue/",
                {"game_type": "ludo", "target_size": 3},
                format="json",
            )
            self.assertEqual(response.status_code, 201)
            tickets.append(response.data["ticket"])
        self.assertEqual([ticket["target_players"] for ticket in tickets], [3, 3, 3])
        self.assertEqual(tickets[-1]["status"], "matched")
        table = GameTable.objects.get(pk=tickets[-1]["table_id"])
        self.assertEqual(table.max_players, 3)
        self.assertEqual(TableSeat.objects.filter(table=table).count(), 3)

    def test_status_scopes_ticket_to_selected_game(self):
        self.client.force_authenticate(self.first)
        self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        poker = self.client.get("/api/v1/games/matchmaking/status/?game_type=poker")
        ludo = self.client.get("/api/v1/games/matchmaking/status/?game_type=ludo")
        self.assertIsNone(poker.data["ticket"])
        self.assertEqual(ludo.data["ticket"]["game_type"], "ludo")
        self.assertEqual(ludo.data["ticket"]["target_players"], 2)

    def test_unsupported_matchmaking_format_is_rejected_without_table(self):
        self.client.force_authenticate(self.first)
        response = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "belote", "target_size": 3},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(GameTable.objects.count(), 0)

    def test_matchmaking_joins_existing_public_room_with_present_host(self):
        table = GameTable.objects.create(
            table_code="human-ludo-available",
            name="Ludo ouvert",
            game_type="ludo",
            stakes="Gratuit",
            max_players=2,
            status="open",
            created_by=self.first,
            mode="HUMAN_MATCH",
            stake_amount=0,
        )
        TableSeat.objects.create(table=table, user=self.first, seat_index=0)
        self.client.force_authenticate(self.first)
        self.client.post(
            "/api/v1/games/matchmaking/heartbeat/",
            {"game_type": "ludo"},
            format="json",
        )
        self.client.force_authenticate(self.second)
        response = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["ticket"]["status"], "matched")
        self.assertEqual(response.data["ticket"]["table_id"], str(table.pk))
        self.assertEqual(GameTable.objects.count(), 1)
        self.assertEqual(TableSeat.objects.filter(table=table).count(), 2)

    def test_matchmaking_ignores_existing_room_with_stale_host(self):
        table = GameTable.objects.create(
            table_code="stale-ludo-available",
            name="Ludo sans présence",
            game_type="ludo",
            stakes="Gratuit",
            max_players=2,
            status="open",
            created_by=self.first,
            mode="HUMAN_MATCH",
            stake_amount=0,
        )
        TableSeat.objects.create(table=table, user=self.first, seat_index=0)
        self.client.force_authenticate(self.second)
        response = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["ticket"]["status"], "queued")
        self.assertEqual(TableSeat.objects.filter(table=table).count(), 1)

    def test_switching_games_cancels_other_pending_search(self):
        self.client.force_authenticate(self.first)
        old = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        next_search = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "poker", "target_size": 2},
            format="json",
        )
        self.assertEqual(old.status_code, 201)
        self.assertEqual(next_search.status_code, 201)
        self.assertEqual(
            MatchmakingTicket.objects.get(pk=old.data["ticket"]["ticket_id"]).status,
            "cancelled",
        )
        self.client.force_authenticate(self.second)
        second = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        self.assertEqual(second.data["ticket"]["status"], "queued")
