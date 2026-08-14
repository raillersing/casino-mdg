import hashlib
import hmac
import json

import requests
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.backoffice.services import is_feature_enabled, record_audit
from apps.clubs.models import ClubMembership
from apps.wallet.services import credit_simulation_reward, settle_game_win

from .chance_simulation import MAX_ROUNDS, simulate_draw, simulate_instant
from .matchmaking import active_presence, cancel_ticket, queue_player
from .models import (
    BotSimulationParticipant,
    BotSimulationSession,
    DailyRewardClaim,
    DrawDefinition,
    DrawEntry,
    DrawResult,
    GameResult,
    GameTable,
    InstantGameDefinition,
    InstantPlay,
    MatchmakingTicket,
)
from .modes import DEMO_AI, SIMULATION_SOLO
from .services import join_table, seed_demo_tables
from .test_games import create_draw_entry, draw_now, ensure_test_catalog, play_instant

MATCHMAKING_TIMEOUT_SECONDS = 20


def game_result_signature_payload(game_id, game_type, outcome, amount, metadata):
    return json.dumps(
        {
            "amount": amount,
            "game_id": str(game_id),
            "game_type": game_type,
            "metadata": metadata or {},
            "outcome": outcome,
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode()


def valid_engine_signature(request, game_id, game_type, outcome, amount, metadata):
    received = request.headers.get("X-Game-Engine-Signature", "")
    expected = hmac.new(
        settings.GAME_ENGINE_RESULT_SECRET.encode(),
        game_result_signature_payload(game_id, game_type, outcome, amount, metadata),
        hashlib.sha256,
    ).hexdigest()
    return bool(received) and hmac.compare_digest(received, expected)


def table_payload(table, request):
    return {
        "id": str(table.id),
        "table_code": table.table_code,
        "name": table.name,
        "game_type": table.game_type,
        "stakes": table.stakes,
        "player_count": table.seats.count(),
        "max_players": table.max_players,
        "status": table.status,
        "mode": table.mode,
        "is_private": table.is_private,
        "club_id": str(table.club_id) if table.club_id else None,
        "club_name": table.club.name if table.club_id else None,
        "joined": bool(
            request.user.is_authenticated
            and table.seats.filter(user=request.user).exists()
        ),
    }


def bot_simulation_payload(session):
    return {
        "session_id": str(session.id),
        "table_id": str(session.table_id),
        "table_code": session.table.table_code,
        "game_type": session.game_type,
        "mode": DEMO_AI,
        "profile": session.profile,
        "status": session.status,
        "bots": [
            {
                "bot_key": bot.bot_key,
                "display_name": bot.display_name,
                "seat_index": bot.seat_index,
                "profile": bot.profile,
                "is_bot": bot.is_bot,
            }
            for bot in session.bots.all().order_by("seat_index")
        ],
        "created_at": session.created_at.isoformat(),
    }


class BotSimulationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        game_type = str(request.data.get("game_type", "poker"))
        profile = str(request.data.get("profile", "balanced"))
        idempotency_key = str(
            request.headers.get("Idempotency-Key")
            or request.data.get("idempotency_key")
            or ""
        )[:120]
        # bot count limits per game type (poker max 9 players total = 8 bots + 1 human)
        if game_type == "poker":
            max_bots = 8
            default_bots = 3
        elif game_type == "belote":
            max_bots = 3
            default_bots = 3
        else:  # rami
            max_bots = 3
            default_bots = 1
        try:
            bot_count = int(request.data.get("bot_count", default_bots))
        except (ValueError, TypeError):
            bot_count = default_bots
        bot_count = max(1, min(bot_count, max_bots))
        if game_type not in dict(GameTable.GAME_TYPES):
            return Response({"detail": "Jeu inconnu."}, status=400)
        if profile not in dict(BotSimulationSession.PROFILE_CHOICES):
            return Response({"detail": "Profil bot inconnu."}, status=400)
        if not idempotency_key:
            return Response(
                {"detail": "Une clé d'idempotence est requise."}, status=400
            )
        existing = BotSimulationSession.objects.filter(
            owner=request.user, idempotency_key=idempotency_key
        ).first()
        if existing:
            return Response(bot_simulation_payload(existing))
        bot_names = (
            "Tovo", "Rija", "Saholy", "Koto", "Lova", "Mika", "Zaza", "Bao", "Naly"
        )
        with transaction.atomic():
            table = GameTable.objects.create(
                table_code=f"bot-{game_type}-{str(GameTable.objects.count() + 1).zfill(3)}",
                name=f"Simulation IA · {game_type.title()}",
                game_type=game_type,
                max_players=bot_count + 1,
                status="open",
                mode=DEMO_AI,
                is_private=True,
                created_by=request.user,
            )
            session = BotSimulationSession.objects.create(
                owner=request.user,
                table=table,
                game_type=game_type,
                profile=profile,
                idempotency_key=idempotency_key,
                status="queued",
            )
            for seat in range(1, bot_count + 1):
                name = bot_names[(seat - 1) % len(bot_names)]
                BotSimulationParticipant.objects.create(
                    session=session,
                    bot_key=f"{game_type}-bot-{seat}",
                    display_name=f"IA Démo · {name}",
                    seat_index=seat,
                    profile=profile,
                )
        try:
            response = requests.post(
                f"{settings.GAME_ENGINE_INTERNAL_URL}/internal/bots/attach",
                headers={"X-Game-Engine-Bot-Secret": settings.GAME_ENGINE_BOT_SECRET},
                json={
                    "table_id": str(table.id),
                    "game_type": game_type,
                    "bots": [
                        {
                            "id": bot.bot_key,
                            "name": bot.display_name,
                            "profile": bot.profile,
                        }
                        for bot in session.bots.all().order_by("seat_index")
                    ],
                },
                timeout=3,
            )
            response.raise_for_status()
        except requests.RequestException:
            session.status = "cancelled"
            session.save(update_fields=["status"])
            return Response(
                {"detail": "Le moteur de jeu est indisponible."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        session.status = "running"
        session.started_at = timezone.now()
        session.save(update_fields=["status", "started_at"])
        return Response(bot_simulation_payload(session), status=201)

    def get(self, request):
        sessions = BotSimulationSession.objects.filter(
            owner=request.user
        ).select_related("table")
        return Response(
            {"results": [bot_simulation_payload(item) for item in sessions]}
        )


class BotSimulationCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, session_id):
        try:
            session = BotSimulationSession.objects.get(
                pk=session_id, owner=request.user
            )
        except BotSimulationSession.DoesNotExist:
            return Response(
                {"detail": "Session de simulation introuvable."}, status=404
            )
        if session.status in {"queued", "running"}:
            session.status = "cancelled"
            session.save(update_fields=["status"])
        return Response(bot_simulation_payload(session))


class BotSimulationCompleteView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        received = request.headers.get("X-Game-Engine-Bot-Secret", "")
        expected = settings.GAME_ENGINE_BOT_SECRET
        if not received or not hmac.compare_digest(received, expected):
            return Response({"detail": "Non autorisé."}, status=403)
        table_id = request.data.get("table_id")
        if not table_id:
            return Response({"detail": "table_id requis."}, status=400)
        try:
            session = BotSimulationSession.objects.get(
                table_id=table_id, status__in={"queued", "running"}
            )
        except BotSimulationSession.DoesNotExist:
            return Response(
                {"detail": "Session introuvable ou déjà terminée."}, status=404
            )
        session.status = "completed"
        session.completed_at = timezone.now()
        session.save(update_fields=["status", "completed_at"])
        return Response(bot_simulation_payload(session))


class TableListCreateView(APIView):
    def get_permissions(self):
        return (
            [permissions.AllowAny()]
            if self.request.method == "GET"
            else [permissions.IsAuthenticated()]
        )

    def get(self, request):
        seed_demo_tables()
        visibility = Q(is_private=False)
        if request.user.is_authenticated:
            visibility |= (
                Q(created_by=request.user)
                | Q(seats__user=request.user)
                | Q(club__memberships__user=request.user)
            )
        tables = (
            GameTable.objects.exclude(status="finished")
            .filter(visibility)
            .distinct()
            .prefetch_related("seats", "bot_simulation__bots")
        )
        if request.query_params.get("game_type"):
            tables = tables.filter(game_type=request.query_params["game_type"])
        return Response(
            {"results": [table_payload(table, request) for table in tables]}
        )

    def post(self, request):
        if not is_feature_enabled("game_results"):
            return Response(
                {"detail": "Les résultats de partie sont temporairement suspendus."},
                status=503,
            )
        game_type = request.data.get("game_type", "poker")
        if game_type not in dict(GameTable.GAME_TYPES):
            return Response({"detail": "Jeu inconnu."}, status=400)
        try:
            max_players = min(max(int(request.data.get("max_players", 4)), 2), 9)
        except (TypeError, ValueError):
            return Response(
                {"detail": "Le nombre de joueurs est invalide."}, status=400
            )
        club = None
        club_id = request.data.get("club_id")
        if club_id:
            try:
                club = ClubMembership.objects.select_related("club").get(
                    club_id=club_id, user=request.user
                )
            except ClubMembership.DoesNotExist:
                return Response(
                    {
                        "detail": "Vous devez être membre du club pour créer cette table."
                    },
                    status=403,
                )
            if club.role not in {"owner", "admin"}:
                return Response(
                    {"detail": "Seuls les responsables peuvent créer une table club."},
                    status=403,
                )
            club = club.club
        table = GameTable.objects.create(
            name=str(request.data.get("name", "Ma table"))[:80],
            game_type=game_type,
            stakes=str(request.data.get("stakes", "Gratuit"))[:40],
            max_players=max_players,
            is_private=bool(request.data.get("is_private", False)) or club is not None,
            club=club,
            created_by=request.user,
            table_code=f"{game_type}-{str(GameTable.objects.count() + 1).zfill(3)}",
        )
        join_table(table, request.user)
        return Response(table_payload(table, request), status=status.HTTP_201_CREATED)


class TableJoinView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, table_id):
        try:
            table = GameTable.objects.get(pk=table_id)
            if (
                table.club_id
                and not ClubMembership.objects.filter(
                    club_id=table.club_id, user=request.user
                ).exists()
            ):
                return Response(
                    {"detail": "Cette table est réservée aux membres du club."},
                    status=403,
                )
            if (
                table.is_private
                and not table.club_id
                and not (
                    table.created_by_id == request.user.pk
                    or table.seats.filter(user=request.user).exists()
                )
            ):
                return Response(
                    {"detail": "Cette salle est accessible sur invitation."},
                    status=403,
                )
            seat, created = join_table(table, request.user)
        except GameTable.DoesNotExist:
            return Response({"detail": "Table introuvable."}, status=404)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=409)
        return Response(
            {
                "table": table_payload(table, request),
                "table_id": str(table.id),
                "seat_index": seat.seat_index,
                "created": created,
            },
            status=201 if created else 200,
        )


def matchmaking_payload(ticket):
    waiting_seconds = max(0, int((timezone.now() - ticket.created_at).total_seconds()))
    return {
        "ticket_id": str(ticket.id),
        "game_type": ticket.game_type,
        "status": ticket.status,
        "table_id": str(ticket.matched_table_id) if ticket.matched_table_id else None,
        "table_code": (
            ticket.matched_table.table_code if ticket.matched_table_id else None
        ),
        "created_at": ticket.created_at.isoformat(),
        "waiting_seconds": waiting_seconds,
        "timeout_seconds": MATCHMAKING_TIMEOUT_SECONDS,
    }


class MatchmakingStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        game_type = request.query_params.get("game_type")
        if game_type and game_type not in dict(GameTable.GAME_TYPES):
            return Response({"detail": "Jeu inconnu."}, status=400)
        active = active_presence(game_type)
        queued = MatchmakingTicket.objects.filter(status="queued")
        if game_type:
            queued = queued.filter(game_type=game_type)
        ticket = (
            MatchmakingTicket.objects.filter(
                user=request.user, status__in=["queued", "matched"]
            )
            .order_by("-created_at")
            .first()
        )
        return Response(
            {
                "game_type": game_type,
                "human_online": active.count(),
                "queued": queued.count(),
                "estimated_wait_seconds": (
                    0
                    if queued.exclude(user=request.user).exists()
                    else MATCHMAKING_TIMEOUT_SECONDS
                ),
                "timeout_seconds": MATCHMAKING_TIMEOUT_SECONDS,
                "ticket": matchmaking_payload(ticket) if ticket else None,
            }
        )


class MatchmakingHeartbeatView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        game_type = request.data.get("game_type")
        if game_type and game_type not in dict(GameTable.GAME_TYPES):
            return Response({"detail": "Jeu inconnu."}, status=400)
        from django.utils import timezone

        from .models import PlayerPresence

        presence, _ = PlayerPresence.objects.update_or_create(
            user=request.user,
            defaults={
                "game_type": game_type,
                "status": "online",
                "last_seen_at": timezone.now(),
            },
        )
        return Response(
            {
                "status": presence.status,
                "game_type": presence.game_type,
                "last_seen_at": presence.last_seen_at.isoformat(),
            }
        )


class MatchmakingQueueView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        game_type = request.data.get("game_type", "poker")
        if game_type not in dict(GameTable.GAME_TYPES):
            return Response({"detail": "Jeu inconnu."}, status=400)
        ticket, created = queue_player(request.user, game_type)
        return Response(
            {"ticket": matchmaking_payload(ticket), "created": created},
            status=201 if created else 200,
        )


class MatchmakingCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, ticket_id):
        try:
            ticket = cancel_ticket(request.user, ticket_id)
        except MatchmakingTicket.DoesNotExist:
            return Response({"detail": "Ticket introuvable."}, status=404)
        return Response({"ticket": matchmaking_payload(ticket)})


class GameResultCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        results = GameResult.objects.filter(user=request.user).select_related(
            "transaction"
        )
        payload = [
            {
                "id": result.pk,
                "game_id": str(result.game_id),
                "game_type": result.game_type,
                "outcome": result.outcome,
                "amount": result.amount,
                "transaction_id": (
                    str(result.transaction_id) if result.transaction_id else None
                ),
                "created_at": result.created_at.isoformat(),
            }
            for result in results[:50]
        ]
        return Response(
            {
                "results": payload,
                "stats": {
                    "played": results.count(),
                    "wins": results.filter(outcome="win").count(),
                    "losses": results.filter(outcome="loss").count(),
                    "draws": results.filter(outcome="draw").count(),
                    "total_won": results.filter(outcome="win").aggregate(
                        total=Sum("amount")
                    )["total"]
                    or 0,
                },
            }
        )

    def post(self, request):
        try:
            game_id = request.data["game_id"]
            game_type = request.data["game_type"]
            outcome = request.data["outcome"]
            amount = int(request.data.get("amount", 0))
        except (KeyError, TypeError, ValueError):
            return Response({"detail": "Résultat de partie invalide."}, status=400)
        if (
            game_type not in dict(GameTable.GAME_TYPES)
            or outcome not in dict(GameResult.OUTCOMES)
            or amount < 0
        ):
            return Response({"detail": "Résultat de partie invalide."}, status=400)
        metadata = request.data.get("metadata", {})
        if outcome == "win" and not valid_engine_signature(
            request, game_id, game_type, outcome, amount, metadata
        ):
            return Response(
                {"detail": "Une victoire doit être attestée par le moteur de jeu."},
                status=403,
            )
        existing = GameResult.objects.filter(game_id=game_id).first()
        if existing:
            if existing.user_id != request.user.id:
                return Response(
                    {"detail": "Ce résultat appartient déjà à un autre joueur."},
                    status=409,
                )
            if (
                existing.game_type,
                existing.outcome,
                existing.amount,
                existing.metadata,
            ) != (game_type, outcome, amount, metadata):
                return Response(
                    {"detail": "Le rejeu ne correspond pas au résultat initial."},
                    status=409,
                )
            result, created = existing, False
        else:
            try:
                with transaction.atomic():
                    transaction_entry, created_transaction = (
                        settle_game_win(
                            request.user, game_id, game_type, amount, metadata
                        )
                        if outcome == "win"
                        else (None, False)
                    )
                    result = GameResult.objects.create(
                        game_id=game_id,
                        user=request.user,
                        game_type=game_type,
                        outcome=outcome,
                        amount=amount,
                        transaction=transaction_entry,
                        metadata=metadata,
                    )
                    record_audit(
                        request.user,
                        "game.result.created",
                        result,
                        {
                            "outcome": outcome,
                            "amount": amount,
                            "source": "game-engine" if outcome == "win" else "player",
                        },
                    )
                    created = created_transaction or transaction_entry is None
            except IntegrityError:
                result = GameResult.objects.get(game_id=game_id)
                if result.user_id != request.user.id:
                    return Response(
                        {"detail": "Ce résultat appartient déjà à un autre joueur."},
                        status=409,
                    )
                if (
                    result.game_type,
                    result.outcome,
                    result.amount,
                    result.metadata,
                ) != (game_type, outcome, amount, metadata):
                    return Response(
                        {"detail": "Le rejeu ne correspond pas au résultat initial."},
                        status=409,
                    )
                created = False
        return Response(
            {
                "id": result.pk,
                "game_id": str(result.game_id),
                "outcome": result.outcome,
                "amount": result.amount,
                "transaction_id": (
                    str(result.transaction_id) if result.transaction_id else None
                ),
                "created": created,
            },
            status=201 if created else 200,
        )


class GameLeaderboardView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        ranking = (
            GameResult.objects.filter(outcome="win")
            .values("user_id", "user__display_name")
            .annotate(wins=Count("id"), total_won=Sum("amount"))
            .order_by("-wins", "-total_won")[:20]
        )
        return Response(
            {
                "results": [
                    {
                        "rank": index,
                        "user_id": item["user_id"],
                        "display_name": item["user__display_name"],
                        "wins": item["wins"],
                        "total_won": item["total_won"] or 0,
                    }
                    for index, item in enumerate(ranking, start=1)
                ]
            }
        )


def instant_game_payload(game, user=None):
    return {
        "slug": game.slug,
        "name": game.name,
        "game_type": game.game_type,
        "version": game.version,
        "cost": game.cost,
        "max_prize": game.max_prize,
        "status": game.status,
        "mode": SIMULATION_SOLO,
        "rules": game.rules,
    }


def instant_play_payload(play):
    return {
        "play_id": str(play.id),
        "game_slug": play.game.slug,
        "game_version": play.game.version,
        "status": play.status,
        "currency": "SIM",
        "cost": play.cost,
        "prize": play.prize,
        "result_label": play.result_label,
        "transaction_id": str(play.transaction_id) if play.transaction_id else None,
        "audit": play.audit,
        "created_at": play.created_at.isoformat(),
    }


class TestGamesCatalogView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        ensure_test_catalog()
        games = InstantGameDefinition.objects.filter(status="active")
        return Response(
            {
                "currency": "SIM",
                "results": [instant_game_payload(game, request.user) for game in games],
            }
        )


class TestInstantPlayView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, slug):
        if not is_feature_enabled("instant_games"):
            return Response(
                {"detail": "Les jeux instantanés sont temporairement suspendus."},
                status=503,
            )
        ensure_test_catalog()
        try:
            game = InstantGameDefinition.objects.get(slug=slug, status="active")
        except InstantGameDefinition.DoesNotExist:
            return Response({"detail": "Jeu instantané introuvable."}, status=404)
        idempotency_key = str(
            request.headers.get("Idempotency-Key")
            or request.data.get("idempotency_key")
            or ""
        )[:120]
        if not idempotency_key:
            return Response(
                {"detail": "Une clé d'idempotence est requise."}, status=400
            )
        if (
            game.slug == "roue-mdg"
            and InstantPlay.objects.filter(
                user=request.user, game=game, created_at__date=timezone.localdate()
            ).exists()
        ):
            return Response(
                {"detail": "La roue quotidienne a déjà été utilisée."}, status=409
            )
        try:
            play, created = play_instant(request.user, game, idempotency_key)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=409)
        return Response(instant_play_payload(play), status=201 if created else 200)


class TestGamesActivityView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        plays = InstantPlay.objects.filter(user=request.user).select_related(
            "game", "transaction"
        )[:30]
        entries = DrawEntry.objects.filter(user=request.user).select_related(
            "draw", "transaction"
        )[:30]
        return Response(
            {
                "plays": [instant_play_payload(play) for play in plays],
                "entries": [
                    {
                        "entry_id": str(entry.id),
                        "draw_slug": entry.draw.slug,
                        "draw_name": entry.draw.name,
                        "numbers": entry.numbers,
                        "transaction_id": str(entry.transaction_id),
                        "created_at": entry.created_at.isoformat(),
                    }
                    for entry in entries
                ],
            }
        )


def draw_payload(draw, result=None, can_simulate=False):
    return {
        "slug": draw.slug,
        "name": draw.name,
        "draw_type": draw.draw_type,
        "version": draw.version,
        "status": draw.status,
        "mode": SIMULATION_SOLO,
        "entry_cost": draw.entry_cost,
        "closes_at": draw.closes_at.isoformat(),
        "rules": draw.rules,
        "can_simulate": can_simulate,
        "result": (
            {
                "numbers": result.numbers,
                "commitment": result.commitment,
                "proof": result.proof,
                "created_at": result.created_at.isoformat(),
            }
            if result
            else None
        ),
    }


class TestDrawListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        ensure_test_catalog()
        draws = DrawDefinition.objects.all()
        for draw in draws:
            if draw.status == "open" and draw.closes_at <= timezone.now():
                draw.status = "closed"
                draw.save(update_fields=["status", "updated_at"])
        return Response(
            {
                "currency": "SIM",
                "results": [
                    draw_payload(
                        draw, getattr(draw, "result", None), request.user.is_staff
                    )
                    for draw in draws
                ],
            }
        )


class TestDrawEntryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, slug):
        if not is_feature_enabled("draws"):
            return Response(
                {"detail": "Les tirages sont temporairement suspendus."}, status=503
            )
        ensure_test_catalog()
        try:
            draw = DrawDefinition.objects.get(slug=slug)
            numbers = [int(number) for number in request.data.get("numbers", [])]
        except (DrawDefinition.DoesNotExist, TypeError, ValueError):
            return Response({"detail": "Sélection de tirage invalide."}, status=400)
        idempotency_key = str(
            request.headers.get("Idempotency-Key")
            or request.data.get("idempotency_key")
            or ""
        )[:120]
        if not idempotency_key:
            return Response(
                {"detail": "Une clé d'idempotence est requise."}, status=400
            )
        try:
            entry, created = create_draw_entry(
                request.user, draw, numbers, idempotency_key
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=409)
        return Response(
            {
                "entry_id": str(entry.id),
                "draw_slug": entry.draw.slug,
                "numbers": entry.numbers,
                "transaction_id": str(entry.transaction_id),
                "created": created,
            },
            status=201 if created else 200,
        )


class TestDrawResultView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, slug):
        try:
            draw = DrawDefinition.objects.get(slug=slug)
            result = draw.result
        except (DrawDefinition.DoesNotExist, DrawResult.DoesNotExist):
            return Response({"detail": "Résultat indisponible."}, status=404)
        return Response(draw_payload(draw, result))

    def post(self, request, slug):
        if not request.user.is_staff:
            return Response(
                {"detail": "Seul le back-office peut simuler un tirage."}, status=403
            )
        try:
            draw = DrawDefinition.objects.get(slug=slug)
        except DrawDefinition.DoesNotExist:
            return Response({"detail": "Tirage introuvable."}, status=404)
        try:
            result, created = draw_now(draw)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=409)
        return Response(
            {**draw_payload(result.draw, result), "created": created},
            status=201 if created else 200,
        )


class ChanceSimulationView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        ensure_test_catalog()
        slug = str(request.data.get("slug", "")).strip()
        try:
            rounds = int(request.data.get("rounds", 10_000))
        except (TypeError, ValueError):
            return Response({"detail": "Le nombre de tours est invalide."}, status=400)
        seed = str(request.data.get("seed", "mdg-default-seed"))[:120]
        if not slug or rounds < 1 or rounds > MAX_ROUNDS or not seed:
            return Response(
                {"detail": f"rounds doit être compris entre 1 et {MAX_ROUNDS}."},
                status=400,
            )
        game = InstantGameDefinition.objects.filter(slug=slug).first()
        if game:
            return Response(simulate_instant(game, rounds, seed))
        draw = DrawDefinition.objects.filter(slug=slug).first()
        if draw:
            return Response(simulate_draw(draw, rounds, seed))
        return Response({"detail": "Jeu de hasard introuvable."}, status=404)


MISSIONS = {
    "play_daily": {
        "title": "Jouer aujourd’hui",
        "goal": 1,
        "reward": 100,
        "outcome": None,
    },
    "win_daily": {
        "title": "Gagner aujourd’hui",
        "goal": 1,
        "reward": 250,
        "outcome": "win",
    },
}


class DailyMissionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _payload(self, user):
        today = timezone.localdate()
        results = GameResult.objects.filter(user=user, created_at__date=today)
        claims = set(
            DailyRewardClaim.objects.filter(user=user, mission_date=today).values_list(
                "mission_key", flat=True
            )
        )
        payload = []
        for key, mission in MISSIONS.items():
            progress = (
                results.filter(outcome=mission["outcome"]).count()
                if mission["outcome"]
                else results.count()
            )
            payload.append(
                {
                    "key": key,
                    "title": mission["title"],
                    "progress": min(progress, mission["goal"]),
                    "goal": mission["goal"],
                    "reward": mission["reward"],
                    "claimed": key in claims,
                    "claimable": progress >= mission["goal"] and key not in claims,
                }
            )
        return {"date": today.isoformat(), "missions": payload}

    def get(self, request):
        return Response(self._payload(request.user))

    def post(self, request):
        key = str(request.data.get("key", ""))
        mission = MISSIONS.get(key)
        if not mission:
            return Response({"detail": "Mission inconnue."}, status=400)
        today = timezone.localdate()
        results = GameResult.objects.filter(user=request.user, created_at__date=today)
        progress = (
            results.filter(outcome=mission["outcome"]).count()
            if mission["outcome"]
            else results.count()
        )
        if progress < mission["goal"]:
            return Response({"detail": "Mission non terminée."}, status=409)
        try:
            with transaction.atomic():
                claim = (
                    DailyRewardClaim.objects.select_for_update()
                    .filter(user=request.user, mission_key=key, mission_date=today)
                    .first()
                )
                if claim:
                    return Response(
                        {
                            "claimed": True,
                            "transaction_id": str(claim.transaction_id),
                            "duplicate": True,
                        }
                    )
                wallet_transaction, _ = credit_simulation_reward(
                    request.user,
                    f"daily-reward:{request.user.pk}:{today}:{key}",
                    mission["reward"],
                    mission["title"],
                )
                claim = DailyRewardClaim.objects.create(
                    user=request.user,
                    mission_key=key,
                    mission_date=today,
                    amount=mission["reward"],
                    transaction=wallet_transaction,
                )
        except IntegrityError:
            claim = DailyRewardClaim.objects.get(
                user=request.user, mission_key=key, mission_date=today
            )
            return Response(
                {
                    "claimed": True,
                    "transaction_id": str(claim.transaction_id),
                    "duplicate": True,
                }
            )
        return Response(
            {
                "claimed": True,
                "transaction_id": str(claim.transaction_id),
                "duplicate": False,
            },
            status=201,
        )
