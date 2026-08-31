import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone


class ResponsibleGamingProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="responsible_gaming_profile",
    )
    # Limites financières en Ariary (MGA)
    daily_deposit_limit = models.PositiveBigIntegerField(null=True, blank=True, help_text="Plafond de dépôt journalier (Ar)")
    weekly_deposit_limit = models.PositiveBigIntegerField(null=True, blank=True, help_text="Plafond de dépôt hebdomadaire (Ar)")
    monthly_deposit_limit = models.PositiveBigIntegerField(null=True, blank=True, help_text="Plafond de dépôt mensuel (Ar)")
    daily_loss_limit = models.PositiveBigIntegerField(null=True, blank=True, help_text="Plafond de perte journalière (Ar)")
    daily_bet_limit = models.PositiveBigIntegerField(null=True, blank=True, help_text="Plafond de mise journalière (Ar)")

    # Limites temporelles
    session_time_limit_minutes = models.PositiveIntegerField(null=True, blank=True, help_text="Durée max par session (min)")
    reality_check_interval_minutes = models.PositiveIntegerField(default=30, help_text="Intervalle de rappel réalité (min)")

    # Pause temporaire ("Cooling-off")
    cooling_off_until = models.DateTimeField(null=True, blank=True)
    cooling_off_started_at = models.DateTimeField(null=True, blank=True)
    cooling_off_reason = models.CharField(max_length=255, blank=True)

    # Auto-exclusion
    self_exclusion_until = models.DateTimeField(null=True, blank=True)
    self_exclusion_started_at = models.DateTimeField(null=True, blank=True)
    is_permanently_excluded = models.BooleanField(default=False)
    self_exclusion_reason = models.CharField(max_length=255, blank=True)

    # Suivi
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "responsible_gaming_profiles"

    def is_active_cooling_off(self) -> bool:
        return bool(self.cooling_off_until and self.cooling_off_until > timezone.now())

    def is_active_self_exclusion(self) -> bool:
        if self.is_permanently_excluded:
            return True
        return bool(self.self_exclusion_until and self.self_exclusion_until > timezone.now())

    def is_blocked_from_playing(self) -> bool:
        return self.is_active_cooling_off() or self.is_active_self_exclusion()

    def __str__(self):
        return f"ResponsibleGamingProfile for user #{self.user_id}"


class ResponsibleGamingAudit(models.Model):
    ACTIONS = [
        ("limits_updated", "Mise à jour des limites"),
        ("cooling_off_activated", "Activation pause temporaire"),
        ("self_exclusion_activated", "Activation auto-exclusion"),
        ("cooling_off_expired", "Fin de pause temporaire"),
        ("self_exclusion_expired", "Fin d'auto-exclusion"),
        ("deposit_blocked_limit", "Dépôt bloqué (plafond atteint)"),
        ("game_blocked_exclusion", "Jeu bloqué (auto-exclusion)"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="responsible_gaming_audits",
    )
    action = models.CharField(max_length=50, choices=ACTIONS)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "responsible_gaming_audits"
        ordering = ["-created_at"]

    def __str__(self):
        return f"RGAudit {self.action} on user #{self.user_id} at {self.created_at}"
