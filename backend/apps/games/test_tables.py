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

    def test_table_creation_with_specific_rules_and_access_code(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/v1/games/tables/",
            {
                "name": "Belote Amis",
                "game_type": "belote",
                "is_private": True,
                "stake_amount": 2000,
                "turn_duration": 10,
                "rules_config": {
                    "target_score": 1001,
                    "variant": "classique",
                    "announcements": True,
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        data = response.data
        self.assertEqual(data["name"], "Belote Amis")
        self.assertEqual(data["game_type"], "belote")
        self.assertEqual(data["max_players"], 4)
        self.assertEqual(data["stake_amount"], 2000)
        self.assertEqual(data["turn_duration"], 10)
        self.assertEqual(data["stakes"], "2 000 Ar")
        self.assertTrue(data["is_private"])
        self.assertIsNotNone(data["access_code"])
        self.assertEqual(len(data["access_code"]), 6)
        self.assertEqual(data["rules_config"]["target_score"], 1001)

    def test_table_join_by_code_and_access_code_protection(self):
        self.client.force_authenticate(self.user)
        create_resp = self.client.post(
            "/api/v1/games/tables/",
            {
                "name": "Domino Prive",
                "game_type": "domino",
                "is_private": True,
                "max_players": 4,
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, 201)
        access_code = create_resp.data["access_code"]
        table_id = create_resp.data["id"]

        second_user = User.objects.create_user(
            email="friend@mdg.local", phone="+261340000302", display_name="Friend"
        )
        self.client.force_authenticate(second_user)

        # 1. Direct join without access code fails for private table
        direct_fail = self.client.post(f"/api/v1/games/tables/{table_id}/join/")
        self.assertEqual(direct_fail.status_code, 403)

        # 2. Direct join with correct access code succeeds
        direct_ok = self.client.post(
            f"/api/v1/games/tables/{table_id}/join/",
            {"access_code": access_code},
            format="json",
        )
        self.assertEqual(direct_ok.status_code, 201)

        # 3. Join by code with another friend
        third_user = User.objects.create_user(
            email="friend2@mdg.local", phone="+261340000303", display_name="Friend 2"
        )
        self.client.force_authenticate(third_user)
        by_code_ok = self.client.post(
            "/api/v1/games/tables/join-by-code/",
            {"code": access_code.lower()},  # case-insensitive
            format="json",
        )
        self.assertEqual(by_code_ok.status_code, 201)
        self.assertIn("admission_token", by_code_ok.data)

        # 4. Join with invalid code returns 404
        by_code_fail = self.client.post(
            "/api/v1/games/tables/join-by-code/",
            {"code": "INVAL9"},
            format="json",
        )
        self.assertEqual(by_code_fail.status_code, 404)

    def test_live_stats_endpoint(self):
        resp = self.client.get("/api/v1/games/live-stats/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("total_online_players", resp.data)
        self.assertIn("total_active_tables", resp.data)
        self.assertIn("games", resp.data)
        for g in ("belote", "domino", "ludo", "rami", "poker"):
            self.assertIn(g, resp.data["games"])
            self.assertIn("online_players", resp.data["games"][g])
            self.assertIn("running_tables", resp.data["games"][g])
            self.assertIn("open_tables", resp.data["games"][g])
