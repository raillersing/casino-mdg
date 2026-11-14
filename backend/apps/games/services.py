import os
from datetime import datetime
from datetime import timezone as dt_timezone

import jwt
import requests
from django.db import transaction

from .live_activity import engine_activity
from .models import GameTable, TableBankroll, TableSeat
from .modes import HUMAN_MATCH


def generate_admission_token(
    user, table, seat_index=None, role="player", lifetime_seconds=60, buy_in=None
):
    now = datetime.now(dt_timezone.utc)
    if role == "player" and seat_index is not None:
        TableSeat.objects.filter(table=table, user=user).update(admitted_at=now)
    funding = None
    if role == "player" and table.game_type == "poker" and table.stake_amount > 0:
        funding = TableBankroll.objects.filter(
            table=table, user=user, status__in=["reserved", "active"], finance_version=1
        ).first()
        if not funding:
            from rest_framework.exceptions import ValidationError

            raise ValidationError("Financement MGA non rapproché ou siège non financé.")
    if buy_in is None and role == "player":
        seat = TableSeat.objects.filter(table=table, user=user).first()
        if seat and seat.buy_in:
            buy_in = seat.buy_in
        elif table.game_type == "poker" and table.stake_amount:
            buy_in = table.stake_amount
        else:
            # Non-poker minimums are eligibility checks, not engine chips.
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
        "funding_session": str(funding.pk) if funding else "",
        "funding_operation": (
            str(funding.tablefundingoperation_set.get(kind="entry").pk)
            if funding
            else ""
        ),
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
            live = engine_activity().get(str(table.pk), {})
            # A running game may accept an additional seat only while the
            # engine explicitly advertises the room as waiting. "started"
            # alone cannot prove that a Poker hand is safe for late entry.
            waiting = live.get("waiting") is True
        except (requests.RequestException, ValueError):
            waiting = False
        if not waiting:
            raise ValueError("Cette partie a déjà commencé.")
        table.status = "open"

    from .finance import account, money, reserve

    min_part = money(table.stake_amount, zero=True)
    effective_buy_in = 0
    wallet = account(user.pk)
    if table.game_type != "poker":
        if buy_in is not None and int(buy_in) != min_part:
            raise ValueError(
                f"Pour {table.game_type.capitalize()}, la mise de participation "
                f"est fixe et ne peut pas être augmentée ({min_part} Ar)."
            )
        # Admission to non-poker games must never reserve MGA. The minimum
        # is an eligibility gate, not a debit or a playable monetary stack.
        if min_part > 0 and wallet.balance < min_part:
            raise ValueError("Solde Ariary inférieur au minimum d'accès ; aucun débit.")
    elif min_part:
        effective_buy_in = money(buy_in if buy_in is not None else min_part)
        if effective_buy_in < min_part:
            raise ValueError("Le tapis choisi doit atteindre le minimum de la table.")
        bankroll = TableBankroll.objects.create(
            table=table,
            user=user,
            currency_code="MGA",
            finance_version=1,
            status="reserved",
            current_stack=0,
        )
        reserve(
            table, user, bankroll, effective_buy_in, f"entry:{bankroll.pk}", "entry"
        )
    elif buy_in not in (None, 0):
        raise ValueError("Une table gratuite utilise des jetons SIM, pas des Ariary.")

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

        from .finance import request_leave

        if request_leave(table, user):
            table.refresh_from_db(fields=["status"])
            return True, table.status == "finished"
        deleted_count, _ = TableSeat.objects.filter(table=table, user=user).delete()
        if deleted_count == 0:
            return False, False

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


def top_up_table(table, user, amount, key=None):
    from .finance import reserve_top_up

    return reserve_top_up(table, user, amount, key)
