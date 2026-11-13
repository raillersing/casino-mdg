from unittest.mock import patch

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

    def test_public_list_does_not_seed_demo_tables(self):
        response = self.client.get("/api/v1/games/tables/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 0)
        self.assertEqual({item["mode"] for item in response.data["results"]}, set())

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

        self.client.force_authenticate(player_b)
        resp_b = self.client.post(
            "/api/v1/games/matchmaking/queue/",
            {"game_type": "poker", "max_players": 6},
            format="json",
        )
        self.assertEqual(resp_b.data["ticket"]["status"], "queued")
        for i in range(4):
            friend = User.objects.create_user(
                email=f"capacity{i}@mdg.local",
                phone=f"+26134000800{i}",
                display_name=f"Capacity {i}",
            )
            self.client.force_authenticate(friend)
            last = self.client.post(
                "/api/v1/games/matchmaking/queue/",
                {"game_type": "poker", "max_players": 6},
                format="json",
            )
        self.assertEqual(last.data["ticket"]["status"], "matched")
        table = GameTable.objects.get(pk=last.data["ticket"]["table_id"])
        self.assertEqual(table.max_players, 6)
        self.assertEqual(table.seats.count(), 6)

    def test_table_creation_with_specific_rules_and_access_code(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/v1/games/tables/",
            {
                "name": "Belote Amis",
                "game_type": "belote",
                "is_private": True,
                "stake_amount": 0,
                "turn_duration": 10,
                "rules_config": {
                    "target_score": 1001,
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        data = response.data
        self.assertEqual(data["name"], "Belote Amis")
        self.assertEqual(data["game_type"], "belote")
        self.assertEqual(data["max_players"], 4)
        self.assertEqual(data["stake_amount"], 0)
        self.assertEqual(data["turn_duration"], 10)
        self.assertEqual(data["stakes"], "Gratuit")
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

        # A public table identifier is not authorization to a private room.
        by_public_code = self.client.post(
            "/api/v1/games/tables/join-by-code/",
            {"code": create_resp.data["table_code"]},
            format="json",
        )
        self.assertEqual(by_public_code.status_code, 404)

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

    @patch("apps.games.views.engine_activity", return_value={})
    def test_live_stats_endpoint(self, mocked_engine):
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

    @patch("apps.games.views.engine_activity", return_value={})
    def test_live_stats_do_not_count_historical_seats_as_online(self, mocked_engine):
        from datetime import timedelta

        from django.core.cache import cache
        from django.utils import timezone

        from apps.games.models import PlayerPresence

        cache.delete("casino_mdg_live_lobby_stats")
        PlayerPresence.objects.all().delete()
        table = GameTable.objects.create(
            table_code="stale-seat-stats",
            name="Old",
            game_type="belote",
            created_by=self.user,
        )
        TableSeat.objects.create(table=table, user=self.user, seat_index=0)
        response = self.client.get("/api/v1/games/live-stats/")
        self.assertEqual(response.data["total_online_players"], 0)
        cache.delete("casino_mdg_live_lobby_stats")
        PlayerPresence.objects.create(
            user=self.user, last_seen_at=timezone.now(), game_type="belote"
        )
        self.assertEqual(
            self.client.get("/api/v1/games/live-stats/").data["total_online_players"], 1
        )
        cache.delete("casino_mdg_live_lobby_stats")
        PlayerPresence.objects.filter(user=self.user).update(
            last_seen_at=timezone.now() - timedelta(seconds=61)
        )
        self.assertEqual(
            self.client.get("/api/v1/games/live-stats/").data["total_online_players"], 0
        )

    def test_leave_table_removes_seat_and_auto_closes_when_empty(self):
        table = GameTable.objects.create(
            table_code="leave-auto-close",
            name="Auto Close Table",
            game_type="belote",
            max_players=4,
            created_by=self.user,
        )
        self.client.force_authenticate(self.user)
        join_res = self.client.post(f"/api/v1/games/tables/{table.pk}/join/")
        self.assertEqual(join_res.status_code, 201)
        self.assertEqual(table.seats.count(), 1)
        self.assertEqual(table.status, "open")

        # Player leaves table
        leave_res = self.client.post(f"/api/v1/games/tables/{table.pk}/leave/")
        self.assertEqual(leave_res.status_code, 200)
        self.assertEqual(leave_res.data["status"], "finished")
        self.assertEqual(leave_res.data["remaining_seats"], 0)

        table.refresh_from_db()
        self.assertEqual(table.status, "finished")
        self.assertEqual(table.seats.count(), 0)

        # Table should no longer appear in active tables list
        list_res = self.client.get("/api/v1/games/tables/")
        self.assertNotIn(str(table.pk), [t["id"] for t in list_res.data["results"]])

    def test_leave_table_with_multiple_players_leaves_table_open_until_last_player(
        self,
    ):
        other_user = User.objects.create_user(
            email="other_leave@mdg.local",
            phone="+261340000088",
            display_name="Other Leave",
        )
        table = GameTable.objects.create(
            table_code="multi-leave",
            name="Multi Leave Table",
            game_type="belote",
            max_players=4,
            created_by=self.user,
        )
        self.client.force_authenticate(self.user)
        self.client.post(f"/api/v1/games/tables/{table.pk}/join/")

        other_client = APIClient()
        other_client.force_authenticate(other_user)
        other_client.post(f"/api/v1/games/tables/{table.pk}/join/")

        self.assertEqual(table.seats.count(), 2)

        # First player leaves: remaining seats = 1, status stays open
        leave_1 = self.client.post(f"/api/v1/games/tables/{table.pk}/leave/")
        self.assertEqual(leave_1.status_code, 200)
        self.assertEqual(leave_1.data["status"], "open")
        self.assertEqual(leave_1.data["remaining_seats"], 1)

        table.refresh_from_db()
        self.assertEqual(table.status, "open")
        self.assertEqual(table.seats.count(), 1)

        # Second player leaves: table auto-closes
        leave_2 = other_client.post(f"/api/v1/games/tables/{table.pk}/leave/")
        self.assertEqual(leave_2.status_code, 200)
        self.assertEqual(leave_2.data["status"], "finished")
        self.assertEqual(leave_2.data["remaining_seats"], 0)

        table.refresh_from_db()
        self.assertEqual(table.status, "finished")
        self.assertEqual(table.seats.count(), 0)

    def test_stale_empty_tables_are_hidden_without_writing_on_list(self):
        from datetime import timedelta

        from django.utils import timezone

        stale_table = GameTable.objects.create(
            table_code="stale-empty-room",
            name="Stale Empty Room",
            game_type="poker",
            max_players=6,
            created_by=self.user,
            status="open",
        )
        # Force updated_at back by 5 minutes
        GameTable.objects.filter(pk=stale_table.pk).update(
            updated_at=timezone.now() - timedelta(minutes=5)
        )

        resp = self.client.get("/api/v1/games/tables/")
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn(str(stale_table.pk), [t["id"] for t in resp.data["results"]])

        stale_table.refresh_from_db()
        self.assertEqual(stale_table.status, "open")

    def test_reconciler_expires_stale_tables_without_hiding_connected_tables(self):
        from datetime import timedelta

        from django.utils import timezone

        # 1. Demo table with demo code is excluded
        demo = GameTable.objects.create(
            table_code="baobab-01",
            name="Baobab Demo",
            game_type="belote",
            created_by=self.user,
        )
        TableSeat.objects.create(table=demo, user=self.user, seat_index=0)

        # 2. Abandoned waiting table older than 15 minutes is excluded
        stale_waiting = GameTable.objects.create(
            table_code="stale-waiting-table",
            name="Stale Waiting",
            game_type="belote",
            created_by=self.user,
        )
        TableSeat.objects.create(table=stale_waiting, user=self.user, seat_index=0)
        GameTable.objects.filter(pk=stale_waiting.pk).update(
            updated_at=timezone.now() - timedelta(minutes=20)
        )

        resp = self.client.get("/api/v1/games/tables/")
        self.assertEqual(resp.status_code, 200)
        result_ids = [t["id"] for t in resp.data["results"]]
        self.assertNotIn(str(demo.pk), result_ids)
        self.assertIn(str(stale_waiting.pk), result_ids)
        from unittest.mock import patch

        from .lifecycle import reconcile_tables

        with patch(
            "apps.games.lifecycle.engine_activity_snapshot",
            return_value={"tables": {}, "uptime_seconds": 300},
        ):
            reconcile_tables()
        response = self.client.get("/api/v1/games/tables/")
        self.assertNotIn(
            str(stale_waiting.pk), [t["id"] for t in response.data["results"]]
        )

    def test_table_creation_returns_admission_token_and_reserves_mga_funds(self):
        from apps.games.models import TableBankroll
        from apps.wallet.models import LedgerAccount

        # Set up player MGA account with 75,000 Ar
        mga_acc, _ = LedgerAccount.objects.get_or_create(
            user=self.user, account_type="player", currency_code="MGA"
        )
        mga_acc.balance = 75000
        mga_acc.held_balance = 0
        mga_acc.save()

        self.client.force_authenticate(self.user)
        # Poker: minimum de 5 000 Ar, tapis initial de 50 000 Ar.
        resp = self.client.post(
            "/api/v1/games/tables/",
            {
                "name": "Table Royale MGA",
                "game_type": "poker",
                "max_players": 6,
                "stake_amount": 5000,
                "buy_in": 50000,
                "is_private": False,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertIn("admission_token", resp.data)
        self.assertIn("table_id", resp.data)
        self.assertEqual(resp.data["seat_index"], 0)

        # Check ledger balance: 50,000 held, 25,000 available
        mga_acc.refresh_from_db()
        self.assertEqual(mga_acc.balance, 25000)
        self.assertEqual(mga_acc.held_balance, 50000)

        # Check TableBankroll
        bankroll = TableBankroll.objects.filter(
            table_id=resp.data["table_id"], user=self.user
        ).first()
        self.assertIsNotNone(bankroll)
        self.assertEqual(bankroll.reserved_amount, 50000)
        self.assertEqual(bankroll.current_stack, 0)
        self.assertEqual(bankroll.held_amount, 50000)
        self.assertEqual(bankroll.status, "reserved")

    def test_poker_buy_in_below_minimum_or_exceeding_balance_is_rejected(self):
        from apps.wallet.models import LedgerAccount

        mga_acc, _ = LedgerAccount.objects.get_or_create(
            user=self.user, account_type="player", currency_code="MGA"
        )
        mga_acc.balance = 20000
        mga_acc.held_balance = 0
        mga_acc.save()

        self.client.force_authenticate(self.user)
        table = GameTable.objects.create(
            table_code="poker-5k-min",
            name="Table 5k Min",
            game_type="poker",
            stake_amount=5000,
            max_players=6,
        )

        # Below minimum (e.g. 2,000 < 5,000)
        resp_low = self.client.post(
            f"/api/v1/games/tables/{table.pk}/join/",
            {"buy_in": 2000},
            format="json",
        )
        self.assertEqual(resp_low.status_code, 409)

        # Exceeding available balance (e.g. 50,000 > 20,000)
        resp_high = self.client.post(
            f"/api/v1/games/tables/{table.pk}/join/",
            {"buy_in": 50000},
            format="json",
        )
        self.assertEqual(resp_high.status_code, 409)
        self.assertIn("Solde Ariary insuffisant", resp_high.data["detail"])

    def test_poker_top_up_endpoint_reserves_mga_and_updates_pending_top_up(self):
        from apps.wallet.models import LedgerAccount

        mga_acc, _ = LedgerAccount.objects.get_or_create(
            user=self.user, account_type="player", currency_code="MGA"
        )
        mga_acc.balance = 80000
        mga_acc.held_balance = 0
        mga_acc.save()

        self.client.force_authenticate(self.user)
        table = GameTable.objects.create(
            table_code="poker-rebuy",
            name="Table Rebuy",
            game_type="poker",
            stake_amount=5000,
            max_players=6,
        )
        join_resp = self.client.post(
            f"/api/v1/games/tables/{table.pk}/join/",
            {"buy_in": 10000},
            format="json",
        )
        self.assertEqual(join_resp.status_code, 201)

        # Top up with 15,000 Ar
        topup_resp = self.client.post(
            f"/api/v1/games/tables/{table.pk}/top-up/",
            {"amount": 15000, "idempotency_key": "test-top-up"},
            format="json",
        )
        self.assertEqual(topup_resp.status_code, 200)
        self.assertEqual(topup_resp.data["pending_top_up"], 15000)

        # Total held = 10,000 + 15,000 = 25,000; remaining available = 55,000
        mga_acc.refresh_from_db()
        self.assertEqual(mga_acc.held_balance, 25000)
        self.assertEqual(mga_acc.balance, 55000)

    def test_leaving_table_refunds_unspent_mga_bankroll(self):
        from apps.wallet.models import LedgerAccount

        mga_acc, _ = LedgerAccount.objects.get_or_create(
            user=self.user, account_type="player", currency_code="MGA"
        )
        mga_acc.balance = 50000
        mga_acc.held_balance = 0
        mga_acc.save()

        self.client.force_authenticate(self.user)
        table = GameTable.objects.create(
            table_code="poker-leave-refund",
            name="Table Leave",
            game_type="poker",
            stake_amount=5000,
            max_players=6,
        )
        self.client.post(
            f"/api/v1/games/tables/{table.pk}/join/",
            {"buy_in": 25000},
            format="json",
        )

        mga_acc.refresh_from_db()
        self.assertEqual(mga_acc.balance, 25000)
        self.assertEqual(mga_acc.held_balance, 25000)

        # Leave table
        leave_resp = self.client.post(f"/api/v1/games/tables/{table.pk}/leave/")
        self.assertEqual(leave_resp.status_code, 200)

        # This seat never reached an engine; cancellation returns the reservation.
        mga_acc.refresh_from_db()
        self.assertEqual(mga_acc.balance, 50000)
        self.assertEqual(mga_acc.held_balance, 0)

    def test_non_poker_games_have_fixed_participation_fee_and_reject_increased_buy_in(
        self,
    ):
        from apps.wallet.models import LedgerAccount

        mga_acc, _ = LedgerAccount.objects.get_or_create(
            user=self.user, account_type="player", currency_code="MGA"
        )
        mga_acc.balance = 50000
        mga_acc.held_balance = 0
        mga_acc.save()

        self.client.force_authenticate(self.user)
        table = GameTable.objects.create(
            table_code="ludo-fixed-stake",
            name="Table Ludo 2k",
            game_type="ludo",
            stake_amount=2000,
            max_players=4,
        )

        # Trying to buy-in with 10,000 Ar on Ludo is rejected
        resp_high = self.client.post(
            f"/api/v1/games/tables/{table.pk}/join/",
            {"buy_in": 10000},
            format="json",
        )
        self.assertEqual(resp_high.status_code, 409)
        self.assertIn("la mise de participation est fixe", resp_high.data["detail"])

        # Top-up is also strictly rejected for non-poker games
        topup_resp = self.client.post(
            f"/api/v1/games/tables/{table.pk}/top-up/",
            {"amount": 5000, "idempotency_key": "top-up-ludo"},
            format="json",
        )
        self.assertEqual(topup_resp.status_code, 400)
        self.assertIn(
            "Le rechargement de tapis n'est autorisé qu'au Poker",
            topup_resp.data["detail"],
        )

        # The non-Poker minimum is an eligibility gate, never a debit.
        # This must match test_finance.py and the seat/admission contract.
        join_ok = self.client.post(
            f"/api/v1/games/tables/{table.pk}/join/",
            format="json",
        )
        self.assertEqual(join_ok.status_code, 201)
        self.assertEqual(table.seats.get(user=self.user).buy_in, 0)

        mga_acc.refresh_from_db()
        self.assertEqual(mga_acc.balance, 50000)
        self.assertEqual(mga_acc.held_balance, 0)
