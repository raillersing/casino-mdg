from django.urls import path

from .views import (
    WalletBalanceView,
    WalletTransactionDetailView,
    WalletTransactionsView,
)

urlpatterns = [
    path("balance/", WalletBalanceView.as_view(), name="wallet-balance"),
    path("transactions/", WalletTransactionsView.as_view(), name="wallet-transactions"),
    path(
        "transactions/<uuid:transaction_id>/",
        WalletTransactionDetailView.as_view(),
        name="wallet-transaction-detail",
    ),
]
