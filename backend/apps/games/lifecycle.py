"""Expire orphaned real-time tables only with a healthy, warmed-up engine."""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .live_activity import engine_activity_snapshot
from .models import GameTable
from .modes import HUMAN_MATCH


def reconcile_tables():
    observed_at = timezone.now()
    snapshot = engine_activity_snapshot()  # Any failure leaves the database untouched.
    if snapshot.get("uptime_seconds", 0) < 120:
        return {"closed": 0, "engine_ready": False}
    live = snapshot["tables"]
    closed = 0
    released = 0
    candidates = GameTable.objects.filter(mode=HUMAN_MATCH).exclude(status="finished")
    for table_id in candidates.values_list("pk", flat=True).iterator():
        with transaction.atomic():
            table = GameTable.objects.select_for_update().filter(pk=table_id).first()
            if table is None:
                continue
            if table.status == "finished" or table.updated_at > observed_at:
                continue
            if str(table_id) in live:
                entry = live[str(table_id)]
                reserved = entry.get("reserved_humans")
                if entry.get("waiting") is True and isinstance(reserved, list):
                    cutoff = observed_at - timedelta(
                        seconds=getattr(
                            settings, "TABLE_RESERVATION_EXPIRY_SECONDS", 120
                        )
                    )
                    stale = (
                        table.seats.exclude(user_id__in=reserved)
                        .filter(joined_at__lt=cutoff)
                        .filter(Q(admitted_at__isnull=True) | Q(admitted_at__lt=cutoff))
                    )
                    count, _ = stale.delete()
                    released += count
                    if (
                        count
                        and table.status == "running"
                        and table.seats.count() < table.max_players
                    ):
                        table.status = "open"
                        table.save(update_fields=["status", "updated_at"])
                continue  # Retain engine seats, including disconnected humans in grace.
            if not table.seats.exists():
                duration = getattr(settings, "TABLE_EMPTY_EXPIRY_SECONDS", 120)
            elif table.status == "running":
                duration = getattr(settings, "TABLE_RUNNING_EXPIRY_SECONDS", 120)
            else:
                duration = getattr(settings, "TABLE_WAITING_EXPIRY_SECONDS", 900)
            if table.updated_at >= observed_at - timedelta(seconds=duration):
                continue
            table.status = "finished"
            table.save(update_fields=["status", "updated_at"])
            closed += 1
    return {"closed": closed, "released_seats": released, "engine_ready": True}
