from django.db import models
from django.core.exceptions import ValidationError
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ResponsibleGamingAudit, ResponsibleGamingProfile
from .services import (
    apply_cooling_off,
    apply_self_exclusion,
    get_deposit_usage,
    get_or_create_rg_profile,
    update_player_limits,
)


def serialize_rg_profile(profile: ResponsibleGamingProfile, user) -> dict:
    usage = get_deposit_usage(user)
    return {
        "daily_deposit_limit": profile.daily_deposit_limit,
        "weekly_deposit_limit": profile.weekly_deposit_limit,
        "monthly_deposit_limit": profile.monthly_deposit_limit,
        "daily_loss_limit": profile.daily_loss_limit,
        "daily_bet_limit": profile.daily_bet_limit,
        "session_time_limit_minutes": profile.session_time_limit_minutes,
        "reality_check_interval_minutes": profile.reality_check_interval_minutes,
        # Statuts de restriction
        "is_active_cooling_off": profile.is_active_cooling_off(),
        "cooling_off_until": profile.cooling_off_until.isoformat() if profile.cooling_off_until else None,
        "is_active_self_exclusion": profile.is_active_self_exclusion(),
        "is_permanently_excluded": profile.is_permanently_excluded,
        "self_exclusion_until": profile.self_exclusion_until.isoformat() if profile.self_exclusion_until else None,
        "is_blocked": profile.is_blocked_from_playing(),
        # Consommation actuelle
        "deposit_usage": usage,
        "updated_at": profile.updated_at.isoformat(),
    }


class ResponsibleGamingStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile = get_or_create_rg_profile(request.user)
        return Response(serialize_rg_profile(profile, request.user))

    def post(self, request):
        try:
            profile = update_player_limits(request.user, request.data)
        except ValidationError as exc:
            return Response({"detail": exc.message if hasattr(exc, "message") else str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": "Limites de jeu mises à jour avec succès.",
                "profile": serialize_rg_profile(profile, request.user),
            }
        )


class ResponsibleGamingCoolingOffView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            duration_hours = int(request.data.get("duration_hours", 24))
        except (ValueError, TypeError):
            return Response({"detail": "Durée de pause invalide."}, status=status.HTTP_400_BAD_REQUEST)

        reason = str(request.data.get("reason", ""))
        try:
            profile = apply_cooling_off(request.user, duration_hours=duration_hours, reason=reason)
        except ValidationError as exc:
            return Response({"detail": exc.message if hasattr(exc, "message") else str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": f"Pause de {duration_hours}h activée avec succès.",
                "profile": serialize_rg_profile(profile, request.user),
            },
            status=status.HTTP_200_OK,
        )


class ResponsibleGamingSelfExclusionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        permanent = bool(request.data.get("permanent", False))
        months = request.data.get("months")
        if months is not None:
            try:
                months = int(months)
            except (ValueError, TypeError):
                months = None

        if not permanent and not months:
            return Response({"detail": "Veuillez spécifier une durée en mois ou confirmer l'exclusion définitive."}, status=status.HTTP_400_BAD_REQUEST)

        reason = str(request.data.get("reason", ""))
        try:
            profile = apply_self_exclusion(request.user, months=months, permanent=permanent, reason=reason)
        except ValidationError as exc:
            return Response({"detail": exc.message if hasattr(exc, "message") else str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": "Auto-exclusion enregistrée avec succès.",
                "profile": serialize_rg_profile(profile, request.user),
            },
            status=status.HTTP_200_OK,
        )


class BackofficeResponsibleGamingListView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        profiles = ResponsibleGamingProfile.objects.select_related("user").filter(
            models.Q(is_permanently_excluded=True)
            | models.Q(self_exclusion_until__isnull=False)
            | models.Q(cooling_off_until__isnull=False)
        )[:100]

        results = []
        for item in profiles:
            results.append(
                {
                    "id": item.pk,
                    "user": {
                        "id": str(item.user.pk),
                        "phone": item.user.phone,
                        "display_name": item.user.display_name,
                        "email": item.user.email,
                    },
                    "is_active_cooling_off": item.is_active_cooling_off(),
                    "cooling_off_until": item.cooling_off_until.isoformat() if item.cooling_off_until else None,
                    "is_active_self_exclusion": item.is_active_self_exclusion(),
                    "is_permanently_excluded": item.is_permanently_excluded,
                    "self_exclusion_until": item.self_exclusion_until.isoformat() if item.self_exclusion_until else None,
                    "reason": item.self_exclusion_reason or item.cooling_off_reason,
                    "updated_at": item.updated_at.isoformat(),
                }
            )
        return Response({"results": results, "count": len(results)})
