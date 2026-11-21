from django.urls import path

from apps.kyc.views import BackofficeKYCListView, BackofficeKYCReviewView

from .auth_views import BackofficeAuthChannelsView
from .dashboard_views import LiveDashboardView
from .finance_views import MgaFinanceOverviewView, MgaPaymentIntentListView
from .flag_views import ChatModerationView, FeatureFlagView, PaymentReconciliationView
from .players_views import PlayerDetailView, PlayerDirectoryView
from .reconciliation_views import TransactionReconciliationView
from .report_views import (
    BackofficeLiveTablesView,
    BackofficeOperationalReportView,
    BackofficeReportCSVView,
)
from .sim_views import (
    SimAdjustmentDecisionView,
    SimAdjustmentListCreateView,
    SimCashierSummaryView,
    SimLedgerView,
)
from .views import AuditEventListView

urlpatterns = [
    path(
        "finance/overview/",
        MgaFinanceOverviewView.as_view(),
        name="backoffice-mga-overview",
    ),
    path(
        "finance/intents/",
        MgaPaymentIntentListView.as_view(),
        name="backoffice-mga-intents",
    ),
    path(
        "finance/reconciliation/items/",
        TransactionReconciliationView.as_view(),
        name="backoffice-finance-transaction-reconciliation",
    ),
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
    path("players/", PlayerDirectoryView.as_view(), name="backoffice-players"),
    path(
        "players/<int:player_id>/",
        PlayerDetailView.as_view(),
        name="backoffice-player-detail",
    ),
    path(
        "sim/summary/", SimCashierSummaryView.as_view(), name="backoffice-sim-summary"
    ),
    path("sim/ledger/", SimLedgerView.as_view(), name="backoffice-sim-ledger"),
    path(
        "sim/adjustments/",
        SimAdjustmentListCreateView.as_view(),
        name="backoffice-sim-adjustments",
    ),
    path(
        "sim/adjustments/<uuid:adjustment_id>/decision/",
        SimAdjustmentDecisionView.as_view(),
        name="backoffice-sim-decision",
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
