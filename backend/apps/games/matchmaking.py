from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import GameTable, MatchmakingTicket, PlayerPresence
from .services import join_table

PRESENCE_TTL = timedelta(seconds=30)


def active_presence(game_type=None):
    cutoff = timezone.now() - PRESENCE_TTL
    queryset = PlayerPresence.objects.filter(last_seen_at__gte=cutoff)
    if game_type:
        queryset = queryset.filter(game_type=game_type)
    return queryset


@transaction.atomic
def queue_player(user, game_type, target_size=None):
    now = timezone.now()
    PlayerPresence.objects.update_or_create(
        user=user,
        defaults={"game_type": game_type, "status": "searching", "last_seen_at": now},
    )
    ticket, created = MatchmakingTicket.objects.select_for_update().get_or_create(
        user=user,
        game_type=game_type,
        status="queued",
        defaults={},
    )
    if not created and ticket.matched_table_id:
        return ticket, False
    opponent = (
        MatchmakingTicket.objects.select_for_update()
        .filter(game_type=game_type, status="queued", created_at__lt=ticket.created_at)
        .exclude(user=user)
        .order_by("created_at")
        .first()
    )
    if opponent:
        try:
            target_int = int(target_size) if target_size is not None else None
        except (TypeError, ValueError):
            target_int = None
        if game_type == "poker":
            max_players = target_int if target_int in (2, 6, 9) else 2
        elif game_type == "belote":
            max_players = 4
        else:
            max_players = target_int if target_int in (2, 4) else 4
        table = GameTable.objects.create(
            table_code=f"match-{str(ticket.id)[:8]}",
            name=f"Match {game_type.title()}",
            game_type=game_type,
            stakes="Simulation",
            max_players=max_players,
            status="open",
        )
        join_table(table, opponent.user)
        join_table(table, user)
        opponent.status = "matched"
        opponent.matched_table = table
        opponent.save(update_fields=["status", "matched_table", "updated_at"])
        ticket.status = "matched"
        ticket.matched_table = table
        ticket.save(update_fields=["status", "matched_table", "updated_at"])
        PlayerPresence.objects.filter(user__in=[user, opponent.user]).update(
            status="online", last_seen_at=now
        )
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
