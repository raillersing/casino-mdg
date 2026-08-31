from django.urls import path

from .views import (
    BackofficeKYCListView,
    BackofficeKYCReviewView,
    KYCDocumentDownloadView,
    KYCDocumentUploadView,
    KYCStatusView,
)

urlpatterns = [
    path("status/", KYCStatusView.as_view(), name="kyc-status"),
    path("request/", KYCStatusView.as_view(), name="kyc-request"),
    path("documents/upload/", KYCDocumentUploadView.as_view(), name="kyc-document-upload"),
    path("documents/<uuid:doc_id>/", KYCDocumentDownloadView.as_view(), name="kyc-document-download"),
    # Backoffice aliases
    path("backoffice/requests/", BackofficeKYCListView.as_view(), name="backoffice-kyc-list"),
    path("backoffice/requests/<int:request_id>/review/", BackofficeKYCReviewView.as_view(), name="backoffice-kyc-review"),
]
