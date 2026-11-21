"""Back-office player directory, restricted details and audited status controls."""

from django.db import transaction
from django.db.models import Q
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.games.models import TableBankroll
from apps.payments.models import PaymentIntent
from apps.wallet.models import LedgerAccount, WalletTransaction

from .rbac import BackofficeCapabilityPermission
from .services import record_audit


def mask_email(value):
    if not value or value.endswith(".local"):
        return "Non vérifié"
    name, _, domain = value.partition("@")
    return f"{name[:1]}***@{domain}" if domain else "Non vérifié"


def mask_phone(value):
    return f"***{value[-3:]}" if value else "—"


class PlayerDirectoryView(APIView):
    permission_classes = [BackofficeCapabilityPermission]
    capability_by_method = {"GET": "players.list"}

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
    permission_classes = [BackofficeCapabilityPermission]
    capability_by_method = {"GET": "players.detail"}

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


class PlayerStatusView(APIView):
    """Superuser/TOTP account suspension; never modifies wallet or table funds."""

    permission_classes = [BackofficeCapabilityPermission]
    capability_by_method = {"POST": "players.status"}

    @transaction.atomic
    def post(self, request, player_id):
        if not request.user.is_superuser:
            return Response({"detail": "Super-administrateur requis."}, status=403)

        action = request.data.get("action")
        reason = request.data.get("reason")
        expected_active = request.data.get("expected_active")
        code = str(request.data.get("mfa_code") or "").strip()
        if action not in ("suspend", "reactivate"):
            return Response({"detail": "Action inconnue."}, status=400)
        if type(expected_active) is not bool:
            return Response({"detail": "État attendu obligatoire."}, status=400)
        if not isinstance(reason, str) or not 12 <= len(reason.strip()) <= 255:
            return Response(
                {"detail": "Justification obligatoire (12 à 255 caractères)."},
                status=400,
            )
        if len(code) != 6 or not code.isdigit():
            return Response({"detail": "Code TOTP requis."}, status=403)

        player = (
            User.objects.select_for_update()
            .filter(pk=player_id, is_staff=False, is_superuser=False)
            .first()
        )
        if player is None:
            return Response({"detail": "Joueur introuvable."}, status=404)
        if player.is_active != expected_active:
            return Response(
                {"detail": "État modifié depuis la consultation."}, status=409
            )
        desired_active = action == "reactivate"
        if player.is_active == desired_active:
            return Response({"detail": "Aucun changement à appliquer."}, status=409)

        # Do not lock a player out of an unsettled game without an operational
        # review and an explicit engine/funds recovery procedure.
        if (
            not desired_active
            and TableBankroll.objects.filter(
                user=player, status__in=["reserved", "active"]
            ).exists()
        ):
            return Response(
                {
                    "detail": "Partie financée en cours : traitement manuel requis.",
                    "manual_review_required": True,
                },
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

        previous = player.is_active
        player.is_active = desired_active
        player.token_version += 1
        player.save(update_fields=["is_active", "token_version"])
        record_audit(
            request.user,
            "player.reactivated" if desired_active else "player.suspended",
            player,
            {
                "before": previous,
                "after": player.is_active,
                "reason": reason.strip(),
                "jwt_sessions_revoked": True,
                "live_engine_disconnect_verified": False,
            },
        )
        return Response(
            {
                "player_id": player.pk,
                "is_active": player.is_active,
                "jwt_sessions_revoked": True,
                "live_engine_disconnect_verified": False,
            }
        )
