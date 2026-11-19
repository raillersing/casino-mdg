"""Read-only, per-intent internal reconciliation.

This never queries a PSP or validates external settlement. It only compares
persisted intents, webhook inbox records, wallet postings, and ledger entries.
"""

from collections import defaultdict
from datetime import timedelta

from django.utils import timezone
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.payments.models import PaymentIntent, WebhookInboxEvent
from apps.wallet.models import LedgerEntry, WalletTransaction


class TransactionReconciliationView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        if not request.user.is_active or not request.user.is_superuser:
            return Response(
                {"detail": "Contrôle financier réservé au super-administrateur."},
                status=403,
            )
        try:
            days = int(request.query_params.get("days", 7))
            limit = int(request.query_params.get("limit", 25))
            offset = int(request.query_params.get("offset", 0))
        except (ValueError, TypeError):
            return Response(
                {"detail": "Paramètres de période ou de pagination invalides."},
                status=400,
            )
        if (
            days not in (1, 7, 30, 90)
            or not 1 <= limit <= 100
            or not 0 <= offset <= 100000
        ):
            return Response({"detail": "Période ou pagination invalide."}, status=400)
        provider = request.query_params.get("provider", "all")
        if provider not in ("all", "mvola", "orange", "airtel"):
            return Response({"detail": "Prestataire invalide."}, status=400)

        since = timezone.now() - timedelta(days=days)
        intents = PaymentIntent.objects.filter(currency="MGA", created_at__gte=since)
        if provider != "all":
            intents = intents.filter(provider=provider)
        total = intents.count()
        page = list(intents.order_by("-created_at", "-pk")[offset:][:limit])
        ids = [str(item.pk) for item in page]

        transactions = list(
            WalletTransaction.objects.filter(
                currency_code="MGA", metadata__payment_intent_id__in=ids
            ).order_by("created_at")
        )
        tx_map = defaultdict(list)
        for txn in transactions:
            tx_map[str(txn.metadata["payment_intent_id"])].append(txn)

        entry_map = defaultdict(list)
        if transactions:
            for entry in LedgerEntry.objects.filter(
                transaction_id__in=[txn.pk for txn in transactions]
            ).select_related("account"):
                entry_map[entry.transaction_id].append(entry)

        webhook_map = defaultdict(list)
        if ids:
            for event in WebhookInboxEvent.objects.filter(
                payload__intent_id__in=ids
            ).order_by("received_at"):
                if isinstance(event.payload, dict):
                    webhook_map[str(event.payload.get("intent_id"))].append(event)

        duplicate_refs = set()
        refs = [
            (item.provider, item.provider_reference)
            for item in page
            if item.provider_reference
        ]
        for provider_name, ref in refs:
            if (
                PaymentIntent.objects.filter(
                    provider=provider_name, provider_reference=ref
                ).count()
                > 1
            ):
                duplicate_refs.add((provider_name, ref))

        results = []
        for intent in page:
            key = str(intent.pk)
            expected_direction = "credit" if intent.direction == "deposit" else "debit"
            matches = tx_map.get(key, [])
            events = webhook_map.get(key, [])
            issues = []
            if not intent.provider_reference:
                issues.append("missing_provider_reference")
            if (intent.provider, intent.provider_reference) in duplicate_refs:
                issues.append("duplicate_provider_reference")
            if any(event.provider != intent.provider for event in events):
                issues.append("webhook_provider_mismatch")
            if intent.status == "completed":
                if not any(
                    event.provider == intent.provider and event.status == "processed"
                    for event in events
                ):
                    issues.append("missing_processed_webhook")
                if len(matches) != 1:
                    issues.append(
                        "missing_wallet_transaction"
                        if not matches
                        else "duplicate_wallet_transactions"
                    )
            elif any(txn.status == "completed" for txn in matches):
                issues.append("settlement_on_incomplete_intent")

            for txn in matches:
                if (
                    txn.user_id != intent.user_id
                    or txn.status != "completed"
                    or txn.type != intent.direction
                    or txn.direction != expected_direction
                    or txn.amount != intent.amount
                    or txn.currency_code != "MGA"
                ):
                    issues.append("wallet_intent_mismatch")
                entries = entry_map.get(txn.pk, [])
                debit = sum(
                    entry.amount for entry in entries if entry.entry_type == "debit"
                )
                credit = sum(
                    entry.amount for entry in entries if entry.entry_type == "credit"
                )
                if (
                    not entries
                    or debit != credit
                    or debit != txn.amount
                    or any(entry.account.currency_code != "MGA" for entry in entries)
                ):
                    issues.append("ledger_entries_mismatch")

            issue_codes = sorted(set(issues))
            results.append(
                {
                    "intent_id": key,
                    "provider": intent.provider,
                    "provider_reference": intent.provider_reference,
                    "direction": intent.direction,
                    "status": intent.status,
                    "amount_mga": intent.amount,
                    "sandbox": (
                        intent.metadata.get("sandbox") is True
                        if isinstance(intent.metadata, dict)
                        else False
                    ),
                    "wallet_transaction_ids": [str(txn.pk) for txn in matches],
                    "linked_webhooks": len(events),
                    "processed_webhooks": sum(
                        event.status == "processed" for event in events
                    ),
                    "issue_codes": issue_codes,
                    "internal_status": (
                        "needs_review"
                        if issue_codes
                        else (
                            "internally_consistent"
                            if intent.status == "completed"
                            else "in_progress"
                        )
                    ),
                    "external_psp_settlement_verified": False,
                }
            )

        return Response(
            {
                "currency": "MGA",
                "mode": "read_only_internal_transaction_checks",
                "external_psp_settlement_verified": False,
                "real_money_activation_authorized": False,
                "window_days": days,
                "generated_at": timezone.now().isoformat(),
                "count": total,
                "next_offset": offset + limit if offset + limit < total else None,
                "review_count_on_page": sum(
                    bool(item["issue_codes"]) for item in results
                ),
                "results": results,
                "limitations": [
                    "Les correspondances internes ne sont pas une confirmation de règlement PSP.",
                    (
                        "Les rapprochements exigent des relevés authentifiés "
                        "fournis par chaque prestataire."
                    ),
                    "Les paiements réels restent désactivés.",
                ],
            }
        )
