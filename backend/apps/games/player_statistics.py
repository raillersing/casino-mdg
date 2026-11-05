"""Exact human participation counts. Presence and participation are distinct."""

from datetime import timedelta

from django.db import models
from django.utils import timezone

from .models import GameTable, HumanGameActivity


def unique_player_statistics():
    now = timezone.now()
    windows = {
        f"unique_players_{days}d": models.Count(
            "user_id",
            distinct=True,
            filter=models.Q(last_seen_at__gte=now - timedelta(days=days)),
        )
        for days in (1, 7, 30, 365)
    }
    observed = {
        row.pop("game_type"): row
        for row in HumanGameActivity.objects.exclude(user__phone__startswith="guest_")
        .values("game_type")
        .annotate(**windows)
    }
    data = {
        game: observed.get(game, {key: 0 for key in windows})
        for game, _ in GameTable.GAME_TYPES
    }
    first = HumanGameActivity.objects.aggregate(first=models.Min("first_seen_at"))[
        "first"
    ]
    return {
        "games": data,
        "as_of": now.isoformat(),
        "coverage_started_at": first.isoformat() if first else None,
        "population": "identified_humans_with_confirmed_multiplayer_participation",
        "windows_days": [1, 7, 30, 365],
        "window_type": "rolling",
    }
