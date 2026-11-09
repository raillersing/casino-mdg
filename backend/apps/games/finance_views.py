import hmac

from django.conf import settings
from django.core.exceptions import ValidationError
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .finance import apply_checkpoint
from .models import GameTable, TableFundingOperation


class InternalTableFinanceView(APIView):
    throttle_classes = []
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def dispatch(self, request, *args, **kwargs):
        secret = getattr(settings, "GAME_ENGINE_RESULT_SECRET", "")
        received = request.headers.get("X-Game-Engine-Secret", "")
        if not secret or not hmac.compare_digest(secret, received):
            from django.http import JsonResponse

            return JsonResponse({"detail": "Non autorisé."}, status=403)
        return super().dispatch(request, *args, **kwargs)

    def get(self, request, table_id):
        if not GameTable.objects.filter(pk=table_id).exists():
            return Response({"detail": "Table inconnue."}, status=404)
        operations = (
            TableFundingOperation.objects.filter(
                table_id=table_id,
                bankroll__finance_version=1,
                bankroll__status__in=["reserved", "active"],
            )
            .exclude(status="cancelled")
            .order_by("created_at", "id")
        )
        return Response(
            {
                "operations": [
                    {
                        "id": str(op.pk),
                        "session": str(op.bankroll_id),
                        "user_id": str(op.user_id),
                        "kind": op.kind,
                        "amount": op.amount,
                        "status": op.status,
                    }
                    for op in operations
                ]
            }
        )

    def post(self, request, table_id):
        try:
            apply_checkpoint(table_id, request.data)
        except (ValueError, TypeError, ValidationError) as exc:
            return Response({"detail": str(exc)}, status=409)
        except GameTable.DoesNotExist:
            return Response({"detail": "Table inconnue."}, status=404)
        return Response({"accepted": True})
