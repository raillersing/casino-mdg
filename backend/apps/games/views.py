from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import GameTable
from .services import join_table, seed_demo_tables


def table_payload(table, request):
    return {"id": str(table.id), "table_code": table.table_code, "name": table.name, "game_type": table.game_type, "stakes": table.stakes, "player_count": table.seats.count(), "max_players": table.max_players, "status": table.status, "is_private": table.is_private, "joined": bool(request.user.is_authenticated and table.seats.filter(user=request.user).exists())}


class TableListCreateView(APIView):
    def get_permissions(self):
        return [permissions.AllowAny()] if self.request.method == "GET" else [permissions.IsAuthenticated()]

    def get(self, request):
        seed_demo_tables()
        tables = GameTable.objects.exclude(status="finished").prefetch_related("seats")
        if request.query_params.get("game_type"):
            tables = tables.filter(game_type=request.query_params["game_type"])
        return Response({"results": [table_payload(table, request) for table in tables]})

    def post(self, request):
        game_type = request.data.get("game_type", "poker")
        if game_type not in dict(GameTable.GAME_TYPES):
            return Response({"detail": "Jeu inconnu."}, status=400)
        try:
            max_players = min(max(int(request.data.get("max_players", 4)), 2), 9)
        except (TypeError, ValueError):
            return Response({"detail": "Le nombre de joueurs est invalide."}, status=400)
        table = GameTable.objects.create(name=str(request.data.get("name", "Ma table"))[:80], game_type=game_type, stakes=str(request.data.get("stakes", "Gratuit"))[:40], max_players=max_players, is_private=bool(request.data.get("is_private", False)), created_by=request.user, table_code=f"{game_type}-{str(GameTable.objects.count() + 1).zfill(3)}")
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
        return Response({"table": table_payload(table, request), "table_id": str(table.id), "seat_index": seat.seat_index, "created": created}, status=201 if created else 200)
