"""Read-only monetary controls. Never settle or modify real funds here."""

from datetime import timedelta

from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.payments.models import PaymentIntent, WebhookInboxEvent
from apps.wallet.models import LedgerAccount, LedgerEntry, WalletTransaction


def aggregate_intents(queryset):
    return [
        {
            "status": row["status"],
            "provider": row["provider"],
            "direction": row["direction"],
            "count": int(row["count"]),
            "amount_mga": int(row["total"] or 0),
        }
        for row in (
            queryset.values("status", "provider", "direction")
            .annotate(count=Count("id"), total=Sum("amount"))
            .order_by("provider", "direction", "status")
        )
    ]


class MgaFinanceOverviewView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        if not request.user.is_superuser:
            return Response(
                {"detail": "Accès aux données financières restreint."}, status=403
            )
        try:
            days = int(request.query_params.get("days", 7))
        except (TypeError, ValueError):
            return Response({"detail": "Période invalide."}, status=400)
        if days not in (1, 7, 30, 90):
            return Response({"detail": "Période invalide."}, status=400)
        cutoff = timezone.now() - timedelta(days=days)
        intents = PaymentIntent.objects.filter(currency="MGA", created_at__gte=cutoff)
        sandbox_count = intents.filter(metadata__sandbox=True).count()
        total_count = intents.count()
        wallet = WalletTransaction.objects.filter(
            currency_code="MGA", created_at__gte=cutoff
        )
        entries = LedgerEntry.objects.filter(
            account__currency_code="MGA",
            transaction__created_at__gte=cutoff,
        )
        debit_total = int(
            entries.filter(entry_type="debit").aggregate(total=Sum("amount"))["total"]
            or 0
        )
        credit_total = int(
            entries.filter(entry_type="credit").aggregate(total=Sum("amount"))["total"]
            or 0
        )
        accounts = LedgerAccount.objects.filter(
            currency_code="MGA", account_type="player"
        )
        hold = int(accounts.aggregate(total=Sum("held_balance"))["total"] or 0)
        completed = wallet.filter(status="completed")
        receipts = (
            completed.filter(type="deposit", direction="credit").aggregate(
                total=Sum("amount")
            )["total"]
            or 0
        )
        withdrawals = (
            completed.filter(type="withdrawal", direction="debit").aggregate(
                total=Sum("amount")
            )["total"]
            or 0
        )
        webhook_qs = WebhookInboxEvent.objects.filter(received_at__gte=cutoff)
        return Response(
            {
                "currency": "MGA",
                "mode": "read_only_internal_ledger",
                "window_days": days,
                "generated_at": timezone.now().isoformat(),
                "external_psp_reconciliation_verified": False,
                "real_money_activation_authorized": False,
                "intents": {
                    "count": total_count,
                    "sandbox_count": sandbox_count,
                    "unclassified_count": total_count - sandbox_count,
                    "grouped": aggregate_intents(intents),
                    "pending_withdrawals": intents.filter(
                        direction="withdrawal", status__in=["pending", "processing"]
                    ).count(),
                },
                "wallet": {
                    "completed_deposit_total_mga": int(receipts),
                    "completed_withdrawal_total_mga": int(withdrawals),
                    "player_held_mga": hold,
                    "ledger_entries_debit_mga": debit_total,
                    "ledger_entries_credit_mga": credit_total,
                    "aggregate_entries_balanced": debit_total == credit_total,
                    "aggregate_check_only": True,
                },
                "webhooks": {
                    "received": webhook_qs.count(),
                    "processed": webhook_qs.filter(status="processed").count(),
                    "unprocessed": webhook_qs.exclude(status="processed").count(),
                },
                "warnings": [
                    "Les écritures MGA internes peuvent provenir de tests sandbox.",
                    (
                        "Un grand livre agrégé équilibré ne certifie "
                        "pas chaque intent ni un paiement PSP."
                    ),
                    "Les opérations réelles restent soumises aux autorisations et tests externes.",
                ],
            }
        )


class MgaPaymentIntentListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Accès financier restreint."}, status=403)
        status = request.query_params.get("status", "all")
        if status not in (
            "all",
            "pending",
            "processing",
            "completed",
            "failed",
            "cancelled",
        ):
            return Response({"detail": "Statut invalide."}, status=400)
        try:
            limit = int(request.query_params.get("limit", 25))
            offset = int(request.query_params.get("offset", 0))
        except (ValueError, TypeError):
            return Response({"detail": "Pagination invalide."}, status=400)
        if not 1 <= limit <= 100 or not 0 <= offset <= 100000:
            return Response({"detail": "Pagination invalide."}, status=400)
        rows = PaymentIntent.objects.filter(currency="MGA").order_by("-created_at")
        if status != "all":
            rows = rows.filter(status=status)
        count = rows.count()
        return Response(
            {
                "count": count,
                "next_offset": offset + limit if offset + limit < count else None,
                "currency": "MGA",
                "read_only": True,
                "results": [
                    {
                        "id": str(item.id),
                        "player_id": item.user_id,
                        "provider": item.provider,
                        "direction": item.direction,
                        "status": item.status,
                        "amount_mga": item.amount,
                        "sandbox": (
                            item.metadata.get("sandbox") is True
                            if isinstance(item.metadata, dict)
                            else False
                        ),
                        "provider_reference": item.provider_reference,
                        "created_at": item.created_at.isoformat(),
                    }
                    for item in rows[offset:][:limit]
                ],
            }
        )
