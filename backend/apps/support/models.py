from django.conf import settings
from django.db import models


class SupportTicket(models.Model):
    STATUSES = [("open", "Ouvert"), ("in_progress", "En cours"), ("closed", "Fermé")]
    CATEGORIES = [("account", "Compte"), ("wallet", "Wallet"), ("game", "Partie"), ("other", "Autre")]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="support_tickets")
    category = models.CharField(max_length=20, choices=CATEGORIES)
    subject = models.CharField(max_length=120)
    description = models.TextField(max_length=2000)
    status = models.CharField(max_length=20, choices=STATUSES, default="open")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "support_tickets"
        ordering = ["-created_at"]
