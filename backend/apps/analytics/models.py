import uuid

from django.conf import settings
from django.db import models


class ProductEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event_name = models.CharField(max_length=80)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="product_events",
    )
    anonymous_id = models.CharField(max_length=128, blank=True)
    session_id = models.CharField(max_length=128, blank=True)
    mode = models.CharField(max_length=40, blank=True)
    game_type = models.CharField(max_length=40, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "product_events"
        indexes = [
            models.Index(fields=["event_name", "created_at"]),
            models.Index(fields=["session_id", "created_at"]),
        ]
