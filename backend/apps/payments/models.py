import uuid

from django.conf import settings
from django.db import models


class WebhookInboxEvent(models.Model):
    PROVIDERS = [
        ("mvola", "MVola"),
        ("orange", "Orange Money"),
        ("airtel", "Airtel Money"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.CharField(max_length=20, choices=PROVIDERS)
    event_id = models.CharField(max_length=160)
    event_type = models.CharField(max_length=80)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=20, default="received")
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "payment_webhook_inbox"
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "event_id"], name="unique_provider_webhook_event"
            )
        ]

    def __str__(self):
        return f"WebhookInboxEvent {self.provider} - {self.event_id} ({self.status})"


class PaymentIntent(models.Model):
    DIRECTIONS = [("deposit", "Dépôt"), ("withdrawal", "Retrait")]
    STATUSES = [
        ("pending", "En attente"),
        ("processing", "Traitement"),
        ("completed", "Terminée"),
        ("failed", "Échouée"),
        ("cancelled", "Annulée"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="payment_intents"
    )
    provider = models.CharField(max_length=20, choices=WebhookInboxEvent.PROVIDERS)
    direction = models.CharField(max_length=20, choices=DIRECTIONS)
    amount = models.PositiveBigIntegerField(help_text="Montant en Ariary (MGA)")
    currency = models.CharField(max_length=3, default="MGA")
    phone_number = models.CharField(max_length=20, blank=True)
    provider_reference = models.CharField(max_length=160, blank=True, db_index=True)
    checkout_url = models.CharField(max_length=500, blank=True)
    error_message = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=STATUSES, default="pending")
    idempotency_key = models.CharField(max_length=160, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_intents"
        ordering = ["-created_at"]

    def __str__(self):
        return f"PaymentIntent #{self.pk} {self.direction} {self.amount} {self.currency} ({self.provider}: {self.status})"
