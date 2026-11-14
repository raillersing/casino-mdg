from datetime import timedelta

import requests
from django.db import connection, transaction
from django.utils import timezone

from .live_activity import engine_activity
from .models import GameTable, MatchmakingTicket, PlayerPresence
from .services import join_table

PRESENCE_TTL = timedelta(seconds=30)
# The frontend sends a heartbeat every 15 seconds; tolerate brief mobile
# interruptions without treating indefinitely abandoned searches as active.
QUEUE_TTL = timedelta(seconds=45)


def active_presence(game_type=None):
    cutoff = timezone.now() - PRESENCE_TTL
    queryset = PlayerPresence.objects.filter(last_seen_at__gte=cutoff)
    if game_type:
        queryset = queryset.filter(game_type=game_type)
    return queryset


def active_queued_tickets(game_type=None):
    queryset = MatchmakingTicket.objects.filter(
        status="queued", updated_at__gte=timezone.now() - QUEUE_TTL
    )
    if game_type:
        queryset = queryset.filter(game_type=game_type)
    return queryset


@transaction.atomic
def queue_player(user, game_type, target_size=None):
    # Serialize queue allocation per game before locking individual tickets.
    # Otherwise simultaneous entrants can lock their own tickets and deadlock.
    if connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            game_key = list(dict(GameTable.GAME_TYPES)).index(game_type)
            cursor.execute("SELECT pg_advisory_xact_lock(%s, %s)", [617204, game_key])
    now = timezone.now()
    PlayerPresence.objects.update_or_create(
        user=user,
        defaults={"game_type": game_type, "status": "searching", "last_seen_at": now},
    )
    # Expire a ticket whose browser stopped sending the queue heartbeat;
    # a returning user must explicitly begin a fresh search.
    MatchmakingTicket.objects.select_for_update().filter(
        user=user, status="queued", updated_at__lt=now - QUEUE_TTL
    ).update(status="cancelled", updated_at=now)
    # A human should not remain matchable in two games simultaneously.
    MatchmakingTicket.objects.select_for_update().filter(
        user=user, status="queued"
    ).exclude(game_type=game_type).update(status="cancelled", updated_at=now)
    ticket, created = MatchmakingTicket.objects.select_for_update().get_or_create(
        user=user,
        game_type=game_type,
        status="queued",
        defaults={},
    )
    if not created and ticket.matched_table_id:
        return ticket, False
    from .table_rules import CAPABILITIES

    try:
        capacity = (
            int(target_size)
            if target_size is not None
            else (4 if game_type == "belote" else 2)
        )
    except (ValueError, TypeError):
        raise ValueError("Nombre de joueurs invalide.")
    if capacity not in CAPABILITIES[game_type]["players"]:
        raise ValueError("Format de table invalide.")
    ticket.target_players = capacity
    ticket.save(update_fields=["target_players", "updated_at"])

    # Prefer a public, free table with a verified connected human.
    # A reserved seat or a lobby heartbeat alone is not table presence.
    public_tables = (
        GameTable.objects.filter(
            game_type=game_type,
            status="open",
            mode="HUMAN_MATCH",
            is_private=False,
            stake_amount=0,
            max_players=capacity,
            created_by__isnull=False,
        )
        .exclude(seats__user=user)
        .prefetch_related("seats")
        .order_by("created_at")[:50]
    )
    # A lobby heartbeat is NOT evidence that a human is inside this table.
    # Match only to seats with a live, authenticated human engine connection.
    candidate_tables = []
    for table in public_tables:
        seats = list(table.seats.all())
        if 0 < len(seats) < capacity:
            candidate_tables.append((table, seats))
    # A player may be connected to the game engine without visiting the
    # lobby. Do not require a separate lobby heartbeat as a precondition.
    if candidate_tables:
        try:
            live_tables = engine_activity()
        except (requests.RequestException, ValueError, KeyError, TypeError):
            live_tables = {}
    else:
        live_tables = {}
    for existing_table, seats in candidate_tables:
        live_entry = live_tables.get(str(existing_table.pk))
        if not isinstance(live_entry, dict):
            continue
        if live_entry.get("waiting") is not True:
            continue
        engine_humans = live_entry.get("humans")
        if not isinstance(engine_humans, list):
            continue
        verified_humans = {str(item) for item in engine_humans if isinstance(item, str)}
        if not any(str(seat.user_id) in verified_humans for seat in seats):
            continue
        # join_table performs its own row-level lock and rechecks seats.
        try:
            join_table(existing_table, user)
        except ValueError:
            continue
        ticket.status = "matched"
        ticket.matched_table = existing_table
        ticket.save(update_fields=["status", "matched_table", "updated_at"])
        PlayerPresence.objects.filter(user=user).update(
            status="online", last_seen_at=now
        )
        return ticket, created

    candidates = list(
        active_queued_tickets(game_type)
        .select_for_update()
        .filter(
            target_players=capacity,
            user_id__in=active_presence(game_type).values("user_id"),
        )
        .order_by("created_at")[:capacity]
    )
    if len(candidates) == capacity:
        table = GameTable.objects.create(
            table_code=f"match-{ticket.id.hex[:26]}",
            name=f"Match {game_type.title()}",
            game_type=game_type,
            stakes="Gratuit",
            max_players=capacity,
            created_by=candidates[0].user,
            rules_config=CAPABILITIES[game_type]["defaults"],
            turn_duration=30,
            rules_version=1,
        )
        for candidate in candidates:
            join_table(table, candidate.user)
            candidate.status = "matched"
            candidate.matched_table = table
            candidate.save(update_fields=["status", "matched_table", "updated_at"])
            if candidate.pk == ticket.pk:
                ticket = candidate
        PlayerPresence.objects.filter(
            user_id__in=[candidate.user_id for candidate in candidates]
        ).update(status="online", last_seen_at=now)
    return ticket, created


def cancel_ticket(user, ticket_id):
    with transaction.atomic():
        ticket = MatchmakingTicket.objects.select_for_update().get(
            id=ticket_id, user=user
        )
        if ticket.status == "queued":
            ticket.status = "cancelled"
            ticket.save(update_fields=["status", "updated_at"])
        PlayerPresence.objects.filter(user=user).update(
            status="online", last_seen_at=timezone.now()
        )
        return ticket
