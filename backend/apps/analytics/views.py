import json
import uuid
from datetime import timedelta

from django.db import models, transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.support.models import PilotFeedback

from .models import ProductEvent


def actor_key(event):
    return (
        f"user:{event.user_id}" if event.user_id else f"anonymous:{event.anonymous_id}"
    )


def retention_snapshot(events, now):
    activation = {}
    active_days = {}
    for event in events.only("user_id", "anonymous_id", "created_at", "event_name"):
        actor = actor_key(event)
        if actor == "anonymous:":
            continue
        day = event.created_at.date()
        if event.event_name == "activation_viewed":
            activation[actor] = min(day, activation.get(actor, day))
        active_days.setdefault(actor, set()).add(day)
    cohorts = {
        offset: {
            actor
            for actor, day in activation.items()
            if day <= now.date() - timedelta(days=offset)
        }
        for offset in (1, 7)
    }
    result = {}
    for offset, cohort in cohorts.items():
        returned = {
            actor
            for actor in cohort
            if any(
                day >= activation[actor] + timedelta(days=offset)
                for day in active_days[actor]
            )
        }
        result[f"d{offset}"] = {
            "eligible_actors": len(cohort),
            "returned_actors": len(returned),
            "rate": round(len(returned) / len(cohort), 4) if cohort else None,
        }
    return result


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
    "reconnection_succeeded",
    "heartbeat_latency",
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
        retention_events = ProductEvent.objects.filter(
            created_at__gte=timezone.now() - timedelta(days=30)
        )
        counts = {
            item["event_name"]: item["count"]
            for item in events.values("event_name").annotate(count=Count("id"))
        }
        actors = set()
        sessions = set()
        for event in events.only("user_id", "anonymous_id", "session_id"):
            actor = actor_key(event)
            if actor != "anonymous:":
                actors.add(actor)
            if event.session_id:
                sessions.add(event.session_id)
        completed = counts.get("first_game_completed", 0)
        heartbeat_latencies = sorted(
            float(event.metadata["latency_ms"])
            for event in events.filter(event_name="heartbeat_latency")
            if isinstance(event.metadata, dict)
            and isinstance(event.metadata.get("latency_ms"), (int, float))
            and 0 <= float(event.metadata["latency_ms"]) <= 120000
        )
        p95_index = max(0, int(len(heartbeat_latencies) * 0.95) - 1)
        return Response(
            {
                "window": "7d",
                "since": since.isoformat(),
                "total": events.count(),
                "events": counts,
                "unique_actors": len(actors),
                "unique_sessions": len(sessions),
                "funnel": {
                    "activation_viewed": counts.get("activation_viewed", 0),
                    "demo_started": counts.get("demo_started", 0),
                    "test_game_played": counts.get("test_game_played", 0),
                    "first_game_completed": completed,
                },
                "errors_per_completed_game": (
                    round(counts.get("game_error", 0) / completed, 2)
                    if completed
                    else None
                ),
                "reconnections_succeeded": counts.get("reconnection_succeeded", 0),
                "heartbeat_latency_ms": {
                    "samples": len(heartbeat_latencies),
                    "average": (
                        round(sum(heartbeat_latencies) / len(heartbeat_latencies), 2)
                        if heartbeat_latencies
                        else None
                    ),
                    "p95": (
                        heartbeat_latencies[p95_index] if heartbeat_latencies else None
                    ),
                },
                "retention": retention_snapshot(retention_events, timezone.now()),
            }
        )


class PilotGateSummaryView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        since = timezone.now() - timedelta(days=7)
        events = ProductEvent.objects.filter(created_at__gte=since)
        feedback = PilotFeedback.objects.filter(created_at__gte=since)
        counts = {
            item["event_name"]: item["count"]
            for item in events.values("event_name").annotate(count=Count("id"))
        }
        feedback_count = feedback.count()
        average_rating = feedback.aggregate(value=models.Avg("rating"))["value"]
        criteria = [
            {
                "key": "feedback_volume",
                "label": "Feedback pilote suffisant",
                "observed": feedback_count,
                "target": 5,
                "unit": "retours",
                "status": "pass" if feedback_count >= 5 else "pending",
            },
            {
                "key": "feedback_rating",
                "label": "Note moyenne satisfaisante",
                "observed": round(float(average_rating), 2) if average_rating else None,
                "target": 4,
                "unit": "/ 5",
                "status": (
                    "pass"
                    if average_rating is not None and average_rating >= 4
                    else "pending"
                ),
            },
            {
                "key": "completed_games",
                "label": "Parties terminées observées",
                "observed": counts.get("first_game_completed", 0),
                "target": 5,
                "unit": "parties",
                "status": (
                    "pass" if counts.get("first_game_completed", 0) >= 5 else "pending"
                ),
            },
            {
                "key": "blocking_errors",
                "label": "Erreurs bloquantes",
                "observed": counts.get("game_error", 0),
                "target": 0,
                "unit": "erreurs",
                "status": "pass" if counts.get("game_error", 0) == 0 else "blocked",
            },
        ]
        status = (
            "blocked"
            if any(item["status"] == "blocked" for item in criteria)
            else (
                "go_provisional"
                if all(item["status"] == "pass" for item in criteria)
                else "monitor"
            )
        )
        return Response(
            {
                "window": "7d",
                "since": since.isoformat(),
                "status": status,
                "criteria": criteria,
            }
        )
