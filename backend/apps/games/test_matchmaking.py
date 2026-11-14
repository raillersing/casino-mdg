from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
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
        self.assertIsNone(status.data["estimated_wait_seconds"])
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
        self.assertIsNone(status.data["estimated_wait_seconds"])

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

    @patch("apps.games.matchmaking.engine_activity")
    def test_matchmaking_joins_existing_public_room_with_present_host(self, live_activity):
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
        live_activity.return_value = {
            str(table.pk): {
                "waiting": True,
                "humans": [str(self.first.pk)],
            }
        }
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

    @patch("apps.games.matchmaking.engine_activity", return_value={})
    def test_matchmaking_ignores_existing_room_with_stale_host(self, activity):
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
        activity.assert_called_once()

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

    def test_queue_heartbeat_preserves_search_and_never_invents_a_deadline(self):
        self.client.force_authenticate(self.first)
        queued = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        self.assertEqual(queued.status_code, 201)
        self.assertIsNone(queued.data["ticket"]["timeout_seconds"])
        heartbeat = self.client.post(
            "/api/v1/games/matchmaking/heartbeat/",
            {"game_type": "ludo"},
            format="json",
        )
        self.assertEqual(heartbeat.data["status"], "searching")
        self.assertEqual(
            PlayerPresence.objects.get(user=self.first).status, "searching"
        )
        status = self.client.get("/api/v1/games/matchmaking/status/?game_type=ludo")
        self.assertIsNone(status.data["estimated_wait_seconds"])
        self.assertIsNone(status.data["timeout_seconds"])
        self.assertEqual(status.data["ticket"]["status"], "queued")

    def test_stale_ticket_is_not_visible_and_cannot_match(self):
        self.client.force_authenticate(self.first)
        old = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        ticket = MatchmakingTicket.objects.get(pk=old.data["ticket"]["ticket_id"])
        MatchmakingTicket.objects.filter(pk=ticket.pk).update(
            updated_at=timezone.now() - timedelta(minutes=2)
        )
        stale_status = self.client.get(
            "/api/v1/games/matchmaking/status/?game_type=ludo"
        )
        self.assertIsNone(stale_status.data["ticket"])
        self.assertEqual(stale_status.data["queued"], 0)

        self.client.force_authenticate(self.second)
        fresh = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        self.assertEqual(fresh.data["ticket"]["status"], "queued")
        self.assertEqual(GameTable.objects.count(), 0)

        self.client.force_authenticate(self.first)
        heartbeat = self.client.post(
            "/api/v1/games/matchmaking/heartbeat/",
            {"game_type": "ludo"},
            format="json",
        )
        self.assertEqual(heartbeat.data["status"], "online")
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, "cancelled")

    def test_returning_player_starts_a_new_search_after_expiry(self):
        self.client.force_authenticate(self.first)
        old = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        MatchmakingTicket.objects.filter(pk=old.data["ticket"]["ticket_id"]).update(
            updated_at=timezone.now() - timedelta(minutes=3)
        )
        new = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        self.assertEqual(new.status_code, 201)
        self.assertNotEqual(
            old.data["ticket"]["ticket_id"], new.data["ticket"]["ticket_id"]
        )
        self.assertEqual(
            MatchmakingTicket.objects.get(pk=old.data["ticket"]["ticket_id"]).status,
            "cancelled",
        )

    def test_only_seated_players_can_resume_a_live_match(self):
        self.client.force_authenticate(self.first)
        self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        self.client.force_authenticate(self.second)
        final = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        self.assertEqual(final.data["ticket"]["status"], "matched")
        status = self.client.get("/api/v1/games/matchmaking/status/?game_type=ludo")
        self.assertEqual(status.data["ticket"]["status"], "matched")
        table = GameTable.objects.get(pk=final.data["ticket"]["table_id"])
        TableSeat.objects.filter(table=table, user=self.second).delete()
        status_without_seat = self.client.get(
            "/api/v1/games/matchmaking/status/?game_type=ludo"
        )
        self.assertIsNone(status_without_seat.data["ticket"])

        self.client.force_authenticate(self.first)
        table.status = "finished"
        table.save(update_fields=["status"])
        finished = self.client.get("/api/v1/games/matchmaking/status/?game_type=ludo")
        self.assertIsNone(finished.data["ticket"])

    @patch("apps.games.matchmaking.engine_activity")
    def test_lobby_heartbeat_is_not_live_table_presence(self, activity):
        room = GameTable.objects.create(
            table_code="lobby-heartbeat-is-not-presence",
            name="Presence check",
            game_type="ludo",
            max_players=2,
            created_by=self.first,
        )
        TableSeat.objects.create(table=room, user=self.first, seat_index=0)
        self.client.force_authenticate(self.first)
        self.client.post(
            "/api/v1/games/matchmaking/heartbeat/",
            {"game_type": "ludo"},
            format="json",
        )
        activity.return_value = {str(room.pk): {"waiting": True, "humans": []}}
        self.client.force_authenticate(self.second)
        response = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        self.assertEqual(response.data["ticket"]["status"], "queued")
        self.assertEqual(TableSeat.objects.filter(table=room).count(), 1)
        activity.assert_called_once()

    @patch("apps.games.matchmaking.engine_activity")
    def test_engine_human_in_a_different_room_cannot_validate_host(self, activity):
        room = GameTable.objects.create(
            table_code="different-room-presence",
            name="Presence check",
            game_type="ludo",
            max_players=2,
            created_by=self.first,
        )
        TableSeat.objects.create(table=room, user=self.first, seat_index=0)
        self.client.force_authenticate(self.first)
        self.client.post(
            "/api/v1/games/matchmaking/heartbeat/",
            {"game_type": "ludo"},
            format="json",
        )
        activity.return_value = {
            "some-other-table": {
                "waiting": True,
                "humans": [str(self.first.pk)],
            }
        }
        self.client.force_authenticate(self.second)
        response = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        self.assertEqual(response.data["ticket"]["status"], "queued")
        self.assertEqual(TableSeat.objects.filter(table=room).count(), 1)

    @patch("apps.games.matchmaking.engine_activity")
    def test_started_room_does_not_get_new_matchmaking_seat(self, activity):
        room = GameTable.objects.create(
            table_code="started-room-presence",
            name="Started room",
            game_type="poker",
            max_players=2,
            created_by=self.first,
        )
        TableSeat.objects.create(table=room, user=self.first, seat_index=0)
        self.client.force_authenticate(self.first)
        self.client.post(
            "/api/v1/games/matchmaking/heartbeat/",
            {"game_type": "poker"},
            format="json",
        )
        activity.return_value = {
            str(room.pk): {
                "waiting": False,
                "started": True,
                "humans": [str(self.first.pk)],
            }
        }
        self.client.force_authenticate(self.second)
        response = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "poker", "target_size": 2},
            format="json",
        )
        self.assertEqual(response.data["ticket"]["status"], "queued")
        self.assertEqual(TableSeat.objects.filter(table=room).count(), 1)

    @patch("apps.games.matchmaking.engine_activity")
    def test_engine_outage_falls_back_to_normal_queue(self, activity):
        import requests

        room = GameTable.objects.create(
            table_code="offline-room-presence",
            name="Offline engine",
            game_type="ludo",
            max_players=2,
            created_by=self.first,
        )
        TableSeat.objects.create(table=room, user=self.first, seat_index=0)
        self.client.force_authenticate(self.first)
        self.client.post(
            "/api/v1/games/matchmaking/heartbeat/",
            {"game_type": "ludo"},
            format="json",
        )
        activity.side_effect = requests.Timeout("Engine offline")
        self.client.force_authenticate(self.second)
        response = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["ticket"]["status"], "queued")
        self.assertEqual(TableSeat.objects.filter(table=room).count(), 1)

    @patch("apps.games.services.engine_activity")
    def test_poker_running_table_cannot_admit_during_started_hand(self, activity):
        from apps.games.services import join_table

        room = GameTable.objects.create(
            table_code="running-poker-hand",
            name="Poker running",
            game_type="poker",
            max_players=6,
            created_by=self.first,
            status="running",
        )
        TableSeat.objects.create(table=room, user=self.first, seat_index=0)
        activity.return_value = {str(room.pk): {"waiting": False, "started": True}}
        with self.assertRaisesRegex(ValueError, "déjà commencé"):
            join_table(room, self.second)
        self.assertFalse(room.seats.filter(user=self.second).exists())
        room.refresh_from_db()
        self.assertEqual(room.status, "running")

    @patch("apps.games.services.engine_activity")
    def test_running_room_can_admit_only_when_engine_explicitly_waits(self, activity):
        from apps.games.services import join_table

        room = GameTable.objects.create(
            table_code="waiting-poker-intermission",
            name="Poker intermission",
            game_type="poker",
            max_players=6,
            created_by=self.first,
            status="running",
        )
        TableSeat.objects.create(table=room, user=self.first, seat_index=0)
        activity.return_value = {str(room.pk): {"waiting": True, "started": True}}
        seat, created = join_table(room, self.second)
        self.assertTrue(created)
        self.assertEqual(seat.user_id, self.second.pk)
        room.refresh_from_db()
        self.assertEqual(room.status, "open")

    @patch("apps.games.matchmaking.engine_activity")
    def test_connected_host_is_matchable_without_a_lobby_heartbeat(self, activity):
        room = GameTable.objects.create(
            table_code="game-engine-presence-only",
            name="Waiting with host connected",
            game_type="ludo",
            max_players=2,
            created_by=self.first,
        )
        TableSeat.objects.create(table=room, user=self.first, seat_index=0)
        activity.return_value = {
            str(room.pk): {"waiting": True, "humans": [str(self.first.pk)]}
        }
        # The first player is connected to the game, not refreshing the lobby.
        self.assertFalse(PlayerPresence.objects.filter(user=self.first).exists())
        self.client.force_authenticate(self.second)
        response = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "ludo", "target_size": 2},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["ticket"]["status"], "matched")
        self.assertEqual(response.data["ticket"]["table_id"], str(room.pk))
        self.assertEqual(TableSeat.objects.filter(table=room).count(), 2)
