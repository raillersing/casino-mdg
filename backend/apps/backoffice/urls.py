from django.urls import path

from apps.kyc.views import BackofficeKYCListView, BackofficeKYCReviewView
from .flag_views import ChatModerationView, FeatureFlagView, PaymentReconciliationView
from .views import AuditEventListView

urlpatterns = [
    path("audit-events/", AuditEventListView.as_view(), name="audit-events"),
    path("feature-flags/", FeatureFlagView.as_view(), name="feature-flags"),
    path("chat-messages/", ChatModerationView.as_view(), name="chat-moderation"),
    path(
        "payment-reconciliation/",
        PaymentReconciliationView.as_view(),
        name="payment-reconciliation",
    ),
    path("kyc/", BackofficeKYCListView.as_view(), name="backoffice-kyc"),
    path("kyc/<int:request_id>/review/", BackofficeKYCReviewView.as_view(), name="backoffice-kyc-review-action"),
]
