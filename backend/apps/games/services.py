from django.conf import settings
from django.db import transaction

from .models import GameTable, TableSeat


def seed_demo_tables():
    if not settings.DEBUG or GameTable.objects.exists():
        return
    demo_tables = [
        ("emerald-01", "Émeraude", "poker", "100 / 200", 6, "running"),
        ("baobab-01", "Baobab", "belote", "Gratuit", 4, "open"),
        ("vanilla-01", "Vanille", "rami", "50 / 100", 4, "open"),
        ("ocean-01", "Océan Indien", "poker", "500 / 1K", 9, "open"),
    ]
    GameTable.objects.bulk_create(
        [
            GameTable(
                table_code=code,
                name=name,
                game_type=game_type,
                stakes=stakes,
                max_players=max_players,
                status=status,
            )
            for code, name, game_type, stakes, max_players, status in demo_tables
        ]
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
