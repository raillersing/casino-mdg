import hashlib
import hmac
import json

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.backoffice.services import is_feature_enabled, record_audit
from apps.wallet.services import credit_simulation_reward, settle_game_win

from .models import DailyRewardClaim, GameResult, GameTable
from .services import join_table, seed_demo_tables


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
        "is_private": table.is_private,
        "joined": bool(
            request.user.is_authenticated
            and table.seats.filter(user=request.user).exists()
        ),
    }


class TableListCreateView(APIView):
    def get_permissions(self):
        return (
            [permissions.AllowAny()]
            if self.request.method == "GET"
            else [permissions.IsAuthenticated()]
        )

    def get(self, request):
        seed_demo_tables()
        tables = GameTable.objects.exclude(status="finished").prefetch_related("seats")
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
        table = GameTable.objects.create(
            name=str(request.data.get("name", "Ma table"))[:80],
            game_type=game_type,
            stakes=str(request.data.get("stakes", "Gratuit"))[:40],
            max_players=max_players,
            is_private=bool(request.data.get("is_private", False)),
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


MISSIONS = {
    "play_daily": {"title": "Jouer aujourd’hui", "goal": 1, "reward": 100, "outcome": None},
    "win_daily": {"title": "Gagner aujourd’hui", "goal": 1, "reward": 250, "outcome": "win"},
}


class DailyMissionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _payload(self, user):
        today = timezone.localdate()
        results = GameResult.objects.filter(user=user, created_at__date=today)
        claims = set(DailyRewardClaim.objects.filter(user=user, mission_date=today).values_list("mission_key", flat=True))
        payload = []
        for key, mission in MISSIONS.items():
            progress = results.filter(outcome=mission["outcome"]).count() if mission["outcome"] else results.count()
            payload.append({"key": key, "title": mission["title"], "progress": min(progress, mission["goal"]), "goal": mission["goal"], "reward": mission["reward"], "claimed": key in claims, "claimable": progress >= mission["goal"] and key not in claims})
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
        progress = results.filter(outcome=mission["outcome"]).count() if mission["outcome"] else results.count()
        if progress < mission["goal"]:
            return Response({"detail": "Mission non terminée."}, status=409)
        try:
            with transaction.atomic():
                claim = DailyRewardClaim.objects.select_for_update().filter(user=request.user, mission_key=key, mission_date=today).first()
                if claim:
                    return Response({"claimed": True, "transaction_id": str(claim.transaction_id), "duplicate": True})
                wallet_transaction, _ = credit_simulation_reward(request.user, f"daily-reward:{request.user.pk}:{today}:{key}", mission["reward"], mission["title"])
                claim = DailyRewardClaim.objects.create(user=request.user, mission_key=key, mission_date=today, amount=mission["reward"], transaction=wallet_transaction)
        except IntegrityError:
            claim = DailyRewardClaim.objects.get(user=request.user, mission_key=key, mission_date=today)
            return Response({"claimed": True, "transaction_id": str(claim.transaction_id), "duplicate": True})
        return Response({"claimed": True, "transaction_id": str(claim.transaction_id), "duplicate": False}, status=201)
