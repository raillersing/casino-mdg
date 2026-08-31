import mimetypes
import os

from django.core.exceptions import ValidationError
from django.http import FileResponse, Http404
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import KYCDocument, KYCRequest
from .services import attach_document_to_request, review_kyc_request

LIMITS = {
    "discovered": {"deposit": 0, "withdrawal": 0},
    "light_player": {"deposit": 100000, "withdrawal": 50000},
    "verified": {"deposit": 1000000, "withdrawal": 500000},
    "vip": {"deposit": 10000000, "withdrawal": 5000000},
}


def serialize_document(doc: KYCDocument, request) -> dict:
    return {
        "id": str(doc.id),
        "document_type": doc.document_type,
        "document_type_display": doc.get_document_type_display(),
        "file_name": doc.file_name,
        "file_size": doc.file_size,
        "mime_type": doc.mime_type,
        "file_hash": doc.file_hash,
        "status": doc.status,
        "status_display": doc.get_status_display(),
        "rejection_reason": doc.rejection_reason,
        "uploaded_at": doc.created_at.isoformat(),
        "download_url": request.build_absolute_uri(f"/api/v1/kyc/documents/{doc.id}/") if request else f"/api/v1/kyc/documents/{doc.id}/",
    }


def serialize_request(item: KYCRequest, request=None) -> dict:
    return {
        "id": item.pk,
        "level": item.requested_level,
        "level_display": item.get_requested_level_display(),
        "status": item.status,
        "status_display": item.get_status_display(),
        "note": item.note,
        "reviewer_notes": item.reviewer_notes,
        "created_at": item.created_at.isoformat(),
        "reviewed_at": item.reviewed_at.isoformat() if item.reviewed_at else None,
        "documents": [serialize_document(doc, request) for doc in item.documents.all()],
    }


class KYCStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        latest = KYCRequest.objects.filter(user=request.user).prefetch_related("documents").first()
        return Response(
            {
                "level": request.user.kyc_level,
                "limits_mga": LIMITS.get(request.user.kyc_level, LIMITS["discovered"]),
                "request": serialize_request(latest, request) if latest else None,
                "documents_enabled": True,
                "available_document_types": [
                    {"code": code, "label": label} for code, label in KYCDocument.DOCUMENT_TYPES
                ],
            }
        )

    def post(self, request):
        level = str(request.data.get("requested_level", ""))
        if level not in dict(KYCRequest.LEVELS):
            return Response({"detail": "Niveau KYC invalide."}, status=status.HTTP_400_BAD_REQUEST)
        if KYCRequest.objects.filter(user=request.user, status__in=["pending", "resubmission_requested"]).exists():
            return Response({"detail": "Une demande est déjà en cours de traitement."}, status=status.HTTP_409_CONFLICT)
        item = KYCRequest.objects.create(
            user=request.user,
            requested_level=level,
            note=str(request.data.get("note", ""))[:255],
        )
        return Response(
            {
                "id": item.pk,
                "status": item.status,
                "documents_enabled": True,
                "request": serialize_request(item, request),
            },
            status=status.HTTP_201_CREATED,
        )


class KYCDocumentUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "Aucun fichier fourni."}, status=status.HTTP_400_BAD_REQUEST)

        document_type = request.data.get("document_type", "")
        if not document_type:
            return Response({"detail": "Le paramètre 'document_type' est requis."}, status=status.HTTP_400_BAD_REQUEST)

        # Récupérer ou créer la demande KYC en cours
        kyc_req = KYCRequest.objects.filter(user=request.user, status__in=["pending", "resubmission_requested"]).first()
        if not kyc_req:
            requested_level = request.data.get("requested_level", "verified")
            if requested_level not in dict(KYCRequest.LEVELS):
                requested_level = "verified"
            kyc_req = KYCRequest.objects.create(
                user=request.user,
                requested_level=requested_level,
                note="Créée automatiquement lors de l'upload de document",
            )

        try:
            doc = attach_document_to_request(kyc_req, document_type, file_obj)
        except ValidationError as exc:
            return Response({"detail": exc.message if hasattr(exc, "message") else str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": "Document téléversé avec succès.",
                "document": serialize_document(doc, request),
                "request": serialize_request(kyc_req, request),
            },
            status=status.HTTP_201_CREATED,
        )


class KYCDocumentDownloadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, doc_id):
        try:
            doc = KYCDocument.objects.select_related("kyc_request__user").get(id=doc_id)
        except (KYCDocument.DoesNotExist, ValueError):
            raise Http404("Document introuvable.")

        # Contrôle d'accès : seul le propriétaire ou le staff peut accéder au document
        if doc.kyc_request.user_id != request.user.pk and not request.user.is_staff:
            return Response({"detail": "Accès non autorisé à ce document."}, status=status.HTTP_403_FORBIDDEN)

        if not doc.file or not doc.file.storage.exists(doc.file.name):
            raise Http404("Fichier non trouvé sur le serveur de stockage.")

        response = FileResponse(doc.file.open("rb"), content_type=doc.mime_type or "application/octet-stream")
        response["Content-Disposition"] = f'inline; filename="{doc.file_name}"'
        return response


# ─── Backoffice KYC Endpoints ──────────────────────────────────────────

class BackofficeKYCListView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        status_filter = request.query_params.get("status")
        queryset = KYCRequest.objects.select_related("user", "reviewer").prefetch_related("documents").all()
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        results = []
        for item in queryset[:100]:
            data = serialize_request(item, request)
            data["user"] = {
                "id": str(item.user.pk),
                "phone": item.user.phone,
                "display_name": item.user.display_name,
                "email": item.user.email,
                "current_level": item.user.kyc_level,
            }
            if item.reviewer:
                data["reviewer"] = {
                    "id": str(item.reviewer.pk),
                    "display_name": item.reviewer.display_name,
                }
            results.append(data)

        return Response({"results": results, "count": len(results)})


class BackofficeKYCReviewView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, request_id):
        try:
            item = KYCRequest.objects.select_related("user").prefetch_related("documents").get(pk=request_id)
        except KYCRequest.DoesNotExist:
            return Response({"detail": "Demande KYC introuvable."}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get("action")
        notes = str(request.data.get("notes", ""))
        doc_statuses = request.data.get("doc_statuses")

        try:
            reviewed = review_kyc_request(item, request.user, action, notes=notes, doc_statuses=doc_statuses)
        except ValidationError as exc:
            return Response({"detail": exc.message if hasattr(exc, "message") else str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": f"Demande KYC {reviewed.get_status_display().lower()}.",
                "request": serialize_request(reviewed, request),
            }
        )
