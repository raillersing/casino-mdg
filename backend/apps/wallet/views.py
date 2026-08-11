from rest_framework.response import Response
from rest_framework.views import APIView

from .models import WalletTransaction
from .services import get_or_create_player_account


class WalletBalanceView(APIView):
    def get(self, request):
        account = get_or_create_player_account(request.user)
        return Response({"account_id": account.pk, "balance": account.balance, "held_balance": account.held_balance, "currency": account.currency_code})


class WalletTransactionsView(APIView):
    def get(self, request):
        transactions = WalletTransaction.objects.filter(user=request.user).order_by("-created_at")[:50]
        return Response({"results": [{"id": str(item.id), "type": item.type, "direction": item.direction, "amount": item.amount, "currency": item.currency_code, "status": item.status, "description": item.description, "created_at": item.created_at.isoformat()} for item in transactions]})
