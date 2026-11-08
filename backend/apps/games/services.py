import os
from datetime import datetime, timezone as dt_timezone

import jwt
import requests
from django.db import transaction
from django.utils import timezone

from .live_activity import engine_activity
from .models import GameTable, TableBankroll, TableSeat
from .modes import HUMAN_MATCH


def generate_admission_token(
    user, table, seat_index=None, role="player", lifetime_seconds=60, buy_in=None
):
    now = datetime.now(dt_timezone.utc)
    if role == "player" and seat_index is not None:
        TableSeat.objects.filter(table=table, user=user).update(admitted_at=now)
    if buy_in is None and role == "player":
        seat = TableSeat.objects.filter(table=table, user=user).first()
        if seat and seat.buy_in:
            buy_in = seat.buy_in
        elif table.stake_amount:
            buy_in = table.stake_amount
        else:
            buy_in = 0
    payload = {
        "sub": str(user.pk),
        "name": (
            getattr(user, "display_name", "")
            or getattr(user, "username", "")
            or str(user.pk)[:8]
        ),
        "table_id": str(table.pk),
        "seat_id": seat_index if seat_index is not None else -1,
        "role": role,
        "mode": table.mode,
        "game_type": table.game_type,
        "type": "admission",
        "turn_duration": table.turn_duration,
        "buy_in": int(buy_in or 0),
        "stake_amount": table.stake_amount,
        "table_settings": {
            "version": table.rules_version,
            "max_players": table.max_players,
            "turn_duration": table.turn_duration,
            "stake_amount": table.stake_amount,
            "min_participation": table.stake_amount,
            "belote_target": (
                table.rules_config.get("target_score", 501)
                if table.game_type == "belote"
                else 0
            ),
            "poker_small_blind": (
                table.rules_config.get("small_blind", 50)
                if table.game_type == "poker"
                else 0
            ),
        },
        "iat": int(now.timestamp()),
        "exp": int(now.timestamp()) + lifetime_seconds,
    }
    if table.rules_version == 0:
        payload.pop("table_settings", None)
    secret = os.getenv("JWT_SECRET", "dev-jwt-secret-change-me-32-bytes")
    return jwt.encode(payload, secret, algorithm="HS256")


def seed_demo_tables():
    demo_tables = [
        ("emerald-01", "Émeraude", "poker", "100 / 200", 6, "open"),
        ("baobab-01", "Baobab", "belote", "Gratuit", 4, "open"),
        ("vanilla-01", "Vanille", "rami", "50 / 100", 4, "open"),
        ("ludo-mada-01", "Ludo Malagasy", "ludo", "Gratuit", 4, "open"),
        ("domino-gasikara-01", "Domino Double-Six", "domino", "50 / 100", 4, "open"),
        ("ocean-01", "Océan Indien", "poker", "500 / 1K", 9, "open"),
    ]
    for code, name, game_type, stakes, max_players, status in demo_tables:
        GameTable.objects.get_or_create(
            table_code=code,
            defaults={
                "name": name,
                "game_type": game_type,
                "stakes": stakes,
                "max_players": max_players,
                "status": status,
                "mode": HUMAN_MATCH,
            },
        )


@transaction.atomic
def join_table(table, user, buy_in=None):
    from apps.wallet.models import LedgerAccount, LedgerEntry, WalletTransaction

    table = GameTable.objects.select_for_update().get(pk=table.pk)
    if table.status == "finished":
        raise ValueError("Cette table est terminée.")
    existing = TableSeat.objects.filter(table=table, user=user).first()
    if existing:
        table.save(update_fields=["updated_at"])
        return existing, False
    if table.seats.count() >= table.max_players:
        raise ValueError("Cette table est complète.")
    if table.status == "running":
        try:
            waiting = engine_activity().get(str(table.pk), {}).get("waiting") is True
        except (requests.RequestException, ValueError):
            waiting = False
        if not waiting:
            raise ValueError("Cette partie a déjà commencé.")
        table.status = "open"

    min_part = table.stake_amount
    effective_buy_in = 0
    if table.game_type == "poker":
        if buy_in is not None:
            effective_buy_in = int(buy_in)
            if effective_buy_in < min_part:
                raise ValueError(
                    f"Le tapis choisi ({effective_buy_in:,} Ar) doit être au moins égal au minimum de table ({min_part:,} Ar)."
                )
        else:
            effective_buy_in = min_part
    else:
        effective_buy_in = min_part

    if effective_buy_in > 0:
        mga_acc = LedgerAccount.objects.select_for_update().get_or_create(
            user=user, account_type="player", currency_code="MGA"
        )[0]
        if mga_acc.balance < effective_buy_in:
            raise ValueError(
                f"Solde Ariary insuffisant. Solde disponible : {mga_acc.balance:,} Ar (requis : {effective_buy_in:,} Ar)."
            )
        mga_acc.balance -= effective_buy_in
        mga_acc.held_balance += effective_buy_in
        mga_acc.save(update_fields=["balance", "held_balance", "updated_at"])

        tx_code = f"MGA-BUYIN-{str(table.id)[:18]}-{user.pk}-{int(timezone.now().timestamp())}"
        tx = WalletTransaction.objects.create(
            transaction_code=tx_code,
            user=user,
            type="game",
            direction="debit",
            amount=effective_buy_in,
            currency_code="MGA",
            status="completed",
            source_account=mga_acc,
            description=f"Participation table {table.name} ({table.get_game_type_display()})",
            metadata={"table_id": str(table.id), "buy_in": effective_buy_in},
            processed_at=timezone.now(),
        )
        LedgerEntry.objects.create(
            transaction=tx,
            account=mga_acc,
            entry_type="debit",
            amount=effective_buy_in,
            balance_after=mga_acc.balance,
            description="Réservation buy-in table",
        )
        TableBankroll.objects.create(
            table=table,
            user=user,
            currency_code="MGA",
            reserved_amount=effective_buy_in,
            current_stack=effective_buy_in,
            status="active",
            initial_transaction=tx,
        )

    occupied = set(table.seats.values_list("seat_index", flat=True))
    available = next(
        index for index in range(table.max_players) if index not in occupied
    )
    seat = TableSeat.objects.create(
        table=table, user=user, seat_index=available, buy_in=effective_buy_in
    )
    if table.seats.count() >= table.max_players:
        table.status = "running"
    table.save(update_fields=["status", "updated_at"])
    return seat, True


def leave_table(table, user):
    with transaction.atomic():
        try:
            table = GameTable.objects.select_for_update().get(pk=table.pk)
        except GameTable.DoesNotExist:
            return False, False

        deleted_count, _ = TableSeat.objects.filter(table=table, user=user).delete()
        if deleted_count == 0:
            return False, False

        from apps.wallet.models import LedgerAccount, LedgerEntry, WalletTransaction

        bankroll = (
            TableBankroll.objects.select_for_update()
            .filter(table=table, user=user, status="active")
            .first()
        )
        if bankroll and bankroll.current_stack > 0:
            refund_amount = bankroll.current_stack
            mga_acc = LedgerAccount.objects.select_for_update().get_or_create(
                user=user, account_type="player", currency_code="MGA"
            )[0]
            mga_acc.balance += refund_amount
            mga_acc.held_balance = max(0, mga_acc.held_balance - refund_amount)
            mga_acc.save(update_fields=["balance", "held_balance", "updated_at"])

            tx_code = f"MGA-REFUND-{str(table.id)[:18]}-{user.pk}-{int(timezone.now().timestamp())}"
            tx = WalletTransaction.objects.create(
                transaction_code=tx_code,
                user=user,
                type="refund",
                direction="credit",
                amount=refund_amount,
                currency_code="MGA",
                status="completed",
                destination_account=mga_acc,
                description=f"Remboursement sortie table {table.name}",
                metadata={"table_id": str(table.id), "refund_amount": refund_amount},
                processed_at=timezone.now(),
            )
            LedgerEntry.objects.create(
                transaction=tx,
                account=mga_acc,
                entry_type="credit",
                amount=refund_amount,
                balance_after=mga_acc.balance,
                description="Restitution stack sortie table",
            )
            bankroll.status = "refunded"
            bankroll.current_stack = 0
            bankroll.save(update_fields=["status", "current_stack", "updated_at"])

        remaining_seats = table.seats.count()

        # Fermer la table quand le dernier joueur part.
        if remaining_seats == 0:
            table.status = "finished"
            table.save(update_fields=["status", "updated_at"])

            try:
                from .models import BotSimulationSession

                BotSimulationSession.objects.filter(
                    table=table, status__in={"queued", "running"}
                ).update(status="completed")
            except Exception:
                pass

            return True, True

        return True, False


@transaction.atomic
def top_up_table(table, user, amount):
    if amount <= 0:
        raise ValueError("Le montant de recharge doit être supérieur à 0 Ar.")
    seat = TableSeat.objects.filter(table=table, user=user).first()
    if not seat:
        raise ValueError("Vous n'êtes pas assis à cette table.")

    from apps.wallet.models import LedgerAccount, LedgerEntry, WalletTransaction

    mga_acc = LedgerAccount.objects.select_for_update().get_or_create(
        user=user, account_type="player", currency_code="MGA"
    )[0]
    if mga_acc.balance < amount:
        raise ValueError(
            f"Solde Ariary insuffisant. Solde disponible : {mga_acc.balance:,} Ar (demandé : {amount:,} Ar)."
        )
    mga_acc.balance -= amount
    mga_acc.held_balance += amount
    mga_acc.save(update_fields=["balance", "held_balance", "updated_at"])

    tx_code = f"MGA-TOPUP-{str(table.id)[:18]}-{user.pk}-{int(timezone.now().timestamp())}"
    tx = WalletTransaction.objects.create(
        transaction_code=tx_code,
        user=user,
        type="game",
        direction="debit",
        amount=amount,
        currency_code="MGA",
        status="completed",
        source_account=mga_acc,
        description=f"Recharge tapis table {table.name}",
        metadata={"table_id": str(table.id), "top_up_amount": amount},
        processed_at=timezone.now(),
    )
    LedgerEntry.objects.create(
        transaction=tx,
        account=mga_acc,
        entry_type="debit",
        amount=amount,
        balance_after=mga_acc.balance,
        description="Réservation recharge tapis poker",
    )
    bankroll, _ = TableBankroll.objects.get_or_create(
        table=table,
        user=user,
        defaults={
            "currency_code": "MGA",
            "reserved_amount": 0,
            "current_stack": 0,
            "status": "active",
        },
    )
    bankroll.pending_top_up += amount
    bankroll.reserved_amount += amount
    bankroll.save(update_fields=["pending_top_up", "reserved_amount", "updated_at"])
    return bankroll, mga_acc.balance
