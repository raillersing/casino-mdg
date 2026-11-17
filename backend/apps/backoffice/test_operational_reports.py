"""Operational reports are based on persisted server data, never mixed currencies."""

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.analytics.models import ProductEvent
from apps.backoffice.models import AuditEvent
from apps.games.models import GameResult, GameTable, MatchmakingTicket
from apps.payments.models import PaymentIntent, WebhookInboxEvent
from apps.wallet.models import WalletTransaction


class OperationalReportsTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            email="reports-staff@mdg.local",
            phone="+261340000301",
            display_name="Ops reader",
            is_staff=True,
        )
        self.superuser = User.objects.create_superuser(
            email="reports-admin@mdg.local",
            password="test-only-strong-credential",
            phone="+261340000302",
            display_name="Admin",
        )
        self.player = User.objects.create_user(
            email="reports-player@mdg.local",
            phone="+261340000303",
            display_name="Real Player",
        )
        self.client = APIClient()

    def seed(self):
        table = GameTable.objects.create(
            table_code="OPS-PUB-0001",
            name="Table opérations",
            game_type="belote",
            status="open",
            max_players=4,
            created_by=self.player,
            is_private=True,
            access_code="729103",
        )
        GameResult.objects.create(
            game_id=table.id,
            user=self.player,
            game_type="belote",
            outcome="win",
            amount=9000,
        )
        MatchmakingTicket.objects.create(
            user=self.player,
            game_type="ludo",
            status="queued",
        )
        ProductEvent.objects.create(
            event_name="table_created",
            user=self.player,
            game_type="belote",
        )
        for code, currency, direction, amount in (
            ("OPS-SIM-BET", "SIM", "debit", 8000),
            ("OPS-MGA-BET", "MGA", "debit", 300),
            ("OPS-MGA-WIN", "MGA", "credit", 200),
        ):
            WalletTransaction.objects.create(
                transaction_code=code,
                user=self.player,
                type="game",
                status="completed",
                direction=direction,
                currency_code=currency,
                amount=amount,
            )
        PaymentIntent.objects.create(
            user=self.player,
            provider="mvola",
            direction="deposit",
            amount=5000,
            status="processing",
            idempotency_key="ops-psp-001",
        )
        WebhookInboxEvent.objects.create(
            provider="mvola",
            event_id="ops-event-001",
            event_type="payment.processing",
        )
        return table

    def test_report_is_staff_only_and_has_explicit_sim_mga_separation(self):
        self.seed()
        url = "/api/v1/backoffice/reports/overview/?days=7"
        self.assertEqual(self.client.get(url).status_code, 401)
        self.client.force_authenticate(self.player)
        self.assertEqual(self.client.get(url).status_code, 403)
        self.client.force_authenticate(self.staff)
        result = self.client.get(url)
        self.assertEqual(result.status_code, 200, result.data)
        data = result.data
        self.assertEqual(data["games"]["tables_created"], 1)
        self.assertEqual(data["games"]["tables_by_game"]["belote"], 1)
        self.assertEqual(data["games"]["games_with_results"], 1)
        self.assertEqual(data["games"]["matchmaking_tickets"]["queued"], 1)
        self.assertEqual(data["players"]["registered_total"], 1)
        self.assertEqual(data["players"]["active_accounts"], 1)
        self.assertEqual(
            {(r["currency"], r["direction"], r["amount"]) for r in data["wallet"]["MGA"]},
            {("MGA", "debit", 300), ("MGA", "credit", 200)},
        )
        self.assertEqual(data["wallet"]["SIM"][0]["amount"], 8000)
        self.assertEqual(data["payments"]["intent_counts"]["processing"], 1)
        self.assertEqual(data["payments"]["webhooks_received"], 1)
        self.assertFalse(data["payments"]["settlement_verified"])
        self.assertNotIn(self.player.phone, str(data))
        self.assertNotIn(self.player.email, str(data))
        for invalid in ("0", "365", "abc", "-1"):
            self.assertEqual(
                self.client.get(f"/api/v1/backoffice/reports/overview/?days={invalid}").status_code,
                400,
            )

    def test_export_is_superuser_only_aggregate_and_audited(self):
        self.seed()
        url = "/api/v1/backoffice/reports/export.csv?days=7"
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(url).status_code, 403)
        self.client.force_authenticate(self.superuser)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])
        self.assertEqual(response["Cache-Control"], "no-store")
        data = response.content.decode("utf-8")
        self.assertIn("section,metric,dimension,count,amount,currency", data)
        self.assertIn("MGA", data)
        self.assertIn("SIM", data)
        self.assertNotIn(self.player.phone, data)
        self.assertNotIn(self.player.email, data)
        self.assertTrue(
            AuditEvent.objects.filter(
                action="backoffice.report.csv_exported",
                actor=self.superuser,
            ).exists()
        )

    def test_live_tables_protects_private_codes_and_is_paginated(self):
        table = self.seed()
        self.client.force_authenticate(self.staff)
        result = self.client.get("/api/v1/backoffice/games/tables/?status=open&limit=1")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["count"], 1)
        item = result.data["results"][0]
        self.assertEqual(item["id"], str(table.id))
        self.assertEqual(item["game_type"], "belote")
        self.assertTrue(item["is_private"])
        self.assertNotIn("access_code", item)
        self.assertNotIn(table.access_code, str(result.data))
        self.assertIn("not confirmed live engine", result.data["status_provenance"])
        self.assertEqual(
            self.client.get("/api/v1/backoffice/games/tables/?status=broken").status_code,
            400,
        )

    def test_live_dashboard_does_not_invent_production_readiness(self):
        self.client.force_authenticate(self.staff)
        response = self.client.get("/api/v1/backoffice/live-dashboard/?period=day")
        self.assertEqual(response.status_code, 200)
        capacity = response.data["application_stats"]["concurrency_and_capacity"]
        self.assertIsNone(capacity["production_readiness_score"])
        self.assertIsNone(capacity["readiness_pillars"])
        self.assertEqual(capacity["capacity_tiers"], [])
        self.assertEqual(capacity["readiness_evidence"]["status"], "not_assessed")
