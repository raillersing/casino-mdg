import uuid

from django.conf import settings
from django.db import models

from apps.games.models import GameTable


class ChatMessage(models.Model):
    table = models.ForeignKey(GameTable, on_delete=models.CASCADE, related_name="chat_messages")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="chat_messages")
    body = models.CharField(max_length=500)
    is_hidden = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "social_chat_messages"
        ordering = ["created_at"]


class TableInvitation(models.Model):
    STATUSES = [("pending", "En attente"), ("accepted", "Acceptée"), ("expired", "Expirée")]
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    table = models.ForeignKey(GameTable, on_delete=models.CASCADE, related_name="invitations")
    inviter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sent_invitations")
    invitee = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="received_invitations")
    status = models.CharField(max_length=10, choices=STATUSES, default="pending")
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "table_invitations"
        ordering = ["-created_at"]
