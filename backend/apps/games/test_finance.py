from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.wallet.models import LedgerAccount, WalletTransaction

from .finance import apply_checkpoint, reserve_top_up
from .models import GameTable, TableBankroll, TableFundingOperation, TableSeat
from .services import join_table, leave_table


class FundingTests(TestCase):
    def setUp(self):
        self.users = [
            User.objects.create_user(
                email=f"fund{i}@qa.local", phone=f"fund{i}", display_name=f"P{i}"
            )
            for i in range(2)
        ]
        for user in self.users:
            LedgerAccount.objects.create(
                user=user, account_type="player", currency_code="MGA", balance=100000
            )
        self.table = GameTable.objects.create(
            created_by=self.users[0],
            table_code="finance",
            name="QA",
            game_type="poker",
            stake_amount=5000,
            max_players=6,
        )

    def enter(self, index=0, amount=50000):
        join_table(self.table, self.users[index], amount)
        b = TableBankroll.objects.get(
            table=self.table, user=self.users[index], status="reserved"
        )
        op = TableFundingOperation.objects.get(bankroll=b, kind="entry")
        return b, op

    def checkpoint(self, revision, operations, balances, closed=False):
        return {
            "revision": revision,
            "operations": [str(o.pk) for o in operations],
            "balances": {str(b.pk): v for b, v in balances},
            "closed": closed,
        }

    def balances(self, index=0):
        w = LedgerAccount.objects.get(
            user=self.users[index], account_type="player", currency_code="MGA"
        )
        e = LedgerAccount.objects.get(
            user=self.users[index], account_type="escrow", currency_code="MGA"
        )
        return w.balance, w.held_balance, e.balance

    def test_reserve_replay_apply_then_exit_refunds_pending_exactly_once(self):
        b, entry = self.enter()
        apply_checkpoint(
            self.table.pk, self.checkpoint(1, [entry], [(b, {"stack": 50000})])
        )
        _, _, top = reserve_top_up(self.table, self.users[0], 10000, "top-1")
        _, _, retry = reserve_top_up(self.table, self.users[0], 10000, "top-1")
        self.assertEqual(top.pk, retry.pk)
        self.assertEqual(self.balances(), (40000, 60000, 60000))
        leave_table(self.table, self.users[0])
        data = self.checkpoint(
            2, [entry], [(b, {"stack": 50000, "pending": 0, "exited": True})], True
        )
        apply_checkpoint(self.table.pk, data)
        apply_checkpoint(self.table.pk, data)
        self.assertEqual(self.balances(), (100000, 0, 0))
        b.refresh_from_db()
        self.assertEqual((b.status, b.pending_top_up), ("refunded", 0))
        self.assertEqual(
            TableFundingOperation.objects.get(pk=top.pk).status, "cancelled"
        )
        for tx in WalletTransaction.objects.all():
            self.assertEqual(
                sum(e.amount for e in tx.entries.filter(entry_type="debit")),
                sum(e.amount for e in tx.entries.filter(entry_type="credit")),
            )

    def test_failed_admission_can_cancel_without_waiting_for_an_engine(self):
        self.enter()
        reserve_top_up(self.table, self.users[0], 10000, "unadmitted-top")
        leave_table(self.table, self.users[0])
        self.assertEqual(self.balances(), (100000, 0, 0))
        self.assertFalse(TableSeat.objects.filter(table=self.table).exists())

    def test_gains_losses_and_out_of_order_delivery_preserve_total_mga(self):
        a, ea = self.enter(0)
        b, eb = self.enter(1)
        data = self.checkpoint(
            5, [ea, eb], [(a, {"stack": 60000}), (b, {"stack": 40000})]
        )
        apply_checkpoint(self.table.pk, data)
        self.assertEqual(self.balances(0), (50000, 60000, 60000))
        self.assertEqual(self.balances(1), (50000, 40000, 40000))
        with self.assertRaises(ValueError):
            apply_checkpoint(
                self.table.pk, self.checkpoint(4, [ea], [(a, {"stack": 50000})])
            )
        apply_checkpoint(
            self.table.pk,
            self.checkpoint(
                6,
                [ea, eb],
                [
                    (a, {"stack": 60000, "exited": True}),
                    (b, {"stack": 40000, "exited": True}),
                ],
                True,
            ),
        )
        self.assertEqual(self.balances(0), (110000, 0, 0))
        self.assertEqual(self.balances(1), (90000, 0, 0))

    def test_unfunded_checkpoint_is_atomic_and_rejected(self):
        b, entry = self.enter()
        with self.assertRaises(ValueError):
            apply_checkpoint(
                self.table.pk, self.checkpoint(2, [entry], [(b, {"stack": 999999})])
            )
        self.assertEqual(self.balances(), (50000, 50000, 50000))
        self.assertEqual(
            TableFundingOperation.objects.get(pk=entry.pk).status, "reserved"
        )

    def test_top_up_never_changes_existing_hand_and_clears_pending_on_application(self):
        b, entry = self.enter()
        apply_checkpoint(
            self.table.pk, self.checkpoint(1, [entry], [(b, {"stack": 50000})])
        )
        _, _, top = reserve_top_up(self.table, self.users[0], 10000, "top")
        apply_checkpoint(
            self.table.pk,
            self.checkpoint(2, [entry, top], [(b, {"stack": 50000, "pending": 10000})]),
        )
        b.refresh_from_db()
        self.assertEqual((b.current_stack, b.pending_top_up), (50000, 10000))
        apply_checkpoint(
            self.table.pk, self.checkpoint(3, [entry, top], [(b, {"stack": 60000})])
        )
        b.refresh_from_db()
        self.assertEqual(
            (b.current_stack, b.pending_top_up, b.held_amount), (60000, 0, 60000)
        )

    def test_non_poker_minimum_is_a_balance_gate_without_any_debit(self):
        self.table.game_type = "ludo"
        self.table.stake_amount = 50000
        self.table.save()
        seat, _ = join_table(self.table, self.users[0])
        self.assertEqual(seat.buy_in, 0)
        self.assertFalse(TableBankroll.objects.exists())
        self.assertFalse(WalletTransaction.objects.exists())
        self.assertEqual(
            LedgerAccount.objects.get(
                user=self.users[0], account_type="player"
            ).balance,
            100000,
        )
        with self.assertRaises(ValueError):
            self.table.stake_amount = 100001
            self.table.save()
            join_table(self.table, self.users[1])

    def test_same_key_cannot_change_amount_and_invalid_numbers_do_not_debit(self):
        self.enter()
        reserve_top_up(self.table, self.users[0], 10000, "same")
        for value, key in [
            (20000, "same"),
            (True, "bool"),
            (1.5, "float"),
            (-1, "minus"),
            (2**63, "huge"),
            (50000, "poor"),
        ]:
            with self.assertRaises(ValueError):
                reserve_top_up(self.table, self.users[0], value, key)
        self.assertEqual(self.balances(), (40000, 60000, 60000))

    @override_settings(GAME_ENGINE_RESULT_SECRET="review-secret")
    def test_finance_endpoint_requires_internal_auth_and_never_accepts_browser_stack(
        self,
    ):
        b, entry = self.enter()
        client = APIClient()
        client.force_authenticate(self.users[0])
        path = f"/api/v1/games/internal/tables/{self.table.pk}/finance/"
        body = self.checkpoint(1, [entry], [(b, {"stack": 50000})])
        self.assertEqual(client.post(path, body, format="json").status_code, 403)
        self.assertEqual(
            client.post(
                path, body, format="json", HTTP_X_GAME_ENGINE_SECRET="review-secret"
            ).status_code,
            200,
        )

    def test_unadmitted_expiry_releases_all_reservations(self):
        from datetime import timedelta

        from django.utils import timezone

        from .lifecycle import reconcile_tables

        self.enter()
        reserve_top_up(self.table, self.users[0], 10000, "top")
        GameTable.objects.filter(pk=self.table.pk).update(
            updated_at=timezone.now() - timedelta(hours=1)
        )
        with patch(
            "apps.games.lifecycle.engine_activity_snapshot",
            return_value={"uptime_seconds": 300, "tables": {}},
        ):
            reconcile_tables()
        self.assertEqual(self.balances(), (100000, 0, 0))

    def test_admitted_or_legacy_money_is_not_guessed_after_loss_of_engine(self):
        from datetime import timedelta

        from django.utils import timezone

        from .lifecycle import reconcile_tables

        b, entry = self.enter()
        apply_checkpoint(
            self.table.pk, self.checkpoint(1, [entry], [(b, {"stack": 50000})])
        )
        GameTable.objects.filter(pk=self.table.pk).update(
            updated_at=timezone.now() - timedelta(hours=1)
        )
        with patch(
            "apps.games.lifecycle.engine_activity_snapshot",
            return_value={"uptime_seconds": 300, "tables": {}},
        ):
            reconcile_tables()
        self.table.refresh_from_db()
        self.assertNotEqual(self.table.status, "finished")
        self.assertEqual(self.balances(), (50000, 50000, 50000))


from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.db import close_old_connections, connection
from django.test import TransactionTestCase


class FundingConcurrencyTests(TransactionTestCase):
    def test_two_tables_cannot_reserve_the_same_available_funds(self):
        if connection.vendor != "postgresql":
            self.skipTest("Row-lock concurrency requires PostgreSQL")
        user = User.objects.create_user(
            email="concurrent@qa.local", phone="concurrent", display_name="QA"
        )
        LedgerAccount.objects.create(
            user=user, account_type="player", currency_code="MGA", balance=80000
        )
        tables = [
            GameTable.objects.create(
                table_code=f"concurrent-{i}",
                name="QA",
                game_type="poker",
                stake_amount=5000,
                max_players=2,
            )
            for i in range(2)
        ]
        barrier = Barrier(2)

        def enter(table_id):
            close_old_connections()
            try:
                table = GameTable.objects.get(pk=table_id)
                actor = User.objects.get(pk=user.pk)
                barrier.wait(timeout=5)
                try:
                    join_table(table, actor, 50000)
                    return "reserved"
                except ValueError:
                    return "insufficient"
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(enter, t.pk) for t in tables]
            outcomes = [f.result(timeout=15) for f in futures]
        self.assertCountEqual(outcomes, ["reserved", "insufficient"])
        wallet = LedgerAccount.objects.get(
            user=user, account_type="player", currency_code="MGA"
        )
        self.assertEqual((wallet.balance, wallet.held_balance), (30000, 50000))
        self.assertEqual(TableFundingOperation.objects.filter(user=user).count(), 1)
