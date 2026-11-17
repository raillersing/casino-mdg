from django.urls import path

from apps.kyc.views import BackofficeKYCListView, BackofficeKYCReviewView

from .auth_views import BackofficeAuthChannelsView
from .dashboard_views import LiveDashboardView
from .flag_views import ChatModerationView, FeatureFlagView, PaymentReconciliationView
from .report_views import (
    BackofficeLiveTablesView,
    BackofficeOperationalReportView,
    BackofficeReportCSVView,
)
from .views import AuditEventListView

urlpatterns = [
    path(
        "reports/overview/",
        BackofficeOperationalReportView.as_view(),
        name="backoffice-report-overview",
    ),
    path(
        "reports/export.csv",
        BackofficeReportCSVView.as_view(),
        name="backoffice-report-export",
    ),
    path(
        "games/tables/",
        BackofficeLiveTablesView.as_view(),
        name="backoffice-live-tables",
    ),
    path(
        "config/auth-methods/",
        BackofficeAuthChannelsView.as_view(),
        name="backoffice-auth-methods",
    ),
    path("live-dashboard/", LiveDashboardView.as_view(), name="live-dashboard"),
    path("audit-events/", AuditEventListView.as_view(), name="audit-events"),
    path("feature-flags/", FeatureFlagView.as_view(), name="feature-flags"),
    path("chat-messages/", ChatModerationView.as_view(), name="chat-moderation"),
    path(
        "payment-reconciliation/",
        PaymentReconciliationView.as_view(),
        name="payment-reconciliation",
    ),
    path("kyc/", BackofficeKYCListView.as_view(), name="backoffice-kyc"),
    path(
        "kyc/<int:request_id>/review/",
        BackofficeKYCReviewView.as_view(),
        name="backoffice-kyc-review-action",
    ),
]
