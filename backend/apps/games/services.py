import os
from datetime import datetime, timezone

import jwt
from django.db import transaction

from .models import GameTable, TableSeat
from .modes import HUMAN_MATCH


def generate_admission_token(
    user, table, seat_index=None, role="player", lifetime_seconds=60
):
    now = datetime.now(timezone.utc)
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
        "table_settings": {
            "version": table.rules_version,
            "max_players": table.max_players,
            "turn_duration": table.turn_duration,
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
def join_table(table, user):
    table = GameTable.objects.select_for_update().get(pk=table.pk)
    if table.status == "finished":
        raise ValueError("Cette table est terminée.")
    existing = TableSeat.objects.filter(table=table, user=user).first()
    if existing:
        return existing, False
    if table.seats.count() >= table.max_players:
        raise ValueError("Cette table est complète.")
    seat = TableSeat.objects.create(
        table=table, user=user, seat_index=table.seats.count()
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

        remaining_seats = table.seats.count()

        # Auto-Close: Quand il n'y a plus aucun joueur sur la table, la table se ferme automatiquement
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

        elif table.status == "running" and remaining_seats < table.max_players:
            table.status = "open"
            table.save(update_fields=["status", "updated_at"])

        return True, False
