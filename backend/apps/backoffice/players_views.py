"""Back-office player directory and audited detail (no account mutations)."""

from django.db.models import Q
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.payments.models import PaymentIntent
from apps.wallet.models import LedgerAccount, WalletTransaction


def mask_email(value):
    if not value or value.endswith(".local"):
        return "Non vérifié"
    name, _, domain = value.partition("@")
    return f"{name[:1]}***@{domain}" if domain else "Non vérifié"


def mask_phone(value):
    return f"***{value[-3:]}" if value else "—"


class PlayerDirectoryView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        query = str(request.query_params.get("q", "")).strip()
        if len(query) > 120:
            return Response({"detail": "Recherche trop longue."}, status=400)
        try:
            limit = int(request.query_params.get("limit", 25))
            offset = int(request.query_params.get("offset", 0))
        except (ValueError, TypeError):
            return Response({"detail": "Pagination invalide."}, status=400)
        if not 1 <= limit <= 100 or not 0 <= offset <= 100_000:
            return Response({"detail": "Pagination invalide."}, status=400)

        queryset = User.objects.filter(is_staff=False).order_by("-date_joined")
        if query:
            queryset = queryset.filter(
                Q(display_name__icontains=query)
                | Q(phone__icontains=query)
                | Q(email__icontains=query)
            )
        state = request.query_params.get("state")
        if state == "active":
            queryset = queryset.filter(is_active=True)
        elif state == "suspended":
            queryset = queryset.filter(is_active=False)
        elif state not in (None, "all"):
            return Response({"detail": "Filtre de statut invalide."}, status=400)
        total = queryset.count()
        users = queryset[offset:][:limit]
        full_access = request.user.is_superuser
        return Response(
            {
                "count": total,
                "next_offset": offset + limit if offset + limit < total else None,
                "results": [
                    {
                        "id": user.pk,
                        "display_name": user.display_name,
                        "email": user.email if full_access else mask_email(user.email),
                        "phone": user.phone if full_access else mask_phone(user.phone),
                        "email_verified": user.email_verified_at is not None,
                        "phone_verified": user.phone_verified_at is not None,
                        "kyc_level": user.kyc_level,
                        "is_active": user.is_active,
                        "date_joined": user.date_joined.isoformat(),
                    }
                    for user in users
                ],
            }
        )


class PlayerDetailView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, player_id):
        # Detailed contact and financial records require elevated privileges.
        if not request.user.is_superuser:
            return Response(
                {"detail": "Droit de consultation renforcé requis."}, status=403
            )
        try:
            player = User.objects.get(pk=player_id, is_staff=False)
        except User.DoesNotExist:
            return Response({"detail": "Joueur introuvable."}, status=404)
        balances = list(
            LedgerAccount.objects.filter(user=player, account_type="player")
            .values("currency_code", "balance", "held_balance", "status")
            .order_by("currency_code")
        )
        recent_tx = WalletTransaction.objects.filter(user=player).order_by(
            "-created_at"
        )[:25]
        intents = PaymentIntent.objects.filter(user=player).order_by("-created_at")[:10]
        return Response(
            {
                "player": {
                    "id": player.pk,
                    "display_name": player.display_name,
                    "email": player.email if player.email_verified_at else None,
                    "phone": player.phone,
                    "email_verified": player.email_verified_at is not None,
                    "phone_verified": player.phone_verified_at is not None,
                    "kyc_level": player.kyc_level,
                    "is_active": player.is_active,
                    "date_joined": player.date_joined.isoformat(),
                },
                "wallets": balances,
                "transactions": [
                    {
                        "id": str(item.pk),
                        "type": item.type,
                        "direction": item.direction,
                        "amount": item.amount,
                        "currency": item.currency_code,
                        "status": item.status,
                        "created_at": item.created_at.isoformat(),
                    }
                    for item in recent_tx
                ],
                "payments": [
                    {
                        "id": str(item.pk),
                        "provider": item.provider,
                        "direction": item.direction,
                        "amount": item.amount,
                        "currency": item.currency,
                        "status": item.status,
                        "created_at": item.created_at.isoformat(),
                    }
                    for item in intents
                ],
            }
        )
