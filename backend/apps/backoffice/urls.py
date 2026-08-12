from django.urls import path

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
]
