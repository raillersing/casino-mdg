from datetime import timedelta
from typing import Any, Dict, Optional, Tuple

from django.core.exceptions import ValidationError
from django.db.models import Sum
from django.utils import timezone

from apps.backoffice.services import record_audit
from apps.notifications.services import create_notification
from apps.payments.models import PaymentIntent

from .models import ResponsibleGamingAudit, ResponsibleGamingProfile


def get_or_create_rg_profile(user) -> ResponsibleGamingProfile:
    """Récupère ou initialise le profil de Jeu Responsable du joueur."""
    profile, _ = ResponsibleGamingProfile.objects.get_or_create(user=user)
    return profile


def get_deposit_usage(user) -> Dict[str, int]:
    """Calcule le total des dépôts effectués sur les dernières 24h, 7 jours et 30 jours."""
    now = timezone.now()
    
    daily_sum = PaymentIntent.objects.filter(
        user=user,
        direction="deposit",
        status="completed",
        created_at__gte=now - timedelta(days=1),
    ).aggregate(total=Sum("amount"))["total"] or 0

    weekly_sum = PaymentIntent.objects.filter(
        user=user,
        direction="deposit",
        status="completed",
        created_at__gte=now - timedelta(days=7),
    ).aggregate(total=Sum("amount"))["total"] or 0

    monthly_sum = PaymentIntent.objects.filter(
        user=user,
        direction="deposit",
        status="completed",
        created_at__gte=now - timedelta(days=30),
    ).aggregate(total=Sum("amount"))["total"] or 0

    return {
        "daily": daily_sum,
        "weekly": weekly_sum,
        "monthly": monthly_sum,
    }


def check_deposit_allowed(user, deposit_amount: int) -> None:
    """
    Vérifie qu'un dépôt ne viole pas une auto-exclusion, une pause active
    ou un plafond de dépôt journalier/hebdomadaire/mensuel configuré par le joueur.
    """
    profile = get_or_create_rg_profile(user)

    if profile.is_permanently_excluded:
        record_audit(user, "rg.deposit_blocked_permanent_exclusion", profile, {"amount": deposit_amount})
        raise ValidationError("Votre compte fait l'objet d'une auto-exclusion définitive du jeu.")

    if profile.is_active_self_exclusion():
        record_audit(user, "rg.deposit_blocked_self_exclusion", profile, {"amount": deposit_amount})
        raise ValidationError(
            f"Votre compte est auto-exclu jusqu'au {profile.self_exclusion_until.strftime('%d/%m/%Y à %H:%M')}."
        )

    if profile.is_active_cooling_off():
        record_audit(user, "rg.deposit_blocked_cooling_off", profile, {"amount": deposit_amount})
        raise ValidationError(
            f"Votre compte est en pause de jeu temporaire jusqu'au {profile.cooling_off_until.strftime('%d/%m/%Y à %H:%M')}."
        )

    usage = get_deposit_usage(user)

    if profile.daily_deposit_limit and (usage["daily"] + deposit_amount > profile.daily_deposit_limit):
        diff = profile.daily_deposit_limit - usage["daily"]
        raise ValidationError(
            f"Ce dépôt dépasse votre limite journalière personnelle ({profile.daily_deposit_limit:,} Ar). Montant restant aujourd'hui : {max(0, diff):,} Ar."
        )

    if profile.weekly_deposit_limit and (usage["weekly"] + deposit_amount > profile.weekly_deposit_limit):
        diff = profile.weekly_deposit_limit - usage["weekly"]
        raise ValidationError(
            f"Ce dépôt dépasse votre limite hebdomadaire personnelle ({profile.weekly_deposit_limit:,} Ar). Montant restant cette semaine : {max(0, diff):,} Ar."
        )

    if profile.monthly_deposit_limit and (usage["monthly"] + deposit_amount > profile.monthly_deposit_limit):
        diff = profile.monthly_deposit_limit - usage["monthly"]
        raise ValidationError(
            f"Ce dépôt dépasse votre limite mensuelle personnelle ({profile.monthly_deposit_limit:,} Ar). Montant restant ce mois-ci : {max(0, diff):,} Ar."
        )


def check_gameplay_allowed(user) -> None:
    """Vérifie si le joueur est autorisé à participer à une partie ou rejoindre une table."""
    profile = get_or_create_rg_profile(user)

    if profile.is_permanently_excluded:
        raise ValidationError("Accès refusé : auto-exclusion définitive active.")

    if profile.is_active_self_exclusion():
        raise ValidationError(
            f"Accès refusé : auto-exclusion active jusqu'au {profile.self_exclusion_until.strftime('%d/%m/%Y à %H:%M')}."
        )

    if profile.is_active_cooling_off():
        raise ValidationError(
            f"Accès refusé : pause temporaire en cours jusqu'au {profile.cooling_off_until.strftime('%d/%m/%Y à %H:%M')}."
        )


def apply_cooling_off(user, duration_hours: int, reason: str = "") -> ResponsibleGamingProfile:
    """Active une pause temporaire (cooling-off) sur le compte du joueur."""
    if duration_hours not in [24, 48, 72, 168]:  # 24h, 48h, 72h, 7 jours
        raise ValidationError("Durée de pause non valide. Choix : 24h, 48h, 72h ou 7 jours (168h).")

    profile = get_or_create_rg_profile(user)
    now = timezone.now()
    profile.cooling_off_started_at = now
    profile.cooling_off_until = now + timedelta(hours=duration_hours)
    profile.cooling_off_reason = reason[:255]
    profile.save(update_fields=["cooling_off_started_at", "cooling_off_until", "cooling_off_reason", "updated_at"])

    ResponsibleGamingAudit.objects.create(
        user=user,
        action="cooling_off_activated",
        details={"duration_hours": duration_hours, "until": profile.cooling_off_until.isoformat(), "reason": reason},
    )
    record_audit(user, "rg.cooling_off_activated", profile, {"hours": duration_hours, "reason": reason})

    create_notification(
        user=user,
        category="security",
        title="Pause de jeu activée",
        message=f"Votre pause de {duration_hours}h est active jusqu'au {profile.cooling_off_until.strftime('%d/%m/%Y à %H:%M')}. Aucun dépôt ni jeu payant ne sera autorisé durant cette période.",
    )
    return profile


def apply_self_exclusion(user, months: Optional[int], permanent: bool = False, reason: str = "") -> ResponsibleGamingProfile:
    """Active une auto-exclusion de jeu temporaire (ex: 1, 3, 6, 12 mois) ou définitive."""
    profile = get_or_create_rg_profile(user)
    now = timezone.now()

    if permanent:
        profile.is_permanently_excluded = True
        profile.self_exclusion_until = None
    else:
        if not months or months < 1:
            raise ValidationError("Durée d'auto-exclusion invalide.")
        profile.is_permanently_excluded = False
        profile.self_exclusion_until = now + timedelta(days=30 * months)

    profile.self_exclusion_started_at = now
    profile.self_exclusion_reason = reason[:255]
    profile.save(update_fields=["is_permanently_excluded", "self_exclusion_until", "self_exclusion_started_at", "self_exclusion_reason", "updated_at"])

    ResponsibleGamingAudit.objects.create(
        user=user,
        action="self_exclusion_activated",
        details={"permanent": permanent, "months": months, "reason": reason},
    )
    record_audit(user, "rg.self_exclusion_activated", profile, {"permanent": permanent, "months": months, "reason": reason})

    create_notification(
        user=user,
        category="security",
        title="Auto-exclusion activée",
        message="Votre auto-exclusion a été prise en compte avec succès." if permanent else f"Votre auto-exclusion est active jusqu'au {profile.self_exclusion_until.strftime('%d/%m/%Y')}.",
    )
    return profile


def update_player_limits(user, limits_data: Dict[str, Any]) -> ResponsibleGamingProfile:
    """Met à jour les plafonds et préférences de Jeu Responsable du joueur."""
    profile = get_or_create_rg_profile(user)

    for field in [
        "daily_deposit_limit",
        "weekly_deposit_limit",
        "monthly_deposit_limit",
        "daily_loss_limit",
        "daily_bet_limit",
        "session_time_limit_minutes",
        "reality_check_interval_minutes",
    ]:
        if field in limits_data:
            val = limits_data[field]
            if val is not None and val != "":
                try:
                    val = int(val)
                    if val <= 0:
                        val = None
                except (ValueError, TypeError):
                    val = None
            else:
                val = None
            setattr(profile, field, val)

    profile.save()

    ResponsibleGamingAudit.objects.create(
        user=user,
        action="limits_updated",
        details=limits_data,
    )
    record_audit(user, "rg.limits_updated", profile, limits_data)
    return profile
