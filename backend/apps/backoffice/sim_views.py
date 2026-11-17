"""SIM-only financial read model and segregated dual-control grant workflow."""

from django.db import IntegrityError, transaction
from django.db.models import Count, Sum
from django.utils import timezone
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.wallet.models import LedgerAccount, LedgerEntry, WalletTransaction
from apps.wallet.services import credit_simulation_reward

from .models import BalanceAdjustmentRequest
from .services import record_audit


def paginate(request):
    try:
        limit = int(request.query_params.get("limit", 25))
        offset = int(request.query_params.get("offset", 0))
    except (TypeError, ValueError):
        return None
    return (limit, offset) if 1 <= limit <= 100 and 0 <= offset <= 100_000 else None


def serialize_grant(grant):
    return {
        "id": str(grant.pk),
        "player_id": grant.player_id,
        "amount": grant.amount,
        "currency": "SIM",
        "reason": grant.reason,
        "status": grant.status,
        "requested_by_id": grant.requested_by_id,
        "decided_by_id": grant.decided_by_id,
        "decision_reason": grant.decision_reason,
        "transaction_id": str(grant.transaction_id) if grant.transaction_id else None,
        "created_at": grant.created_at.isoformat(),
        "decided_at": grant.decided_at.isoformat() if grant.decided_at else None,
    }


class SimCashierSummaryView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        accounts = LedgerAccount.objects.filter(currency_code="SIM")
        grouped = list(
            accounts.values("account_type")
            .annotate(count=Count("id"), balance=Sum("balance"), held=Sum("held_balance"))
            .order_by("account_type")
        )
        entries = LedgerEntry.objects.filter(account__currency_code="SIM")
        debit = int(
            entries.filter(entry_type="debit").aggregate(total=Sum("amount"))[
                "total"
            ]
            or 0
        )
        credit = int(
            entries.filter(entry_type="credit").aggregate(total=Sum("amount"))[
                "total"
            ]
            or 0
        )
        return Response(
            {
                "currency": "SIM",
                "account_groups": grouped,
                "total_balances_sim": sum(
                    int(item["balance"] or 0) for item in grouped
                ),
                "entries_debit_sim": debit,
                "entries_credit_sim": credit,
                "ledger_entries_balanced": debit == credit,
                "pending_adjustments": BalanceAdjustmentRequest.objects.filter(
                    status="pending"
                ).count(),
                "generated_at": timezone.now().isoformat(),
                "money_mode": "simulation_only",
            }
        )


class SimLedgerView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Accès comptable restreint."}, status=403)
        page = paginate(request)
        if page is None:
            return Response({"detail": "Pagination invalide."}, status=400)
        limit, offset = page
        queryset = WalletTransaction.objects.filter(
            currency_code="SIM"
        ).order_by("-created_at")
        total = queryset.count()
        items = queryset.select_related("user").prefetch_related(
            "entries__account"
        )[offset : offset + limit]
        return Response(
            {
                "currency": "SIM",
                "count": total,
                "next_offset": offset + limit if offset + limit < total else None,
                "results": [
                    {
                        "id": str(item.pk),
                        "transaction_code": item.transaction_code,
                        "player_id": item.user_id,
                        "amount": item.amount,
                        "currency": item.currency_code,
                        "type": item.type,
                        "direction": item.direction,
                        "status": item.status,
                        "created_at": item.created_at.isoformat(),
                        "entries": [
                            {
                                "account_id": entry.account_id,
                                "entry_type": entry.entry_type,
                                "amount": entry.amount,
                                "balance_after": entry.balance_after,
                            }
                            for entry in item.entries.all()
                        ],
                    }
                    for item in items
                ],
            }
        )


class SimAdjustmentListCreateView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        page = paginate(request)
        if page is None:
            return Response({"detail": "Pagination invalide."}, status=400)
        limit, offset = page
        queryset = BalanceAdjustmentRequest.objects.all()
        total = queryset.count()
        items = queryset[offset : offset + limit]
        return Response(
            {
                "count": total,
                "next_offset": offset + limit if offset + limit < total else None,
                "results": [serialize_grant(item) for item in items],
            }
        )

    def post(self, request):
        player_id = request.data.get("player_id")
        amount = request.data.get("amount")
        reason = request.data.get("reason")
        key = request.headers.get("Idempotency-Key", "").strip()
        if type(player_id) is not int or player_id <= 0:
            return Response({"detail": "Identifiant joueur invalide."}, status=400)
        if type(amount) is not int or not 1 <= amount <= 1_000_000:
            return Response({"detail": "Montant SIM invalide (1 à 1 000 000)."}, status=400)
        if not isinstance(reason, str) or not 20 <= len(reason.strip()) <= 1000:
            return Response({"detail": "Motif détaillé requis (20 à 1000 caractères)."}, status=400)
        if not 16 <= len(key) <= 160:
            return Response({"detail": "Clé d'idempotence requise."}, status=400)
        try:
            player = User.objects.get(pk=player_id, is_staff=False, is_active=True)
        except User.DoesNotExist:
            return Response({"detail": "Joueur non admissible."}, status=404)

        try:
            with transaction.atomic():
                grant, created = BalanceAdjustmentRequest.objects.get_or_create(
                    idempotency_key=key,
                    defaults={
                        "player": player,
                        "amount": amount,
                        "reason": reason.strip(),
                        "requested_by": request.user,
                    },
                )
                if not created and (
                    grant.requested_by_id != request.user.pk
                    or grant.player_id != player_id
                    or grant.amount != amount
                    or grant.reason != reason.strip()
                ):
                    return Response(
                        {"detail": "Clé d'idempotence utilisée pour une autre demande."},
                        status=409,
                    )
                if created:
                    record_audit(
                        request.user,
                        "sim.grant.requested",
                        grant,
                        {"amount": amount, "currency": "SIM", "player_id": player.pk},
                    )
        except IntegrityError:
            return Response({"detail": "Conflit d'idempotence."}, status=409)
        return Response(serialize_grant(grant), status=201 if created else 200)


class SimAdjustmentDecisionView(APIView):
    permission_classes = [IsAdminUser]

    @transaction.atomic
    def post(self, request, adjustment_id):
        if not request.user.is_superuser or not request.user.is_active:
            return Response({"detail": "Approbateur autorisé requis."}, status=403)
        action = request.data.get("action")
        reason = request.data.get("reason")
        token = str(request.data.get("mfa_code") or "").strip()
        if action not in ("approve", "reject"):
            return Response({"detail": "Décision invalide."}, status=400)
        if not isinstance(reason, str) or not 10 <= len(reason.strip()) <= 1000:
            return Response({"detail": "Motif de décision requis."}, status=400)
        try:
            grant = (
                BalanceAdjustmentRequest.objects.select_for_update()
                .select_related("player", "requested_by")
                .get(pk=adjustment_id)
            )
        except BalanceAdjustmentRequest.DoesNotExist:
            return Response({"detail": "Demande introuvable."}, status=404)
        if grant.requested_by_id == request.user.pk:
            return Response({"detail": "Auto-approbation interdite."}, status=403)
        if grant.status != "pending":
            return Response(
                {"detail": "Demande déjà traitée.", "request": serialize_grant(grant)},
                status=409,
            )
        if len(token) != 6 or not token.isdigit():
            return Response({"detail": "Code MFA TOTP requis."}, status=403)
        devices = TOTPDevice.objects.select_for_update().filter(
            user=request.user, confirmed=True
        )
        if not any(device.verify_token(token) for device in devices):
            return Response({"detail": "Vérification MFA refusée."}, status=403)

        if action == "approve":
            if not grant.player.is_active or grant.player.is_staff:
                return Response({"detail": "Compte joueur non admissible."}, status=409)
            wallet_tx, _ = credit_simulation_reward(
                grant.player,
                idempotency_key=f"admin-sim-grant:{grant.pk}",
                amount=grant.amount,
                description=f"Dotation SIM approuvée : {grant.pk}",
            )
            grant.transaction = wallet_tx
            grant.status = "approved"
        else:
            grant.status = "rejected"
        grant.decision_reason = reason.strip()
        grant.decided_by = request.user
        grant.decided_at = timezone.now()
        grant.save(
            update_fields=[
                "status", "transaction", "decision_reason",
                "decided_by", "decided_at",
            ]
        )
        record_audit(
            request.user,
            f"sim.grant.{grant.status}",
            grant,
            {
                "currency": "SIM", "amount": grant.amount,
                "player_id": grant.player_id,
                "requester_id": grant.requested_by_id,
                "decision_reason": grant.decision_reason,
                "transaction_id": str(grant.transaction_id) if grant.transaction_id else None,
            },
        )
        return Response(serialize_grant(grant))
