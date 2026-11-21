"""Audited, least-privilege matchmaking diagnostics and stale-only recovery."""

from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.games.matchmaking import QUEUE_TTL
from apps.games.models import MatchmakingTicket

from .rbac import BackofficeCapabilityPermission
from .services import record_audit


class MatchmakingDiagnosticsView(APIView):
    """Database-only diagnostics; no claim about live game-engine health."""

    permission_classes = [BackofficeCapabilityPermission]
    capability_by_method = {"GET": "games.read"}

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", "25"))
        except (TypeError, ValueError):
            return Response({"detail": "Pagination invalide."}, status=400)
        if not 1 <= limit <= 100:
            return Response({"detail": "Pagination invalide."}, status=400)

        now = timezone.now()
        stale_cutoff = now - QUEUE_TTL
        queued = MatchmakingTicket.objects.filter(status="queued")
        stale = queued.filter(updated_at__lt=stale_cutoff)
        fresh = queued.filter(updated_at__gte=stale_cutoff)
        broken = MatchmakingTicket.objects.filter(
            status="matched", matched_table__isnull=True
        )
        by_game = list(
            fresh.values("game_type").annotate(count=Count("pk")).order_by("game_type")
        )
        sample = list(stale.order_by("updated_at")[:limit])
        return Response(
            {
                "generated_at": now.isoformat(),
                "provenance": "Persisted ticket status only; engine not queried",
                "engine_state_verified": False,
                "queue_ttl_seconds": int(QUEUE_TTL.total_seconds()),
                "queued_fresh": fresh.count(),
                "queued_stale": stale.count(),
                "matched_without_table": broken.count(),
                "fresh_queued_by_game": by_game,
                "stale_sample": [
                    {
                        "ticket_id": str(ticket.pk),
                        "game_type": ticket.game_type,
                        "target_players": ticket.target_players,
                        "age_seconds": max(
                            0, int((now - ticket.updated_at).total_seconds())
                        ),
                        "expected_updated_at": ticket.updated_at.isoformat(),
                    }
                    for ticket in sample
                ],
            }
        )


class MatchmakingTicketInterventionView(APIView):
    """Cancel only stale queue tickets; never touch matched games or funds."""

    permission_classes = [BackofficeCapabilityPermission]
    capability_by_method = {"POST": "games.cancel_stale"}

    @transaction.atomic
    def post(self, request, ticket_id):
        if not request.user.is_superuser:
            return Response({"detail": "Super-administrateur requis."}, status=403)
        reason = request.data.get("reason")
        expected = request.data.get("expected_updated_at")
        code = str(request.data.get("mfa_code") or "").strip()
        if not isinstance(reason, str) or not 12 <= len(reason.strip()) <= 255:
            return Response(
                {"detail": "Justification (12-255 caractères) requise."}, status=400
            )
        if not isinstance(expected, str) or not expected:
            return Response({"detail": "Version du ticket requise."}, status=400)
        if len(code) != 6 or not code.isdigit():
            return Response({"detail": "Code TOTP requis."}, status=403)

        ticket = (
            MatchmakingTicket.objects.select_for_update().filter(pk=ticket_id).first()
        )
        if ticket is None:
            return Response({"detail": "Ticket introuvable."}, status=404)
        if ticket.updated_at.isoformat() != expected:
            return Response(
                {"detail": "Ticket modifié depuis la consultation."}, status=409
            )
        if (
            ticket.status != "queued"
            or ticket.matched_table_id is not None
            or ticket.updated_at >= timezone.now() - QUEUE_TTL
        ):
            return Response(
                {"detail": "Intervention interdite sur un ticket actif ou associé."},
                status=409,
            )

        devices = (
            TOTPDevice.objects.select_for_update()
            .filter(user=request.user, confirmed=True)
            .order_by("pk")
        )
        if not any(device.verify_token(code) for device in devices):
            return Response(
                {"detail": "Seconde vérification TOTP refusée."}, status=403
            )
        ticket.status = "cancelled"
        ticket.save(update_fields=["status", "updated_at"])
        record_audit(
            request.user,
            "matchmaking.stale_ticket.cancelled",
            ticket,
            {"game_type": ticket.game_type, "reason": reason.strip()},
        )
        return Response(
            {
                "ticket_id": str(ticket.pk),
                "status": ticket.status,
                "engine_state_verified": False,
            }
        )
