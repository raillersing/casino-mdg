from django.conf import settings
from django.db import models


class KYCRequest(models.Model):
    LEVELS = [("light_player", "Petit joueur"), ("verified", "Vérifié"), ("vip", "VIP")]
    STATUSES = [
        ("pending", "En attente"),
        ("approved", "Approuvée"),
        ("rejected", "Refusée"),
    ]
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="kyc_requests"
    )
    requested_level = models.CharField(max_length=20, choices=LEVELS)
    status = models.CharField(max_length=20, choices=STATUSES, default="pending")
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "kyc_requests"
        ordering = ["-created_at"]
