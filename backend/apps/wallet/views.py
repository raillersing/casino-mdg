from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import WalletTransaction
from .services import get_or_create_player_account


class WalletBalanceView(APIView):
    def get(self, request):
        account = get_or_create_player_account(request.user)
        return Response(
            {
                "account_id": account.pk,
                "balance": account.balance,
                "held_balance": account.held_balance,
                "currency": account.currency_code,
            }
        )


class WalletTransactionsView(APIView):
    def get(self, request):
        try:
            limit = min(max(int(request.query_params.get("limit", 50)), 1), 100)
            offset = max(int(request.query_params.get("offset", 0)), 0)
        except (TypeError, ValueError):
            return Response(
                {"detail": "Pagination invalide."}, status=status.HTTP_400_BAD_REQUEST
            )
        queryset = WalletTransaction.objects.filter(user=request.user).order_by(
            "-created_at"
        )
        total = queryset.count()
        transactions = queryset[offset : offset + limit]  # noqa: E203
        return Response(
            {
                "count": total,
                "next_offset": offset + limit if offset + limit < total else None,
                "results": [
                    {
                        "id": str(item.id),
                        "type": item.type,
                        "direction": item.direction,
                        "amount": item.amount,
                        "currency": item.currency_code,
                        "status": item.status,
                        "description": item.description,
                        "created_at": item.created_at.isoformat(),
                    }
                    for item in transactions
                ],
            }
        )


class WalletTransactionDetailView(APIView):
    def get(self, request, transaction_id):
        try:
            transaction = WalletTransaction.objects.prefetch_related(
                "entries__account"
            ).get(id=transaction_id, user=request.user)
        except WalletTransaction.DoesNotExist:
            return Response(
                {"detail": "Transaction introuvable."}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(
            {
                "id": str(transaction.id),
                "transaction_code": transaction.transaction_code,
                "type": transaction.type,
                "direction": transaction.direction,
                "amount": transaction.amount,
                "currency": transaction.currency_code,
                "status": transaction.status,
                "description": transaction.description,
                "metadata": transaction.metadata,
                "created_at": transaction.created_at.isoformat(),
                "processed_at": (
                    transaction.processed_at.isoformat()
                    if transaction.processed_at
                    else None
                ),
                "entries": [
                    {
                        "account_type": entry.account.account_type,
                        "entry_type": entry.entry_type,
                        "amount": entry.amount,
                        "balance_after": entry.balance_after,
                    }
                    for entry in transaction.entries.all()
                ],
            }
        )
