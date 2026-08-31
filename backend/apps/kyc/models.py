import os
import uuid
from django.conf import settings
from django.db import models


def kyc_document_upload_path(instance, filename):
    """Génère un chemin sécurisé et non prédictible pour le stockage des documents KYC."""
    ext = os.path.splitext(filename)[1].lower()
    unique_name = f"{uuid.uuid4().hex}{ext}"
    user_id = instance.kyc_request.user_id
    return f"kyc_documents/user_{user_id}/{unique_name}"


class KYCRequest(models.Model):
    LEVELS = [
        ("light_player", "Petit joueur"),
        ("verified", "Vérifié"),
        ("vip", "VIP"),
    ]
    STATUSES = [
        ("pending", "En attente"),
        ("approved", "Approuvée"),
        ("rejected", "Refusée"),
        ("resubmission_requested", "Complément requis"),
    ]
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="kyc_requests"
    )
    requested_level = models.CharField(max_length=20, choices=LEVELS)
    status = models.CharField(max_length=30, choices=STATUSES, default="pending")
    note = models.CharField(max_length=255, blank=True)
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_kyc_requests",
    )
    reviewer_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "kyc_requests"
        ordering = ["-created_at"]

    def __str__(self):
        return f"KYCRequest #{self.pk} ({self.user.phone} -> {self.requested_level}: {self.status})"


class KYCDocument(models.Model):
    DOCUMENT_TYPES = [
        ("national_id_front", "CIN (Recto)"),
        ("national_id_back", "CIN (Verso)"),
        ("passport", "Passeport"),
        ("proof_of_residence", "Certificat de résidence"),
        ("selfie_with_id", "Selfie avec pièce d'identité"),
        ("source_of_funds", "Justificatif de revenus / Source de fonds"),
    ]
    STATUSES = [
        ("pending", "En cours de vérification"),
        ("valid", "Conforme"),
        ("rejected", "Non conforme"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kyc_request = models.ForeignKey(
        KYCRequest, on_delete=models.CASCADE, related_name="documents"
    )
    document_type = models.CharField(max_length=40, choices=DOCUMENT_TYPES)
    file = models.FileField(upload_to=kyc_document_upload_path)
    file_name = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField(help_text="Taille en octets")
    mime_type = models.CharField(max_length=100)
    file_hash = models.CharField(max_length=64, db_index=True, help_text="SHA-256")
    status = models.CharField(max_length=20, choices=STATUSES, default="pending")
    rejection_reason = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "kyc_documents"
        ordering = ["created_at"]

    def __str__(self):
        return f"KYCDocument {self.document_type} ({self.status}) for {self.kyc_request_id}"
