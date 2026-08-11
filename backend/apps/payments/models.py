import uuid

from django.db import models


class WebhookInboxEvent(models.Model):
    PROVIDERS = [("mvola", "MVola"), ("orange", "Orange Money"), ("airtel", "Airtel Money")]
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
        constraints = [models.UniqueConstraint(fields=["provider", "event_id"], name="unique_provider_webhook_event")]
