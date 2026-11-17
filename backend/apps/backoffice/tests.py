from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.analytics.models import ProductEvent
from apps.backoffice.models import AuditEvent, FeatureFlag
from apps.games.models import (
    GameResult,
    GameTable,
    MatchmakingTicket,
    PlayerPresence,
    TableSeat,
)
from apps.payments.models import PaymentIntent, WebhookInboxEvent
from apps.social.models import ChatMessage
from apps.wallet.models import WalletTransaction


class AuditTests(TestCase):
    def test_audit_endpoint_is_staff_only(self):
        user = User.objects.create_user(
            email="player@mdg.local", phone="+261340000015", display_name="Player"
        )
        client = APIClient()
        client.force_authenticate(user)
        self.assertEqual(
            client.get("/api/v1/backoffice/audit-events/").status_code, 403
        )
        staff = User.objects.create_user(
            email="staff@mdg.local",
            phone="+261340000016",
            display_name="Staff",
            is_staff=True,
        )
        AuditEvent.objects.create(
            actor=user, action="test.action", target_type="User", target_id=str(user.pk)
        )
        client.force_authenticate(staff)
        response = client.get("/api/v1/backoffice/audit-events/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)

    def test_staff_can_toggle_feature_flag(self):
        staff = User.objects.create_user(
            email="flagstaff@mdg.local",
            phone="+261340000017",
            display_name="Flag staff",
            is_staff=True,
        )
        client = APIClient()
        client.force_authenticate(staff)
        response = client.post(
            "/api/v1/backoffice/feature-flags/",
            {"key": "game_results", "enabled": False, "reason": "Maintenance"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(FeatureFlag.objects.get(key="game_results").enabled)
        self.assertTrue(
            AuditEvent.objects.filter(
                action="feature_flag.updated",
                target_id=str(FeatureFlag.objects.get(key="game_results").pk),
            ).exists()
        )

    def test_staff_can_hide_chat_message_and_action_is_audited(self):
        player = User.objects.create_user(
            email="chatplayer@mdg.local",
            phone="+261340000020",
            display_name="Chat player",
        )
        table = GameTable.objects.create(
            table_code="audit-chat",
            name="Audit chat",
            game_type="poker",
            created_by=player,
        )
        TableSeat.objects.create(table=table, user=player, seat_index=0)
        message = ChatMessage.objects.create(
            table=table, author=player, body="Message à modérer"
        )
        staff = User.objects.create_user(
            email="modstaff@mdg.local",
            phone="+261340000021",
            display_name="Moderator",
            is_staff=True,
        )
        client = APIClient()
        client.force_authenticate(staff)
        response = client.post(
            "/api/v1/backoffice/chat-messages/",
            {"message_id": message.pk, "reason": "signalement"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(ChatMessage.objects.get(pk=message.pk).is_hidden)
        self.assertTrue(
            AuditEvent.objects.filter(action="chat.message.hidden").exists()
        )
        restored = client.post(
            "/api/v1/backoffice/chat-messages/",
            {"message_id": message.pk, "hidden": False, "reason": "faux positif"},
            format="json",
        )
        self.assertEqual(restored.status_code, 200)
        self.assertFalse(ChatMessage.objects.get(pk=message.pk).is_hidden)
        self.assertTrue(
            AuditEvent.objects.filter(action="chat.message.restored").exists()
        )

    def test_staff_can_run_sandbox_payment_reconciliation(self):
        staff = User.objects.create_user(
            email="recon@mdg.local",
            phone="+261340000024",
            display_name="Recon",
            is_staff=True,
        )
        WebhookInboxEvent.objects.create(
            provider="mvola",
            event_id="unmatched",
            event_type="payment.succeeded",
            payload={"intent_id": "missing"},
            status="processed",
        )
        PaymentIntent.objects.create(
            user=staff,
            provider="mvola",
            direction="deposit",
            amount=100,
            idempotency_key="recon-intent",
        )
        client = APIClient()
        client.force_authenticate(staff)
        response = client.get("/api/v1/backoffice/payment-reconciliation/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["intents_pending"], 1)
        self.assertEqual(len(response.data["unmatched_webhooks"]), 1)

    def test_live_dashboard_is_staff_only_and_aggregates_telemetry(self):
        player = User.objects.create_user(
            email="liveplayer@mdg.local",
            phone="+261340000031",
            display_name="Live Player",
        )
        staff = User.objects.create_user(
            email="livestaff@mdg.local",
            phone="+261340000032",
            display_name="Live Staff",
            is_staff=True,
        )
        client = APIClient()

        # 1. Anonymous user -> 401
        self.assertEqual(
            client.get("/api/v1/backoffice/live-dashboard/").status_code, 401
        )

        # 2. Regular player -> 403 Forbidden
        client.force_authenticate(player)
        self.assertEqual(
            client.get("/api/v1/backoffice/live-dashboard/").status_code, 403
        )

        # 3. Seed game tables, presence, matchmaking, results & latency telemetry
        table = GameTable.objects.create(
            table_code="POKER-LIVE-01",
            name="Table Royale",
            game_type="poker",
            status="running",
            stakes="100 / 200",
            max_players=9,
            created_by=player,
        )
        TableSeat.objects.create(table=table, user=player, seat_index=0)
        PlayerPresence.objects.create(
            user=player,
            game_type="poker",
            status="online",
            last_seen_at=timezone.now(),
        )
        MatchmakingTicket.objects.create(
            user=player,
            game_type="belote",
            status="queued",
        )
        GameResult.objects.create(
            game_id=table.id,
            user=player,
            game_type="poker",
            outcome="win",
            amount=1500,
        )
        for ev_name, meta in (
            ("activation_viewed", {}),
            ("play_hub_viewed", {}),
            ("matchmaking_started", {}),
            ("human_match_found", {}),
            ("table_joined", {}),
            ("test_game_played", {}),
            ("first_game_completed", {}),
            ("reconnection_succeeded", {}),
            ("heartbeat_latency", {"latency_ms": 62}),
            ("heartbeat_latency", {"latency_ms": 145}),
            ("heartbeat_latency", {"latency_ms": 280}),
        ):
            ProductEvent.objects.create(
                event_name=ev_name,
                user=player,
                session_id="live-sess-1",
                game_type="poker",
                mode="HUMAN_MATCH",
                metadata=meta,
            )

        # 4. Staff user -> 200 OK with full 3-pillar telemetry
        client.force_authenticate(staff)
        res = client.get("/api/v1/backoffice/live-dashboard/?days=7")
        self.assertEqual(res.status_code, 200)
        data = res.data

        # Pillar 1: Games stats
        self.assertEqual(data["games_stats"]["overview"]["tables_running"], 1)
        self.assertEqual(data["games_stats"]["overview"]["active_human_seats"], 1)
        self.assertEqual(data["games_stats"]["overview"]["results_recorded"], 1)
        self.assertTrue(len(data["games_stats"]["by_table_game"]) >= 3)
        self.assertTrue(len(data["games_stats"]["instant_games"]) >= 3)
        self.assertEqual(
            data["games_stats"]["active_tables_radar"][0]["table_code"],
            "POKER-LIVE-01",
        )

        # Pillar 2: Application, network latency & concurrency stats
        self.assertEqual(
            data["application_stats"]["services_health"]["database"]["status"], "ok"
        )
        self.assertEqual(data["application_stats"]["network_latency"]["samples"], 3)
        self.assertIsNotNone(data["application_stats"]["network_latency"]["p95_ms"])
        self.assertEqual(
            len(data["application_stats"]["network_latency"]["global_regions_matrix"]),
            6,
        )
        self.assertEqual(
            len(
                data["application_stats"]["concurrency_and_capacity"]["capacity_tiers"]
            ),
            0,
        )

        # Pillar 3: Player flow
        self.assertEqual(data["player_flow"]["realtime_presence"]["online_30s"], 1)
        self.assertEqual(
            data["player_flow"]["realtime_presence"]["searching_matchmaking"], 1
        )
        self.assertEqual(
            data["player_flow"]["network_resilience"]["reconnections_succeeded"], 1
        )
        self.assertEqual(len(data["player_flow"]["hourly_traffic_24h"]), 24)
        self.assertTrue(len(data["player_flow"]["conversion_funnel"]) == 6)
        self.assertTrue(len(data["player_flow"]["live_activity_stream"]) >= 1)

        # Pillar 4: Executive & Financial Dashboard
        self.assertIn("executive_dashboard", data)
        exec_d = data["executive_dashboard"]
        self.assertIn("periods_comparison", exec_d)
        self.assertIn("day", exec_d["periods_comparison"])
        self.assertIn("week", exec_d["periods_comparison"])
        self.assertIn("month", exec_d["periods_comparison"])
        self.assertIn("year", exec_d["periods_comparison"])
        self.assertTrue(len(exec_d["by_game_analytics"]) >= 4)
        self.assertIn("financial_overview", exec_d)
        self.assertIn("leaderboards", exec_d)
        self.assertIn("recent_games_feed", exec_d)

    def test_executive_dashboard_periods_and_leaderboards(self):
        staff = User.objects.create_user(
            email="execstaff@mdg.local",
            phone="+261340000040",
            display_name="Exec Staff",
            is_staff=True,
        )
        vip_winner = User.objects.create_user(
            email="winner@mdg.local",
            phone="+261340000041",
            display_name="Champion Belote",
        )
        vip_bettor = User.objects.create_user(
            email="bettor@mdg.local",
            phone="+261340000042",
            display_name="Grand Parieur",
        )

        # Create wallet transactions
        WalletTransaction.objects.create(
            transaction_code="TX-DEP-01",
            currency_code="MGA",
            user=vip_winner,
            type="deposit",
            direction="credit",
            amount=50000,
            status="completed",
        )
        WalletTransaction.objects.create(
            transaction_code="TX-BET-01",
            currency_code="MGA",
            user=vip_bettor,
            type="game",
            direction="debit",
            amount=15000,
            status="completed",
            description="Mise Belote",
        )
        WalletTransaction.objects.create(
            transaction_code="TX-WD-01",
            currency_code="MGA",
            user=vip_winner,
            type="withdrawal",
            direction="debit",
            amount=10000,
            status="pending",
        )

        WalletTransaction.objects.create(
            transaction_code="TX-PRIZE-01",
            user=vip_winner,
            type="game",
            direction="credit",
            currency_code="MGA",
            amount=42000,
            status="completed",
            metadata={"game_type": "belote"},
        )

        # GameResults prove wins, but no real MGA amount without a ledger post.
        GameResult.objects.create(
            game_id="00000000-0000-0000-0000-000000000001",
            user=vip_winner,
            game_type="belote",
            outcome="win",
            amount=28000,
        )
        GameResult.objects.create(
            game_id="00000000-0000-0000-0000-000000000002",
            user=vip_winner,
            game_type="belote",
            outcome="win",
            amount=14000,
        )

        client = APIClient()
        client.force_authenticate(staff)

        # 1. Test period=day
        res_day = client.get("/api/v1/backoffice/live-dashboard/?period=day")
        self.assertEqual(res_day.status_code, 200)
        exec_day = res_day.data["executive_dashboard"]
        self.assertEqual(exec_day["selected_period"]["period"], "day")
        self.assertEqual(exec_day["selected_period"]["window_days"], 1)

        # Win count from authoritative results; money from MGA ledger entries.
        top_winners = exec_day["leaderboards"]["top_winners"]
        self.assertTrue(len(top_winners) >= 1)
        self.assertEqual(top_winners[0]["user_id"], vip_winner.id)
        self.assertEqual(top_winners[0]["wins_count"], 2)
        self.assertEqual(top_winners[0]["total_won_mga"], 42000)

        # Leaderboard: top bettor should be Grand Parieur with 15000 MGA
        top_bettors = exec_day["leaderboards"]["top_bettors"]
        self.assertTrue(len(top_bettors) >= 1)
        self.assertEqual(top_bettors[0]["user_id"], vip_bettor.id)
        self.assertEqual(top_bettors[0]["total_staked_mga"], 15000)

        # Financial overview: pending withdrawal should show 10000 MGA
        fin = exec_day["financial_overview"]
        self.assertEqual(fin["pending_withdrawals_volume_mga"], 10000)
        self.assertEqual(fin["pending_withdrawals_count"], 1)
        self.assertEqual(fin["deposits_volume_mga"], 50000)
        self.assertTrue(len(fin["recent_transactions"]) >= 3)

        # 2. Test periods: week, month, year
        for p in ("week", "month", "year"):
            r = client.get(f"/api/v1/backoffice/live-dashboard/?period={p}")
            self.assertEqual(r.status_code, 200)
            self.assertEqual(
                r.data["executive_dashboard"]["selected_period"]["period"], p
            )

    def test_financial_metrics_do_not_mix_sim_and_mga_or_client_table_events(self):
        staff = User.objects.create_user(
            email="finance-report@mdg.local",
            phone="+261340000140",
            display_name="Finance",
            is_staff=True,
        )
        player = User.objects.create_user(
            email="currency-check@mdg.local",
            phone="+261340000141",
            display_name="Currency",
        )
        ProductEvent.objects.create(
            user=player,
            event_name="table_created",
            game_type="belote",
            session_id="client-only",
        )
        GameResult.objects.create(
            game_id="00000000-0000-0000-0000-000000000088",
            user=player,
            game_type="belote",
            outcome="win",
            amount=900000,
        )
        for code, currency, kind, direction, amount in (
            ("SIM-DEP", "SIM", "deposit", "credit", 40000),
            ("SIM-STK", "SIM", "game", "debit", 70000),
            ("SIM-PRZ", "SIM", "game", "credit", 80000),
            ("SIM-WD", "SIM", "withdrawal", "debit", 20000),
            ("SIM-BON", "SIM", "bonus", "credit", 5000),
            ("MGA-DEP", "MGA", "deposit", "credit", 6000),
            ("MGA-STK", "MGA", "game", "debit", 1500),
            ("MGA-PRZ", "MGA", "game", "credit", 1100),
            ("MGA-WD", "MGA", "withdrawal", "debit", 1000),
        ):
            WalletTransaction.objects.create(
                transaction_code=code,
                user=player,
                currency_code=currency,
                type=kind,
                direction=direction,
                amount=amount,
                status="completed",
            )

        client = APIClient()
        client.force_authenticate(staff)
        response = client.get("/api/v1/backoffice/live-dashboard/?period=week")
        self.assertEqual(response.status_code, 200)
        executive = response.data["executive_dashboard"]
        week = executive["periods_comparison"]["week"]
        self.assertEqual(week["tables_created"], 0)
        self.assertEqual(week["total_stakes_mga"], 1500)
        self.assertEqual(week["total_payouts_mga"], 1100)
        self.assertEqual(week["ggr_mga"], 400)
        self.assertEqual(week["deposits_volume_mga"], 6000)
        self.assertEqual(week["withdrawals_volume_mga"], 1000)
        self.assertEqual(executive["financial_overview"]["deposits_volume_mga"], 6000)
        self.assertEqual(executive["financial_overview"]["bonus_volume_mga"], 0)
        self.assertEqual(executive["sim_overview"]["completed_bonus_sim"], 5000)
        self.assertEqual(executive["sim_overview"]["completed_game_debits_sim"], 70000)
        self.assertEqual(
            executive["leaderboards"]["top_winners"][0]["total_won_mga"], 1100
        )
        self.assertEqual(executive["by_game_analytics"][1]["ggr_mga"], 0)
