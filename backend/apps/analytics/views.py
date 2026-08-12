import json
import uuid
from datetime import timedelta

from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ProductEvent

EVENT_NAMES = {
    "activation_viewed",
    "test_games_opened",
    "demo_started",
    "bot_mode_selected",
    "matchmaking_started",
    "matchmaking_cancelled",
    "matchmaking_timeout",
    "human_match_found",
    "bot_fallback_started",
    "invite_sent",
    "invite_joined",
    "test_game_played",
    "first_game_completed",
    "session_paused",
    "game_error",
}


class ProductEventCreateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        event_name = str(data.get("event_name", "")).strip()
        if event_name not in EVENT_NAMES:
            return Response({"detail": "Événement produit inconnu."}, status=400)
        try:
            event_id = uuid.UUID(str(data.get("event_id", "")))
        except (ValueError, AttributeError):
            return Response({"detail": "event_id invalide."}, status=400)
        metadata = data.get("metadata", {})
        if not isinstance(metadata, dict) or len(metadata) > 20:
            return Response({"detail": "metadata invalide."}, status=400)
        if len(json.dumps(metadata, ensure_ascii=False)) > 8000:
            return Response({"detail": "metadata trop volumineuse."}, status=400)
        defaults = {
            "event_name": event_name,
            "user": request.user if request.user.is_authenticated else None,
            "anonymous_id": str(data.get("anonymous_id", ""))[:128],
            "session_id": str(data.get("session_id", ""))[:128],
            "mode": str(data.get("mode", ""))[:40],
            "game_type": str(data.get("game_type", ""))[:40],
            "metadata": metadata,
        }
        with transaction.atomic():
            event, created = ProductEvent.objects.get_or_create(
                id=event_id, defaults=defaults
            )
        if not created and (
            event.event_name != event_name or event.metadata != metadata
        ):
            return Response({"detail": "event_id déjà utilisé."}, status=409)
        return Response({"event_id": str(event.id), "created": created}, status=202)


class ProductEventSummaryView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        since = timezone.now() - timedelta(days=7)
        events = ProductEvent.objects.filter(created_at__gte=since)
        counts = {
            item["event_name"]: item["count"]
            for item in events.values("event_name").annotate(count=Count("id"))
        }
        return Response(
            {
                "window": "7d",
                "since": since.isoformat(),
                "total": events.count(),
                "events": counts,
            }
        )
