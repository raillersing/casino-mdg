import uuid

from django.conf import settings
from django.db import models


class AuditEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="audit_events",
    )
    action = models.CharField(max_length=80)
    target_type = models.CharField(max_length=80)
    target_id = models.CharField(max_length=120)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_events"
        ordering = ["-created_at"]


class FeatureFlag(models.Model):
    key = models.CharField(max_length=80, unique=True)
    enabled = models.BooleanField(default=True)
    reason = models.CharField(max_length=255, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="feature_flag_changes",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "feature_flags"

    def __str__(self):
        return self.key


class AuthChannelPolicy(models.Model):
    """Singleton server-side choice of allowed player OTP channels."""

    MODES = [
        ("email", "Email"),
        ("sms", "SMS"),
        ("both", "Email et SMS"),
        ("none", "Désactivés"),
    ]

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    mode = models.CharField(max_length=8, choices=MODES, default="both")
    revision = models.PositiveIntegerField(default=1)
    reason = models.CharField(max_length=255, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="auth_channel_policy_changes",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "auth_channel_policy"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(pk=1),
                name="auth_channel_singleton",
            )
        ]


class BalanceAdjustmentRequest(models.Model):
    """Approval-only SIM token grant. Never represents real MGA funds."""

    STATES = [
        ("pending", "En attente"),
        ("approved", "Approuvée"),
        ("rejected", "Rejetée"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sim_grant_requests",
    )
    amount = models.PositiveBigIntegerField()
    reason = models.TextField()
    idempotency_key = models.CharField(max_length=160, unique=True)
    status = models.CharField(max_length=12, choices=STATES, default="pending")
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sim_grants_requested",
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="sim_grants_decided",
    )
    decision_reason = models.TextField(blank=True)
    transaction = models.ForeignKey(
        "wallet.WalletTransaction",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="approved_sim_grants",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "backoffice_sim_grants"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0, amount__lte=1_000_000),
                name="sim_grant_amount_bounded",
            )
        ]
