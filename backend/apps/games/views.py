import hashlib
import hmac
import json
import uuid
from datetime import timedelta

import requests
from django.conf import settings
from django.contrib.auth import get_user_model
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
from .live_activity import engine_activity
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
    PlayerPresence,
    TableSeat,
    generate_table_access_code,
)
from .modes import DEMO_AI, HUMAN_MATCH, SIMULATION_SOLO
from .services import generate_admission_token, join_table, leave_table
from .table_rules import CAPABILITIES, validate_table_settings
from .test_games import create_draw_entry, draw_now, ensure_test_catalog, play_instant

MATCHMAKING_TIMEOUT_SECONDS = 20


def game_result_signature_payload(
    game_id, game_type, outcome, amount, metadata, player_id=None
):
    payload = {
        "amount": amount,
        "game_id": str(game_id),
        "game_type": game_type,
        "metadata": metadata or {},
        "outcome": outcome,
    }
    if player_id is not None:
        payload["player_id"] = str(player_id)
    return json.dumps(
        payload,
        separators=(",", ":"),
        sort_keys=True,
    ).encode()


def valid_engine_signature(request, game_id, game_type, outcome, amount, metadata):
    received = request.headers.get("X-Game-Engine-Signature", "")
    if not received:
        return False
    player_id = (
        str(request.user.pk) if request.user and request.user.is_authenticated else None
    )
    if player_id is not None:
        expected_bound = hmac.new(
            settings.GAME_ENGINE_RESULT_SECRET.encode(),
            game_result_signature_payload(
                game_id,
                game_type,
                outcome,
                amount,
                metadata,
                player_id=player_id,
            ),
            hashlib.sha256,
        ).hexdigest()
        if hmac.compare_digest(received, expected_bound):
            return True
    expected_legacy = hmac.new(
        settings.GAME_ENGINE_RESULT_SECRET.encode(),
        game_result_signature_payload(game_id, game_type, outcome, amount, metadata),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(received, expected_legacy)


def table_payload(table, request):
    return {
        "id": str(table.id),
        "table_code": table.table_code,
        "name": table.name,
        "game_type": table.game_type,
        "stakes": table.stakes,
        "stake_amount": getattr(table, "stake_amount", 0) or 0,
        "turn_duration": getattr(table, "turn_duration", 15) or 15,
        "rules_config": getattr(table, "rules_config", {}) or {},
        "rules_version": table.rules_version,
        "access_code": table.access_code if table.is_private else None,
        "player_count": table.seats.count(),
        "max_players": table.max_players,
        "status": table.status,
        "mode": table.mode,
        "is_private": table.is_private,
        "club_id": str(table.club_id) if table.club_id else None,
        "club_name": table.club.name if table.club_id else None,
        "club_is_certified": bool(table.club.is_certified) if table.club_id else False,
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
        "admission_token": generate_admission_token(
            session.owner, session.table, seat_index=0, role="player"
        ),
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
        elif game_type in ("ludo", "domino"):
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
            idempotency_key = f"auto-{uuid.uuid4()}"
        existing = BotSimulationSession.objects.filter(
            owner=request.user, idempotency_key=idempotency_key
        ).first()
        if existing:
            return Response(bot_simulation_payload(existing))
        bot_names = (
            "Tovo",
            "Rija",
            "Saholy",
            "Koto",
            "Lova",
            "Mika",
            "Zaza",
            "Bao",
            "Naly",
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
                timeout=10,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            import logging

            logger = logging.getLogger(__name__)
            logger.warning("Bot attach failed: %s", exc)
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
            session.completed_at = timezone.now()
            session.save(update_fields=["status", "completed_at"])
            try:
                table = session.table
                table.status = "finished"
                table.save(update_fields=["status", "updated_at"])
                table.seats.all().delete()
            except Exception:
                pass
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

        # Auto-Close: Fermer la table associée et libérer les sièges
        try:
            table = GameTable.objects.get(pk=table_id)
            table.status = "finished"
            table.save(update_fields=["status", "updated_at"])
            table.seats.all().delete()
        except GameTable.DoesNotExist:
            pass

        return Response(bot_simulation_payload(session))


class InternalGameSettleView(APIView):
    """
    Endpoint Serveur-à-Serveur (S2S) appelé directement par le moteur temps réel Go.
    Crédite et enregistre les résultats de fin de manche de façon infalsifiable,
    indépendamment de la connectivité réseau du navigateur du joueur au moment du showdown.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        received_secret = (
            request.headers.get("X-Game-Engine-Secret")
            or request.headers.get("X-Game-Engine-Result-Secret")
            or request.headers.get("X-Game-Engine-Bot-Secret", "")
        )
        expected_secret = getattr(settings, "GAME_ENGINE_RESULT_SECRET", "")
        bot_secret = getattr(settings, "GAME_ENGINE_BOT_SECRET", "")

        is_valid = False
        if received_secret and (
            (expected_secret and hmac.compare_digest(received_secret, expected_secret))
            or (bot_secret and hmac.compare_digest(received_secret, bot_secret))
        ):
            is_valid = True

        if not is_valid:
            return Response({"detail": "Non autorisé."}, status=403)

        game_id = request.data.get("game_id")
        game_type = request.data.get("game_type")
        if not game_id or not game_type:
            return Response({"detail": "game_id et game_type requis."}, status=400)

        raw_results = request.data.get("results")
        if raw_results is None:
            raw_results = [request.data]
        elif not isinstance(raw_results, list):
            return Response({"detail": "results doit être une liste."}, status=400)

        User = get_user_model()
        settled_details = []

        for item in raw_results:
            player_id = item.get("player_id")
            outcome = item.get("outcome", "loss")
            try:
                amount = int(item.get("amount", 0))
            except (ValueError, TypeError):
                amount = 0
            metadata = item.get("metadata") or {}

            if not player_id:
                continue

            try:
                user = User.objects.filter(pk=player_id).first()
            except (ValueError, TypeError):
                user = None

            if not user:
                settled_details.append(
                    {
                        "player_id": player_id,
                        "status": "ignored_non_user",
                        "outcome": outcome,
                    }
                )
                continue

            existing = GameResult.objects.filter(game_id=game_id, user=user).first()
            if existing:
                settled_details.append(
                    {
                        "player_id": player_id,
                        "status": "already_settled",
                        "id": existing.pk,
                        "outcome": existing.outcome,
                    }
                )
                continue

            try:
                with transaction.atomic():
                    transaction_entry = None
                    if outcome == "win" and amount > 0:
                        transaction_entry, _ = settle_game_win(
                            user, game_id, game_type, amount, metadata
                        )
                    result = GameResult.objects.create(
                        game_id=game_id,
                        user=user,
                        game_type=game_type,
                        outcome=outcome,
                        amount=amount,
                        transaction=transaction_entry,
                        metadata=metadata,
                    )
                    record_audit(
                        user,
                        "game.result.s2s_settled",
                        result,
                        {
                            "outcome": outcome,
                            "amount": amount,
                            "source": "game-engine-s2s",
                        },
                    )
                    settled_details.append(
                        {
                            "player_id": player_id,
                            "status": "settled",
                            "id": result.pk,
                            "outcome": outcome,
                            "amount": amount,
                            "transaction_id": (
                                str(transaction_entry.pk) if transaction_entry else None
                            ),
                        }
                    )
            except IntegrityError:
                existing = GameResult.objects.filter(game_id=game_id, user=user).first()
                settled_details.append(
                    {
                        "player_id": player_id,
                        "status": "already_settled",
                        "id": existing.pk if existing else None,
                    }
                )

        settled_count = len(
            [d for d in settled_details if d.get("status") == "settled"]
        )
        return Response(
            {
                "status": "ok",
                "game_id": str(game_id),
                "settled_count": settled_count,
                "details": settled_details,
            },
            status=200,
        )


class TableListCreateView(APIView):
    def get_permissions(self):
        return (
            [permissions.AllowAny()]
            if self.request.method == "GET"
            else [permissions.IsAuthenticated()]
        )

    def get(self, request):
        now = timezone.now()
        fresh_empty_threshold = now - timedelta(minutes=2)
        active_waiting_threshold = now - timedelta(minutes=15)
        active_running_threshold = now - timedelta(minutes=20)

        DEMO_CODES = [
            "emerald-01",
            "baobab-01",
            "vanilla-01",
            "ludo-mada-01",
            "domino-gasikara-01",
            "ocean-01",
        ]

        # Règle stricte : Seules les tables créées par un joueur humain (created_by != None)
        # en mode multijoueur (mode = HUMAN_MATCH) apparaissent dans le lobby.
        base_qs = (
            GameTable.objects.exclude(status="finished")
            .exclude(table_code__in=DEMO_CODES)
            .filter(
                created_by__isnull=False,
                mode=HUMAN_MATCH,
            )
        )

        # Visibilité :
        # - Les tables publiques ne sont visibles pour autrui que si un joueur y est assis (num_seats > 0).
        # - Les tables privées ne sont visibles que par leur créateur, joueurs assis ou membres de club.
        if request.user.is_authenticated:
            visibility = (
                Q(is_private=False, num_seats__gt=0)
                | Q(created_by=request.user)
                | Q(seats__user=request.user)
                | Q(club__memberships__user=request.user)
            )
        else:
            visibility = Q(is_private=False, num_seats__gt=0)

        # Expiration & cycle de vie actif (bonnes pratiques jeux en ligne) :
        # - Une table vide (0 joueur) n'est tolérée que pour son créateur pendant 2 minutes max.
        # - Une table en attente (open) expire après 15 min sans activité.
        # - Une table en cours (running) expire après 20 min sans activité.
        active_lifecycle = (
            Q(num_seats=0, updated_at__gte=fresh_empty_threshold)
            | Q(
                status="open",
                num_seats__gt=0,
                updated_at__gte=active_waiting_threshold,
            )
            | Q(
                status="running",
                num_seats__gt=0,
                updated_at__gte=active_running_threshold,
            )
        )

        tables = (
            base_qs.annotate(num_seats=Count("seats"))
            .filter(visibility)
            .filter(active_lifecycle)
            .distinct()
            .prefetch_related("seats", "bot_simulation__bots")
        )
        if request.query_params.get("game_type"):
            tables = tables.filter(game_type=request.query_params["game_type"])
        return Response(
            {"results": [table_payload(table, request) for table in tables]}
        )

    @transaction.atomic
    def post(self, request):
        if not is_feature_enabled("game_results"):
            return Response(
                {"detail": "Les résultats de partie sont temporairement suspendus."},
                status=503,
            )
        creation_key = request.headers.get("Idempotency-Key") or request.data.get(
            "idempotency_key"
        )
        creation_hash = ""
        if creation_key is not None:
            if not isinstance(creation_key, str) or not 1 <= len(creation_key) <= 64:
                return Response({"detail": "Clé de création invalide."}, status=400)
            get_user_model().objects.select_for_update().get(pk=request.user.pk)
            creation_hash = hashlib.sha256(
                json.dumps(request.data, sort_keys=True).encode()
            ).hexdigest()
            existing = GameTable.objects.filter(
                created_by=request.user, creation_key=creation_key
            ).first()
            if existing:
                if existing.creation_payload_hash != creation_hash:
                    return Response(
                        {
                            "detail": (
                                "Les réglages ont changé. "
                                "Rouvrez le formulaire pour créer une autre table."
                            )
                        },
                        status=409,
                    )
                return Response(table_payload(existing, request), status=200)
        game_type = request.data.get("game_type", "poker")
        if game_type not in dict(GameTable.GAME_TYPES):
            return Response({"detail": "Jeu inconnu."}, status=400)

        try:
            raw_players = request.data.get(
                "max_players", CAPABILITIES[game_type]["players"][-1]
            )

            def integer(value):
                if isinstance(value, bool) or not isinstance(value, (int, str)):
                    raise ValueError("Un entier est requis pour ce réglage.")
                return int(value)

            max_players = integer(raw_players)
            turn_duration = integer(request.data.get("turn_duration", 30))
            stake_amount = integer(request.data.get("stake_amount", 0))
            rules_config = validate_table_settings(
                game_type,
                max_players,
                turn_duration,
                request.data.get("rules_config", {}),
                stake_amount,
            )
        except (TypeError, ValueError) as exc:
            return Response({"detail": str(exc)}, status=400)
        stakes_label = "Jetons de jeu" if game_type == "poker" else "Gratuit"

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

        raw_private = request.data.get("is_private", False)
        if not isinstance(raw_private, bool):
            return Response({"detail": "Visibilité invalide."}, status=400)
        is_private = raw_private or club is not None
        access_code = None
        if is_private:
            access_code = generate_table_access_code()
            while GameTable.objects.filter(access_code=access_code).exists():
                access_code = generate_table_access_code()

        table = GameTable.objects.create(
            creation_key=creation_key,
            creation_payload_hash=creation_hash,
            name=str(request.data.get("name", "Ma table"))[:80],
            game_type=game_type,
            stakes=stakes_label,
            stake_amount=stake_amount,
            turn_duration=turn_duration,
            max_players=max_players,
            is_private=is_private,
            access_code=access_code,
            rules_config=rules_config,
            rules_version=1,
            club=club,
            created_by=request.user,
            table_code=f"{game_type}-{uuid.uuid4().hex[:16]}",
        )
        join_table(table, request.user)
        try:
            from apps.analytics.models import ProductEvent

            ProductEvent.objects.create(
                user=request.user,
                event_name="table_created",
                game_type=game_type,
                mode=HUMAN_MATCH,
                metadata={
                    "table_id": str(table.id),
                    "stake_amount": stake_amount,
                    "max_players": max_players,
                    "is_private": is_private,
                },
            )
        except Exception:
            pass
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
            provided_code = str(request.data.get("access_code", "")).strip().upper()
            if (
                table.is_private
                and not table.club_id
                and not (
                    table.created_by_id == request.user.pk
                    or table.seats.filter(user=request.user).exists()
                    or (
                        table.access_code and table.access_code.upper() == provided_code
                    )
                )
            ):
                return Response(
                    {
                        "detail": "Code d'accès invalide ou manquant pour cette salle privée."
                    },
                    status=403,
                )
            seat, created = join_table(table, request.user)
        except GameTable.DoesNotExist:
            return Response({"detail": "Table introuvable."}, status=404)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=409)
        admission_token = generate_admission_token(
            request.user, table, seat_index=seat.seat_index, role="player"
        )
        return Response(
            {
                "table": table_payload(table, request),
                "table_id": str(table.id),
                "seat_index": seat.seat_index,
                "admission_token": admission_token,
                "created": created,
            },
            status=201 if created else 200,
        )


class TableLeaveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, table_id):
        try:
            table = GameTable.objects.get(pk=table_id)
        except GameTable.DoesNotExist:
            return Response({"detail": "Table introuvable."}, status=404)

        left, closed = leave_table(table, request.user)
        table.refresh_from_db()
        return Response(
            {
                "left": left,
                "table_closed": closed,
                "status": table.status,
                "remaining_seats": table.seats.count(),
                "table_id": str(table.id),
            },
            status=200,
        )


class TableAdmissionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request, table_id):
        try:
            table = GameTable.objects.select_for_update().get(pk=table_id)
            if table.status == "finished":
                return Response({"detail": "Cette table est terminée."}, status=409)
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
            provided_code = str(request.data.get("access_code", "")).strip().upper()
            if (
                table.is_private
                and not table.club_id
                and not (
                    table.created_by_id == request.user.pk
                    or table.seats.filter(user=request.user).exists()
                    or (
                        table.access_code and table.access_code.upper() == provided_code
                    )
                )
            ):
                return Response(
                    {"detail": "Cette salle est accessible sur invitation."},
                    status=403,
                )
            seat = TableSeat.objects.filter(table=table, user=request.user).first()
            if seat:
                seat.admitted_at = timezone.now()
                seat.save(update_fields=["admitted_at"])
                table.save(update_fields=["updated_at"])
            role = "player" if seat else "spectator"
            seat_index = seat.seat_index if seat else None
            admission_token = generate_admission_token(
                request.user, table, seat_index=seat_index, role=role
            )
            return Response(
                {
                    "admission_token": admission_token,
                    "table_id": str(table.id),
                    "seat_index": seat_index,
                    "role": role,
                    "expires_in": 60,
                }
            )
        except GameTable.DoesNotExist:
            return Response({"detail": "Table introuvable."}, status=404)


class TableJoinByCodeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        raw_code = str(request.data.get("code", "")).strip().upper()
        if not raw_code:
            return Response(
                {"detail": "Veuillez entrer un code de table."},
                status=400,
            )
        table = (
            GameTable.objects.filter(
                Q(access_code__iexact=raw_code)
                | Q(is_private=False, table_code__iexact=raw_code)
            )
            .exclude(status="finished")
            .first()
        )
        if not table:
            return Response(
                {
                    "detail": "Aucune table trouvée avec ce code ou la partie est terminée."
                },
                status=404,
            )
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
        try:
            seat, created = join_table(table, request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=409)

        admission_token = generate_admission_token(
            request.user, table, seat_index=seat.seat_index, role="player"
        )
        return Response(
            {
                "table": table_payload(table, request),
                "table_id": str(table.id),
                "seat_index": seat.seat_index,
                "admission_token": admission_token,
                "created": created,
            },
            status=201 if created else 200,
        )


class LiveStatsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            live = engine_activity()
        except (requests.RequestException, ValueError):
            return Response(
                {"detail": "Activité moteur indisponible.", "available": False},
                status=503,
            )
        now = timezone.now()
        recent = PlayerPresence.objects.filter(
            last_seen_at__gte=now - timedelta(seconds=60)
        )
        humans = {
            str(identity) for identity in recent.values_list("user_id", flat=True)
        }
        in_game = set()
        human_table_ids = {
            str(pk)
            for pk in GameTable.objects.filter(mode="HUMAN_MATCH").values_list(
                "pk", flat=True
            )
        }
        public = GameTable.objects.filter(
            is_private=False,
            mode="HUMAN_MATCH",
            created_by__isnull=False,
            updated_at__gte=now - timedelta(minutes=20),
        ).exclude(status="finished")
        public_ids = {str(table.pk) for table in public}
        for identifier, table in live.items():
            humans.update(table.get("humans", []))
            if table.get("started") and identifier in human_table_ids:
                in_game.update(table.get("humans", []))
        games = {}
        for game, name in GameTable.GAME_TYPES:
            playing = set()
            running = 0
            for identifier, table in live.items():
                if (
                    identifier not in human_table_ids
                    or table.get("game") != game
                    or not table.get("started")
                ):
                    continue
                playing.update(table.get("humans", []))
                if identifier in public_ids:
                    running += 1
            opened = public.filter(
                game_type=game,
                status="open",
                pk__in=[
                    identifier
                    for identifier, entry in live.items()
                    if entry.get("humans") and not entry.get("started")
                ],
            ).count()
            games[game] = {
                "name": name,
                "online_players": len(playing),
                "in_game_players": len(playing),
                "running_tables": running,
                "open_tables": opened,
                "total_tables": running + opened,
            }
        return Response(
            {
                "available": True,
                "running_tables_verified": True,
                "total_online_players": len(humans),
                "total_in_game_players": len(in_game),
                "total_running_tables": sum(
                    g["running_tables"] for g in games.values()
                ),
                "total_open_tables": sum(g["open_tables"] for g in games.values()),
                "total_active_tables": sum(g["total_tables"] for g in games.values()),
                "games": games,
                "updated_at": now.isoformat(),
            }
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
        target_size = request.data.get("max_players") or request.data.get("target_size")
        try:
            ticket, created = queue_player(
                request.user, game_type, target_size=target_size
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
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
        existing = GameResult.objects.filter(game_id=game_id, user=request.user).first()
        if existing:
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
                result = GameResult.objects.get(game_id=game_id, user=request.user)
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

        streak_claimed = "daily_streak" in claims
        streak_count = 1
        for day_offset in range(1, 7):
            past_date = today - timedelta(days=day_offset)
            if (
                GameResult.objects.filter(
                    user=user, created_at__date=past_date
                ).exists()
                or DailyRewardClaim.objects.filter(
                    user=user, mission_date=past_date
                ).exists()
            ):
                streak_count += 1
            else:
                break
        streak_rewards = [100, 200, 300, 500, 750, 1000, 2500]
        streak_reward = streak_rewards[min(streak_count - 1, len(streak_rewards) - 1)]

        return {
            "date": today.isoformat(),
            "missions": payload,
            "streak": {
                "current_day": streak_count,
                "claimed": streak_claimed,
                "reward": streak_reward,
                "schedule": streak_rewards,
            },
        }

    def get(self, request):
        return Response(self._payload(request.user))

    def post(self, request):
        key = str(request.data.get("key", ""))
        today = timezone.localdate()

        if key == "daily_streak":
            with transaction.atomic():
                claim = (
                    DailyRewardClaim.objects.select_for_update()
                    .filter(
                        user=request.user,
                        mission_key="daily_streak",
                        mission_date=today,
                    )
                    .first()
                )
                if claim:
                    return Response({"claimed": True, "duplicate": True})
                streak_count = 1
                for day_offset in range(1, 7):
                    past_date = today - timedelta(days=day_offset)
                    if (
                        GameResult.objects.filter(
                            user=request.user, created_at__date=past_date
                        ).exists()
                        or DailyRewardClaim.objects.filter(
                            user=request.user, mission_date=past_date
                        ).exists()
                    ):
                        streak_count += 1
                    else:
                        break
                rewards = [100, 200, 300, 500, 750, 1000, 2500]
                reward_amt = rewards[min(streak_count - 1, len(rewards) - 1)]
                wallet_transaction, _ = credit_simulation_reward(
                    request.user,
                    f"daily-streak:{request.user.pk}:{today}",
                    reward_amt,
                    f"Bonus Série Jour {streak_count}",
                )
                DailyRewardClaim.objects.create(
                    user=request.user,
                    mission_key="daily_streak",
                    mission_date=today,
                    amount=reward_amt,
                    transaction=wallet_transaction,
                )
                return Response(
                    {"claimed": True, "reward": reward_amt, "day": streak_count},
                    status=201,
                )

        mission = MISSIONS.get(key)
        if not mission:
            return Response({"detail": "Mission inconnue."}, status=400)
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


def tournament_payload(tournament, user=None):
    participants = tournament.participants.all()
    user_participant = (
        participants.filter(user=user).first()
        if user and user.is_authenticated
        else None
    )
    return {
        "id": str(tournament.id),
        "name": tournament.name,
        "game_type": tournament.game_type,
        "format": tournament.format,
        "buy_in": tournament.buy_in,
        "starting_chips": tournament.starting_chips,
        "max_players": tournament.max_players,
        "registered_count": participants.count(),
        "blind_interval_minutes": tournament.blind_interval_minutes,
        "status": tournament.status,
        "prize_pool": tournament.prize_pool,
        "club_id": str(tournament.club_id) if tournament.club_id else None,
        "registered": user_participant is not None,
        "user_status": user_participant.status if user_participant else None,
        "created_at": tournament.created_at.isoformat(),
        "prizes": (
            [
                {"place": 1, "percent": 50, "amount": int(tournament.prize_pool * 0.5)},
                {"place": 2, "percent": 30, "amount": int(tournament.prize_pool * 0.3)},
                {"place": 3, "percent": 20, "amount": int(tournament.prize_pool * 0.2)},
            ]
            if tournament.max_players >= 6
            else [
                {"place": 1, "percent": 70, "amount": int(tournament.prize_pool * 0.7)},
                {"place": 2, "percent": 30, "amount": int(tournament.prize_pool * 0.3)},
            ]
        ),
    }


def seed_default_tournaments():
    from .models import Tournament

    defaults = [
        {
            "name": "Sit & Go Turbo 6-Max - 1 000 Ar",
            "game_type": "poker",
            "format": "sit_and_go",
            "buy_in": 1000,
            "starting_chips": 1500,
            "max_players": 6,
            "blind_interval_minutes": 3,
        },
        {
            "name": "Sit & Go Deepstack - 2 500 Ar",
            "game_type": "poker",
            "format": "sit_and_go",
            "buy_in": 2500,
            "starting_chips": 3000,
            "max_players": 6,
            "blind_interval_minutes": 5,
        },
        {
            "name": "Grand Tournoi Hebdo Poker - 5 000 Ar",
            "game_type": "poker",
            "format": "scheduled",
            "buy_in": 5000,
            "starting_chips": 5000,
            "max_players": 9,
            "blind_interval_minutes": 7,
        },
    ]
    for d in defaults:
        Tournament.objects.get_or_create(name=d["name"], defaults=d)


class TournamentListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def get(self, request):
        from .models import Tournament

        if not Tournament.objects.exists():
            seed_default_tournaments()

        tournaments = Tournament.objects.all().order_by("-status", "-created_at")[:30]
        return Response(
            {"results": [tournament_payload(t, request.user) for t in tournaments]}
        )

    def post(self, request):
        from .models import Tournament

        name = request.data.get("name")
        if not name:
            return Response({"detail": "Le nom du tournoi est requis."}, status=400)
        buy_in = int(request.data.get("buy_in", 1000))
        max_players = int(request.data.get("max_players", 6))
        game_type = request.data.get("game_type", "poker")
        tournament = Tournament.objects.create(
            name=name,
            buy_in=buy_in,
            max_players=max_players,
            game_type=game_type,
            created_by=request.user,
        )
        return Response(tournament_payload(tournament, request.user), status=201)


class TournamentDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, tournament_id):
        from .models import Tournament

        try:
            tournament = Tournament.objects.get(pk=tournament_id)
        except Tournament.DoesNotExist:
            return Response({"detail": "Tournoi introuvable."}, status=404)
        participants = tournament.participants.select_related("user").all()
        participants_data = [
            {
                "user_id": str(p.user.id),
                "display_name": p.user.display_name or p.user.email,
                "chips": p.chips,
                "status": p.status,
                "rank": p.rank,
                "payout": p.payout,
            }
            for p in participants
        ]
        return Response(
            {
                "tournament": tournament_payload(tournament, request.user),
                "participants": participants_data,
            }
        )


class TournamentRegisterView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, tournament_id):
        from .models import Tournament, TournamentParticipant

        try:
            tournament = Tournament.objects.get(pk=tournament_id)
        except Tournament.DoesNotExist:
            return Response({"detail": "Tournoi introuvable."}, status=404)

        if tournament.status != "registering":
            return Response(
                {"detail": "Les inscriptions pour ce tournoi sont fermées."},
                status=400,
            )

        if tournament.participants.filter(user=request.user).exists():
            return Response(
                {"detail": "Vous êtes déjà inscrit à ce tournoi."}, status=400
            )

        if tournament.participants.count() >= tournament.max_players:
            return Response({"detail": "Ce tournoi est complet."}, status=400)

        with transaction.atomic():
            TournamentParticipant.objects.create(
                tournament=tournament,
                user=request.user,
                chips=tournament.starting_chips,
            )
            # If SNG reaches max_players, launch tournament!
            if tournament.participants.count() >= tournament.max_players:
                tournament.status = "running"
                tournament.started_at = timezone.now()
                tournament.save(update_fields=["status", "started_at"])

        return Response(
            {
                "status": "registered",
                "tournament": tournament_payload(tournament, request.user),
            },
            status=201,
        )


class TableCapabilitiesView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {
                "version": 1,
                "turn_durations": [10, 15, 30, 60, 90, 120],
                "games": CAPABILITIES,
            }
        )


class ResumableTablesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            live = engine_activity()
        except (requests.RequestException, ValueError):
            return Response({"detail": "Reprise indisponible."}, status=503)
        tables = (
            GameTable.objects.filter(seats__user=request.user, mode="HUMAN_MATCH")
            .exclude(status="finished")
            .distinct()
        )
        return Response(
            {
                "results": [
                    table_payload(table, request)
                    for table in tables
                    if str(table.pk) in live and live[str(table.pk)].get("started")
                ]
            }
        )
