import hashlib
import hmac

from django.conf import settings
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import BotSimulationSession, GameTable, TableSeat


@override_settings(DEBUG=True)
class TableApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="joueur@mdg.local", phone="+261340000001", display_name="Joueur"
        )

    def test_public_list_seeds_demo_tables(self):
        response = self.client.get("/api/v1/games/tables/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 6)
        self.assertEqual(
            {item["mode"] for item in response.data["results"]}, {"HUMAN_MATCH"}
        )

    def test_join_is_idempotent_and_never_duplicates_seat(self):
        table = GameTable.objects.create(
            table_code="test-001", name="Test", game_type="poker", max_players=2
        )
        self.client.force_authenticate(self.user)
        first = self.client.post(f"/api/v1/games/tables/{table.pk}/join/")
        second = self.client.post(f"/api/v1/games/tables/{table.pk}/join/")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(
            TableSeat.objects.filter(table=table, user=self.user).count(), 1
        )

    def test_second_player_gets_next_seat_and_full_table_rejects_new_player(self):
        table = GameTable.objects.create(
            table_code="test-full", name="Full", game_type="poker", max_players=2
        )
        second_user = User.objects.create_user(
            email="second@mdg.local", phone="+261340000002", display_name="Second"
        )
        third_user = User.objects.create_user(
            email="third@mdg.local", phone="+261340000003", display_name="Third"
        )

        self.client.force_authenticate(self.user)
        first = self.client.post(f"/api/v1/games/tables/{table.pk}/join/")
        self.client.force_authenticate(second_user)
        second = self.client.post(f"/api/v1/games/tables/{table.pk}/join/")
        self.client.force_authenticate(third_user)
        rejected = self.client.post(f"/api/v1/games/tables/{table.pk}/join/")

        self.assertEqual(first.data["seat_index"], 0)
        self.assertEqual(second.data["seat_index"], 1)
        self.assertEqual(rejected.status_code, 409)
        self.assertEqual(table.seats.count(), 2)

    def test_club_table_is_visible_and_joinable_only_by_club_members(self):
        from apps.clubs.models import Club, ClubMembership

        club = Club.objects.create(name="Club tables", owner=self.user)
        ClubMembership.objects.create(club=club, user=self.user, role="owner")
        table = GameTable.objects.create(
            table_code="club-table-001",
            name="Table club",
            game_type="poker",
            is_private=True,
            club=club,
            created_by=self.user,
        )
        stranger = User.objects.create_user(
            email="club-stranger@mdg.local",
            phone="+261340000099",
            display_name="Club Stranger",
        )
        self.client.force_authenticate(stranger)
        listed = self.client.get("/api/v1/games/tables/")
        self.assertNotIn(str(table.id), {item["id"] for item in listed.data["results"]})
        self.assertEqual(
            self.client.post(f"/api/v1/games/tables/{table.id}/join/").status_code, 403
        )

    def test_private_table_is_hidden_from_strangers_but_visible_to_owner(self):
        table = GameTable.objects.create(
            table_code="private-001",
            name="Amis",
            game_type="belote",
            is_private=True,
            created_by=self.user,
        )
        stranger = User.objects.create_user(
            email="stranger@mdg.local",
            phone="+261340000003",
            display_name="Stranger",
        )

        self.assertNotIn(
            str(table.id),
            {
                item["id"]
                for item in self.client.get("/api/v1/games/tables/").data["results"]
            },
        )
        self.client.force_authenticate(self.user)
        owner_tables = self.client.get("/api/v1/games/tables/").data["results"]
        self.assertIn(str(table.id), {item["id"] for item in owner_tables})
        self.client.force_authenticate(stranger)
        stranger_tables = self.client.get("/api/v1/games/tables/").data["results"]
        self.assertNotIn(str(table.id), {item["id"] for item in stranger_tables})
        self.assertEqual(
            self.client.post(f"/api/v1/games/tables/{table.id}/join/").status_code,
            403,
        )

    def test_bot_simulation_webhook_completes_session(self):
        table = GameTable.objects.create(
            table_code="bot-webhook-01",
            name="Test Webhook",
            game_type="poker",
            max_players=4,
            status="open",
            mode="DEMO_AI",
            is_private=True,
            created_by=self.user,
        )
        session = BotSimulationSession.objects.create(
            owner=self.user,
            table=table,
            game_type="poker",
            profile="balanced",
            idempotency_key="webhook-test-1",
            status="running",
        )
        response = self.client.post(
            "/api/v1/games/internal/bots/session-complete/",
            {"table_id": str(table.id)},
            HTTP_X_GAME_ENGINE_BOT_SECRET=settings.GAME_ENGINE_BOT_SECRET,
        )
        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.status, "completed")
        self.assertIsNotNone(session.completed_at)

    def test_bot_simulation_webhook_rejects_invalid_secret(self):
        response = self.client.post(
            "/api/v1/games/internal/bots/session-complete/",
            {"table_id": "11111111-1111-1111-1111-111111111111"},
            HTTP_X_GAME_ENGINE_BOT_SECRET="bad-secret",
        )
        self.assertEqual(response.status_code, 403)

    def test_bot_simulation_webhook_rejects_missing_session(self):
        table = GameTable.objects.create(
            table_code="bot-webhook-02",
            name="Test Webhook Missing",
            game_type="poker",
            max_players=4,
            status="open",
            mode="DEMO_AI",
            is_private=True,
            created_by=self.user,
        )
        response = self.client.post(
            "/api/v1/games/internal/bots/session-complete/",
            {"table_id": str(table.id)},
            HTTP_X_GAME_ENGINE_BOT_SECRET=settings.GAME_ENGINE_BOT_SECRET,
        )
        self.assertEqual(response.status_code, 404)

    def test_join_returns_signed_admission_token(self):
        table = GameTable.objects.create(
            table_code="test-adm-001",
            name="Test Admission",
            game_type="poker",
            max_players=6,
        )
        self.client.force_authenticate(self.user)
        response = self.client.post(f"/api/v1/games/tables/{table.pk}/join/")
        self.assertEqual(response.status_code, 201)
        self.assertIn("admission_token", response.data)
        token = response.data["admission_token"]
        self.assertTrue(token.startswith("ey"))

    def test_admission_endpoint_returns_token_for_seated_and_spectator(self):
        table = GameTable.objects.create(
            table_code="test-adm-002",
            name="Test Admission Spec",
            game_type="poker",
            max_players=6,
        )
        self.client.force_authenticate(self.user)
        # As spectator (not seated yet)
        response = self.client.post(f"/api/v1/games/tables/{table.pk}/admission/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role"], "spectator")
        self.assertIn("admission_token", response.data)

        # As player (after joining)
        self.client.post(f"/api/v1/games/tables/{table.pk}/join/")
        response_seated = self.client.post(
            f"/api/v1/games/tables/{table.pk}/admission/"
        )
        self.assertEqual(response_seated.status_code, 200)
        self.assertEqual(response_seated.data["role"], "player")
        self.assertEqual(response_seated.data["seat_index"], 0)

    def test_full_ring_9_players_table_creation_and_seating(self):
        self.client.force_authenticate(self.user)
        # Create a 9-player Full Ring table via API (creator is seated at index 0)
        create_resp = self.client.post(
            "/api/v1/games/tables/",
            {
                "name": "Full Ring 9-Max",
                "game_type": "poker",
                "max_players": 9,
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, 201)
        table_id = create_resp.data["id"]
        table = GameTable.objects.get(pk=table_id)
        self.assertEqual(table.max_players, 9)
        self.assertEqual(table.seats.count(), 1)
        self.assertEqual(table.seats.first().user, self.user)

        # 8 additional distinct players join (seats 1 to 8)
        other_players = [
            User.objects.create_user(
                email=f"frplayer{i}@mdg.local",
                phone=f"+26134000010{i}",
                display_name=f"Player {i}",
            )
            for i in range(1, 9)
        ]
        for idx, player in enumerate(other_players):
            seat_num = idx + 1
            self.client.force_authenticate(player)
            resp = self.client.post(f"/api/v1/games/tables/{table_id}/join/")
            self.assertEqual(resp.status_code, 201)
            self.assertEqual(resp.data["seat_index"], seat_num)

        # 10th player is rejected with 409
        tenth = User.objects.create_user(
            email="tenth@mdg.local",
            phone="+261340000199",
            display_name="Tenth",
        )
        self.client.force_authenticate(tenth)
        rejected = self.client.post(f"/api/v1/games/tables/{table_id}/join/")
        self.assertEqual(rejected.status_code, 409)
        table.refresh_from_db()
        self.assertEqual(table.status, "running")
        self.assertEqual(table.seats.count(), 9)

    def test_matchmaking_creates_table_with_configured_size(self):
        player_a = self.user
        player_b = User.objects.create_user(
            email="mmb@mdg.local",
            phone="+261340000201",
            display_name="MM Player B",
        )
        # Player A queues for 6-max poker
        self.client.force_authenticate(player_a)
        resp_a = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "poker", "max_players": 6},
            format="json",
        )
        self.assertEqual(resp_a.status_code, 201)

        # Player B queues for 6-max poker and matches Player A
        self.client.force_authenticate(player_b)
        resp_b = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "poker", "max_players": 6},
            format="json",
        )
        self.assertEqual(resp_b.status_code, 201)
        self.assertEqual(resp_b.data["ticket"]["status"], "matched")
        matched_table_id = resp_b.data["ticket"]["table_id"]
        matched_table = GameTable.objects.get(pk=matched_table_id)
        self.assertEqual(matched_table.max_players, 6)
        self.assertEqual(matched_table.game_type, "poker")
        self.assertEqual(matched_table.seats.count(), 2)
