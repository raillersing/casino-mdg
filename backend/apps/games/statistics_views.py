import hmac
from datetime import timedelta
from datetime import timezone as utc_timezone

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import GameTable, HumanGameActivity, TableSeat
from .player_statistics import unique_player_statistics


class UniquePlayerStatisticsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(unique_player_statistics())


class ConfirmHumanActivityView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        secret = getattr(settings, "GAME_ENGINE_RESULT_SECRET", "")
        received = request.headers.get("X-Game-Engine-Secret", "")
        if not secret or not received or not hmac.compare_digest(secret, received):
            return Response({"detail": "Non autorisé."}, status=403)
        try:
            table = GameTable.objects.get(pk=request.data.get("table_id"))
            seat = TableSeat.objects.get(
                table=table, user_id=request.data.get("user_id")
            )
        except (
            GameTable.DoesNotExist,
            TableSeat.DoesNotExist,
            ValidationError,
            ValueError,
            TypeError,
        ):
            return Response({"detail": "Participation inconnue."}, status=404)
        if seat.user.phone.startswith("guest_") or table.mode != "HUMAN_MATCH":
            return Response({"recorded": False})
        now = timezone.now()
        raw_time = request.data.get("occurred_at")
        if raw_time:
            try:
                at = parse_datetime(raw_time)
            except (TypeError, ValueError):
                at = None
            if at is None or timezone.is_naive(at) or at > now + timedelta(minutes=5):
                return Response({"detail": "Date invalide."}, status=400)
            now = at
        with transaction.atomic():
            record, created = HumanGameActivity.objects.get_or_create(
                user=seat.user,
                game_type=table.game_type,
                day=now.astimezone(utc_timezone.utc).date(),
                defaults={"first_seen_at": now, "last_seen_at": now},
            )
            if not created:
                HumanGameActivity.objects.filter(
                    pk=record.pk, first_seen_at__gt=now
                ).update(first_seen_at=now)
                HumanGameActivity.objects.filter(
                    pk=record.pk, last_seen_at__lt=now
                ).update(last_seen_at=now)
        return Response({"recorded": True})
