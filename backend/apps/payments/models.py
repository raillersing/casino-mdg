import uuid

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
        "accounts.User", on_delete=models.PROTECT, related_name="payment_intents"
    )
    provider = models.CharField(max_length=20, choices=WebhookInboxEvent.PROVIDERS)
    direction = models.CharField(max_length=20, choices=DIRECTIONS)
    amount = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="MGA")
    status = models.CharField(max_length=20, choices=STATUSES, default="pending")
    idempotency_key = models.CharField(max_length=160, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_intents"
        ordering = ["-created_at"]
