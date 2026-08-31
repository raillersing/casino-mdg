import hashlib
import os
from typing import Dict, List, Optional, Tuple

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import UploadedFile
from django.utils import timezone

from apps.backoffice.services import record_audit

from .models import KYCDocument, KYCRequest

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 Mo
ALLOWED_MIME_TYPES = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "application/pdf": [".pdf"],
}

REQUIRED_DOCUMENTS_BY_LEVEL = {
    "light_player": [],  # Phone OTP is sufficient
    "verified": ["national_id_front", "national_id_back"],  # or passport
    "vip": ["national_id_front", "national_id_back", "proof_of_residence", "source_of_funds"],
}


def validate_file_security(uploaded_file: UploadedFile) -> Tuple[str, str, int]:
    """
    Valide la taille, l'extension, le type MIME et les magic bytes d'un fichier uploadé.
    Retourne (mime_type, file_hash, file_size).
    """
    if uploaded_file.size > MAX_FILE_SIZE:
        raise ValidationError(f"Le fichier dépasse la taille maximale autorisée (5 Mo). Taille: {uploaded_file.size} octets.")

    ext = os.path.splitext(uploaded_file.name)[1].lower()
    
    # Lire l'en-tête pour valider les magic bytes
    initial_pos = uploaded_file.tell() if hasattr(uploaded_file, "tell") else 0
    header = uploaded_file.read(32)
    uploaded_file.seek(0)
    
    detected_mime = None
    if header.startswith(b"\xff\xd8\xff"):
        detected_mime = "image/jpeg"
    elif header.startswith(b"\x89PNG\r\n\x1a\n"):
        detected_mime = "image/png"
    elif len(header) >= 12 and header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        detected_mime = "image/webp"
    elif header.startswith(b"%PDF-"):
        detected_mime = "application/pdf"

    if not detected_mime:
        raise ValidationError("Format de fichier non reconnu ou non autorisé. Formats acceptés : JPEG, PNG, WEBP, PDF.")

    if ext not in ALLOWED_MIME_TYPES.get(detected_mime, []):
        raise ValidationError(f"L'extension {ext} ne correspond pas au contenu détecté ({detected_mime}).")

    # Calcul SHA-256
    sha256 = hashlib.sha256()
    for chunk in uploaded_file.chunks():
        sha256.update(chunk)
    uploaded_file.seek(0)
    file_hash = sha256.hexdigest()

    return detected_mime, file_hash, uploaded_file.size


def attach_document_to_request(
    kyc_request: KYCRequest, document_type: str, uploaded_file: UploadedFile
) -> KYCDocument:
    """Valide et attache un document à une demande KYC."""
    valid_types = dict(KYCDocument.DOCUMENT_TYPES)
    if document_type not in valid_types:
        raise ValidationError(f"Type de document '{document_type}' invalide. Types autorisés : {list(valid_types.keys())}")

    if kyc_request.status not in ["pending", "resubmission_requested"]:
        raise ValidationError("Impossible d'ajouter un document à une demande déjà clôturée.")

    mime_type, file_hash, file_size = validate_file_security(uploaded_file)

    # Remplacer un document précédent du même type s'il existait
    existing = kyc_request.documents.filter(document_type=document_type).first()
    if existing:
        existing.file.delete(save=False)
        existing.delete()

    doc = KYCDocument.objects.create(
        kyc_request=kyc_request,
        document_type=document_type,
        file=uploaded_file,
        file_name=uploaded_file.name[:250],
        file_size=file_size,
        mime_type=mime_type,
        file_hash=file_hash,
        status="pending",
    )

    record_audit(
        kyc_request.user,
        "kyc.document.uploaded",
        doc,
        {
            "request_id": kyc_request.pk,
            "document_type": document_type,
            "file_size": file_size,
            "mime_type": mime_type,
        },
    )
    return doc


def review_kyc_request(
    kyc_request: KYCRequest,
    reviewer,
    action: str,
    notes: str = "",
    doc_statuses: Optional[Dict[str, Dict[str, str]]] = None,
) -> KYCRequest:
    """
    Exécute la revue d'une demande KYC par un administrateur / compliance officer.
    action: 'approve', 'reject', 'request_resubmission'
    """
    if action not in ["approve", "reject", "request_resubmission"]:
        raise ValidationError(f"Action '{action}' non reconnue.")

    now = timezone.now()
    kyc_request.reviewer = reviewer
    kyc_request.reviewer_notes = notes
    kyc_request.reviewed_at = now

    if action == "approve":
        kyc_request.status = "approved"
        # Mettre à jour le niveau KYC de l'utilisateur
        user = kyc_request.user
        user.kyc_level = kyc_request.requested_level
        user.kyc_verified_at = now
        user.save(update_fields=["kyc_level", "kyc_verified_at"])
        # Marquer tous les documents comme valides
        kyc_request.documents.filter(status="pending").update(status="valid")

    elif action == "reject":
        kyc_request.status = "rejected"
        kyc_request.documents.filter(status="pending").update(status="rejected")

    elif action == "request_resubmission":
        kyc_request.status = "resubmission_requested"

    # Mise à jour granulaire des documents si spécifiée
    if doc_statuses:
        for doc_id, doc_info in doc_statuses.items():
            doc = kyc_request.documents.filter(id=doc_id).first()
            if doc:
                if "status" in doc_info and doc_info["status"] in ["valid", "rejected", "pending"]:
                    doc.status = doc_info["status"]
                if "reason" in doc_info:
                    doc.rejection_reason = str(doc_info["reason"])[:255]
                doc.save(update_fields=["status", "rejection_reason"])

    kyc_request.save(update_fields=["status", "reviewer", "reviewer_notes", "reviewed_at"])

    record_audit(
        reviewer,
        f"kyc.request.{action}",
        kyc_request,
        {
            "user_id": kyc_request.user_id,
            "target_level": kyc_request.requested_level,
            "status": kyc_request.status,
            "notes": notes,
        },
    )
    return kyc_request
