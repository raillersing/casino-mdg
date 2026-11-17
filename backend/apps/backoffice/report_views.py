"""Aggregate-only operational reports and protected game-table monitoring."""

import csv
import io
from datetime import timedelta

from django.db.models import Count, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.games.models import GameResult, GameTable, MatchmakingTicket
from apps.payments.models import PaymentIntent, WebhookInboxEvent
from apps.wallet.models import WalletTransaction

from .services import record_audit


def resolve_window(request):
    try:
        days = int(request.query_params.get("days", 7))
    except (ValueError, TypeError):
        return None
    return days if days in (1, 7, 30, 90) else None


def grouped_count(queryset, field):
    return {
        str(row[field]): int(row["count"])
        for row in queryset.values(field).annotate(count=Count("pk")).order_by(field)
    }


def finance_breakdown(queryset, currency):
    return [
        {
            "type": row["type"],
            "direction": row["direction"],
            "status": row["status"],
            "count": int(row["count"]),
            "amount": int(row["total"] or 0),
            "currency": currency,
        }
        for row in (
            queryset.filter(currency_code=currency)
            .values("type", "direction", "status")
            .annotate(count=Count("pk"), total=Sum("amount"))
            .order_by("type", "direction", "status")
        )
    ]


def build_report(days):
    since = timezone.now() - timedelta(days=days)
    players = User.objects.filter(is_staff=False)
    tables = GameTable.objects.filter(created_at__gte=since)
    results = GameResult.objects.filter(created_at__gte=since)
    tickets = MatchmakingTicket.objects.filter(created_at__gte=since)
    intents = PaymentIntent.objects.filter(created_at__gte=since)
    wallet = WalletTransaction.objects.filter(created_at__gte=since)
    return {
        "report_type": "operational_snapshot",
        "window_days": days,
        "since": since.isoformat(),
        "generated_at": timezone.now().isoformat(),
        "measurement_notes": {
            "tables_created": "Persisted GameTable rows; no client-side event count",
            "games_with_results": "Distinct persisted GameResult.game_id, not a full game audit",
            "finance": "Internal wallet and payment intents; not PSP reconciliation",
            "mga_vs_sim": "Never sum or convert between MGA and SIM",
            "live_games": "Open/running in database does not prove engine state",
        },
        "players": {
            "registered_total": players.count(),
            "new_in_window": players.filter(date_joined__gte=since).count(),
            "active_accounts": players.filter(is_active=True).count(),
            "suspended_accounts": players.filter(is_active=False).count(),
            "email_verified": players.filter(email_verified_at__isnull=False).count(),
            "phone_verified": players.filter(phone_verified_at__isnull=False).count(),
            "kyc_levels": grouped_count(players, "kyc_level"),
        },
        "games": {
            "tables_created": tables.count(),
            "tables_by_game": grouped_count(tables, "game_type"),
            "tables_by_status": grouped_count(tables, "status"),
            "games_with_results": results.values("game_id").distinct().count(),
            "matchmaking_tickets": grouped_count(tickets, "status"),
        },
        "wallet": {
            "SIM": finance_breakdown(wallet, "SIM"),
            "MGA": finance_breakdown(wallet, "MGA"),
        },
        "payments": {
            "intent_counts": grouped_count(intents, "status"),
            "intent_providers": grouped_count(intents, "provider"),
            "webhooks_received": WebhookInboxEvent.objects.filter(
                received_at__gte=since
            ).count(),
            "currency": "MGA",
            "settlement_verified": False,
        },
    }


class BackofficeOperationalReportView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        days = resolve_window(request)
        if days is None:
            return Response(
                {"detail": "Période invalide : 1, 7, 30 ou 90 jours."}, status=400
            )
        return Response(build_report(days))


class BackofficeReportCSVView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        if not request.user.is_superuser:
            return Response(
                {"detail": "Export réservé au super-administrateur."}, status=403
            )
        days = resolve_window(request)
        if days is None:
            return Response({"detail": "Période invalide."}, status=400)
        report = build_report(days)
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(
            ["section", "metric", "dimension", "count", "amount", "currency"]
        )
        for key, value in report["players"].items():
            if isinstance(value, dict):
                for dimension, count in sorted(value.items()):
                    writer.writerow(["players", key, dimension, count, "", ""])
            else:
                writer.writerow(["players", key, "", value, "", ""])
        for key, value in report["games"].items():
            if isinstance(value, dict):
                for dimension, count in sorted(value.items()):
                    writer.writerow(["games", key, dimension, count, "", ""])
            else:
                writer.writerow(["games", key, "", value, "", ""])
        for currency in ("SIM", "MGA"):
            for row in report["wallet"][currency]:
                writer.writerow(
                    [
                        "wallet",
                        row["type"],
                        f"{row['direction']}:{row['status']}",
                        row["count"],
                        row["amount"],
                        currency,
                    ]
                )
        for key in ("intent_counts", "intent_providers"):
            for dimension, count in sorted(report["payments"][key].items()):
                writer.writerow(["payments", key, dimension, count, "", ""])
        writer.writerow(
            [
                "payments",
                "webhooks_received",
                "",
                report["payments"]["webhooks_received"],
                "",
                "",
            ]
        )
        record_audit(
            request.user,
            "backoffice.report.csv_exported",
            request.user,
            {
                "days": days,
                "report_type": "operational_snapshot",
                "contains_pii": False,
            },
        )
        response = HttpResponse(
            stream.getvalue(), content_type="text/csv; charset=utf-8"
        )
        response["Content-Disposition"] = (
            f'attachment; filename="casino-mdg-operational-{days}d.csv"'
        )
        response["Cache-Control"] = "no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class BackofficeLiveTablesView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        status = request.query_params.get("status", "all")
        if status not in ("all", "open", "running", "finished"):
            return Response({"detail": "Statut de table invalide."}, status=400)
        try:
            limit = int(request.query_params.get("limit", "25"))
            offset = int(request.query_params.get("offset", "0"))
        except (ValueError, TypeError):
            return Response({"detail": "Pagination invalide."}, status=400)
        if not 1 <= limit <= 100 or not 0 <= offset <= 100000:
            return Response({"detail": "Pagination invalide."}, status=400)
        queryset = GameTable.objects.select_related("created_by").order_by(
            "-updated_at"
        )
        if status != "all":
            queryset = queryset.filter(status=status)
        total = queryset.count()
        entries = queryset[offset : offset + limit]
        return Response(
            {
                "count": total,
                "next_offset": offset + limit if offset + limit < total else None,
                "status": status,
                "status_provenance": "Database table status, not confirmed live engine state",
                "results": [
                    {
                        "id": str(table.pk),
                        "code": table.table_code,
                        "name": table.name,
                        "game_type": table.game_type,
                        "mode": table.mode,
                        "status": table.status,
                        "is_private": table.is_private,
                        "max_players": table.max_players,
                        "owner_display_name": (
                            table.created_by.display_name if table.created_by else None
                        ),
                        "updated_at": table.updated_at.isoformat(),
                    }
                    for table in entries
                ],
            }
        )
